# Phát hiện của Lead — điều tra độc lập trên `my app/`

> Ghi chú thô của Lead trong lúc 4 teammate chạy Track E/F/G/H.
> Mọi mục đã được Lead tự đọc code tại đúng dòng.

---

## 🔴 L-E01 (CRITICAL) — `syncAllAiSecretsToMktFlow()` phá vỡ kho bí mật, ghi API key ra plaintext

**Vị trí:** `my app/out/main/index.js:17237-17279` (được gọi ở `:59` mỗi lần khởi động mkt-flow, và `:17283`)

### Đây là NGUYÊN NHÂN GỐC của sự cố 15 API key bị lộ

Omnira Studio **có** một kho bí mật được thiết kế đúng:

```js
// :2519-2533 — dùng Electron safeStorage (Windows DPAPI)
return electron.safeStorage.isEncryptionAvailable();
...
masterKey = Buffer.from(electron.safeStorage.decryptString(node_fs.readFileSync(file2)), "base64");
node_fs.writeFileSync(file2, electron.safeStorage.encryptString(masterKey.toString("base64")), { mode: 384 });
```
```js
// :17236
const backendName = () => process.platform === "win32" ? "Windows DPAPI" : ... "macOS Keychain" ...
```
```js
// :2602, :2618
function putSecret(input) { ... }
function readSecret(ownerType, ownerId, kind) { ... }
```

Nhưng ngay cạnh đó, hàm này **hạ cấp bí mật xuống plaintext**:

```js
// :17237-17279
function syncAllAiSecretsToMktFlow() {
  const mktKeysPath = node_path.join(mktFlowDir, "runtime/database/keys.json");
  if (!node_fs.existsSync(mktKeysPath)) return;
  const mktKeys = JSON.parse(node_fs.readFileSync(mktKeysPath, "utf8")) || {};
  for (const pName of ["gemini", "nvidia", "openai"]) {
    const secret = readSecret("ai_provider", row.id, "api_key");   // đọc từ vault MÃ HOÁ
    const keys = parseKeyPool(secret);
    keys.forEach(k => {
      mktKeys[pName].push({
        api_key: k,                    // <-- GHI PLAINTEXT
        status: "ACTIVE", ...
      });
    });
  }
  if (changed) {
    node_fs.writeFileSync(mktKeysPath, JSON.stringify(mktKeys, null, 2), "utf8");  // <-- :17273
  }
}
```

### Vì sao nghiêm trọng

1. **Vô hiệu hoá toàn bộ vault.** Key được bảo vệ bằng DPAPI, rồi bị sao chép nguyên văn sang JSON không mã hoá. Kẻ đọc được file là có key, không cần phá DPAPI.
2. **Ghi vào thư mục BỊ ĐÓNG GÓI.** `mktFlowDir` = `my app/resources/mkt-flow/` — chính thư mục `build_package.ps1` nén vào installer. Bằng chứng: `my app/resources/mkt-flow/runtime/database/keys.json` hiện có đúng 15 key ACTIVE.
3. **Tự động lặp lại.** Hàm chạy ở `:59` (mỗi lần start mkt-flow) và `:17283` (mỗi lần mở màn hình `ai.providers`). Người dùng nhập key mới → key mới lại bị ghi ra đĩa.
4. **Không có cảnh báo.** Chỉ có `console.info("[ai] Đã đồng bộ toàn bộ secret từ Omnira sang MKT FLOW keys.json...")` — không nói rõ đây là ghi plaintext.

### Đây là mâu thuẫn thiết kế, không phải lỗi nhỏ

Ứng dụng tuyên bố dùng "Windows DPAPI / macOS Keychain" (`backendName`, `:17236`) nhưng thực tế vẫn tồn tại một bản sao plaintext trên đĩa. Bất kỳ ai tin vào tuyên bố đó đều bị đánh lừa về mức độ an toàn thật.

### Cách sửa (chọn 1)

**Cách A (khuyến nghị) — bỏ hẳn việc ghi ra file:**
mkt-flow nên đọc key qua IPC/biến môi trường tạm thời do tiến trình cha truyền, không qua file trên đĩa.

**Cách B — nếu buộc phải có file:** mã hoá `keys.json` bằng `safeStorage` trước khi ghi, và giải mã trong mkt-flow (cần đổi `keyManager.js`).

**Cách C — tối thiểu, nếu chưa làm được A/B:**
- Ghi vào thư mục ngoài gói cài (ví dụ `app.getPath('userData')`), **không** ghi vào `resources/`.
- Chặn cứng trong `build_package.ps1` (xem file `SECURITY-KEYS-LEAK.md`).
- Xoá `keys.json` khỏi `resources/mkt-flow/` hiện tại.
- Cảnh báo rõ trong log rằng đây là bản sao plaintext.

---

## 🟠 L-E02 (HIGH) — Đường dẫn tuyệt đối hard-code của máy dev, gồm cả node.exe cá nhân

**Vị trí:** `my app/out/main/index.js:9, 12, 13, 45, 46, 47`

```js
// :9
"C:\\Users\\nminh\\Desktop\\vibe - code\\omni\\my app\\resources\\mkt-flow",
// :12-13
"C:\\Users\\nminh\\Desktop\\vibe - code\\omni\\mkt-flow",
"C:\\Users\\nminh\\Desktop\\vibe - code\\MKT FLOW"
```
```js
// :45-47 (resolveNodeBinary)
"C:\\Users\\nminh\\Desktop\\vibe - code\\omni\\my app\\resources\\mkt-flow\\runtime\\bin\\node.exe",
"C:\\Users\\nminh\\Desktop\\vibe - code\\omni\\runtime\\node.exe",
"C:\\Users\\nminh\\AppData\\Local\\hermes\\node\\node.exe"   // <-- node.exe của công cụ khác trên máy dev
```

**Tác động:**
- Trên máy người dùng khác, các đường dẫn này không tồn tại → luôn trượt (vô hại nhưng vô nghĩa).
- **Rủi ro thật:** dòng 47 trỏ tới `AppData\Local\hermes\node\node.exe` — một runtime Node của công cụ khác. Nếu máy người dùng tình cờ có đường dẫn này, app sẽ chạy mkt-flow bằng **Node không kiểm soát được**. Đây là rủi ro thực thi mã ngoài ý muốn.
- Rò rỉ cấu trúc thư mục cá nhân vào bản phát hành.

**Cách sửa:** xoá cả 6 hằng số; chỉ giữ `process.resourcesPath` và `path.resolve(__dirname, ...)`.

---

## ✅ L-E03 (ĐÃ RÚT LẠI) — lo ngại "tiến trình mồ côi" là SAI

Ban đầu Lead nghi `stopMktFlowServer()` không được gọi khi app thoát. **Đã kiểm chứng là SAI:**

```
:23250  electron.app.on("before-quit", () => {
:23675  electron.app.on("window-all-closed", () => {
:23680  electron.app.on("will-quit", (e) => {
:23688    stopMktFlowServer();
:23696    stopMktFlowServer();
```

Cleanup được gọi ở **cả `will-quit` lẫn `before-quit`**, và có cờ `mktFlowStopping` (`:27,29,100,102`) để chặn logic tự restart (`:102` kiểm tra `if (!mktFlowStopping)`) — tức **có** chống vòng lặp restart vô hạn.

➡️ Đây là ví dụ thứ hai (sau vụ `redirect: 'manual'`) cho thấy vì sao phải đọc hết trước khi buộc tội. Ghi lại để tránh báo động giả.

**Vấn đề thật còn lại** chỉ là ghi log vào thư mục cài đặt (giữ nguyên ở L-E04).

---

## 🔴 L-E05 (CRITICAL) — ~330 MB dữ liệu media CÁ NHÂN nằm trong thư mục đóng gói

**Vị trí:** `my app/resources/mkt-flow/runtime/uploads/`

Liệt kê thật (đã đo):

| Kích thước | File |
|---|---|
| 25.212.967 B | `40cae1e0cd0f40cee21642f21267adeb` |
| 22.408.814 B | `40cae1e0..._final.mp4` |
| 25.212.967 B | `591592901c8892de51c3304826d9ded7_final_logo.mp4` |
| 23.640.280 B | `591592901c8892de51c3304826d9ded7_final.mp4` |
| 17.699.526 B | `591592901c8892de51c3304826d9ded7` |
| 17.559.229 B | `f27d1b5347d187455df6b5cd7c7013d3_final_logo.mp4` |
| 17.072.916 B | `f27d1b5347d187455df6b5cd7c7013d3_final.mp4` |
| 15.851.544 B | ×4 file |
| 14.464.813 B | `64c7f41c..._final_logo.mp4` |
| 14.292.726 B | `64c7f41c..._final.mp4` |
| 12.774.392 B | `64c7f41c8fae1c1a08d24f79f7109394` |
| 8.392.389 B | `0d5e104801a2d2cf542c683051180d3d` |

**Tổng: 19 file, khoảng 330 MB.**

**Tác động:**
1. **Rò rỉ dữ liệu cá nhân**: đây là video người dùng đã tải/xử lý (bao gồm cả video đã gắn logo, đã lồng tiếng). Chúng nằm trong `resources/` → `build_package.ps1` nén vào installer → **phát hành kèm cho người khác**.
2. **Phình installer vô ích**: 330 MB cộng thẳng vào file cài 337 MB hiện tại. Gần như toàn bộ dung lượng installer là dữ liệu rác.
3. **Vấn đề thiết kế gốc**: mkt-flow ghi `uploads/` vào thư mục cài đặt thay vì `userData`. Trong bản đóng gói, thư mục này không nên tồn tại.

**Cách sửa:**
- Xoá sạch `runtime/uploads/*` trước khi build (thêm vào `build_package.ps1`).
- Đổi `uploadsDir` trong `server.js` sang `app.getPath('userData')` — tương tự cách `USER_DATA_PATH` đã làm cho `db`.
- Thêm bước kiểm tra trong build: nếu `uploads/` có file → dừng build.

---

## 🟠 L-E06 (HIGH) — `mkt-flow-server.log` bị ghi vào thư mục cài đặt

**Vị trí:** `my app/out/main/index.js:84-85` → `my app/resources/mkt-flow/runtime/mkt-flow-server.log` (96 B, sửa 16:31 hôm nay)

Xác nhận thật: file log **đã tồn tại** trong thư mục đóng gói. Log ứng dụng bị ghi vào vùng cài đặt, và sẽ bị đóng gói lại ở lần build sau.

**Cách sửa:** ghi vào `app.getPath('userData')/logs/`.

---

## 🟠 L-E03 (bản gốc) — `detached: false` nhưng không kill tiến trình con khi app thoát

**Vị trí:** `my app/out/main/index.js:86-90` và `stopMktFlowServer()` `:28-36`

```js
mktFlowProc = cp.spawn(nodeExe, [serverPath], {
  cwd: mktFlowDir,
  env: { ...process.env, PORT: "3002", NODE_ENV: "production" },
  stdio: ["ignore", "pipe", "pipe"],
  detached: false,
```
```js
function stopMktFlowServer() {
  mktFlowStopping = true;
  if (mktFlowProc) {
    try { mktFlowProc.kill(); } catch (_) {}
    mktFlowProc = null;
  }
}
```

`stopMktFlowServer` tồn tại nhưng cần kiểm chứng nó có được gọi trong `app.on('before-quit')` / `window-all-closed` hay không. Nếu không, tiến trình Node chạy mkt-flow sẽ **mồ côi**, giữ cổng 3002 và tiếp tục sống sau khi người dùng đóng app.

Thêm: log được ghi vào `path.join(mktFlowDir, "runtime/mkt-flow-server.log")` (`:84-85`) — **ghi log vào thư mục cài đặt**. Trên Windows, `Program Files` thường không cho ghi → có thể lỗi im lặng hoặc crash khi `createWriteStream`.

→ Cần teammate xác nhận có `before-quit` handler không.

---

## 🟡 L-E04 (MEDIUM) — Log ghi vào thư mục cài đặt thay vì userData

**Vị trí:** `my app/out/main/index.js:84-85`

```js
const logPath = path.join(mktFlowDir, "runtime/mkt-flow-server.log");
const outStream = fs.createWriteStream(logPath, { flags: "a" });
```

`mktFlowDir` nằm trong `resources/` của bản cài. Ghi log ở đây:
- Sai nguyên tắc (dữ liệu ghi được phải ở `app.getPath('userData')`).
- Có thể thất bại nếu app cài vào `Program Files`.
- Log tồn tại trong thư mục đóng gói → có thể bị đóng gói lại kèm dữ liệu cũ (xem `runtime/mkt-flow-server.log` có tồn tại không).

---

## ✅ Điểm sáng quan trọng — kiến trúc IPC được làm RẤT TỐT

Không phải chỉ toàn lỗi. Bề mặt IPC của Omnira Studio tốt hơn hầu hết app Electron:

**1. Preload không lộ `ipcRenderer` thô** (`out/preload/index.js`):
```js
// :44-47
invoke: (endpoint, input) => {
  if (typeof endpoint !== "string" || !/^[a-z][a-zA-Z]*\.[a-zA-Z]+$/.test(endpoint)) {
    return Promise.resolve({ ok: false, error: { code: "VALIDATION", message: "Endpoint không hợp lệ" } });
  }
```
Chỉ expose API cụ thể qua `contextBridge.exposeInMainWorld("omni", api)` (`:61`). Đây là cách làm đúng.

**2. Contract-driven + Zod validation** (`:23404-23434`):
```js
const schema2 = contract[endpoint]?.input;
const handler = handlers[endpoint];
if (!schema2 || !handler) return { ok:false, error:{ code:"VALIDATION", ... } };
const input = schema2.parse(raw);      // <-- validate bằng Zod
```
Mọi endpoint đều validate schema trước khi chạy. Lỗi được map sang `{code, message}` an toàn, không lộ stack (`:23433` "Lỗi nội bộ – xem log ứng dụng").

**3. HTTP server đều bind loopback** — `:7172`, `:12063`, `:23551` đều `listen(..., "127.0.0.1", ...)`. Không lộ ra mạng LAN.

**4. Vault dùng `safeStorage` đúng cách** — master key + machine key, file mode `384` (0600).

**5. SSE cleanup đúng** — `sseClients` xoá client khi `req.on("close")` (`:23488`).

**6. Có comment giải thích rõ ràng bằng tiếng Việt** — chất lượng cao hơn nhiều dự án.

➡️ Nghịch lý cần nhấn mạnh trong báo cáo: **cùng một codebase vừa có vault mã hoá chuẩn mực, vừa có hàm ghi key ra plaintext.** Vấn đề không phải thiếu năng lực kỹ thuật, mà là thiếu nhất quán trong chính sách bảo mật.

---

## Việc Lead cần xác minh tiếp

- [ ] `stopMktFlowServer()` có được gọi khi app quit không (`before-quit`, `will-quit`)
- [ ] Logic tự restart (`:98`) có chống vòng lặp vô hạn không
- [ ] `runtime/mkt-flow-server.log` có tồn tại (dấu hiệu đã ghi vào thư mục đóng gói)
- [ ] Có `shell.openExternal` với URL không kiểm tra không
