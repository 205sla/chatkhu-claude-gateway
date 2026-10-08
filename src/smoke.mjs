import { wireRequest } from './adapters/anthropic.mjs';
import { GatewayError, statusHint } from './errors.mjs';
import { startGateway } from './gateway.mjs';

async function callLocal(gateway, config, body) {
  return new Promise((resolve, reject) => {
    const payload = Buffer.from(JSON.stringify(body));
    const request = wireRequest(new URL(`${gateway.url}/v1/messages`), {
      method: 'POST', headers: { authorization: `Bearer ${gateway.token}`, 'anthropic-version': '2023-06-01', 'content-type': 'application/json', 'content-length': payload.length },
      connectTimeoutMs: config.connectTimeoutMs, idleTimeoutMs: config.idleTimeoutMs,
    }, response => {
      let size = 0;
      const chunks = [];
      response.on('data', chunk => {
        size += chunk.length;
        if (size > 4 * 1024 * 1024) response.destroy(new GatewayError('smoke_size', 'smoke 응답이 제한 크기를 초과했습니다.'));
        else chunks.push(chunk);
      });
      response.on('error', reject);
      response.on('end', () => {
        if (response.statusCode !== 200) return reject(new GatewayError('smoke_http', `HTTP ${response.statusCode}: ${statusHint(response.statusCode)}`));
        resolve(Buffer.concat(chunks).toString('utf8'));
      });
    });
    request.on('error', reject);
    request.end(payload);
  });
}

function json(text) { try { return JSON.parse(text); } catch { throw new GatewayError('smoke_json', 'smoke JSON 응답을 해석할 수 없습니다.'); } }
function modelId(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$/.test(value)) throw new GatewayError('smoke_model', '응답에서 유효한 실제 모델 ID를 확인하지 못했습니다.');
  return value;
}
function requireText(response) {
  if (!response.content?.some(block => block.type === 'text' && block.text?.trim()) || !response.stop_reason) throw new GatewayError('smoke_text', '텍스트 또는 종료 사유를 확인하지 못했습니다. 성공으로 기록하지 않습니다.');
}

export async function runSmoke(config, adapter, { report = console.log, gatewayOptions } = {}) {
  const base = { model: config.model, max_tokens: 256, messages: [{ role: 'user', content: 'Reply with just OK.' }] };
  // Establish the official endpoint baseline before testing the local hop.
  const direct = await adapter.json('POST', '/v1/messages', base);
  requireText(direct);
  report(`직접 연결 텍스트: 성공 | 응답 모델 ${modelId(direct.model)}`);
  const gateway = await startGateway(config, { ...gatewayOptions, adapter });
  try {
    const text = json(await callLocal(gateway, config, base));
    requireText(text);
    report(`로컬 중계 텍스트: 성공 | 응답 모델 ${modelId(text.model)}`);
    const stream = await callLocal(gateway, config, { ...base, stream: true });
    const events = stream.replace(/\r\n/g, '\n').split('\n\n').map(frame => frame.split('\n').filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n')).filter(Boolean).map(json);
    if (events.some(event => event.type === 'error') || !events.some(event => event.type === 'message_stop') || !events.some(event => event.type === 'message_delta' && event.delta?.stop_reason) || !events.some(event => event.delta?.type === 'text_delta' && event.delta.text)) throw new GatewayError('smoke_stream', 'SSE 텍스트/정상 종료를 확인하지 못했습니다.');
    report(`로컬 중계 SSE: 성공 | 응답 모델 ${modelId(events.find(event => event.type === 'message_start')?.message?.model)}`);
    const tools = [{ name: 'chatkhu_add', description: 'Add exactly the supplied a and b.', input_schema: { type: 'object', properties: { a: { type: 'integer' }, b: { type: 'integer' } }, required: ['a', 'b'], additionalProperties: false } }];
    const first = { ...base, tools, tool_choice: { type: 'tool', name: 'chatkhu_add' }, messages: [{ role: 'user', content: 'Use chatkhu_add with a=7 and b=5, then report its result.' }] };
    const requested = json(await callLocal(gateway, config, first));
    const tool = requested.content?.find(block => block.type === 'tool_use');
    if (requested.stop_reason !== 'tool_use' || tool?.name !== 'chatkhu_add' || !tool.id || tool.input?.a !== 7 || tool.input?.b !== 5) throw new GatewayError('smoke_tool', '정해진 테스트 도구 호출을 확인하지 못했습니다. 임의 도구는 실행하지 않습니다.');
    const final = json(await callLocal(gateway, config, { ...base, tools, messages: [...first.messages, { role: 'assistant', content: requested.content }, { role: 'user', content: [{ type: 'tool_result', tool_use_id: tool.id, content: String(tool.input.a + tool.input.b) }] }] }));
    requireText(final);
    if (!final.content.some(block => block.type === 'text' && /12/.test(block.text))) throw new GatewayError('smoke_tool', '도구 결과 12가 최종 텍스트에 반영되지 않았습니다.');
    report(`로컬 도구 왕복: 성공 | 요청 응답 모델 ${modelId(requested.model)} | 최종 응답 모델 ${modelId(final.model)}`);
    return { direct: direct.model, text: text.model, stream: events.find(event => event.type === 'message_start').message.model, tool: final.model };
  } finally { await gateway.close(); }
}
