// PoC: platforms.js — detectVideoPlatform
import { detectVideoPlatform, isSupportedVideoUrl }
  from '../resources/mkt-flow/packages/video-downloader/src/platforms.js';

const cases = [
  ['https://www.tiktok.com/@u/video/123', 'valid tiktok'],
  ['http://tiktok.com/x', 'http tiktok'],
  ['ftp://tiktok.com/x', 'ftp scheme'],
  ['javascript:alert(1)', 'javascript scheme'],
  ['data:text/html,<script>', 'data scheme'],
  ['file:///C:/youtube.com', 'file scheme'],
  ['http://evil.com/?youtube.com', 'query spoof'],
  ['http://evil.com/#youtube.com', 'fragment spoof'],
  ['http://youtube.com.evil.com/x', 'suffix domain spoof'],
  ['http://tiktok.com.evil.com/x', 'tiktok suffix spoof'],
  ['http://eviltiktok.com/x', 'prefix spoof'],
  ['http://tiktok.com:8080/x', 'tiktok port 8080'],
  ['http://tiktok.com:443/x', 'tiktok port 443'],
  ['http://user:pass@tiktok.com/x', 'userinfo tiktok'],
  ['http://user:pass@evil.com@tiktok.com/x', 'userinfo confusion'],
  ['HTTP://TIKTOK.COM/x', 'uppercase'],
  ['http://тiktok.com/x', 'cyrillic homoglyph'],
  ['https://youtu.be/abc', 'youtu.be'],
  ['https://www.youtube.com/watch?v=1', 'www.youtube'],
  ['https://m.youtube.com/watch?v=1', 'm.youtube'],
  ['https://music.youtube.com/x', 'music.youtube'],
  ['https://douyin.com/x', 'douyin'],
  ['not a url', 'garbage'],
  ['', 'empty'],
  ['   ', 'spaces'],
  ['//tiktok.com/x', 'protocol-relative'],
  ['https://tiktok.com', 'no path'],
  ['https://tiktok.com./x', 'trailing dot FQDN'],
  ['https://tiktok.com%00.evil.com/x', 'null byte trick'],
  ['https://xn--80ak6aa92e.com/x', 'punycode'],
  ['tiktok.com/x', 'no scheme'],
  ['https://tiktok.com:99999999/x', 'overflow port'],
];

console.log('=== detectVideoPlatform ===');
for (const [input, label] of cases) {
  let r;
  try { r = detectVideoPlatform(input); } catch (e) { r = 'THROW: ' + e.message; }
  console.log(`${String(r).padEnd(9)} [${label.padEnd(26)}] ${JSON.stringify(input)}`);
}

console.log('\n=== isSupportedVideoUrl ===');
for (const [input] of cases) {
  let r; try { r = isSupportedVideoUrl(input); } catch (e) { r = 'THROW: ' + e.message; }
  console.log(`${String(r).padEnd(6)} ${JSON.stringify(input)}`);
}

console.log('\n=== new URL() behavior on odd inputs ===');
for (const v of ['javascript:alert(1)', 'data:text/html,x', 'mailto:a@tiktok.com', 'ftp://tiktok.com/x']) {
  try { const u = new URL(v); console.log(`${v} -> protocol=${u.protocol} hostname=${u.hostname}`); }
  catch (e) { console.log(`${v} -> THROW ${e.message}`); }
}
