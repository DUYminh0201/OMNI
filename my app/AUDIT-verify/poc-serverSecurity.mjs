// PoC: serverSecurity.js — isAllowedLocalOrigin
// Read-only test. Run: node "my app/AUDIT-verify/poc-serverSecurity.mjs"
import { isAllowedLocalOrigin, resolveServerHost, maskSecret, sanitizeKeyStore, sanitizeNvidiaModels }
  from '../resources/mkt-flow/apps/marketing-flow-desktop/server/serverSecurity.js';

const cases = [
  ['undefined', undefined],
  ['null', null],
  ['empty string', ''],
  ['literal "null"', 'null'],
  ['http://evil.com', 'http://evil.com'],
  ['http://[::1]:5173', 'http://[::1]:5173'],
  ['http://127.0.0.1:5173', 'http://127.0.0.1:5173'],
  ['https://localhost:3002', 'https://localhost:3002'],
  ['http://localhost:3002', 'http://localhost:3002'],
  ['http://localhost (no port)', 'http://localhost'],
  ['http://127.0.0.1:8080 (bad port)', 'http://127.0.0.1:8080'],
  ['http://localhost.evil.com:5173 (spoof)', 'http://localhost.evil.com:5173'],
  ['http://127.0.0.1.evil.com:5173 (spoof)', 'http://127.0.0.1.evil.com:5173'],
  ['http://evil.com#http://localhost:5173', 'http://evil.com#http://localhost:5173'],
  ['http://evil.com/?x=http://localhost:5173', 'http://evil.com/?x=http://localhost:5173'],
  ['file://localhost:5173', 'file://localhost:5173'],
  ['javascript:alert(1)', 'javascript:alert(1)'],
  ['http://[0:0:0:0:0:0:0:1]:5173', 'http://[0:0:0:0:0:0:0:1]:5173'],
  ['http://2130706433:5173 (decimal IP)', 'http://2130706433:5173'],
  ['http://0x7f000001:5173 (hex IP)', 'http://0x7f000001:5173'],
  ['http://LOCALHOST:5173 (upper)', 'http://LOCALHOST:5173'],
];

console.log('=== isAllowedLocalOrigin (env = {}) ===');
for (const [label, val] of cases) {
  let r;
  try { r = isAllowedLocalOrigin(val, {}); } catch (e) { r = 'THROW: ' + e.message; }
  console.log(`${r === true ? 'ALLOW' : 'DENY '}  ${String(label).padEnd(42)} -> ${r}`);
}

console.log('\n=== isAllowedLocalOrigin with attacker-controlled env.PORT ===');
for (const env of [{ PORT: '9999' }, { PORT: '80' }, { PORT: 'abc' }, { VITE_PORT: '8080' }, { PORT: '0' }, { PORT: '-1' }]) {
  let r;
  try { r = isAllowedLocalOrigin('http://127.0.0.1:9999', env); } catch (e) { r = 'THROW: ' + e.message; }
  console.log(`env=${JSON.stringify(env).padEnd(22)} origin=http://127.0.0.1:9999 -> ${r}`);
}

console.log('\n=== resolveServerHost ===');
for (const env of [{}, { MARKETING_FLOW_SERVER_HOST: 'localhost' }, { MARKETING_FLOW_SERVER_HOST: '0.0.0.0' },
                   { MARKETING_FLOW_SERVER_HOST: '::1' }, { MARKETING_FLOW_SERVER_HOST: ' 127.0.0.1 ' },
                   { MARKETING_FLOW_SERVER_HOST: 'evil.com' }]) {
  console.log(`${JSON.stringify(env).padEnd(52)} -> ${resolveServerHost(env)}`);
}

console.log('\n=== maskSecret ===');
for (const v of ['', undefined, 'abc', '12345678', '123456789', 'sk-1234567890abcdef']) {
  console.log(`${String(JSON.stringify(v)).padEnd(24)} -> ${JSON.stringify(maskSecret(v))}`);
}

console.log('\n=== sanitizeKeyStore (leak check of api_key) ===');
const store = { nvidia: [{ id: 1, api_key: 'nvapi-SUPERSECRET-1234567890', name: 'k' }],
                gemini: [{ id: 2, api_key: 'AIzaSyABCDEFGHIJKLMNOP' }] };
console.log(JSON.stringify(sanitizeKeyStore(store), null, 2));

console.log('\n=== sanitizeNvidiaModels ===');
console.log(JSON.stringify(sanitizeNvidiaModels(['m1', { model: 'm2', key: 'nvapi-ABCDEFGHIJKLMNOP' }]), null, 2));
