import http from 'node:http';
import https from 'node:https';
import { normalizeBase } from '../config.mjs';
import { GatewayError, statusHint } from '../errors.mjs';

const routes = new Map([
  ['POST /v1/messages', '/v1/messages/'],
  ['POST /v1/messages/count_tokens', '/v1/messages/count_tokens/'],
  // The Messages reference specifies the unsuffixed models path.
  ['GET /v1/models', '/v1/models'],
]);
const hop = new Set(['connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization', 'te', 'trailer', 'transfer-encoding', 'upgrade']);

function hopHeaders(headers) {
  return new Set([...hop, ...String(headers.connection || '').toLowerCase().split(',').map(x => x.trim())]);
}

export function requestHeaders(headers, apiKey, length) {
  const blocked = hopHeaders(headers);
  const result = {};
  for (const [name, value] of Object.entries(headers)) {
    if (!blocked.has(name) && (name.startsWith('anthropic-') || ['content-type', 'content-encoding', 'accept', 'user-agent'].includes(name))) result[name] = value;
  }
  result.authorization = `Bearer ${apiKey}`;
  result['accept-encoding'] = 'identity';
  result['user-agent'] ||= 'chatkhu-claude-gateway/0.1.0';
  if (length !== undefined) result['content-length'] = String(length);
  return result;
}

export function responseHeaders(headers) {
  const blocked = hopHeaders(headers);
  const result = {};
  for (const [name, value] of Object.entries(headers)) {
    if (!blocked.has(name) && !['set-cookie', 'set-cookie2', 'authorization', 'x-api-key', 'location'].includes(name) && !name.startsWith('access-control-')) result[name] = value;
  }
  return result;
}

// One wire request. No redirects, retries, parsing, decompression, or prompt rewriting.
export function wireRequest(url, { method = 'GET', headers = {}, connectTimeoutMs = 15000, idleTimeoutMs = 120000, signal } = {}, onResponse) {
  const transport = url.protocol === 'https:' ? https : http;
  const request = transport.request(url, { method, headers, signal, agent: false, rejectUnauthorized: true }, response => {
    clearTimeout(connectTimer);
    onResponse(response);
  });
  const connectTimer = setTimeout(() => request.destroy(new GatewayError('connect_timeout', 'upstream 연결 타임아웃입니다.', 504)), connectTimeoutMs);
  connectTimer.unref();
  request.on('socket', socket => {
    const connected = () => clearTimeout(connectTimer);
    if (!socket.connecting) connected();
    else socket.once(url.protocol === 'https:' ? 'secureConnect' : 'connect', connected);
  });
  request.setTimeout(idleTimeoutMs, () => request.destroy(new GatewayError('idle_timeout', 'upstream 유휴 타임아웃입니다. 자동 재전송하지 않았습니다.', 504)));
  request.once('close', () => clearTimeout(connectTimer));
  return request;
}

export class AnthropicAdapter {
  constructor(config, { testOnlyAllowHttp = false } = {}) {
    this.config = config;
    this.baseUrl = normalizeBase(config.baseUrl, { testOnlyAllowHttp });
  }

  route(method, rawUrl) {
    // Reject absolute-form URLs and path normalization tricks. Preserve query bytes.
    if (!rawUrl.startsWith('/') || rawUrl.startsWith('//') || rawUrl.includes('#')) return null;
    const queryAt = rawUrl.indexOf('?');
    const path = (queryAt < 0 ? rawUrl : rawUrl.slice(0, queryAt)).replace(/\/$/, '');
    const upstream = routes.get(`${method} ${path}`);
    if (!upstream) return null;
    return { path, url: new URL(`${this.baseUrl}${upstream}${queryAt < 0 ? '' : rawUrl.slice(queryAt)}`) };
  }

  request(route, { method, headers, body, signal }, onResponse) {
    const request = wireRequest(route.url, {
      method, headers: requestHeaders(headers, this.config.apiKey, body?.length),
      connectTimeoutMs: this.config.connectTimeoutMs, idleTimeoutMs: this.config.idleTimeoutMs, signal,
    }, onResponse);
    request.end(body);
    return request;
  }

  async json(method, path, body) {
    const route = this.route(method, path);
    if (!route) throw new GatewayError('route', '지원하지 않는 API 경로입니다.');
    const payload = body === undefined ? undefined : Buffer.from(JSON.stringify(body));
    return new Promise((resolve, reject) => {
      const request = this.request(route, { method, headers: { 'anthropic-version': '2023-06-01', 'content-type': 'application/json' }, body: payload }, response => {
        const chunks = [];
        let length = 0;
        response.on('data', chunk => {
          length += chunk.length;
          if (length > 4 * 1024 * 1024) response.destroy(new GatewayError('response_size', '진단 응답 크기 제한을 초과했습니다.'));
          else chunks.push(chunk);
        });
        response.on('error', reject);
        response.on('end', () => {
          if (response.statusCode < 200 || response.statusCode >= 300) {
            reject(new GatewayError('upstream_http', `HTTP ${response.statusCode}: ${statusHint(response.statusCode)}`, response.statusCode));
            return;
          }
          try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
          catch { reject(new GatewayError('upstream_json', 'upstream 응답이 올바른 JSON이 아닙니다.')); }
        });
      });
      request.on('error', reject);
    });
  }

  async models() {
    const models = new Map();
    let cursor;
    const seen = new Set();
    for (let page = 0; page < 100; page++) {
      const response = await this.json('GET', `/v1/models${cursor ? `?after_id=${encodeURIComponent(cursor)}` : ''}`);
      if (!Array.isArray(response.data)) throw new GatewayError('models', '모델 목록 응답의 data 형식을 확인하세요.');
      for (const model of response.data) {
        // Trust the native Anthropic endpoint, but reject clearly non-Claude entries.
        if (typeof model.id !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$/.test(model.id)) throw new GatewayError('models', '모델 목록에 잘못된 ID가 있습니다.');
        if (!model.id.toLowerCase().includes('claude')) continue;
        models.set(model.id, model);
      }
      if (!response.has_more) return [...models.values()];
      cursor = response.last_id;
      if (typeof cursor !== 'string' || !cursor || seen.has(cursor)) break;
      seen.add(cursor);
    }
    throw new GatewayError('models', '모델 페이지네이션이 완료되지 않았습니다. 불완전한 목록을 사용하지 않습니다.');
  }
}

export function validateModels(config, models) {
  const ids = new Set(models.map(model => model.id));
  for (const id of [config.model, ...Object.values(config.aliases || {})]) {
    if (!id || !ids.has(id)) throw new GatewayError('model', '설정된 모델 또는 별칭 대상이 현재 계정 목록에 없습니다. models와 setup으로 다시 선택하세요.');
  }
}
