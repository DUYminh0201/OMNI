# BÁO CÁO LỖI CẦN FIX — Omnira Studio

**Ngày:** 2026-11-04
**Phạm vi:** Toàn bộ `C:\Users\nminh\Desktop\vibe - code\omni`
**Mục tiêu:** Quét code + logic, tìm lỗi cần fix (theo yêu cầu người dùng)

> **Trạng thái thực hiện:** 4 subagent audit bị dừng giữa chừng do rate limit (429) của model — không phải lỗi dự án. Verifier kịp tạo 10 file PoC với log thật (`AUDIT-verify/`). Lead đã tự hoàn thành phần điều tra còn lại. Xem §6 về phần chưa quét hết.

---

## 1. TÓM TẮT — VIỆC PHẢI FIX NGAY

| # | Lỗi | Mức | Thời gian |
|---|---|---|---|
| 1 | 15 API key thật nằm trong thư mục đóng gói, đang ACTIVE | 🔴 CRITICAL | Ngay |
| 2 | `syncAllAiSecretsToMktFlow()` phá kho mã hoá, ghi key ra plaintext | 🔴 CRITICAL | Ngay |
| 3 | **Thiếu `USER_DATA_PATH` khi spawn mkt-flow → mọi dữ liệu ghi vào thư mục cài** (gốc của #1 và #4) | 🔴 CRITICAL | Ngay |
| 4 | Không có auth: `isAllowedLocalOrigin(undefined) === true` | 🔴 CRITICAL | Ngay |
| 5 | 330 MB video cá nhân lọt vào thư mục đóng gói | 🟠 HIGH | Ngay |
| 6 | `build_package.ps1` đã hỏng (7/9 đường dẫn không tồn tại) + guard là dead code | 🟠 HIGH | Trước build sau |
| 7 | `scorer.js` +10 điểm cứng làm **đảo ngược** model được chọn | 🟠 HIGH | Sprint này |

> **Ưu tiên số 1 thực tế:** mục #3 chỉ là **sửa 1 dòng** và giải quyết gốc rễ của #1, #5. Làm #3 trước, rồi #1/#2 để dọn dẹp dữ liệu đã rò rỉ.

---

## 2. 🔴 CRITICAL

### C-01. 15 API key thật đang nằm trong thư mục đóng gói

**Vị trí:** `my app/resources/mkt-flow/runtime/database/keys.json` (3.768 B, sửa 31/10 18:03)

**Bằng chứng** (Lead đọc trực tiếp, chỉ in độ dài/tiền tố):
```
gemini: 13 keys  (12 × "AQ.Ab8..." dài 53, 1 × "AIzaSy..." dài 39) — tất cả ACTIVE
nvidia:  2 keys  ("nvapi-..." dài 70) — tất cả ACTIVE
TOTAL: 15 keys ACTIVE
```

**Tác động:** `my app/resources/` chính là nguồn `build_package.ps1` nén vào installer. Installer `Omnira-Studio-Setup-1.2.7.exe` tạo 02/11 16:57, key ghi 31/10 → key có trước build. Bất kỳ ai có installer đều trích xuất được 15 key trả phí.

**Cách fix:**
1. **Thu hồi ngay 15 key** (Google AI Studio + build.nvidia.com). Không chờ xác minh thêm.
2. Xoá `my app/resources/mkt-flow/runtime/database/keys.json`.
3. Thêm `.gitignore` entry và bước chặn build (xem C-05).

---

### C-02. `syncAllAiSecretsToMktFlow()` — phá kho mã hoá, ghi plaintext

**Vị trí:** `my app/out/main/index.js:17237-17279` (gọi ở `:59` và `:17283`)

**Đây là NGUYÊN NHÂN GỐC của C-01**, không phải sự cố ngẫu nhiên.

App **có** kho bí mật chuẩn mực dùng DPAPI:
```js
// :2519-2533
electron.safeStorage.isEncryptionAvailable()
masterKey = Buffer.from(electron.safeStorage.decryptString(fs.readFileSync(file2)), "base64")
fs.writeFileSync(file2, electron.safeStorage.encryptString(...), { mode: 384 })
```
```js
// :17236
const backendName = () => process.platform === "win32" ? "Windows DPAPI" : ...
```

Nhưng ngay đó, hàm này **hạ cấp bí mật xuống plaintext**:
```js
// :17237-17279
const mktKeysPath = node_path.join(mktFlowDir, "runtime/database/keys.json");
const secret = readSecret("ai_provider", row.id, "api_key");  // đọc từ vault MÃ HOÁ
keys.forEach(k => {
  mktKeys[pName].push({ api_key: k, status: "ACTIVE", ... });  // <-- GHI PLAINTEXT
});
node_fs.writeFileSync(mktKeysPath, JSON.stringify(mktKeys, null, 2), "utf8");  // :17273
```

**Vì sao nghiêm trọng:**
- Vô hiệu hoá toàn bộ giá trị của DPAPI — kẻ đọc file có key, không cần phá mã hoá.
- Ghi vào `resources/` → vào installer.
- **Tự lặp lại**: chạy mỗi lần start mkt-flow (`:59`) và mỗi lần mở màn hình AI provider (`:17283`). Người dùng nhập key mới → lại ghi ra đĩa.
- Không cảnh báo: chỉ `console.info("[ai] Đã đồng bộ toàn bộ secret..." )`.

**Cách fix** — chọn 1:
- **A (khuyến nghị):** truyền key qua IPC/env tạm cho tiến trình con, không ghi file.
- **B:** mã hoá `keys.json` bằng `safeStorage` trước khi ghi (sửa cả `keyManager.js`).
- **C (tối thiểu):** ghi vào `app.getPath('userData')` thay vì `resources/`.

---

### C-03. Không có auth — request thiếu header `Origin` được chấp nhận

**Vị trí:** `my app/resources/mkt-flow/apps/marketing-flow-desktop/server/serverSecurity.js:12`

```js
export function isAllowedLocalOrigin(origin) {
  if (!origin) return true;   // <-- request không có Origin => cho qua
```

**PoC thật** (`AUDIT-verify/poc-serverSecurity.log`):
```
ALLOW  undefined            -> true
ALLOW  null                 -> true
ALLOW  empty string         -> true
DENY   http://evil.com      -> false     (chỉ chặn đúng browser có Origin)
```

**Tác động:** Cả 30 route của mkt-flow không có auth. CORS là cơ chế *trình duyệt*, không phải cơ chế *bảo vệ server*. Mọi tiến trình trên máy (curl, script, MCP client, malware quyền user) gọi được: `POST /api/keys` (thêm key), `DELETE /api/keys/:provider/:id` (xoá key), `POST /api/upload` (ghi file), `GET /api/download/:filename` (đọc file), `POST /api/merge` (tiêu CPU/đĩa).

**Cách fix:** sinh token ngẫu nhiên lúc khởi động, truyền cho renderer, middleware kiểm tra mọi `/api/*`; đổi thành `if (!origin) return false` cho route ghi.

---

### C-04. 🎯 NGUYÊN NHÂN GỐC DUY NHẤT của cả C-01 và H-01: thiếu `USER_DATA_PATH` khi spawn mkt-flow

**Vị trí:** `my app/out/main/index.js:88`

```js
mktFlowProc = cp.spawn(nodeExe, [serverPath], {
  cwd: mktFlowDir,
  env: { ...process.env, PORT: "3002", NODE_ENV: "production" },   // <-- KHÔNG có USER_DATA_PATH
  stdio: ["ignore", "pipe", "pipe"],
```

Grep xác nhận: **`USER_DATA_PATH` không xuất hiện ở bất kỳ đâu** trong `out/main/index.js`.

Phía mkt-flow, `server.js:1879-1881` và `:93-96`:
```js
const uploadsDir = process.env.USER_DATA_PATH 
  ? path.join(process.env.USER_DATA_PATH, 'uploads')
  : path.join(workspaceRoot, 'runtime', 'uploads');    // <-- FALLBACK vào thư mục cài
```
```js
const bundledDatabaseDir = path.join(workspaceRoot, 'runtime', 'database');
const databaseDir = process.env.USER_DATA_PATH
  ? path.join(process.env.USER_DATA_PATH, 'db')
  : bundledDatabaseDir;                                 // <-- FALLBACK vào thư mục cài
```

**Chuỗi nhân quả:**
```
my app khởi động
  → spawn mkt-flow KHÔNG set USER_DATA_PATH
  → mkt-flow fallback: workspaceRoot/runtime/uploads + /database
  → workspaceRoot = resources/mkt-flow
  → video người dùng ghi vào resources/mkt-flow/runtime/uploads/   → 330 MB (H-01)
  → keys.json ghi vào resources/mkt-flow/runtime/database/          → 15 key (C-01)
  → build_package.ps1 nén resources/ → cả hai lọt vào installer
```

**Đây là lỗi do quá trình tích hợp.** Bản `mkt-flow/electron-main.js` cũ (nay đã xoá) có dòng đúng:
```js
process.env.USER_DATA_PATH = app.getPath('userData');   // dòng 52 bản cũ
```
Khi chuyển sang mô hình "app chính spawn tiến trình con", biến này **bị mất** — không ai set lại.

**Cách fix (1 dòng, sửa gốc cả 2 sự cố):**
```js
env: {
  ...process.env,
  PORT: "3002",
  NODE_ENV: "production",
  USER_DATA_PATH: electron.app.getPath("userData"),   // <-- THÊM
},
```

Sau đó: di chuyển dữ liệu hiện có từ `resources/mkt-flow/runtime/` sang `%APPDATA%\omnira-studio\`, và xoá sạch `runtime/uploads` + `runtime/database/keys.json` khỏi thư mục đóng gói.

---

## 3. 🟠 HIGH

### H-01. ~330 MB video cá nhân trong thư mục đóng gói

> **Nguyên nhân gốc:** xem §C-04 — thiếu `USER_DATA_PATH`. Sửa C-04 là hết H-01.

**Vị trí:** `my app/resources/mkt-flow/runtime/uploads/` — 19 file

| Kích thước | File |
|---|---|
| 25.212.967 B | `40cae1e0...` |
| 25.212.967 B | `59159290..._final_logo.mp4` |
| 23.640.280 B | `59159290..._final.mp4` |
| 22.408.814 B | `40cae1e0..._final.mp4` |
| 17.699.526 B | `59159290...` |
| 17.559.229 B | `f27d1b53..._final_logo.mp4` |
| 17.072.916 B | `f27d1b53..._final.mp4` |
| 15.851.544 B ×4 | … |
| 14.464.813 B | `64c7f41c..._final_logo.mp4` |
| 14.292.726 B | `64c7f41c..._final.mp4` |
| 12.774.392 B | `64c7f41c...` |
| 8.392.389 B | `0d5e1048...` |

**Tác động:** (1) Rò rỉ dữ liệu người dùng — video đã tải, đã lồng tiếng, đã gắn logo. (2) Phình installer: gần như **toàn bộ 337 MB installer là dữ liệu rác**. (3) Gốc: mkt-flow ghi `uploads/` vào thư mục cài thay vì `userData`.

**Cách fix:** xoá `runtime/uploads/*` trước build; đổi `uploadsDir` sang `app.getPath('userData')`.

---

### H-02. `build_package.ps1` — guard là dead code, và script đã hỏng

**Vị trí:** `build_package.ps1:51-56`

Đoạn bảo vệ mới thêm:
```powershell
Get-ChildItem "...\database\*" -Exclude "keys.json*" | Copy-Item ...   # :52 đã loại trừ
if (Test-Path "$mktDest\runtime\database\keys.json") {                 # :53 luôn FALSE
    Remove-Item ...; throw "SECURITY ALERT: ..."                       # :54-55 không bao giờ chạy
}
```

**Đã kiểm chứng bằng thực nghiệm:**
```
Sau khi copy voi -Exclude:
   model_registry.json
   nvidia_models.json
keys.json co trong dst? False
```
→ `Test-Path` luôn `False` ⇒ khối `throw` **không bao giờ chạy**. Guard tạo cảm giác an toàn giả. Phải kiểm tra **nguồn trước khi copy** (fail-fast), không kiểm tra đích sau khi đã loại trừ.

**Thêm: script đã hỏng hoàn toàn** — 7/9 đường dẫn tham chiếu `mkt-flow/` nay không tồn tại:

| Đường dẫn | Trạng thái |
|---|---|
| `mkt-flow\node_modules\.bin\asar.cmd` | ❌ không tồn tại |
| `mkt-flow\apps`, `packages`, `package.json` | ❌ không tồn tại |
| `mkt-flow\runtime\database`, `bin`, `node_modules` | ❌ không tồn tại |
| `my app\out`, `runtime\node.exe` | ✅ OK |

**Cách fix:** trỏ nguồn sang `my app/resources/mkt-flow/`, và viết guard đúng:
```powershell
# Kiểm tra NGUỒN trước, fail-fast
$sourceDb = "$workspace\my app\resources\mkt-flow\runtime\database"
foreach ($p in @("keys.json","nvidia_models.json","*.key","*.pem",".env")) {
    if (Get-ChildItem $sourceDb -Filter $p -ErrorAction SilentlyContinue) {
        throw "SECURITY ABORT: file cam '$p' trong nguon. Build dung."
    }
}
```

---

### H-03. `scorer.js` +10 điểm cứng làm ĐẢO NGƯỢC model được chọn

**Vị trí:** `my app/resources/mkt-flow/.../src/utils/orchestrator/scorer.js:76-78`

```js
// ƯU TIÊN GIẢM TẢI CHO GEMINI:
// Thưởng +10 điểm cho các model bên thứ 3 (Nvidia, OpenAI)
if (m.provider === 'nvidia' || m.provider === 'openai') {
  finalScore += 10;
}
```

**PoC Lead tự chạy** (`AUDIT-verify-2/scorer-proof.mjs`):
```
weights = {"quality":0.4,"speed":0.4,"cost":0.2}

Model                 quality  speed   cost  diem goc  sau bonus
------------------------------------------------------------------
gemini-3.5-flash           95     90     80        90         90
nvidia-nemotron            78     82     85        81         91

KHONG bonus -> nguoi thang: gemini-3.5-flash (90)
CO bonus    -> nguoi thang: nvidia-nemotron (91)      <-- SAI
```

**Vì sao là lỗi:** `finalScore` là điểm có trọng số, tối đa 100 (weights tổng = 1.0). Cộng cứng 10 điểm = **10% toàn bộ thang điểm**, lớn hơn cả trọng số quality (0.4 → tối đa 40 điểm, nhưng 10 điểm đủ để vượt khoảng cách 9 điểm). Comment thừa nhận ý đồ "giảm tải Gemini" nhưng cách làm phá vỡ tính đúng đắn: model kém hơn **17 điểm quality và 8 điểm speed** vẫn thắng.

**Cách fix:** đưa ưu tiên vào **trọng số** thay vì cộng sau khi tính, hoặc áp dụng như tie-breaker chỉ khi điểm sát nhau:
```js
// Đúng: chỉ ưu tiên khi chênh lệch nhỏ
const EPSILON = 2.0;
if (Math.abs(finalScore - bestScore) <= EPSILON && m.provider !== 'gemini') ...
```

---

### H-04. `platforms.js` — nhận URL sai scheme/port, không kiểm tra userinfo

**Vị trí:** `my app/resources/mkt-flow/packages/video-downloader/src/platforms.js:11-21`

**PoC thật** (`AUDIT-verify/poc-platforms.log`):
```
tiktok    "ftp://tiktok.com/x"                  <-- scheme ftp vẫn nhận
tiktok    "http://tiktok.com:8080/x"            <-- port tuỳ ý
tiktok    "http://tiktok.com:443/x"
tiktok    "http://user:pass@tiktok.com/x"       <-- credentials trong URL
null      "http://tiktok.com.evil.com/x"        <-- chặn đúng (tốt)
null      "http://evil.com/?youtube.com"        <-- chặn đúng (tốt)
```

**Đánh giá:** phần chống spoof domain làm **đúng** (`matchesDomain` so hostname đã parse, không so chuỗi con). Thiếu: kiểm tra scheme, port, userinfo.

**Cách fix:**
```js
const { hostname, protocol, port, username, password } = new URL(value);
if (!['http:', 'https:'].includes(protocol)) return null;
if (port && port !== '443' && port !== '80') return null;
if (username || password) return null;
```

---

### H-05. 50 chỗ hard-code đường dẫn máy dev

**Đo được:** `my app/out/main/index.js` (9), `resources/mkt-flow/.../server.js` (4), `scratch/*` (8), `build_package.ps1` (5), `make_ico.ps1` (2), `generate_multires_ico.ps1` (1).

Nghiêm trọng nhất — `my app/out/main/index.js:45-47`:
```js
"C:\\Users\\nminh\\Desktop\\vibe - code\\omni\\my app\\resources\\mkt-flow\\runtime\\bin\\node.exe",
"C:\\Users\\nminh\\Desktop\\vibe - code\\omni\\runtime\\node.exe",
"C:\\Users\\nminh\\AppData\\Local\\hermes\\node\\node.exe"   // <-- Node của công cụ khác
```

**Rủi ro thật:** dòng cuối trỏ tới runtime Node của một công cụ không liên quan (`hermes`). Nếu máy người dùng tình cờ có đường dẫn này, app sẽ **chạy mkt-flow bằng Node không kiểm soát được** — rủi ro thực thi mã ngoài ý muốn, không chỉ là code bẩn.

**Cách fix:** xoá toàn bộ hằng số tuyệt đối; chỉ dùng `process.resourcesPath` + `path.resolve(__dirname, ...)`.

---

### H-06. `/api/upload` không lọc loại file

**Vị trí:** `resources/mkt-flow/.../server/server.js:1884`

```js
const upload = multer({
  dest: uploadsDir,
  limits: { fileSize: 100 * 1024 * 1024 },
});   // <-- KHÔNG có fileFilter
```
(So sánh: `logoUpload` ở `:2511` **có** `fileFilter` — không nhất quán.)

**Tác động:** upload được `.html`/`.svg`/`.js`, rồi phục vụ lại qua `GET /downloads/:filename` trên **cùng origin** `127.0.0.1:3002` → stored XSS. Origin này gọi được `/api/keys`.

**Cách fix:** thêm `fileFilter` allowlist (`video/*`, `audio/*`), ép `Content-Disposition: attachment`.

---

### H-07. Lỗi mã hoá tiếng Việt (mojibake) mang tính hệ thống

**Vị trí:** nhiều nơi, không chỉ 2 chỗ

1. `packages/media-processing/src/audioProcessing.js:127,140`
```
'Audio Engine Demucs khÃ´ng cÃ³ trong báº£n cÃ i...'
```
2. `scripts/prepareAudioBundle.js:60,64,80,88,121,126,129,136,159`
3. `my app/package.json:4` — `"Omnira Studio â€” AI Multimedia Production..."`
4. **`runtime/debug.log`** — toàn bộ log vận hành:
```
[app] khá»Ÿi Ä‘á»™ng omnira-studio 1.2.7
[data] thÆ° má»¥c dá»¯ liá»‡u: C:\Users\nminh\AppData\Roaming\omnira-studio
[auth] Ä‘Äƒng nháº­p 7d800667 ...
```

**Tác động:** người dùng thấy chuỗi rác trong thông báo lỗi UI (vì `error.message` được trả về qua `res.status(503).json`); log không đọc được khi debug.

**Cách fix:** chuẩn hoá tất cả file về UTF-8 không BOM; thêm ESLint rule hoặc script kiểm tra mojibake vào CI.

---

### H-08. `scratch/` — quy trình build không tái lập được

**Vị trí:** `my app/scratch/` — 11 script

Các script này **vá file đã build** (`patch-renderer.cjs`, `update-csp.cjs`, `patch-frontend-solo.js`, `force-show-auth-window.js`, `fix-pending-window.js`…). Nghĩa là: build lại → **mất toàn bộ các bản vá này**.

**Tác động:** người khác clone repo không thể tạo ra bản chạy giống bạn. Đây là lý do các lỗi khác không ai phát hiện: mỗi lần build lại, hành vi thay đổi.

**Cách fix:** chuyển từng bản vá vào **source** (plugin Vite/`vite.config.mjs`), rồi xoá `scratch/`.

---

## 4. 🟡 MEDIUM

### M-01. `resolveWithinDirectory` — lỗ hổng đặc thù Windows

**Vị trí:** `server/fileSecurity.js`

**PoC thật** (`AUDIT-verify/poc-fileSecurity.log`) — chống traversal TỐT:
```
"..\\..\\Windows\\System32\\drivers\\etc\\hosts"  -> THROW: Invalid filename
"C:\\Windows\\System32\\cmd.exe"                  -> THROW
"\\\\?\\C:\\..."  (verbatim)                      -> THROW
"\\\\server\\share\\evil.txt" (UNC)               -> THROW
```
Nhưng **lọt** các ca sau:
```
"CON" / "NUL" / "PRN" / "AUX" / "LPT1" / "COM1.txt"  -> RESOLVED (tên thiết bị Windows)
"file.txt:stream"                                     -> RESOLVED (NTFS Alternate Data Stream)
"file.txt."  / "file.txt "                            -> RESOLVED (Windows tự cắt dấu chấm/khoảng trắng)
"   "  (toàn khoảng trắng)                            -> RESOLVED
"nul\u0000.txt"  (null byte)                          -> RESOLVED
```

**Tác động:** `file.txt:stream` cho phép **ẩn dữ liệu** trong ADS (không hiện trong Explorer). Các tên thiết bị gây lỗi/hành vi lạ khi ghi. Mức thực tế: MEDIUM (cần đã có quyền ghi vào uploads).

**Cách fix:** thêm blocklist tên thiết bị Windows và từ chối `:` ngoài ổ đĩa:
```js
if (/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(\.|$)/i.test(filename)) throw new Error('Invalid filename');
if (filename.includes(':')) throw new Error('Invalid filename');
if (filename !== filename.trim() || /[. ]$/.test(filename)) throw new Error('Invalid filename');
```

### M-02. Thiếu Express error handler; `app.get('*')` che 404 API

**Vị trí:** `server/server.js:2862`
```js
app.get('*', (req, res) => { res.sendFile(path.join(frontendDist, 'index.html')); });
```
Grep xác nhận **không có** middleware lỗi 4 tham số nào trong file.

**Tác động:** (1) Lỗi từ CORS callback → Express default handler trả **HTML kèm stack trace** + đường dẫn tuyệt đối. (2) Route `/api/*` gõ sai trả `index.html` (HTTP 200, `text/html`) thay vì JSON 404 → client gọi `.json()` lỗi khó hiểu.

**Cách fix:** thêm `app.use('/api', (req,res)=>res.status(404).json({error:'Not found'}))` **trước** catch-all; error handler 4 tham số ở cuối file.

### M-03. `isAllowedLocalOrigin` — nhánh IPv6 là dead code

```
DENY  "http://[::1]:5173"  -> false    <-- không bao giờ khớp
```
`new URL('http://[::1]:5173').hostname` trả `'[::1]'` (có ngoặc), nhưng `LOCAL_HOSTS` chứa `'::1'`. → nhánh `::1` trong `serverSecurity.js:3` không bao giờ chạy.

**Cách fix:** `hostname.replace(/^\[|\]$/g, '')` trước khi so sánh.

### M-04. Log ghi vào thư mục cài đặt

**Vị trí:** `my app/out/main/index.js:84-85`
```js
const logPath = path.join(mktFlowDir, "runtime/mkt-flow-server.log");
```
**Đã xác nhận tồn tại:** `resources/mkt-flow/runtime/mkt-flow-server.log` (96 B, nội dung: `Backend server running on http://127.0.0.1:3002` **×2 — server khởi động 2 lần**).

**Tác động:** (1) Sai nguyên tắc — ghi dữ liệu vào vùng cài. (2) Trên `Program Files` thường không ghi được. (3) Sẽ bị đóng gói ở lần build sau. (4) Chạy 2 lần gợi ý logic khởi động chưa chống trùng.

**Cách fix:** ghi vào `app.getPath('userData')/logs/`.

### M-05. `runtime/resources/app` là Junction — rủi ro khi đóng gói

**Đã xác minh:**
```
Mode: d----l   Attributes: Directory, ReparsePoint
LinkType: Junction   Target: c:\Users\nminh\Desktop\vibe - code\omni\my app
```

**Tác động:** `runtime/` (351,8 MB) là Electron runtime dùng cho `npm start`. Junction trỏ về `my app`. Nếu công cụ đóng gói đi theo junction, có thể **nhân đôi dung lượng** hoặc **lặp vô hạn**. Cũng là lý do grep hard-code path đếm trùng (mỗi file tính 2 lần qua 2 đường dẫn).

**Cách fix:** dùng path filter loại junction khi đóng gói; hoặc bỏ junction, dùng biến môi trường trỏ runtime.

### M-06. `runtime/debug.log` lộ thông tin cá nhân

Nội dung: `C:\Users\nminh\AppData\Roaming\omnira-studio`, user ID `7d800667-30a8-4e8f-9c53-3b85f6c1502c`, danh sách tác vụ.
**Cách fix:** xoá khỏi repo, thêm vào `.gitignore`.

---

## 5. ✅ ĐIỂM SÁNG — KHÔNG CẦN SỬA

Ghi lại để bạn không refactor nhầm chỗ:

1. **Kiến trúc IPC rất tốt** (`out/preload/index.js` + `:23404-23440`):
   - Preload **không** lộ `ipcRenderer` thô, chỉ expose API cụ thể qua `contextBridge`.
   - Validate tên endpoint bằng regex (`:45`).
   - Contract-driven + **Zod schema validation** cho mọi endpoint (`:23413`).
   - Error mapping an toàn, không lộ stack (`:23433`).
   → Tốt hơn hầu hết app Electron.

2. **HTTP server đều bind loopback** — `:7172`, `:12063`, `:23551` đều `listen(..., "127.0.0.1")`.

3. **`resolveWithinDirectory` chống traversal đúng** — chặn được Windows traversal, POSIX traversal, absolute, HTTP-style, UNC, verbatim. Chỉ thiếu edge case Windows (§M-01).

4. **Vault dùng `safeStorage` đúng chuẩn** — master key + machine key, file mode `384` (0600).

5. **SSE cleanup đúng** — xoá client khi `req.on("close")` (`:23488`).

6. **Cleanup tiến trình con đúng** — `stopMktFlowServer()` được gọi ở `will-quit` (`:23688`) và `before-quit`, có cờ `mktFlowStopping` chống vòng lặp restart.

7. **User data đúng chỗ** — `AppData\Roaming\omnira-studio` (không phải thư mục cài).

8. **Không có command injection** — mọi `spawn`/`execFile` dùng mảng tham số, không `shell: true`.

9. **Không lộ `api_key` thô qua response** — đều qua `maskSecret`/`sanitizeKeyStore`.

> **Nghịch lý cần nhấn mạnh:** cùng một codebase vừa có vault mã hoá chuẩn mực, vừa có hàm ghi key ra plaintext (C-02). Vấn đề **không phải thiếu năng lực kỹ thuật**, mà là thiếu nhất quán chính sách bảo mật.

---

## 6. PHẦN CHƯA QUÉT HẾT (giới hạn của báo cáo này)

Do 4 subagent bị dừng vì rate limit, các phần sau **chưa được quét đầy đủ**:

| Phần | Kích thước | Trạng thái |
|---|---|---|
| `my app/out/renderer/assets/index-01dFNdzs.js` | 57.413 dòng, 2,5 MB (bundle React) | ❌ chưa quét |
| `my app/out/main/index.js` | 23.654 dòng | ⚠️ quét một phần (IPC, HTTP, mkt-flow, secrets) — **còn ~20.000 dòng chưa đọc** |
| `my app/_archive_gia_lap/` | 2,9 MB — gồm `vault-auth.js` (578 d) | ❌ chưa quét |
| `my app/drizzle/` | 47 migration | ❌ chưa quét |
| `my app/scripts/generate-drizzle.cjs` | 797 dòng | ❌ chưa quét |
| `PROJECT_ARCHITECTURE_SPEC.md` + `SYSTEM_SPECIFICATION.md` | 270 KB | ❌ chưa đối chiếu |
| `my app/resources/mkt-flow/apps/.../src/features/*.jsx` | ~7.000 dòng | ⚠️ có báo cáo cũ từ vòng trước (bản `mkt-flow/` đã xoá) — logic tương tự |

**Ưu tiên nếu muốn quét tiếp:** `out/main/index.js` phần còn lại (database, AI engines, license, auth), rồi `_archive_gia_lap/out-main/vault-auth.js` (liên quan trực tiếp C-02).

---

## 7. THỨ TỰ THỰC HIỆN ĐỀ XUẤT

**Hôm nay (30 phút):**
1. **Sửa 1 dòng ở `out/main/index.js:88`:** thêm `USER_DATA_PATH: electron.app.getPath("userData")` vào env khi spawn mkt-flow. → chặn nguồn ghi dữ liệu vào thư mục cài.
2. Thu hồi 15 key (coi như đã lộ).
3. Xoá `resources/mkt-flow/runtime/database/keys.json`.
4. Xoá `resources/mkt-flow/runtime/uploads/*` (330 MB).
5. Sửa `syncAllAiSecretsToMktFlow` — bỏ `writeFileSync`, hoặc ghi vào `userData`.

**Trước build tiếp theo (2–3 giờ):**
5. Sửa `build_package.ps1` (đường dẫn + guard đúng).
6. Thêm auth token cho `/api/*` (C-03).
7. Thêm `fileFilter` cho `/api/upload` (H-06).

**Sprint này (1–2 ngày):**
8. Sửa `scorer.js` bonus (H-03).
9. Sửa `platforms.js` scheme/port (H-04).
10. Xoá 50 hard-code path (H-05).
11. Fix mojibake toàn bộ (H-07).
12. Chuyển `scratch/` patches vào source (H-08).

**Sau đó:**
13. Các mục MEDIUM §4.
14. Quét nốt phần còn lại §6.
