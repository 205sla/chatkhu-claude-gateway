import http from 'node:http';
import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { pipeline } from 'node:stream';
import { AnthropicAdapter, responseHeaders } from './adapters/anthropic.mjs';
import { GatewayError, safeError } from './errors.mjs';

export const newToken = () => randomBytes(32).toString('base64url');

function equal(a, b) {
  const left = Buffer.from(a || '');
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

function authorized(headers, token) {
  const bearer = headers.authorization?.match(/^Bearer ([^\s]+)$/i)?.[1];
  const key = headers['x-api-key'];
  // Ambiguous or conflicting credentials fail closed.
  return (!headers.authorization || equal(bearer, token)) && (!key || equal(key, token)) && Boolean(bearer || key);
}

function localError(response, status, code, message) {
  if (response.destroyed) return;
  if (response.headersSent) { response.destroy(); return; }
  response.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store', 'x-chatkhu-error-source': 'local', connection: 'close' });
  response.end(JSON.stringify({ type: 'error', error: { type: 'gateway_error', code, message } }));
}

function readBody(request, limit, timeoutMs) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const parts = [];
    let timer;
    const cleanup = () => {
      clearTimeout(timer);
      request.off('data', data).off('end', end).off('error', fail).off('aborted', aborted);
    };
    const fail = error => { cleanup(); request.resume(); reject(error); };
    const reset = () => { clearTimeout(timer); timer = setTimeout(() => fail(new GatewayError('upload_timeout', '요청 본문 수신 타임아웃입니다.', 408)), timeoutMs); timer.unref(); };
    const data = chunk => {
      size += chunk.length;
      if (size > limit) fail(new GatewayError('request_size', '요청 크기 제한을 초과했습니다.', 413));
      else { parts.push(chunk); reset(); }
    };
    const end = () => { cleanup(); resolve(Buffer.concat(parts)); };
    const aborted = () => fail(new GatewayError('client_abort', '클라이언트가 요청을 취소했습니다.', 499));
    request.on('data', data).once('end', end).once('error', fail).once('aborted', aborted);
    reset();
  });
}

export async function startGateway(config, { token = newToken(), adapter = new AnthropicAdapter(config), log = () => {} } = {}) {
  if (token.length < 32 || token === config.apiKey) throw new GatewayError('local_token', '로컬 토큰은 ChatKHU 키와 다른 32자 이상의 값이어야 합니다.');
  const active = new Set();
  const server = http.createServer(async (request, response) => {
    const started = Date.now();
    const id = randomUUID();
    const route = adapter.route(request.method, request.url || '');
    let upstreamRequest;
    let source = 'local';
    let recorded = false;
    const record = () => {
      if (recorded) return;
      recorded = true;
      // Only fixed-schema metadata. No URL query, inbound IDs, headers, or bodies.
      log({ id, route: route?.path || 'other', status: response.statusCode, source, auth: request.headers.authorization ? (request.headers['x-api-key'] ? 'both' : 'bearer') : (request.headers['x-api-key'] ? 'x-api-key' : 'none'), durationMs: Date.now() - started });
    };
    response.once('finish', record);
    response.once('close', () => { if (!response.writableFinished) { source = 'cancelled'; record(); } upstreamRequest?.destroy(); });
    const expectedHost = `127.0.0.1:${server.address()?.port}`;
    // Electron's main-process network client sends sec-fetch-site: none with no
    // Origin. It still needs the loopback Host and the local session credential.
    // Browser origins and every other fetch-site value remain blocked; no CORS.
    const fetchSite = request.headers['sec-fetch-site'];
    if (request.headers.host !== expectedHost || request.headers.origin !== undefined || (fetchSite !== undefined && fetchSite !== 'none')) {
      localError(response, 403, 'local_origin', '로컬 Host 또는 브라우저 요청을 허용하지 않습니다.'); return;
    }
    if (request.method === 'GET' && request.url === '/health') {
      response.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      response.end('{"status":"ok"}'); return;
    }
    if (!authorized(request.headers, token)) { localError(response, 401, 'local_auth', '로컬 세션 토큰이 올바르지 않습니다.'); return; }
    if (!route) { localError(response, 404, 'route', '지원하지 않는 로컬 API 경로입니다.'); return; }
    if (Number(request.headers['content-length']) > config.maxRequestBytes) {
      localError(response, 413, 'request_size', '요청 크기 제한을 초과했습니다.'); return;
    }
    try {
      // Bound and fully validate size BEFORE a billable request is issued.
      const body = await readBody(request, config.maxRequestBytes, config.idleTimeoutMs);
      if (response.destroyed) return;
      upstreamRequest = adapter.request(route, { method: request.method, headers: request.headers, body }, upstream => {
        if (response.destroyed) { upstream.destroy(); return; }
        if (upstream.statusCode >= 300 && upstream.statusCode < 400) {
          response.setHeader('x-chatkhu-upstream-status', upstream.statusCode);
          localError(response, 502, 'upstream_redirect', 'upstream 리디렉션을 거절했습니다. 계정 Base URL과 경로를 확인하세요.');
          upstream.destroy(); return;
        }
        source = 'upstream';
        response.writeHead(upstream.statusCode, { ...responseHeaders(upstream.headers), 'x-chatkhu-error-source': 'upstream', 'x-chatkhu-request-id': id });
        response.flushHeaders();
        // Native streams preserve raw bytes, SSE order, split UTF-8 and backpressure.
        pipeline(upstream, response, error => { if (error) { source = 'stream_interrupted'; record(); response.destroy(); } });
      });
      active.add(upstreamRequest);
      upstreamRequest.once('close', () => active.delete(upstreamRequest));
      upstreamRequest.on('error', error => {
        source = 'local';
        localError(response, error.status || 502, error instanceof GatewayError ? error.code : 'upstream_connection', safeError(error));
      });
    } catch (error) { localError(response, error.status || 500, error.code || 'local_error', safeError(error)); }
  });
  server.headersTimeout = Math.min(60000, config.idleTimeoutMs);
  server.requestTimeout = 0; // readBody enforces a configurable inactivity timeout.
  server.keepAliveTimeout = 5000;
  server.on('clientError', (_error, socket) => { if (socket.writable) socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n'); });
  server.on('connection', socket => {
    // Leave time for the more specific upload/upstream timeout to return an error.
    socket.setTimeout(Math.min(2 ** 31 - 1, config.idleTimeoutMs + 1000));
    socket.on('timeout', () => socket.destroy());
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen({ host: '127.0.0.1', port: config.port ?? 0, exclusive: true }, resolve);
  });
  let closing;
  return {
    token, server, url: `http://127.0.0.1:${server.address().port}`,
    close() {
      closing ??= new Promise((resolve, reject) => {
        server.close(error => error ? reject(error) : resolve());
        for (const request of active) request.destroy();
        server.closeAllConnections();
      });
      return closing;
    },
  };
}
