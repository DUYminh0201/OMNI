# ĐẶC TẢ KỸ THUẬT HỆ THỐNG TOÀN DIỆN (FORENSIC SYSTEM SPECIFICATION)

- **Tên hệ thống:** Omnira Studio (Định danh nội bộ: `omnira-studio`, AppUserModelId: `com.omnipage.studio`)
- **Phiên bản:** `1.2.7`
- **Nền tảng thực thi:** Electron Desktop Runtime (Windows `win32` / macOS `darwin` / Linux) kết hợp Máy chủ HTTP/SSE cục bộ (`127.0.0.1:5173`) và Máy chủ Python VieNeu-TTS nhúng (`127.0.0.1:<dynamic_port>`).
- **Mục tiêu tài liệu:** Đặc tả kỹ thuật mức độ Forensic (pháp y mã nguồn) toàn bộ 100% kiến trúc, luồng khởi động, biến môi trường, giao diện, trạng thái, 33 bảng cơ sở dữ liệu, 268 RPC endpoints, các kết nối HTTP/CDP bên ngoài và công thức nghiệp vụ để tái xây dựng (rebuild) chính xác hệ thống mà không cần tham chiếu mã nguồn cũ.

---

## PHẦN 1: MÔ HÌNH HỆ THỐNG & CƠ CHẾ KHỞI ĐỘNG (SYSTEM BOOTSTRAP)

### 1.1. Entry Point & Lifecycle (Chu trình Khởi động & Đóng ứng dụng)

Hệ thống hỗ trợ 2 phương thức khởi chạy từ hệ điều hành thông qua 2 tệp Batch tại thư mục gốc và đi qua 4 giai đoạn nạp tuần tự:

#### Giai đoạn 0: Kịch bản Khởi chạy cấp Hệ điều hành (`run-local.bat` & `run-http.bat`)
1. **[`run-local.bat`](file:///c:/Users/nminh/Desktop/aaaaaaaaaaaaaaaaaaaaaaa/run-local.bat) (Chế độ Desktop Native):**
   - Thiết lập bảng mã UTF-8 cho console: `chcp 65001 >nul`.
   - Xóa biến môi trường `ELECTRON_RUN_AS_NODE=` để đảm bảo tệp thực thi khởi chạy dưới dạng Electron GUI thay vì Node.js thuần.
   - Buộc dừng tiến trình cũ: `taskkill /F /IM "Omnira Studio.exe" >nul 2>&1` và đợi 1 giây (`timeout /t 1 /nobreak >nul`).
   - Khởi chạy tệp nhị phân: `start "" "%~dp0runtime\Omnira Studio.exe"`.
2. **[`run-http.bat`](file:///c:/Users/nminh/Desktop/aaaaaaaaaaaaaaaaaaaaaaa/run-http.bat) (Chế độ Headless Tray + Web Browser):**
   - Thực hiện các bước chuẩn bị giống hệt `run-local.bat`.
   - Khởi chạy tệp nhị phân kèm 2 cờ dòng lệnh: `start "" "%~dp0runtime\Omnira Studio.exe" --hidden --open-http`.

#### Giai đoạn 1: Khởi chạy Main Process (`my app/out/main/index.js`)
Entry point đầu tiên được khai báo tại trường `"main": "./out/main/index.js"` trong [`my app/package.json`](file:///c:/Users/nminh/Desktop/aaaaaaaaaaaaaaaaaaaaaaa/my%20app/package.json#L6). Trình tự thực thi trong [`out/main/index.js`](file:///c:/Users/nminh/Desktop/aaaaaaaaaaaaaaaaaaaaaaa/my%20app/out/main/index.js) diễn ra chính xác theo thứ tự dòng lệnh sau:

1. **Nạp 25 Module Cốt lõi (`L1-26`):**
   - Nạp tuần tự: `electron`, `node:fs`, `node:path`, `os`, `node:child_process`, `node:util`, `zod`, `node:crypto`, `drizzle-orm`, `better-sqlite3`, `drizzle-orm/better-sqlite3`, `drizzle-orm/better-sqlite3/migrator`, `drizzle-orm/sqlite-core`, `node:fs/promises`, `ffmpeg-static`, `ffprobe-static`, `patchright-core`, `node:stream`, `node:stream/promises`, `@anthropic-ai/sdk`, `node:http`, `node:net`, `node:tls`, `msedge-tts`, `node:url`.
2. **Khởi tạo Hợp đồng Giao tiếp & Schema (`L27-2341`):**
   - Khai báo bảng hằng số kênh IPC `IpcChannel` (`L27-41`).
   - Khai báo bảng hợp đồng xác thực dữ liệu `contract` gồm **268 endpoints** sử dụng `zod` (`L547-1421`), tập hợp `PUBLIC_ENDPOINTS` (`L500-518`) và `UNLICENSED_ENDPOINTS` (`L519-546`).
   - Khai báo định nghĩa **33 bảng Drizzle ORM SQLite** (`L1472-2331`).
3. **Đăng ký Giao thức Đa phương tiện Đặc quyền (`registerMediaScheme` - `L19384-19386`, gọi tại `L22880`):**
   - Thực thi **trước** khi `electron.app.whenReady()` hoàn tất:
   - Gọi `electron.protocol.registerSchemesAsPrivileged([{ scheme: "omni-media", privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }])`.
4. **Kiểm tra Khóa Đơn Tiến trình (`requestSingleInstanceLock` - `L22903-22906`):**
   - Gọi `electron.app.requestSingleInstanceLock()`.
   - Nếu trả về `false` (đã có một tiến trình Omnira Studio đang chạy): Gọi `electron.app.quit()` ngay lập tức.
   - Nếu trả về `true`: Đăng ký listener `electron.app.on("second-instance", () => showWindow())` để khôi phục và đưa cửa sổ hiện có lên tiền cảnh khi người dùng mở thêm ứng dụng lần thứ hai.
5. **Chuỗi Khởi tạo khi Electron Sẵn sàng (`electron.app.whenReady().then(...)` - `L22907-22987`):**
   - **Bước 5.1 (`L22908`):** Đặt định danh ứng dụng hệ điều hành `electron.app.setAppUserModelId("com.omnipage.studio")`.
   - **Bước 5.2 (`L22909`):** Khởi tạo bộ ghi nhật ký xoay vòng `initLogger()` (`L186-213`): tạo thư mục `<userData>/logs`, mở file `main.log`, đảm bảo BOM UTF-8 (`0xEF, 0xBB, 0xBF`), xoay vòng file khi vượt `5 MB` (`MAX_BYTES = 5 * 1024 * 1024`, giữ tối đa `KEEP = 3` bản sao lưu `.1`, `.2`, `.3`), ghi đè `console.log`, `console.info`, `console.warn`, `console.error`, và bắt sự kiện `process.on("uncaughtException")` cùng `process.on("unhandledRejection")`.
   - **Bước 5.3 (`L22910-22915`):** Gọi `writeDataMarker()` (`L1444-1449`) để kiểm tra tệp con trỏ `<userData>/data-location.json` và ghi tệp đánh dấu `<dataRoot>/omnipage-data.json` với nội dung `{ app: "Omnira Studio", version: 1, createdAt }`.
   - **Bước 5.4 (`L22916`):** Đọc chủ đề đã lưu từ `<userData>/ui-theme.json` qua `savedTheme()` và áp dụng qua `applyTheme()` (`L57-65`).
   - **Bước 5.5 (`L22917-22927`):** Khôi phục phiên đăng nhập đã ghi nhớ qua `restoreSession()` (`L2605-2625`):
     - Đọc token phiên từ `<dataRoot>/auth/session.bin` (giải mã bằng `electron.safeStorage.decryptString`), băm SHA-256 và đối chiếu với `rememberTokenHash` cùng `rememberExpiresAt` (hạn 30 ngày) trong `<dataRoot>/auth/users.json`.
     - Nếu hợp lệ, gọi `openSession(remembered)` (`L15465-15517`): đặt `setCurrentUser(user.id)`, chạy migrations SQLite (`getDb()`), nạp khóa két sắt `master.bin`, thực thi `enforceQuota()`, và khởi động 5 tiến trình nền (`startPublisher()`, `startInbox()`, `startInsights()`, `startEarlyCheck()`, `startLicenseHeartbeat()`).
     - Nếu mở dữ liệu thất bại, gọi `forgetSession(remembered.id)` và hiển thị hộp thoại lỗi `electron.dialog.showErrorBox`.
   - **Bước 5.6 (`L22928`):** Gọi `registerIpc()` (`L22883-22902`) đăng ký 5 kênh IPC điều khiển cửa sổ và thông tin ứng dụng (`window:minimize`, `window:toggle-maximize`, `window:close`, `app:set-theme`, `app:info`).
   - **Bước 5.7 (`L22929`):** Gọi `registerApi()` (`L22757-22761`) duyệt toàn bộ `Object.keys(contract)` và đăng ký `electron.ipcMain.handle("api:" + endpoint, (_event, raw) => invokeEndpoint(endpoint, raw))`.
   - **Bước 5.8 (`L22930`):** Gọi `handleMediaProtocol()` (`L19407-19414`) gắn bộ xử lý giao thức `omni-media://` qua `electron.protocol.handle("omni-media", ...)`.
   - **Bước 5.9 (`L22931`):** Gọi `startHttpServer()` (`L22794-22879`) khởi chạy máy chủ HTTP nội bộ lắng nghe tại `127.0.0.1:5173` (hoặc cổng trong `process.env.OMNI_HTTP_PORT`). Nếu có cờ `--open-http`, tự động mở trình duyệt mặc định tới `http://localhost:5173`.
   - **Bước 5.10 (`L22932-22935`):** Tạo cửa sổ chính `mainWindow = createMainWindow({ hidden: startHidden() })`, gắn cơ chế ẩn xuống khay hệ thống khi bấm nút X (`hideOnClose(mainWindow)`), tạo biểu tượng System Tray (`setupTray(() => mainWindow)`), và gắn bộ thu thập log từ Renderer (`attachRendererLogging(mainWindow.webContents)`).
   - **Bước 5.11 (`L22936-22980`):** Đăng ký các cầu nối phát sự kiện thời gian thực từ Main Process xuống cả Electron `mainWindow.webContents` và các kết nối HTTP SSE (`broadcastHttpEvent`):
     - `onLicenseState` & `onQuotaChange` → phát `license:changed`.
     - `startSystemStats` (chu kỳ `2000ms`) → phát `system:stats`.
     - `bindInboxEvents` → phát `inbox:changed` và hiển thị thông báo đẩy hệ điều hành (`electron.Notification`) nếu cửa sổ không được focus (giãn cách tối thiểu `20,000ms` giữa 2 thông báo).
     - `bindEarlyCheckEvents` → hiển thị thông báo đẩy hệ điều hành khi phát hiện bài đăng bị bóp tương tác và điều hướng về `"/"` khi bấm vào thông báo.
6. **Chu trình Đóng ứng dụng An toàn (`will-quit` - `L22992-23010`):**
   - Khi nhận sự kiện `will-quit`, ứng dụng chặn thoát tức thời (`e.preventDefault()`), đặt cờ `quitting2 = true`, và thực thi dọn dẹp đồng bộ + bất đồng bộ:
     1. `closeSession()`: Dừng toàn bộ 5 background timers, chạy `pragma("wal_checkpoint(TRUNCATE)")` và đóng kết nối SQLite.
     2. `cancelInstall()`: Hủy tiến trình tải/cài đặt Python VieNeu-TTS nếu đang chạy.
     3. `stopTtsStudio()`: Dừng worker đọc văn bản TTS Studio.
     4. `killEngine()`: Dừng máy chủ HTTP Python VieNeu-TTS.
     5. Chạy `Promise.race` với giới hạn thời gian **3,500ms** để đóng nhẹ nhàng 3 trình duyệt tự động hóa (`closeFlowChrome()`, `closeMuseChrome()`, `closeGrokChrome()`), sau đó trong khối `.finally()` cưỡng bức diệt các tiến trình trình duyệt còn sót (`killFlowChrome()`, `killMuseChrome()`, `killGrokChrome()`) rồi gọi `electron.app.exit()`.

#### Giai đoạn 2: Nạp Preload Script (`my app/out/preload/index.js`)
Khi `BrowserWindow` khởi tạo (`L86`), Electron nạp [`out/preload/index.js`](file:///c:/Users/nminh/Desktop/aaaaaaaaaaaaaaaaaaaaaaa/my%20app/out/preload/index.js) trong môi trường `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`:
- Định nghĩa hàm `subscribe(channel, cb)` (`L19-23`) bọc `electron.ipcRenderer.on(channel, listener)` và trả về hàm hủy đăng ký `removeListener`.
- Đóng gói đối tượng `api` (`L24-60`) gồm 5 nhánh: `window`, `app`, `system`, `inbox`, `api` và xuất ra phạm vi toàn cục của Renderer thành `window.omni` thông qua `electron.contextBridge.exposeInMainWorld("omni", api)` (`L61`).

#### Giai đoạn 3: Nạp Renderer & Khởi tạo React Tree (`index.html` → `omni-http-bridge.js` → `index-01dFNdzs.js`)
1. **[`out/renderer/index.html`](file:///c:/Users/nminh/Desktop/aaaaaaaaaaaaaaaaaaaaaaa/my%20app/out/renderer/index.html):**
   - Thiết lập `<html lang="vi" data-theme="dark" class="dark">`.
   - Áp dụng chính sách bảo mật nội dung (CSP): `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https: omni-media:; media-src 'self' blob: omni-media:; font-src 'self' data:`.
   - Nạp [`./omni-http-bridge.js`](file:///c:/Users/nminh/Desktop/aaaaaaaaaaaaaaaaaaaaaaa/my%20app/out/renderer/omni-http-bridge.js): Nếu `window.omni` đã tồn tại (chạy trong Electron) thì thoát ngay (`if (typeof window === "undefined" || window.omni) return;`); nếu chạy trên trình duyệt web ngoài (chưa có `window.omni`), khởi tạo kết nối SSE `new EventSource("/__omni/events")`, khởi tạo `MutationObserver` tự động chuyển đổi mọi thuộc tính `src` và `poster` bắt đầu bằng `omni-media://` sang `/__omni/media/`, và gắn đối tượng giả lập `window.omni` gọi về `/__omni/info`, `/__omni/theme`, `/__omni/api`.
2. **[`out/renderer/assets/index-01dFNdzs.js`](file:///c:/Users/nminh/Desktop/aaaaaaaaaaaaaaaaaaaaaaa/my%20app/out/renderer/assets/index-01dFNdzs.js) (`L57022-57035`):**
   - Gọi `applyStoredTheme()` (`L57022`) đọc theme từ `useUiStore.getState().theme` và đồng bộ thuộc tính `data-theme` cùng class `dark` trên thẻ `<html>`.
   - Khởi tạo `queryClient` của TanStack React Query (`L57026-57032`) gắn bộ bắt lỗi `onAuthError` vào cả `QueryCache` và `MutationCache`.
   - Gọi `createRoot(document.getElementById("root")).render(...)` (`L57033-57035`) với cấu trúc bọc:
     `<StrictMode>` → `<QueryClientProvider client={queryClient}>` → `<App />`.

---

### 1.2. Bảng Toàn bộ Biến Môi trường (`process.env`) & Cờ Dòng lệnh (`process.argv`)

Hệ thống không đọc tệp `.env` bên ngoài mà đọc trực tiếp từ `process.env` của tiến trình hệ điều hành với các giá trị mặc định cứng (fallback defaults) được lập trình sẵn trong [`out/main/index.js`](file:///c:/Users/nminh/Desktop/aaaaaaaaaaaaaaaaaaaaaaa/my%20app/out/main/index.js):

| STT | Tên biến / Cờ | Vị trí trong `out/main/index.js` | Giá trị mặc định (Default) | Ý nghĩa & Tác động kỹ thuật |
| :-: | :--- | :---: | :--- | :--- |
| 1 | `ELECTRON_RUN_AS_NODE` | `run-local.bat:3`, `run-http.bat:3` | Rỗng (`""`) | Được xóa về rỗng trong tệp `.bat` để ngăn Electron chạy ở chế độ Node CLI khi khởi chạy từ một IDE dựa trên Electron (như VS Code / Cursor / Antigravity). |
| 2 | `ELECTRON_RENDERER_URL` | `L111-112` | `undefined` | Nếu có, `BrowserWindow` tải giao diện từ URL dev server (Vite HMR) thay vì tải tệp tĩnh `../renderer/index.html`. |
| 3 | `OMNI_HTTP_PORT` | `L22795` | `5173` | Cổng TCP trên `127.0.0.1` mà máy chủ HTTP/SSE nội bộ lắng nghe. |
| 4 | `OMNI_DB_PATH` | `L2308` | `<userDir>/data/omnipage.db` | Ghi đè đường dẫn tệp cơ sở dữ liệu SQLite của người dùng hiện tại (dùng khi kiểm thử tự động). |
| 5 | `OMNI_SEED` | `L2495` | `undefined` (`!== "1"`) | Khi đặt bằng `"1"`, cho phép hàm `seedDemoData()` tạo dữ liệu mẫu vào cơ sở dữ liệu trống. |
| 6 | `OMNI_CLOUD_URL` | `L2862` | `"https://api.omnira.io.vn"` | Địa chỉ máy chủ Backend trung tâm của Omnira (xác thực, bản quyền, thanh toán VietQR, OAuth trung gian, ticket hỗ trợ, AI Cloud). |
| 7 | `OMNI_LICENSE_PUBLIC_KEY` | `L3692`, `L3701` | `LICENSE_PUBLIC_KEY` (RSA 2048-bit PEM ở `L3603-3612`) | Ghi đè khóa công khai RSA dùng để xác minh chữ ký JWT bản quyền `RS256` và bỏ qua kiểm tra `header.kid`. |
| 8 | `OMNI_FLOW_URL` | `L4109`, `L4146` | `"https://labs.google/fx/tools/flow"` | URL đích khi trình duyệt Chrome tự động hóa mở công cụ Google Labs Flow (Veo 3.1 / Nano Banana). |
| 9 | `OMNI_MUSE_URL` | `L6911` | `"https://muse.ai"` (`DEFAULT_MUSE_URL`) | URL đích khi trình duyệt Chrome tự động hóa mở công cụ tạo video Meta Muse AI. |
| 10 | `OMNI_GROK_URL` | `L7863` | `"https://grok.com/imagine"` (`DEFAULT_GROK_URL`) | URL đích khi trình duyệt Chrome tự động hóa mở công cụ tạo video Grok Imagine. |
| 11 | `OMNI_GRAPH_BASE` | `L10933` | `"https://graph.facebook.com"` | Base URL gọi Meta Graph API (`v23.0`) cho Facebook Page và Instagram Business. |
| 12 | `OMNI_GRAPH_VIDEO_BASE` | `L10934` | `"https://graph-video.facebook.com"` | Base URL tải video lên Facebook Page/Reels. |
| 13 | `OMNI_RUPLOAD_BASE` | `L10935` | `"https://rupload.facebook.com"` | Base URL tải luồng nhị phân video (`ig-api-upload` / `facebook-video-upload`) lên máy chủ Meta. |
| 14 | `OMNI_FB_DIALOG_BASE` | `L19791` | `"https://www.facebook.com"` | Base URL mở hộp thoại cấp quyền OAuth của Facebook (`/<version>/dialog/oauth`). |
| 15 | `OMNI_TIKTOK_BASE` | `L10936` | `"https://open.tiktokapis.com"` | Base URL gọi TikTok Open API v2 (`/v2/post/publish/...`, `/v2/user/info/`, `/v2/video/list/`). |
| 16 | `OMNI_TIKTOK_AUTH_BASE` | `L19970` | `"https://www.tiktok.com"` | Base URL mở trang cấp quyền OAuth v2 kèm PKCE của TikTok (`/v2/auth/authorize/`). |
| 17 | `OMNI_YT_AUTH_BASE` | `L11758` | `"https://accounts.google.com"` | Base URL mở trang cấp quyền Google OAuth 2.0 cho YouTube (`/o/oauth2/v2/auth`). |
| 18 | `OMNI_YT_TOKEN_BASE` | `L11759` | `"https://oauth2.googleapis.com"` | Base URL đổi authorization code và làm mới access token của Google (`/token`). |
| 19 | `OMNI_YT_API_BASE` | `L11760` | `"https://www.googleapis.com"` | Base URL gọi YouTube Data API v3 (`/youtube/v3/channels`, `/upload/youtube/v3/videos`, `/youtube/v3/commentThreads`). |
| 20 | `OMNI_YT_ANALYTICS_BASE` | `L12077` | `"https://youtubeanalytics.googleapis.com"` | Base URL gọi YouTube Analytics API v2 (`/v2/reports`) lấy lượt xem và số phút xem theo ngày. |
| 21 | `OMNI_OAUTH_FETCH` | `L11245`, `L11753` | `undefined` (`!== "1"`) | Khi đặt bằng `"1"`, tự động gọi `fetch(authUrl)` ngầm thay vì chỉ mở trình duyệt ngoài (phục vụ môi trường test OAuth mock). |
| 22 | `OMNI_TRENDS_URL` | `L20570` | `"https://trends.google.com/trending/rss"` | Endpoint RSS lấy danh sách từ khóa xu hướng tìm kiếm hàng ngày của Google Trends (`?geo=VN`). |
| 23 | `OMNI_PICK_DIR` | `L16058` | `undefined` | Nếu có, trả về thẳng đường dẫn thư mục này thay vì mở hộp thoại `dialog.showOpenDialog` khi di chuyển thư mục dữ liệu. |
| 24 | `OMNI_NO_RELAUNCH` | `L16065` | `undefined` (`!== "1"`) | Khi đặt bằng `"1"`, ngăn ứng dụng gọi `app.relaunch()` và `app.exit(0)` sau khi đổi thư mục dữ liệu. |
| 25 | `ProgramFiles` & `SystemRoot` | `L9362`, `L9515` | `"C:\\Program Files"` & `"C:\\Windows"` | Biến hệ thống Windows dùng để định vị `nvidia-smi.exe` (dò GPU CUDA cho VieNeu-TTS) và `System32\tar.exe` (giải nén gói Python `uv`). |
| 26 | Cờ CLI `--hidden` | `L22563`, `L22589` | Không bật | Khởi tạo cửa sổ chính ở trạng thái ẩn (`createMainWindow({ hidden: true })`), chỉ hiện biểu tượng dưới khay hệ thống (System Tray). |
| 27 | Cờ CLI `--open-http` | `L22875` | Không bật | Ngay sau khi máy chủ HTTP nội bộ (`127.0.0.1:5173`) khởi động xong, tự động gọi `electron.shell.openExternal("http://localhost:5173")`. |

---

### 1.3. Kiến trúc Tổng thể & Sơ đồ Cây Thư mục Chi tiết

#### A. Mô hình Kiến trúc (Architecture Pattern)
Omnira Studio được thiết kế theo mô hình **Multi-Process Modular Monolith kết hợp Dual-Transport RPC và Event-Driven Background Workers**:
1. **Presentation Layer (Renderer Process):** Ứng dụng đơn trang (SPA) xây dựng bằng React 18, định tuyến bằng `HashRouter`, chia sẻ các nguyên tử giao diện theo hướng Atomic UI Primitives và quản lý trạng thái bất đồng bộ qua TanStack Query kết hợp Zustand.
2. **Transport & Security Boundary Layer (IPC / HTTP-SSE Bridge):**
   - Giao diện gọi duy nhất một cổng `window.omni.api.invoke(endpoint, input)` mà không cần biết bên dưới là Electron IPC (`ipcRenderer.invoke`) hay HTTP REST (`POST /__omni/api`).
   - Luồng sự kiện đẩy một chiều từ Backend xuống Frontend đồng thời qua `webContents.send` và SSE (`GET /__omni/events`).
   - Luồng phục vụ tệp đa phương tiện cục bộ đi qua giao thức ảo `omni-media://` (trong Electron) hoặc `/__omni/media/` (trên trình duyệt web) có kiểm tra chống leo thang thư mục (Path Traversal Protection).
3. **Application & Domain Layer (Main Process RPC Router & 5 Background Daemons):**
   - Bộ định tuyến `invokeEndpoint` kiểm soát xác thực, bản quyền RS256, quyền tính năng (`FeatureGate`), xác thực kiểu dữ liệu `zod` và điều phối xuống 22 nhóm `handlers` (tổng cộng 268 endpoints).
   - 5 tiến trình ngầm độc lập (`Publisher`, `InboxSync`, `InsightsSync`, `EarlyReachCheck`, `LicenseHeartbeat`) cùng 3 bộ điều phối hàng đợi sản xuất (`RenderQueue`, `FilmTakeQueue`, `TtsJobQueue`) chạy bất đồng bộ trong Main Process.
4. **Infrastructure & Persistence Layer (Per-User SQLite + AES-256-GCM Vault + CDP Automation):**
   - Mỗi tài khoản người dùng đăng nhập trên máy có một thư mục `<dataRoot>/users/<userId>/` riêng biệt chứa cơ sở dữ liệu SQLite (`omnipage.db`), két sắt khóa chủ (`master.bin` & `master.portable`), thư mục `media/` và 3 hồ sơ trình duyệt Chrome độc lập (`flow-chrome`, `muse-chrome`, `grok-chrome`).

#### B. Sơ đồ Cây Thư mục Hoàn chỉnh & Chức trách Từng Tệp tin

```text
c:\Users\nminh\Desktop\aaaaaaaaaaaaaaaaaaaaaaa\
├── run-local.bat                                     # Kịch bản Windows Batch tắt tiến trình cũ và mở Omnira Studio ở chế độ cửa sổ Desktop
├── run-http.bat                                      # Kịch bản Windows Batch mở Omnira Studio ẩn dưới khay hệ thống và bật Web UI tại http://localhost:5173
├── PROJECT_ARCHITECTURE_SPEC.md                      # Tài liệu tổng quan kiến trúc hệ thống
├── SYSTEM_SPECIFICATION.md                           # Tài liệu đặc tả kỹ thuật pháp y mã nguồn (tệp hiện tại)
│
├── my app\                                           # Thư mục gốc chứa mã nguồn đã biên dịch và tài nguyên của ứng dụng
│   ├── package.json                                  # Khai báo tên gói "omnira-studio", version "1.2.7", main "./out/main/index.js" và 24 dependencies
│   │
│   ├── drizzle\                                      # Thư mục chứa 39 tệp SQL migration tuần tự cho cơ sở dữ liệu SQLite
│   │   ├── 0000_init.sql                             # Tạo 20 bảng gốc: workspaces, proxies, browser_profiles, accounts, channels, channel_metrics_daily,
│   │   │                                             #   secrets, ai_providers, ai_usage, content_items, content_variants, video_projects, video_scenes,
│   │   │                                             #   render_jobs, scheduled_posts, conversations, messages, quick_replies, auto_reply_rules, alerts, activity_log, settings
│   │   ├── 0001_workspace_tags_budget.sql            # Thêm cột `tags`, `ai_budget_usd`, `ai_token_quota`, `knowledge` vào bảng `workspaces`
│   │   ├── 0002_ai_router.sql                        # Thêm cột `base_url`, `available_models`, `latency_ms` vào bảng `ai_providers`
│   │   ├── 0003_media_engine.sql                     # Thêm cột `transition`, `subtitle_style`, `bgm_track`, `bgm_volume` vào `video_projects`
│   │   ├── 0004_publishing.sql                       # Thêm cột `attempts`, `next_attempt_at`, `first_comment_posted` vào `scheduled_posts`
│   │   ├── 0005_inbox_sync.sql                       # Thêm cột `delivery_status`, `delivery_error`, `send_after`, `attachments` vào `messages`
│   │   ├── 0006_engagement_features.sql              # Thêm cột `ai_meta` vào `messages` và cấu hình tự động tương tác
│   │   ├── 0007_series_plan_goals.sql                # Tạo 5 bảng mới: `series`, `series_characters`, `series_episodes`, `content_ideas`, `channel_goals`
│   │   ├── 0008_long_video.sql                       # Hỗ trợ thời lượng video dài (tới 900 giây) và trường `acts` trong `video_projects`
│   │   ├── 0009_acts.sql                             # Thêm cột `act` và `media_source` vào bảng `video_scenes`
│   │   ├── 0010_scene_media_mode.sql                 # Thêm cột `media_mode` ('auto'|'stock'|'image'|'veo'|'upload'|'none') vào `video_scenes`
│   │   ├── 0011_character_prompt.sql                 # Thêm cột `image_prompt`, `appearance_en`, `reference_image` vào `series_characters`
│   │   ├── 0012_visual_style_en.sql                  # Thêm cột `visual_style_en`, `visual_style_for` vào bảng `series`
│   │   ├── 0013_references_frames.sql                # Thêm `reference_images`, `visual_bible` vào `video_projects`; `start_image`, `end_image`, `scene_refs` vào `video_scenes`
│   │   ├── 0014_shot_prompts.sql                     # Mở rộng cấu trúc prompt phân cảnh cho tạo video AI
│   │   ├── 0015_clip_audio.sql                       # Thêm cột `clip_audio` và `clip_audio_volume` vào `video_projects`
│   │   ├── 0016_early_reach.sql                      # Thêm cột `early_checked_at`, `early_reach_flag` ('ok'|'low'|'zero') vào `scheduled_posts`
│   │   ├── 0017_film_studio.sql                      # Tạo 3 bảng Xưởng Phim AI: `film_projects`, `film_assets`, `film_takes`
│   │   ├── 0018_film_video.sql                       # Thêm cột `selected_video_take_id`, `duration_sec`, `dialogue`, `camera` cho cảnh quay phim
│   │   ├── 0019_series_film_link.sql                 # Liên kết `series` với `film_projects` (`production_mode`, `series_id`, `episode_id`, `proposal`)
│   │   ├── 0020_film_style_options.sql               # Thêm `genre`, `visual_style`, `dialogue_language`, `notes`, `video_resolution`, `video_audio`, `video_tier` vào `film_projects`
│   │   ├── 0021_film_cast_sync.sql                   # Đồng bộ dàn nhân vật giữa `series_characters` và `film_assets` (`series_character_id`)
│   │   ├── 0022_character_voice.sql                  # Thêm `voice_profile`, `voice_provider`, `voice_id`, `voice_mode` cho lồng tiếng nhân vật phim
│   │   ├── 0023_channel_quota.sql                    # Thêm cột `quota_blocked` (INTEGER) vào bảng `channels`
│   │   ├── 0024_prompt_source.sql                    # Thêm cột `description_src` và `prompt_manual` vào `film_assets` và `series_characters`
│   │   ├── 0025_film_subtitle_vi.sql                 # Thêm cột `subtitle_vi` vào `film_projects` và `subtitle`, `subtitle_src` vào `film_assets`
│   │   ├── 0026_film_upscale.sql                     # Thêm cột `upscale` và `source_take_id` vào bảng `film_takes`
│   │   ├── 0027_video_narration.sql                  # Thêm cột `narration` (bật/tắt lời thoại) vào bảng `video_projects`
│   │   ├── 0028_content_hook.sql                     # Thêm cột `hook_score` (lưu kết quả chấm điểm Hook & chính sách) vào `content_items`
│   │   ├── 0029_fashion.sql                          # Thêm cột `fashion` vào `video_projects` và `outfit` vào `video_scenes`
│   │   ├── 0030_cultured_synch.sql                   # Tạo 2 bảng Xưởng Ảnh AI: `image_projects` và `image_results`; thêm `image_project_id` vào `content_ideas`
│   │   ├── 0031_sudden_mercury.sql                   # Cập nhật liên kết ý tưởng ảnh quảng cáo trong `image_projects`
│   │   ├── 0032_perf_indexes.sql                     # Tạo các chỉ mục tối ưu truy vấn (`accounts_workspace_idx`, `channels_account_idx`, `posts_content_idx`, `messages_author_idx`, `film_takes_film_idx`)
│   │   ├── 0033_film_narration_watermark.sql         # Thêm cấu hình thuyết minh (`narration*`) và đóng dấu (`watermark*`) vào `film_projects` & `film_assets`
│   │   ├── 0034_film_end_frames.sql                  # Thêm cột `frame` ('start'|'end'|'chain') vào `film_takes` và `end_frames` vào `film_projects`
│   │   ├── 0035_film_chain_shots.sql                 # Thêm cột `chain_shots` vào `film_projects` và `start_source` vào `film_assets`
│   │   ├── 0036_film_drop_end_frames.sql             # Chuẩn hóa cơ chế nối cảnh `chain_shots` trong `film_projects`
│   │   ├── 0037_tts_jobs.sql                         # Tạo bảng `tts_jobs` cho Phòng thu Đọc văn bản (TTS Studio)
│   │   ├── 0038_tts_cast_srt.sql                     # Thêm cột `cast` (bảng phân vai giọng đọc JSON) và `srt_file` vào `tts_jobs`
│   │   └── meta\                                     # Chứa `_journal.json` và 38 tệp `0000_snapshot.json` .. `0038_snapshot.json` của Drizzle
│   │
│   ├── resources\                                    # Tài nguyên tĩnh sử dụng bởi Main Process và FFmpeg
│   │   ├── icon.png                                  # Icon ứng dụng (dùng cho cửa sổ chính và System Tray 32x32)
│   │   └── fonts\
│   │       ├── Montserrat-Black.ttf                  # Font chữ TrueType nạp trực tiếp vào bộ lọc `ass` của FFmpeg để vẽ phụ đề Karaoke & chữ lên ảnh
│   │       └── OFL-Montserrat.txt                    # Giấy phép Open Font License của font Montserrat
│   │
│   ├── out\                                          # Mã nguồn thực thi đã biên dịch
│   │   ├── main\
│   │   │   └── index.js                              # [23,011 dòng] Toàn bộ logic Main Process (SQLite, Vault, Auth, License, AI, CDP, FFmpeg, Workers, IPC, HTTP)
│   │   ├── preload\
│   │   │   └── index.js                              # [61 dòng] Cầu nối ContextBridge xuất `window.omni` vào thế giới chính của Renderer
│   │   └── renderer\
│   │       ├── index.html                            # [17 dòng] Khung HTML gốc, khai báo CSP và nạp `omni-http-bridge.js`, JS bundle, CSS bundle
│   │       ├── omni-http-bridge.js                   # [146 dòng] Lớp tương thích biến trình duyệt web thường thành client gọi `/__omni/*`
│   │       └── assets\
│   │           ├── index-01dFNdzs.js                 # [57,035 dòng] Toàn bộ mã nguồn giao diện React 18, Zustand stores, TanStack Query hooks & 18 màn hình
│   │           ├── index-D9-rggfQ.css                # [4,198 dòng] Toàn bộ CSS: @font-face, biến màu 3 chủ đề, Tailwind utilities, hiệu ứng Mica & Halloween
│   │           ├── zalo-join-CObQNn89.png            # Ảnh QR tham gia nhóm Zalo hỗ trợ Omnira hiển thị tại màn hình Đăng nhập/Đăng ký
│   │           ├── inter-*.woff2                     # 7 tệp font Inter Variable (vietnamese, latin, latin-ext, cyrillic, cyrillic-ext, greek, greek-ext)
│   │           ├── jetbrains-mono-*.woff2            # 5 tệp font JetBrains Mono Variable (vietnamese, latin, latin-ext, cyrillic, greek)
│   │           ├── montserrat-*.woff2 / *.woff       # 10 tệp font Montserrat 900 Black (vietnamese, latin, latin-ext, cyrillic, cyrillic-ext)
│   │           └── space-grotesk-*.woff2             # 3 tệp font Space Grotesk Variable (vietnamese, latin, latin-ext)
│   │
│   └── node_modules\                                 # Các gói thư viện Node.js phục vụ Main Process (bao gồm binary `better_sqlite3.node`, `ffmpeg.exe`, `ffprobe.exe`)
│
└── runtime\                                          # Bộ thực thi Electron đóng gói sẵn cho Windows x64
    ├── Omnira Studio.exe                             # Tệp thực thi Electron chính (188 MB)
    ├── ffmpeg.dll / libEGL.dll / libGLESv2.dll / ... # Các thư viện liên kết động của nhân Chromium và Vulkan/SwiftShader
    ├── locales\*.pak                                 # 55 gói ngôn ngữ bản địa hóa của Chromium (`vi.pak`, `en-US.pak`, ...)
    └── resources\
        ├── app\                                      # Bản sao ứng dụng được `Omnira Studio.exe` nạp mặc định khi chạy
        ├── drizzle\                                  # Bản sao thư mục migration ở cấp `process.resourcesPath`
        ├── fonts\Montserrat-Black.ttf                # Bản sao font chữ ở cấp `process.resourcesPath`
        └── icon.png                                  # Bản sao icon ứng dụng ở cấp `process.resourcesPath`
```

---

## PHẦN 2: BẢN ĐỒ ĐIỀU HƯỚNG & CẤU TRÚC GIAO DIỆN (UI/UX BLUEPRINT)

### 2.1. Routing & Navigation Hierarchy (Bảng Ánh xạ Toàn bộ Tuyến đường & Cổng Bảo vệ)

Toàn bộ cấu trúc định tuyến được khai báo trong hàm [`App` (`index-01dFNdzs.js:L56998-57021`)](file:///c:/Users/nminh/Desktop/aaaaaaaaaaaaaaaaaaaaaaa/my%20app/out/renderer/assets/index-01dFNdzs.js#L56998-L57021) sử dụng `HashRouter`. Trước khi vào `HashRouter`, người dùng bắt buộc đi qua cổng [`AuthGate` (`L56433-56473`)](file:///c:/Users/nminh/Desktop/aaaaaaaaaaaaaaaaaaaaaaa/my%20app/out/renderer/assets/index-01dFNdzs.js#L56433-L56473).

| STT | Route / Path | Component Chính & Dòng Code (`index-01dFNdzs.js`) | Layout Kế thừa | Điều kiện Truy cập (Auth Guard, License & Feature Gate) | Tham số Params / Query String (`useParams`, `useSearchParams`) |
| :-: | :--- | :--- | :--- | :--- | :--- |
| 0.1 | *(Pre-Router Gate 1)* | `LoginPage` (`L55749-55950`)<br>`VerifyEmailStep` (`L56081-56188`)<br>`ForgotPasswordStep` (`L55951-56080`) | Toàn màn hình độc lập (bọc trong `AuthGate`) | Kích hoạt khi `auth.state` trả về `state.user === null`. | Không có (quản lý bằng state cục bộ `mode`: `"login"` \| `"register"`, `verifyPending`, `forgotOpen`). |
| 0.2 | *(Pre-Router Gate 2)* | `UpdateRequired` (`L56302-56340`) | Toàn màn hình độc lập (bọc trong `AuthGate`) | Kích hoạt khi `state.user !== null` VÀ `cloud.appInfo` trả về `appInfo.updateRequired === true` (`compareVersion(currentVersion, minVersion) < 0`). | Không có. |
| 0.3 | *(Pre-Router Gate 3)* | `LicenseGate` (`L56341-56432`) | Toàn màn hình độc lập (bọc trong `AuthGate`) | Kích hoạt khi `state.user !== null`, `updateRequired === false`, VÀ `state.license.usable === false` (`status` thuộc `"checking"`, `"no_subscription"`, `"device_limit"`, `"revoked"`, `"expired"`, `"relogin"`, `"locked"`). | Không có. |
| 1 | `/` (`index: true`) | `DashboardPage` (`L37240-37381`) | `AppShell` (`L29808-29859`) | Đã qua `AuthGate` (`user !== null && license.usable === true`). | Đọc `activeWorkspaceId` từ `useUiStore`. |
| 2 | `/workspaces` | `WorkspacesPage` (`L49708-49820`) | `AppShell` (`L29808-29859`) | Đã qua `AuthGate`. | Không có (chọn Pocket qua state `selectedId` hoặc `activeWorkspaceId`). |
| 3 | `/accounts` | `AccountsPage` (`L30801-31158`) | `AppShell` (`L29808-29859`) | Đã qua `AuthGate`. | Không có (lọc nền tảng qua state `platform`: `"all"` \| `"facebook"` \| `"tiktok"` \| `"instagram"` \| `"youtube"`). |
| 4 | `/plan` | `PlanPage` (`L51133-51510`) | `AppShell` (`L29808-29859`) | Đã qua `AuthGate`. | Đọc `activeWorkspaceId` từ `useUiStore`. |
| 5 | `/content` | `ContentPage` (`L36413-36760`) | `AppShell` (`L29808-29859`) | Đã qua `AuthGate`. | `?create=1` (tự động mở `CreateContentDialog` khi điều hướng từ `CommandPalette` rồi xóa query param). |
| 6 | `/series` | `SeriesPage` (`L50533-51074`) | `AppShell` (`L29808-29859`) | Đã qua `AuthGate` + `<FeatureGate feature="SERIES">` (`lic.features.includes("SERIES")`). | `?series=<seriesId>` (tự động chọn series tương ứng khi mở trang). |
| 7 | `/studio` | `StudioPage` (`L48459-49226`) | `AppShell` (`L29808-29859`) | Đã qua `AuthGate` + `<FeatureGate feature="STUDIO">` (`lic.features.includes("STUDIO")`). | `?project=<projectId>` (mở thẳng dự án được chuyển từ `PlanPage` hoặc `SeriesPage`); `?new=1` (mở dự án mới). |
| 8 | `/image-studio` | `ImageStudioPage` (`L55213-55277`) | `AppShell` (`L29808-29859`) | Đã qua `AuthGate` + `<FeatureGate feature="STUDIO">` (`lic.features.includes("STUDIO")`). | `?project=<projectId>` (mở thẳng dự án ảnh được chuyển từ `PlanPage`). |
| 9 | `/tts` | `TtsPage` (`L55364-55549`) | `AppShell` (`L29808-29859`) | Đã qua `AuthGate` + `<FeatureGate feature="STUDIO">` (`lic.features.includes("STUDIO")`). | Không có. |
| 10 | `/film` | `FilmPage` (`L54452-54543`) | `AppShell` (`L29808-29859`) | Đã qua `AuthGate` + `<FeatureGate feature="FILM">` (`lic.features.includes("FILM")`) + Kiểm tra điều kiện engine trong `film.gate`. | Không có (hiển thị danh sách phim `FilmList`). |
| 11 | `/film/:id` | `FilmPage` → `FilmWorkspace` (`L54238-54451`) | `AppShell` (`L29808-29859`) | Đã qua `AuthGate` + `<FeatureGate feature="FILM">` + `film.gate`. | `useParams().id`: ID dự án phim cần mở trong bàn dựng 6 bước `FilmWorkspace`. |
| 12 | `/calendar` | `CalendarPage` (`L35853-36181`) | `AppShell` (`L29808-29859`) | Đã qua `AuthGate` + `<FeatureGate feature="CALENDAR">` (`lic.features.includes("CALENDAR")`). | Không có. |
| 13 | `/inbox` | `InboxPage` (`L37967-38100`) | `AppShell` (`L29808-29859`) | Đã qua `AuthGate` + `<FeatureGate feature="INBOX">` (`lic.features.includes("INBOX")`). | Không có. |
| 14 | `/analytics` | `AnalyticsPage` (`L51651-51758`) | `AppShell` (`L29808-29859`) | Đã qua `AuthGate` + `<FeatureGate feature="ANALYTICS">` (`lic.features.includes("ANALYTICS")`). | Không có. |
| 15 | `/settings` | `SettingsPage` (`L41169-41224`) | `AppShell` (`L29808-29859`) | Đã qua `AuthGate`. | `?tab=ai` \| `publish` \| `video` \| `system` (chuyển thẳng tới phân khu cài đặt tương ứng). |
| 16 | `/billing` | `BillingPage` (`L56625-56710`) | `AppShell` (`L29808-29859`) | Đã qua `AuthGate`. | Không có. |
| 17 | `/support` | `SupportPage` (`L56947-56997`) | `AppShell` (`L29808-29859`) | Đã qua `AuthGate`. | Không có. |
| 18 | `/guide` | `GuidePage` (`L51759-51956`) | `AppShell` (`L29808-29859`) | Đã qua `AuthGate`. | `?tab=facebook` \| `instagram` \| `tiktok` \| `youtube` (mở hướng dẫn của nền tảng tương ứng). |
| 19 | `*` (Wildcard) | `<Navigate to="/" replace />` (`L57019`) | `AppShell` | Mọi đường dẫn không khớp các route trên. | Tự động điều hướng thay thế (`replace: true`) về `/`. |

---

### 2.2. Cấu trúc Component & Màn hình (DOM/Component Tree & Cờ Trạng thái UI)

#### 0. Khung Bố cục Toàn cục `AppShell` (`L29808-29859`)
- **Cây Component:**
  - `AppShell`
    - `HalloweenAmbience` (`L28260-28268`) + `Spiders` (`L28322-28365`): Chỉ render khi `theme === "halloween"` (hoặc đang trong dịp lễ và bật hiệu ứng nhện `localStorage["event.halloween.spider"] !== "off"`).
    - `TitleBar` (`L29055-29091`)
      - `WorkspaceSwitcher` (`L28940-29035`): Dropdown chọn Pocket đang làm việc (`activeWorkspaceId`), nút tạo Pocket nhanh.
      - `FlowCredits` (`L28755-28788`): Hiển thị số credit Google Labs Flow còn lại (`flow.status`), đổi sang tone `warning` khi `credits <= 100`.
      - `RefreshLicenseButton` (`L29036-29054`): Gọi `license.refresh`.
      - `NotificationBell` (`L28795-28911`): Hiển thị badge đỏ `unread > 0` từ `cloud.notifications`, mở popover danh sách thông báo và gọi `cloud.notificationsSeen`.
      - `HalloweenOptions` (`L28269-28277`) & `ThemePicker` (`L28214-28236`): Chuyển đổi giữa `"dark"`, `"light"`, `"halloween"`, `"system"`.
      - `AccountMenu` (`L28640-28737`) → mở `ChangePasswordDialog` (`L28593-28639`) hoặc gọi `auth.logout`.
      - `WindowControls` (`L28913-28939`): 3 nút Minimize, Maximize/Restore, Close (ẩn trên macOS vì dùng native traffic lights).
    - `CloudBanner` (`L29092-29184`): Hiển thị khi `appInfo.updateAvailable === true` hoặc có `appInfo.announcement`. Theo dõi tiến trình tải bản cập nhật qua `updateStatus.state` (`"idle"` | `"downloading"` | `"ready"` | `"error"`).
    - `QuotaBar` (`L29780-29807`) → mở `QuotaPicker` (`L29684-29779`): Chỉ hiển thị khi `channels.quota` trả về `quota.blocked > 0` (số kênh vượt hạn mức gói).
    - `NavRail` (`L28038-28133`): Sidebar trái gồm 4 nhóm, điều khiển độ rộng bằng `useUiStore.railCollapsed` (`w-rail-collapsed` 52px khi `true`, `w-rail-expanded` 240px khi `false`).
    - `<main>` → `PromoBanner` (`L29298-29343`, hiển thị khi `billing.promotions` có khuyến mãi `active` và chưa bị đóng trong `localStorage["event.promo.dismissed.<id>"]`) + `<Outlet />`.
    - `StatusBar` (`L28137-28166`): Hiển thị tên Pocket, số job đang render (`runningCount > 0`), tên encoder phần cứng (`media.info`), chi phí AI tháng (`budget.spentMonthUsd / budget.hardCapUsd`), và `% CPU` + `MB RAM`.
    - Overlays: `CommandPalette` (`open = useUiStore.commandOpen`), `Toaster` (`items = useToastStore.items`), `ConfirmHost` (`current = useConfirmStore.current`).

#### 1. Màn hình Xác thực & Bản quyền (`AuthGate` / `LoginPage` / `LicenseGate` - `L55732-56473`)
- **Cây Component:**
  - `AuthGate` (`L56433`)
    - `LoginPage` (`L55749`): Chứa `VerifyEmailStep` (`L56081`), `ForgotPasswordStep` (`L55951`), `DataFolderLink` (`L56189`).
    - `UpdateRequired` (`L56302`)
    - `LicenseGate` (`L56341`): Chứa `PlanCard` (`L29395`), `BuyPlanDialog` (`L29531`) → `OrderPayment` (`L29465`), `DevicesList` (`L56215`).
- **Cờ Trạng thái UI:**
  - `isError` (khi `auth.state` lỗi): Hiển thị màn hình lỗi kèm nút *"Thử lại"* (`refetch()`).
  - `isLoading || !state`: Hiển thị vòng xoay `LoaderCircle` toàn màn hình.
  - `verifyPending !== null`: Chuyển sang màn hình nhập mã OTP 6 chữ số (`VerifyEmailStep`), tự động gọi `auth.registerVerify` ngay khi đủ 6 số (`code.length === 6`), nút gửi lại mã bị khóa đếm ngược `cooldown > 0` giây.
  - `forgotOpen === true`: Chuyển sang `ForgotPasswordStep` (2 bước: `step === "email"` gọi `auth.forgotPassword`, `step === "code"` nhập OTP 6 số + mật khẩu mới gọi `auth.resetPassword`).
  - `state.license.status`:
    - `"checking"`: Hiển thị *"Đang kiểm tra gói sử dụng với Omnira Cloud…"* và tự động polling `1500ms`.
    - `"no_subscription"` | `"expired"`: Hiển thị lưới `PlanCard` để mua gói mới hoặc gia hạn qua VietQR.
    - `"device_limit"` | `"revoked"`: Hiển thị danh sách thiết bị `DevicesList` để gỡ bớt thiết bị cũ (`license.removeDevice`) rồi bấm *"Kích hoạt trên máy này"* (`license.activate`).

#### 2. Màn hình Tổng quan `DashboardPage` (`/`, `L36794-37381`)
- **Cây Component:**
  - `DashboardPage` (`L37240`)
    - `HalloweenHero` (`L28390-28592`): Banner sự kiện Halloween (ẩn khi bấm đóng lưu `localStorage["event.halloween.dismissed"] = "2026"`).
    - Hàng 4 thẻ `KpiTile` (`L27468`): *Lượt tiếp cận (30 ngày)*, *Tương tác (30 ngày)*, *Bài chờ đăng*, *Hộp thư chưa đọc*.
    - `ReachCard` (`L37138-37200`) → `LineChart` (`L37007-37137`): Biểu đồ SVG 4 đường (`facebook`, `tiktok`, `instagram`, `youtube`) kèm nút chuyển đổi xem dạng bảng số liệu (`showTable`).
    - `AlertsCard` (`L36794-36836`): Danh sách cảnh báo chưa xử lý (`alerts.open`) kèm nút *"Đã xử lý"* (`alerts.resolve`).
    - `TopChannelsCard` (`L37202-37239`): Top kênh có lượt tiếp cận cao nhất (`dashboard.topChannels`).
    - `GoldenHoursCard` (`L36929-36997`): Ma trận nhiệt 7 ngày × 24 giờ.
    - `DaemonPanel` (`L36851-36914`): Trạng thái 5 tiến trình ngầm và danh sách nhật ký hoạt động gần đây (`activity.recent`).
- **Cờ Trạng thái UI:**
  - `summaryLoading`: Hiển thị `"…"` trên các `KpiTile`.
  - `!hasReachData` (tổng reach 30 ngày bằng 0): Hiển thị Empty State *"Chưa có số liệu 30 ngày qua"* kèm nút *"Đồng bộ số liệu"* (`insights.sync`).
  - `alerts.length === 0`: Hiển thị trạng thái xanh *"Hệ thống ổn định – không có cảnh báo nào"*.

#### 3. Màn hình Không gian làm việc `WorkspacesPage` (`/workspaces`, `L49227-49820`)
- **Cây Component:**
  - `WorkspacesPage` (`L49708`)
    - Lưới thẻ `PocketCard` (`L49238-49354`): Hiển thị màu sắc, số kênh, số nội dung, chi tiêu AI (`spentUsd / aiBudgetUsd`), trạng thái `Canvas Noise`.
    - `RulesPanel` (`L49380-49569`): Bảng cấu hình chi tiết Pocket đang chọn (Chỉnh sửa Tên, Màu sắc, Ngân sách AI, Ảnh Watermark + vị trí + độ mờ, Giọng văn thương hiệu `brandVoice`, Kiến thức trả lời khách `knowledge`, Thẻ `tags`, và Khung giờ vàng `goldenHours`).
    - `NewWorkspaceDialog` (`L49570-49642`): Modal tạo Pocket mới (`Ctrl+N`).
    - `ArchivedDialog` (`L49643-49707`): Modal xem và khôi phục các Pocket đã lưu trữ (`workspaces.listArchived`, `workspaces.restore`).
- **Cờ Trạng thái UI:**
  - `isLoading`: Hiển thị 3 khung xương `animate-pulse` (`h-48 rounded-xl bg-surface-container-low`).
  - `workspaces.length === 0`: Hiển thị Empty State kèm nút tạo Pocket đầu tiên.
  - `dirty === true` (trong `RulesPanel`): Bật sáng nút *"Lưu quy tắc"* (`workspaces.update`).

#### 4. Màn hình Tài khoản & Kênh `AccountsPage` (`/accounts`, `L29860-31158`)
- **Cây Component:**
  - `AccountsPage` (`L30801`)
    - Thanh công cụ lọc nền tảng (`SegmentedControl`) + các nút kết nối: `ConnectFacebookButton` (`L30078`), `ConnectTiktokButton` (`L30148`), `ConnectYoutubeButton` (`L30190`), nút mở `ImportFacebookDialog` (`L30000`), `AddAccountDialog` (`L30447`), `ProxyManagerDialog`.
    - `FacebookTree` (`L30686-30800`): Sơ đồ cây 3 cấp (Tài khoản VIA → Danh sách Fanpage → nút `AddPageDialog` `L30536`).
    - `TikTokGrid` (`L30590-30639`), `InstagramList` (`L30640-30682`), và danh sách kênh YouTube.
    - `AccountInspector` (`L30251-30438`) & `ConnectChannelDialog` (`L29901`): Panel bên phải kiểm tra sức khỏe token (`channels.verify`), gán Proxy, cập nhật ghi chú, hoặc ngắt kết nối kênh (`channels.disconnect`).
- **Cờ Trạng thái UI:**
  - `treeLoading`: Hiển thị skeleton loading.
  - `channel.quotaBlocked === true`: Hiển thị `Badge` cảnh báo màu vàng *"Ngoài hạn mức"* trên thẻ kênh.
  - `channel.tokenStatus`: Hiển thị `StatusDot` (`"valid"` → xanh lá, `"expiring"` → vàng, `"expired"` / `"missing"` → đỏ).

#### 5. Màn hình Kế hoạch AI `PlanPage` (`/plan`, `L51075-51510`)
- **Cây Component:**
  - `PlanPage` (`L51133`)
    - Thanh cấu hình sinh kế hoạch: Chọn ngày bắt đầu, số ngày (`7` | `14` | `30`), số bài/ngày (`1` | `2` | `3`), công tắc *"Bắt trend Google Tìm kiếm (VN)"* (`useTrends`), bộ chọn định dạng kịch bản (`CONTENT_FORMATS` + custom formats lưu ở `localStorage["omni-plan-custom-formats"]`), nút *"AI lập kế hoạch"* (`plan.generate`).
    - Lưới lịch ý tưởng theo ngày (`groupedByDate`), mỗi thẻ ý tưởng có trạng thái (`"idea"`, `"in_progress"`, `"done"`, `"dropped"`) và 3 nút hành động chuyển đổi: *"Tạo Video"* (`plan.toVideo`), *"Tạo Ảnh"* (`plan.toImage`), *"Tạo Bài đăng"* (`plan.toPost`).
    - `IdeaDialog` (thêm/sửa ý tưởng thủ công `plan.save`) & `CustomFormatDialog` (tạo định dạng kịch bản riêng).
- **Cờ Trạng thái UI:**
  - `generate.isPending`: Hiển thị trạng thái đang phân tích xu hướng và sinh kế hoạch.
  - `selectedIds.size > 0`: Hiển thị thanh công cụ xóa hàng loạt (`plan.deleteMany`).

#### 6. Màn hình Kho Nội dung `ContentPage` (`/content`, `L34906-35315`, `L36182-36760`)
- **Cây Component:**
  - `ContentPage` (`L36413`)
    - Bộ lọc trạng thái (`draft`, `ready`, `scheduled`, `published`, `failed`), ô tìm kiếm, thanh thao tác hàng loạt (`content.bulkMove`, `content.bulkDelete`, `content.spin`, `content.hashtags`).
    - Lưới thẻ `ContentCard` (`L36232-36363`): Hiển thị thumbnail/video, loại bài, trạng thái, điểm `HookScoreBadge`, nút mở `VideoPreviewDialog` (`L36184-36216`), nút mở `ScheduleDialog` (`L35574-35781`), và nút mở `ContentEditor`.
    - `ContentEditor` Drawer (`L35187-35315`):
      - Tab biên tập nội dung chính (`title`, `caption`, `hashtags`, `firstComment`, `mediaPaths`).
      - `HookPanel` (`L35067-35174`): Hiển thị vòng điểm `0-100`, thanh điểm 7 tiêu chí AI, cảnh báo vi phạm chính sách (`policyRisks`), và 3 gợi ý câu mở đầu thay thế (bấm 1-click để thay câu đầu vào caption).
      - `VariantsPanel` (`L34945-35001`): Quản lý các biến thể caption (`content.variants`, `content.applyVariant`, `content.deleteVariant`).

#### 7. Màn hình Series AI `SeriesPage` (`/series`, `L49821-51074`)
- **Cây Component:**
  - `SeriesPage` (`L50533`)
    - Sidebar danh sách Series + nút mở `SeriesDialog` (`L50200-50343`, chọn `productionMode`: `"video"` hoặc `"film"`).
    - Khu vực chi tiết Series:
      - Khối **Dàn Nhân vật (`characters`)**: Thẻ nhân vật kèm ảnh tham chiếu chuẩn (`referenceImage`), nút *"Tạo ảnh tất cả nhân vật"* (`useCharacterBatch` `L49821-49868`), nút mở `CharacterDialog` (`L50344-50497` chứa `CharacterVoiceFields` `L49869-49967`).
      - Khối **Danh sách Tập (`episodes`)**: Nút *"AI phát triển thêm tập"* (`series.develop` 1–30 tập), danh sách tập kèm nút mở `EpisodeDialog` (`L50498-50532`), nút *"Viết kịch bản Video"* (`series.writeEpisode` → chuyển sang `/studio?project=...`) hoặc nút *"Mở trong Xưởng Phim"* (`series.makeFilm` → chuyển sang `/film/...`).

#### 8. Màn hình Xưởng Video AI `StudioPage` (`/studio`, `L45164-45963`, `L46542-49226`)
- **Cây Component (Kiến trúc 3 Cột):**
  - **Cột Trái – `ConfigPanel` (`L45717-45963`):** Chọn dự án, kênh mục tiêu, chủ đề (`topic`), định dạng (`CONTENT_FORMATS`), `FashionSetupEditor` (`L45419-45519` hiện khi `format === "fashion_tryon"`), `ProjectRefsField` (`L45240-45267`), `VisualBibleEditor` (`L45526-45696`), thời lượng (`15-60s` ngắn hoặc `90-900s` dài), giọng đọc TTS + nút nghe thử, chế độ render (`stock`, `semi_ai`, `full_ai`), nút *"Tạo kịch bản AI"* (`Ctrl+Enter`).
  - **Cột Giữa:**
    - Chế độ Video Ngắn (`targetDurationSec <= 90`): `Storyboard` (`L46945-47019`) chứa danh sách kéo thả `@dnd-kit/sortable` các thẻ `SceneCard` (`L46815-46944`) → mở rộng `SceneVisualPanel` (`L45272-45369`), `TryOnPanel` (`L45370-45414`), `UpscaleDialog` (`L46560-46664`).
    - Chế độ Video Dài (`targetDurationSec > 90`): `ActBoard` (`L48054-48262`) gồm `ActEditor` (`L47825`), `SceneEditor` (`L47931`), `Timeline` (`L48011`), nút viết từng Hồi (`studio.writeAct`).
  - **Cột Phải – `PreviewPanel` (`L47136-47599`):** Khung giả lập màn hình `9:16` / `16:9` / `1:1` vẽ phụ đề Karaoke `Montserrat` thời gian thực qua `requestAnimationFrame` (hoặc phát video `.mp4` sau khi render xong), chọn 6 kiểu phụ đề `SUB_LOOK`, chọn nhạc nền BGM + nút mở `MusicDialog` (`L47020-47090` tạo nhạc AI Lyria/ElevenLabs), bảng ước tính chi phí (`render.estimate`), nút *"Render Video (F9)"* mở `RenderConfirmDialog` (`L47676-47773`), nút xuất prompt `PromptExportDialog` (`L48318-48458`), nút đưa vào Kho nội dung (`studio.toContent`), và lịch sử `RenderHistory` (`L47607-47646`).

#### 9. Màn hình Xưởng Ảnh AI `ImageStudioPage` (`/image-studio`, `L54611-55277`)
- **Cây Component:**
  - `ImageStudioPage` (`L55213`)
    - Sidebar danh sách dự án ảnh (`imagestudio.list`) + nút tạo dự án mới.
    - `ProjectEditor` (`L54695-54972`): Nhập tên sản phẩm, mô tả `brief`, chọn loại ảnh (`poster`, `square`, `banner`, `story`), chọn phong cách (`minimal`, `luxury`, `vivid`, `ugc`, `studio`), tải tối đa 6 ảnh tham chiếu (`refs`), nút *"AI lên ý tưởng"* (`imagestudio.generateIdeas`), nút *"Tạo tất cả ảnh"* (`imagestudio.enqueue`).
    - Danh sách `IdeaCard` (`L55049-55176`) → `VisualFields` (`L54973-55048`, chỉnh tiêu đề `headline`, `subhead`, vị trí chữ `top`/`center`/`bottom`, nút *"Cập nhật chữ lên ảnh"* `imagestudio.retext`) + lưới ảnh kết quả `ResultTile` (`L55177-55211`).

#### 10. Màn hình Đọc văn bản `TtsPage` (`/tts`, `L55278-55731`)
- **Cây Component:**
  - `TtsPage` (`L55364`)
    - `FreeEngineBanner` (`L55606-55619`): Gợi ý dùng `edge_tts` hoặc cài đặt `local_tts` miễn phí.
    - Khung soạn thảo văn bản lớn (tối đa `300,000 ký tự`, hỗ trợ nạp file `.txt` / `.md`), chọn nhà cung cấp giọng chính, chọn khoảng nghỉ giữa các đoạn (`pauseSec` 0–3s).
    - Bảng phân vai tự động `CastRow` (`L55550-55605`): Tự động xuất hiện khi văn bản có cú pháp `[Tên nhân vật]: lời thoại`, cho phép gán nhà cung cấp + giọng đọc riêng cho từng nhân vật.
    - `VoiceLibrary` (`L39517-39616`): Quản lý và thu âm giọng nhân bản (`localtts.*`).
    - Cột phải `JobList` (`L55620-55639`) → `JobItem` (`L55640-55731`): Hiển thị thanh tiến độ `chunksDone / chunksTotal`, trình phát audio nghe trực tiếp, nút tạm dừng (`tts.cancel`), nút tiếp tục (`tts.resume`), và nút xuất file `.mp3` + `.srt` (`tts.export`).

#### 11. Màn hình Xưởng Phim AI `FilmPage` (`/film` & `/film/:id`, `L51957-54610`)
- **Cây Component:**
  - `FilmPage` (`L54452`): Kiểm tra `film.gate` (nếu thiếu API key/nguồn tạo video thì hiện `GateScreen` `L54452-54480`). Khi tại `/film` hiện `FilmList` (`L54481-54543`) + `NewFilmDialog` (`L54544-54610`). Khi tại `/film/:id` hiện `FilmWorkspace` (`L54238-54451`).
  - `FilmWorkspace` gồm 6 bước chuyển đổi qua thanh Stepper:
    1. `ScriptStep` (`L53591-53752`): Nhập ý tưởng, thể loại, phong cách, thời lượng mục tiêu (`15-900s`), ngôn ngữ thoại, nút *"AI viết kịch bản phim"* (`film.generateScript`), và `ProposalPanel` (`L53511-53589` duyệt nhân vật mới vào Series).
    2. Bước `character`, `location`, `shot`, `video` dùng chung `AssetBoard` (`L52730-53094`): Chứa thanh điều khiển `SeedanceControls` (`L52691-52729`), `ChainBar` (`L52517-52613` bật/tắt nối cảnh `chainShots`), `NarrationBar` (`L52204-52294`), lưới thẻ `AssetCard` (`L53095-53176`), và ngăn kéo chi tiết `AssetDrawer` (`L53249-53505` quản lý các bản `takes`, tải ảnh ngoài, hoặc nâng cấp `film.upscale` 1080p/4K).
    3. `AssembleStep` (`L53879-54211`): Chứa `VoiceModePanel` (`L54212-54236` chọn giữ tiếng gốc `clip`, đổi giọng ElevenLabs STS `convert`, hoặc lồng tiếng đa nhân vật `dub`), `WatermarkDialog` (`L52425-52474`), cấu hình nhạc nền/phụ đề, nút *"Ghép phim MP4"* (`film.assemble`), và danh sách bản xuất (`film.renders`).

#### 12. Màn hình Lịch đăng `CalendarPage` (`/calendar`, `L35316-36181`)
- **Cây Component:**
  - `CalendarPage` (`L35853`): Bọc trong `<DndContext>` của `@dnd-kit/core`.
    - Thanh công cụ chọn tuần/tháng, lọc kênh, `StaggerControl` (`L35782-35827`), nút bật/tắt Worker đăng bài (`posts.setWorker`), nút xuất CSV (`exportCsv`).
    - `CalendarGrid` (`L35465-35482`) → các ô ngày `DayCell` (`L35397-35464`, `useDroppable`) chứa các thẻ bài đăng `PostChip` (`L35360-35396`, `useDraggable`).
    - `QueueSidebar` (`L35515-35566`): Cột bên phải liệt kê các nội dung `ready` chưa lên lịch và nút *"Tự xếp lịch Giờ vàng"* (`posts.autoSchedule`).
    - `ScheduleDialog` (`L35574-35781`) & Drawer chi tiết bài đăng (nút *"Đăng ngay"* `posts.publishNow`, dời lịch `posts.reschedule`, hủy lịch `posts.cancel`).

#### 13. Màn hình Hộp thư Hợp nhất `InboxPage` (`/inbox`, `L37382-38515`)
- **Cây Component (Bố cục 3 Cột):**
  - **Cột 1 – `ConversationList` (`L37414-37565`):** Lọc theo nền tảng, nguồn (`messenger` | `comment`), trạng thái (`open` | `pending` | `resolved`), chỉ chưa đọc (`unreadOnly`), nút đồng bộ ngay (`inbox.sync`).
  - **Cột 2 – `Thread` (`L38199-38509`):** Hiển thị luồng tin nhắn `Bubble` (`L38139`), trạng thái gửi `DeliveryState` (`L38066`), thẻ duyệt câu trả lời nháp của AI `DraftCard` (`L38100` với 2 nút `inbox.approveDraft` / `inbox.discardDraft`), nút *"AI gợi ý trả lời"* (`inbox.suggestReply`), khung nhập tin nhắn kèm đính kèm ảnh (`inbox.pickAttachments`) và mẫu câu trả lời nhanh (`/`).
  - **Cột 3 – `InboxSidePanel` (`L37844-37922`):** Chứa `ConversationMeta` (`L37779` gắn nhãn khách hàng), `AiReplyCard` (`L37699` cấu hình chế độ AI trả lời tự động `off`/`draft`/`auto`, độ tự tin tối thiểu, tự động like, tự động gắn nhãn SĐT), và danh sách quy tắc từ khóa + `RuleDialog` (`L37566`).

#### 14. Màn hình Phân tích Số liệu `AnalyticsPage` (`/analytics`, `L51511-51758`)
- **Cây Component:**
  - `AnalyticsPage` (`L51651`): Bộ chọn khoảng thời gian (`30` | `60` | `90` ngày) và lọc kênh.
  - Hàng 4 `KpiTile` tổng hợp (`views`, `reach`, `engagements`, `avgWatchSec`).
  - Khối **Mục tiêu Kênh (`analytics.goals`)** + `GoalDialog` (`L51595-51650`, có 2 mẫu thiết lập nhanh: *Bật kiếm tiền Facebook In-Stream* và *Cán mốc 10,000 Followers*).
  - 2 bảng `GroupTable` (`L51520-51555`): Phân tích hiệu quả theo *Định dạng kịch bản* (`byFormat`) và theo *Độ dài video* (`byDurationBucket`).
  - 2 cột `PostList` (`L51556-51594`): Top 5 bài đăng hiệu quả nhất (`topPosts`) và 5 bài đăng hiệu quả thấp nhất (`bottomPosts`).

#### 15. Màn hình Cài đặt `SettingsPage` (`/settings`, `L38625-41380`)
- **Cây Component (4 Phân khu Tab):**
  - Tab `ai` (`AiTab` `L41231-41362`): Trạng thái két sắt `vault.info`, `OmniraAiCard` (`L41065`), danh sách 20 nhà cung cấp `ProviderRow` (`L39293`), `LocalTtsCard` (`L39710` kèm `VoiceLibrary` `L39517` và `Recorder` `L39617`), `BudgetCard` (`L38882`), `RoutingCard` (`L39198`), `PricingCard` (`L39144`).
  - Tab `publish` (`PublishTab` `L41225-41230`): Cấu hình OAuth Meta (`MetaIntegrationCard`), TikTok (`TiktokIntegrationCard`), YouTube (`YoutubeIntegrationCard`), `InstagramSetting` (`L41119`), `YoutubePublishSettings` (`L41140`).
  - Tab `video` (`VideoTab` `L41363-41373`): `MediaSourcesCard` (`L39932` + `SeedancePanel` `L40128`), `FlowCard` (`L40183`), `MuseFlowCard` (`L40389`), `GrokFlowCard` (`L40770`), `MediaEngineCard` (`L39048`).
  - Tab `system` (`SystemTab` `L41374-41380`): `DataLocationCard` (`L38979` di chuyển thư mục dữ liệu), `BackgroundCard` (`L39097` chạy ngầm khay hệ thống & khởi động cùng Windows), `LogsCard` (`L38960`).

#### 16. Màn hình Gói & Thanh toán `BillingPage` (`/billing`, `L56474-56774`)
- **Cây Component:** Thẻ thông tin gói hiện tại & hạn mức (`L56636-56682`), lưới `PlanCard` (`L29395-29464`), `ReferralCard` (`L56477-56562` kèm `HowItWorks` `L56582`), `DevicesList` (`L56215-56256`), `OrderHistory` (`L56711-56773`), và `BuyPlanDialog` (`L29531-29683`) → `OrderPayment` (`L29465-29530` hiển thị mã QR ngân hàng VietQR và tự động polling `billing.order` mỗi `4000ms` cho tới khi `status === "PAID"`).

#### 17. Màn hình Hỗ trợ `SupportPage` (`/support`, `L56775-56997`)
- **Cây Component:** Cột trái danh sách ticket (`support.list`); cột phải chuyển đổi theo state `view`: khi `view.mode === "new"` hiển thị `CreateForm` (`L56845-56899` kèm `AttachPicker` `L56807-56844`); khi `view.mode === "ticket"` hiển thị `TicketDetail` (`L56900-56946` kèm `Attachment` `L56798-56806`).

#### 18. Màn hình Hướng dẫn `GuidePage` (`/guide`, `L51759-51956`)
- **Cây Component:** Thanh chuyển đổi 4 tab (`facebook`, `instagram`, `tiktok`, `youtube`), các khối sơ đồ luồng `FlowBlock`, danh sách từng bước `Steps`, bảng so sánh phương thức kết nối, và tích hợp trực tiếp các nút kết nối nhanh `ConnectFacebookButton`, `ConnectTiktokButton`, `ConnectYoutubeButton`.

---

### 2.3. Design System, CSS Tokens & Custom Hooks Tái sử dụng

#### A. Cấu hình Tailwind Merge (`cn`) & Hệ thống Token (`index-01dFNdzs.js:L18871-18902` & `index-D9-rggfQ.css`)
Hàm tiện ích `cn(...inputs)` (`L18900-18902`) kết hợp `clsx(inputs)` và `extendTailwindMerge` với 2 nhóm mở rộng tùy chỉnh:
- `font-size`: `["display", "headline-lg", "headline-md", "headline-sm", "body-lg", "body-md", "body-sm", "label-md", "label-sm", "code"]`.
- `text-color`: Danh sách 33 lớp màu ngữ nghĩa (`surface`, `surface-dim`, `surface-bright`, `surface-container-lowest`, `surface-container-low`, `surface-container`, `surface-container-high`, `surface-container-highest`, `surface-variant`, `on-surface`, `on-surface-variant`, `inverse-surface`, `inverse-on-surface`, `outline`, `outline-variant`, `primary`, `on-primary`, `primary-container`, `on-primary-container`, `inverse-primary`, `secondary`, `on-secondary`, `secondary-container`, `on-secondary-container`, `tertiary`, `on-tertiary`, `tertiary-container`, `on-tertiary-container`, `error`, `on-error`, `error-container`, `on-error-container`, `success`, `warning`, `danger`, `brand-facebook`, `brand-tiktok`, `brand-tiktok-cyan`, `brand-tiktok-red`, `brand-youtube`, `series-facebook`, `series-tiktok`, `series-instagram`, `series-youtube`, `overlay`).

#### B. Danh sách Custom Hooks & Helpers Cốt lõi phía Renderer
1. **`call(endpoint, input)` (`L3657-3661`):** Gọi `await omni.api.invoke(endpoint, input)`. Nếu `!res.ok` thì ném ngoại lệ `new ApiError(res.error.code, res.error.message)`, ngược lại trả về `res.data`.
2. **`useApiQuery(endpoint, input, options)` (`L3662-3668`):** Bọc `useQuery` của TanStack Query với `queryKey: [endpoint, input ?? null]` và `queryFn: () => call(endpoint, input)`.
3. **`useApiMutation(endpoint, invalidates = [])` (`L3669-3679`):** Bọc `useMutation` của TanStack Query; khi thực thi thành công (`onSuccess`), tự động gọi `qc.invalidateQueries({ predicate: (q) => typeof q.queryKey[0] === "string" && invalidates.some((p) => q.queryKey[0].startsWith(p)) })`.
4. **`useThemeSync()` (`L28181-28191`):** Lắng nghe `useUiStore((s) => s.theme)` và `window.matchMedia("(prefers-color-scheme: dark)")` để cập nhật `document.documentElement.dataset.theme`, class `.dark`, và gọi `omni.app.setTheme()`.
5. **`mediaUrl(relOrAbs)` (`L34906-34916`):** Chuyển đổi đường dẫn media tương đối trong DB thành `omni-media://local/<encodedPath>` và đường dẫn tuyệt đối thành `omni-media://ext/<encodedPath>` để thẻ `<img>`, `<video>`, `<audio>` tải trực tiếp qua giao thức riêng.
6. **`useCharacterBatch(seriesId)` (`L49821-49868`):** Quản lý vòng lặp tạo ảnh tham chiếu hàng loạt cho tất cả nhân vật chưa có ảnh trong một Series, có hỗ trợ hủy giữa chừng (`abortRef`).
7. **`confirmDialog(opts)` (`L27335-27337`):** Khởi tạo یک `Promise<boolean>` lưu hàm `resolve` vào `useConfirmStore`, mở modal xác nhận và trả về `true`/`false` khi người dùng bấm nút.
8. **`toast.success(msg)` / `toast.error(msg)` / `toast.info(msg)` (`L27639-27643`):** Đẩy thông báo mới vào `useToastStore` (giới hạn tối đa 4 thông báo hiển thị cùng lúc, tự động xóa sau `4200ms`).

---

## PHẦN 3: STATE MANAGEMENT & DATA LIFECYCLE

### 3.1. Kiến trúc Quản lý Trạng thái (Global Stores & Server Cache)

#### A. Toàn bộ 4 Zustand Global Stores (`out/renderer/assets/index-01dFNdzs.js`)

| STT | Tên Store & Dòng Code | Danh sách State Fields (State Schema) | Toàn bộ Actions / Mutations & Cơ chế Biến đổi Dữ liệu |
| :-: | :--- | :--- | :--- |
| 1 | **`useUiStore`** (`L27890-27908`)<br>*(Persisted vào `localStorage["omni-ui"]`)* | - `railCollapsed: boolean` (mặc định `false`)<br>- `commandOpen: boolean` (mặc định `false`)<br>- `activeWorkspaceId: string \| null` (mặc định `null`)<br>- `theme: "dark" \| "light" \| "halloween" \| "system"` (mặc định `"dark"`) | - `toggleRail()`: Đảo ngược `railCollapsed: !s.railCollapsed`.<br>- `setCommandOpen(commandOpen)`: Đặt trạng thái đóng/mở `CommandPalette` (không lưu vào `localStorage` do `partialize` lọc ra).<br>- `setActiveWorkspace(activeWorkspaceId)`: Đổi Pocket đang làm việc trên toàn bộ ứng dụng.<br>- `setTheme(theme)`: Cập nhật `theme` và kích hoạt `useThemeSync()`. |
| 2 | **`useSystemStore`** (`L27668-27679`)<br>*(Ephemeral)* | - `cpu: number` (mặc định `0`)<br>- `appMemoryMb: number` (mặc định `0`)<br>- `totalMemoryMb: number` (mặc định `0`)<br>- `freeMemoryMb: number` (mặc định `0`) | - `bindSystemListeners()` (`L27674-27679`): Đảm bảo chỉ đăng ký 1 lần (`bound = true`), lắng nghe `omni.system.onStats((s) => useSystemStore.setState(s))` mỗi `2000ms` từ Main Process. |
| 3 | **`useToastStore`** (`L27630-27643`)<br>*(Ephemeral)* | - `items: Array<{ id: string, tone: "success" \| "error" \| "info", message: string }>` (mặc định `[]`) | - `push(tone, message)`: Tạo `id = Math.random().toString(36).slice(2, 9)`, cắt mảng giữ tối đa 4 phần tử mới nhất `[...s.items.slice(-3), { id, tone, message }]`, và đặt `setTimeout` sau `4200ms` tự động gọi `dismiss(id)`.<br>- `dismiss(id)`: Lọc bỏ phần tử có `t.id === id`. |
| 4 | **`useConfirmStore`** (`L27328-27337`)<br>*(Ephemeral)* | - `current: { title: string, message: string, confirmText?: string, cancelText?: string, danger?: boolean, resolve: (ok: boolean) => void } \| null` (mặc định `null`) | - `ask(opts)`: Khởi tạo `new Promise((resolve) => set({ current: { ...opts, resolve } }))`.<br>- `close(ok)`: Đọc `cur = get().current`, đặt `set({ current: null })`, và gọi `cur?.resolve(ok)`. |

#### B. Cấu hình TanStack Query (`queryClient` - `L57023-57032`)
- **Tham số mặc định (`defaultOptions.queries`):**
  - `staleTime`: `30000` (`30 giây` — trong vòng 30 giây chuyển qua lại giữa các trang sẽ lấy ngay từ RAM cache không gọi lại IPC).
  - `retry`: `1` (thử lại tối đa 1 lần nếu lỗi).
  - `refetchOnWindowFocus`: `false` (tắt tự động gọi lại khi focus cửa sổ Electron).
- **Interceptor bắt lỗi xác thực (`onAuthError` - `L57023-57025`):**
  - Gắn vào cả `new QueryCache({ onError: onAuthError })` và `new MutationCache({ onError: onAuthError })`.
  - Biểu thức kiểm tra: `if (err instanceof ApiError && (err.code === "AUTH" || err.code === "LICENSE")) void queryClient.invalidateQueries({ queryKey: ["auth.state"] });`.

---

### 3.2. Local Storage, File System, Cryptographic Vault & SQLite Persistence

#### A. Bảng Toàn bộ 10 Khóa `localStorage` phía Renderer (`out/renderer/assets/index-01dFNdzs.js`)
| STT | Khóa (`localStorage` Key) | Vị trí Dòng Code | Cấu trúc Giá trị (Value Schema) | Thời gian sống (TTL) & Cơ chế Xóa |
| :-: | :--- | :---: | :--- | :--- |
| 1 | `"omni-ui"` | `L27903`, `L56463` | `{ state: { railCollapsed: boolean, activeWorkspaceId: string \| null, theme: string }, version: 0 }` | Vĩnh viễn; khi đăng nhập tài khoản khác email trước đó (`prevEmail !== u.email`), `activeWorkspaceId` bị reset về `null`. |
| 2 | `"event.halloween.dismissed"` | `L28237`, `L28368`, `L28400` | Chuỗi năm hiện tại, ví dụ: `"2026"` | Hết hiệu lực khi sang năm mới (`String(new Date().getFullYear())`). |
| 3 | `"event.halloween.spider"` | `L28240`, `L28244`, `L28251` | `"on"` \| `"off"` | Vĩnh viễn theo lựa chọn của người dùng trong `HalloweenOptions`. |
| 4 | `"event.promo.dismissed.<id>"` | `L29290`, `L29293`, `L29309` | `"1"` | Vĩnh viễn đối với mã chiến dịch khuyến mãi `<id>` đã bấm đóng. |
| 5 | `"studio.hiddenRenderLog"` | `L47166`, `L47171`, `L47178` | Chuỗi `jobId` của lần render vừa ẩn | Tự động mất hiệu lực ngay khi có một `renderJob` mới được tạo (khác `jobId`). |
| 6 | `"omni-plan-custom-formats"` | `L51085`, `L51089`, `L51095` | `Array<{ id: string, label: string, group: "custom", desc: string, hint: string }>` | Vĩnh viễn cho đến khi người dùng bấm xóa định dạng tùy chỉnh. |
| 7 | `"film.view"` | `L52665`, `L52741`, `L52862` | `"grid"` \| `"list"` | Vĩnh viễn; lưu chế độ hiển thị thẻ tài sản trong `FilmWorkspace`. |
| 8 | `"film.assemble.<filmId>"` | `L53810`, `L53813`, `L53821` | `{ transition: "cut"\|"fade_black", clipLength: "full"\|"shot", clipAudio: boolean, clipVolume: number, bgmTrack: string\|null, bgmVolume: number, subtitleStyle: string, narrationVolume: number, narrationDuck: number, watermark: boolean, excludeShotIds: string[] }` | Vĩnh viễn theo từng dự án phim `<filmId>`. |
| 9 | `"tts.draft"` | `L55301`, `L55370`, `L55378` | `{ title: string, text: string, provider: string, model: string, voiceId: string, pauseSec: number, cast: Record<string, { provider, voiceId, voiceLabel }> }` | Lưu tự động mỗi khi gõ văn bản ở `TtsPage` (giới hạn lưu khi `text.length <= 100,000` ký tự để tránh tràn bộ nhớ `localStorage`). |
| 10 | `"tts.castMemory"` | `L55302`, `L55394`, `L55399` | `Record<string, { provider: string, voiceId: string \| null, voiceLabel: string \| null }>` (tối đa 200 nhân vật) | Vĩnh viễn; tự động gán lại giọng đọc cho nhân vật quen thuộc ở các chương truyện tiếp theo. |

#### B. Bảng Toàn bộ Tệp Lưu trữ Cục bộ & Cơ chế Mã hóa trên Ổ cứng (`out/main/index.js`)
| STT | Đường dẫn Tệp tin | Vị trí Dòng Code | Cấu trúc Dữ liệu & Thuật toán Mã hóa / Bảo mật | TTL / Vòng đời |
| :-: | :--- | :---: | :--- | :--- |
| 1 | `<userData>/data-location.json` | `L1422-1443` | JSON `{ root?: string }`. Ghi nguyên tử qua tệp tạm `.tmp` rồi `renameSync`. | Vĩnh viễn. |
| 2 | `<userData>/ui-theme.json` | `L42-65` | JSON `{ theme: "system" \| "dark" \| "light" \| "halloween" }`. | Vĩnh viễn. |
| 3 | `<userData>/background.json` | `L22564-22574` | JSON `{ closeToTray: boolean, hintShown: boolean }`. | Vĩnh viễn. |
| 4 | `<dataRoot>/omnipage-data.json` | `L1423`, `L1444-1449` | JSON `{ app: "Omnira Studio", version: 1, createdAt: ISOString }`. | Vĩnh viễn. |
| 5 | `<dataRoot>/auth/device.json` | `L2822-2838` | JSON `{ deviceId: "omn-" + 40_hex_chars, createdAt: number }`. Sinh bằng `crypto.randomBytes(20).toString("hex")`. | Vĩnh viễn theo thư mục dữ liệu máy. |
| 6 | `<dataRoot>/auth/users.json` | `L2559-2576` | JSON `{ version: 1, lastEmail: string \| null, users: Array<{ id, email, displayName, provider: "cloud"\|"local", passwordHash, rememberTokenHash, rememberExpiresAt, createdAt, lastLoginAt }> }`.<br>- `passwordHash` (`L2550-2558`): `"scrypt$" + salt_hex(16B) + "$" + scrypt(password.normalize("NFKC"), salt, 64, { N: 16384, r: 8, p: 1 }).toString("hex")`, so sánh bằng `crypto.timingSafeEqual`.<br>- Chống dò mật khẩu (`L2626-2640`): Sai quá `MAX_ATTEMPTS = 5` lần trong cửa sổ `WINDOW_MS = 15 phút` sẽ khóa đăng nhập tài khoản đó trong `LOCK_MS = 5 phút`. | `rememberExpiresAt` có TTL = **30 ngày** (`REMEMBER_TTL_MS = 30 * 86400 * 1000`). |
| 7 | `<dataRoot>/auth/session.bin` | `L2577-2604` | Lưu token phiên ghi nhớ (32 bytes random hex). Mã hóa bằng `electron.safeStorage.encryptString(JSON.stringify({ userId, token }))` (Windows DPAPI / macOS Keychain). | TTL 30 ngày; bị xóa ngay khi gọi `auth.logout` hoặc `forgetSession()`. |
| 8 | `<dataRoot>/auth/cloud-<userId>.bin` | `L3656-3691` | Lưu `{ customerId, email, customerToken, licenseToken, updatedAt }`. Mã hóa toàn bộ bằng `electron.safeStorage.encryptString()`. | `licenseToken` (JWT RS256) có hạn `exp` do Cloud cấp; cho phép chạy ngoại tuyến (`offline_grace`) miễn là `Date.now() < claims.exp * 1000`. |
| 9 | `<userDir>/vault/master.bin` | `L2354-2377` | Khóa chủ 32 bytes (`MASTER_KEY_BYTES = 32`) dùng để mã hóa bảng `secrets`. Được bọc bởi `electron.safeStorage.encryptString(masterKey.toString("base64"))`. | Vĩnh viễn trên máy hiện tại. |
| 10 | `<userDir>/vault/master.portable` | `L2378-2417` | Bản sao di động của khóa chủ 32 bytes để chuyển máy: dẫn xuất khóa KEK 32 bytes từ mật khẩu đăng nhập qua `crypto.scryptSync(password.normalize("NFKC"), salt(16B), 32, { N: 32768, r: 8, p: 1, maxmem: 67108864 })`, sau đó mã hóa `masterKey` bằng **AES-256-GCM** (`iv` 12B, `aad = "omnipage.vault.portable.v1"`, `tag` 16B). | Vĩnh viễn; tự động cập nhật lại khi người dùng đổi mật khẩu (`auth.changePassword`). |

#### C. Đặc tả Toàn bộ 33 Bảng Cơ sở dữ liệu SQLite (`<userDir>/data/omnipage.db` - `L1472-2331`)

Cơ sở dữ liệu SQLite của từng người dùng được cấu hình `PRAGMA journal_mode = WAL`, `PRAGMA foreign_keys = ON`, `PRAGMA busy_timeout = 5000`:

1. **`workspaces` (`L1478-1501`):**
   - Cột: `id` (TEXT PK), `name` (TEXT NOT NULL), `slug` (TEXT NOT NULL UNIQUE), `color` (TEXT NOT NULL DEFAULT `'#22d3ee'`), `icon` (TEXT DEFAULT `'folder'`), `description` (TEXT), `tags` (TEXT JSON `string[]` NOT NULL DEFAULT `'[]'`), `brand_voice` (TEXT), `knowledge` (TEXT), `watermark_path` (TEXT), `watermark_position` (TEXT NOT NULL DEFAULT `'br'`), `watermark_opacity` (REAL NOT NULL DEFAULT `0.85`), `default_hashtags` (TEXT JSON `string[]` NOT NULL DEFAULT `'[]'`), `golden_hours` (TEXT JSON `Array<{start,end,weight}>` NOT NULL DEFAULT `'[]'`), `ai_budget_usd` (REAL), `ai_token_quota` (INTEGER), `sort_order` (INTEGER NOT NULL DEFAULT `0`), `archived_at` (INTEGER ms), `created_at` (INTEGER ms NOT NULL), `updated_at` (INTEGER ms NOT NULL).
2. **`proxies` (`L1502-1524`):**
   - Cột: `id` (TEXT PK), `workspace_id` (TEXT FK `workspaces.id` ON DELETE SET NULL), `label` (TEXT NOT NULL), `protocol` (TEXT NOT NULL DEFAULT `'socks5'`), `host` (TEXT NOT NULL), `port` (INTEGER NOT NULL), `username` (TEXT), `password_secret_id` (TEXT), `country` (TEXT DEFAULT `'VN'`), `kind` (TEXT DEFAULT `'residential'`), `health` (TEXT NOT NULL DEFAULT `'ok'`), `latency_ms` (INTEGER), `external_ip` (TEXT), `last_checked_at` (INTEGER ms), `created_at` (INTEGER ms NOT NULL), `updated_at` (INTEGER ms NOT NULL).
3. **`browser_profiles` (`L1525-1539`):**
   - Cột: `id` (TEXT PK), `workspace_id` (TEXT FK `workspaces.id` ON DELETE CASCADE), `name` (TEXT NOT NULL), `user_agent` (TEXT), `locale` (TEXT NOT NULL DEFAULT `'vi-VN'`), `timezone` (TEXT NOT NULL DEFAULT `'Asia/Ho_Chi_Minh'`), `canvas_noise` (INTEGER boolean NOT NULL DEFAULT `1`), `webrtc_shield` (INTEGER boolean NOT NULL DEFAULT `1`), `webgl_vendor` (TEXT), `data_dir` (TEXT), `created_at` (INTEGER ms NOT NULL), `updated_at` (INTEGER ms NOT NULL).
4. **`accounts` (`L1540-1564`):**
   - Cột: `id` (TEXT PK), `workspace_id` (TEXT FK `workspaces.id` ON DELETE SET NULL), `platform` (TEXT NOT NULL: `'facebook'|'tiktok'|'instagram'|'youtube'`), `display_name` (TEXT NOT NULL), `handle` (TEXT), `external_id` (TEXT), `avatar_url` (TEXT), `proxy_id` (TEXT FK `proxies.id` ON DELETE SET NULL), `browser_profile_id` (TEXT FK `browser_profiles.id` ON DELETE SET NULL), `two_factor_enabled` (INTEGER boolean NOT NULL DEFAULT `0`), `session_status` (TEXT NOT NULL DEFAULT `'unknown'`), `session_expires_at` (INTEGER ms), `health` (TEXT NOT NULL DEFAULT `'idle'`), `note` (TEXT), `created_at` (INTEGER ms NOT NULL), `updated_at` (INTEGER ms NOT NULL).
   - Indexes: `accounts_workspace_idx (workspace_id)`, UNIQUE `accounts_platform_external_uq (platform, external_id)`.
5. **`channels` (`L1565-1595`):**
   - Cột: `id` (TEXT PK), `account_id` (TEXT NOT NULL FK `accounts.id` ON DELETE CASCADE), `workspace_id` (TEXT FK `workspaces.id` ON DELETE SET NULL), `platform` (TEXT NOT NULL), `kind` (TEXT NOT NULL: `'fb_page'|'fb_profile'|'ig_account'|'tiktok_account'|'yt_channel'`), `name` (TEXT NOT NULL), `handle` (TEXT), `external_id` (TEXT), `avatar_url` (TEXT), `followers` (INTEGER NOT NULL DEFAULT `0`), `role` (TEXT NOT NULL DEFAULT `'admin'`), `niche_tag` (TEXT), `status` (TEXT NOT NULL DEFAULT `'active'`), `quota_blocked` (INTEGER boolean NOT NULL DEFAULT `0`), `health` (TEXT NOT NULL DEFAULT `'ok'`), `token_status` (TEXT NOT NULL DEFAULT `'missing'`), `token_expires_at` (INTEGER ms), `last_synced_at` (INTEGER ms), `last_post_at` (INTEGER ms), `created_at` (INTEGER ms NOT NULL), `updated_at` (INTEGER ms NOT NULL).
   - Indexes: `channels_workspace_idx (workspace_id)`, `channels_account_idx (account_id)`, UNIQUE `channels_platform_external_uq (platform, external_id)`.
6. **`channel_metrics_daily` (`L1596-1609`):**
   - Cột: `channel_id` (TEXT NOT NULL FK `channels.id` ON DELETE CASCADE), `day` (TEXT NOT NULL `'YYYY-MM-DD'`), `views` (INTEGER NOT NULL DEFAULT `0`), `engagements` (INTEGER NOT NULL DEFAULT `0`), `watch_minutes` (INTEGER NOT NULL DEFAULT `0`), `followers` (INTEGER NOT NULL DEFAULT `0`).
   - Index: UNIQUE `channel_metrics_day_uq (channel_id, day)`.
7. **`secrets` (`L1610-1628`):**
   - Cột: `id` (TEXT PK), `kind` (TEXT NOT NULL: `'oauth_token'|'cookie'|'api_key'|'proxy_password'|'totp_seed'`), `owner_type` (TEXT NOT NULL: `'account'|'channel'|'ai_provider'|'proxy'|'integration'`), `owner_id` (TEXT NOT NULL), `ciphertext` (BLOB NOT NULL), `iv` (BLOB NOT NULL), `auth_tag` (BLOB NOT NULL), `preview` (TEXT), `expires_at` (INTEGER ms), `last_verified_at` (INTEGER ms), `created_at` (INTEGER ms NOT NULL), `updated_at` (INTEGER ms NOT NULL).
   - Index: `secrets_owner_idx (owner_type, owner_id)`.
8. **`ai_providers` (`L1629-1647`):**
   - Cột: `id` (TEXT PK), `provider` (TEXT NOT NULL), `category` (TEXT NOT NULL: `'text'|'tts'|'media'|'music'`), `label` (TEXT NOT NULL), `default_model` (TEXT), `base_url` (TEXT), `available_models` (TEXT JSON `string[]` NOT NULL DEFAULT `'[]'`), `enabled` (INTEGER boolean NOT NULL DEFAULT `1`), `status` (TEXT NOT NULL DEFAULT `'untested'`), `latency_ms` (INTEGER), `last_error` (TEXT), `last_tested_at` (INTEGER ms), `priority` (INTEGER NOT NULL DEFAULT `0`), `created_at` (INTEGER ms NOT NULL), `updated_at` (INTEGER ms NOT NULL).
9. **`ai_usage` (`L1648-1664`):**
   - Cột: `id` (TEXT PK), `provider_id` (TEXT FK `ai_providers.id` ON DELETE SET NULL), `workspace_id` (TEXT FK `workspaces.id` ON DELETE SET NULL), `model` (TEXT), `feature` (TEXT), `input_tokens` (INTEGER NOT NULL DEFAULT `0`), `output_tokens` (INTEGER NOT NULL DEFAULT `0`), `characters` (INTEGER NOT NULL DEFAULT `0`), `cost_usd` (REAL NOT NULL DEFAULT `0`), `ok` (INTEGER boolean NOT NULL DEFAULT `1`), `created_at` (INTEGER ms NOT NULL).
   - Index: `ai_usage_created_idx (created_at)`.
10. **`content_items` (`L1665-1690`):**
    - Cột: `id` (TEXT PK), `workspace_id` (TEXT FK `workspaces.id` ON DELETE SET NULL), `kind` (TEXT NOT NULL: `'video'|'reel'|'image'|'carousel'|'text'`), `title` (TEXT NOT NULL), `caption` (TEXT), `hashtags` (TEXT JSON `string[]` NOT NULL DEFAULT `'[]'`), `first_comment` (TEXT), `media_paths` (TEXT JSON `string[]` NOT NULL DEFAULT `'[]'`), `thumbnail_path` (TEXT), `duration_sec` (REAL), `aspect` (TEXT NOT NULL DEFAULT `'9:16'`), `source` (TEXT NOT NULL DEFAULT `'upload'`), `spin_variants` (INTEGER NOT NULL DEFAULT `0`), `status` (TEXT NOT NULL DEFAULT `'ready'`), `hook_score` (TEXT JSON `HookScoreResult`), `created_at` (INTEGER ms NOT NULL), `updated_at` (INTEGER ms NOT NULL).
    - Index: `content_workspace_idx (workspace_id, status)`.
11. **`content_variants` (`L1691-1702`):**
    - Cột: `id` (TEXT PK), `content_item_id` (TEXT NOT NULL FK `content_items.id` ON DELETE CASCADE), `caption` (TEXT NOT NULL), `hashtags` (TEXT JSON `string[]` NOT NULL DEFAULT `'[]'`), `model` (TEXT), `created_at` (INTEGER ms NOT NULL).
    - Index: `content_variants_item_idx (content_item_id)`.
12. **`video_projects` (`L1703-1739`):**
    - Cột: `id` (TEXT PK), `workspace_id` (TEXT FK `workspaces.id` ON DELETE SET NULL), `content_item_id` (TEXT FK `content_items.id` ON DELETE SET NULL), `target_channel_id` (TEXT FK `channels.id` ON DELETE SET NULL), `topic` (TEXT NOT NULL), `format` (TEXT DEFAULT `'free'`), `target_duration_sec` (INTEGER NOT NULL DEFAULT `30`), `aspect` (TEXT NOT NULL DEFAULT `'9:16'`), `transition` (TEXT NOT NULL DEFAULT `'cut'`), `acts` (TEXT JSON), `visual_bible` (TEXT JSON), `reference_images` (TEXT JSON `string[]` NOT NULL DEFAULT `'[]'`), `fashion` (TEXT JSON `FashionSetup`), `voice_id` (TEXT), `tts_provider` (TEXT NOT NULL DEFAULT `'edge_tts'`), `narration` (INTEGER boolean NOT NULL DEFAULT `1`), `clip_audio` (TEXT NOT NULL DEFAULT `'tts'`), `clip_audio_volume` (REAL NOT NULL DEFAULT `0.35`), `subtitle_style` (TEXT NOT NULL DEFAULT `'montserrat-kara-pop'`), `bgm_track` (TEXT), `bgm_volume` (REAL NOT NULL DEFAULT `0.18`), `ken_burns` (INTEGER boolean NOT NULL DEFAULT `1`), `watermark_enabled` (INTEGER boolean NOT NULL DEFAULT `1`), `render_mode` (TEXT NOT NULL DEFAULT `'semi_ai'`), `status` (TEXT NOT NULL DEFAULT `'draft'`), `created_at` (INTEGER ms NOT NULL), `updated_at` (INTEGER ms NOT NULL).
13. **`video_scenes` (`L1740-1773`):**
    - Cột: `id` (TEXT PK), `project_id` (TEXT NOT NULL FK `video_projects.id` ON DELETE CASCADE), `position` (INTEGER NOT NULL), `act` (INTEGER NOT NULL DEFAULT `0`), `label` (TEXT), `voiceover` (TEXT NOT NULL), `duration_sec` (REAL NOT NULL DEFAULT `5`), `media_prompt` (TEXT), `search_query` (TEXT), `media_mode` (TEXT NOT NULL DEFAULT `'auto'`), `start_image` (TEXT), `end_image` (TEXT), `scene_refs` (TEXT JSON `string[]`), `outfit` (TEXT JSON `string[]`), `media_path` (TEXT), `media_source` (TEXT), `media_credit` (TEXT), `speaker_id` (TEXT), `voice_id` (TEXT), `audio_path` (TEXT).
    - Index: `video_scenes_project_idx (project_id, position)`.
14. **`render_jobs` (`L1774-1793`):**
    - Cột: `id` (TEXT PK), `project_id` (TEXT NOT NULL FK `video_projects.id` ON DELETE CASCADE), `encoder` (TEXT NOT NULL DEFAULT `'libx264'`), `status` (TEXT NOT NULL DEFAULT `'queued'`), `progress` (REAL NOT NULL DEFAULT `0`), `stage` (TEXT NOT NULL DEFAULT `'queued'`), `output_path` (TEXT), `duration_ms` (INTEGER), `error` (TEXT), `started_at` (INTEGER ms), `finished_at` (INTEGER ms), `created_at` (INTEGER ms NOT NULL).
    - Index: `render_jobs_project_idx (project_id, created_at)`.
15. **`scheduled_posts` (`L1794-1834`):**
    - Cột: `id` (TEXT PK), `content_item_id` (TEXT NOT NULL FK `content_items.id` ON DELETE CASCADE), `channel_id` (TEXT NOT NULL FK `channels.id` ON DELETE CASCADE), `scheduled_at` (INTEGER ms NOT NULL), `published_at` (INTEGER ms), `status` (TEXT NOT NULL DEFAULT `'queued'`), `is_golden_hour` (INTEGER boolean NOT NULL DEFAULT `0`), `external_post_id` (TEXT), `permalink` (TEXT), `reach` (INTEGER), `views` (INTEGER), `likes` (INTEGER), `comments_count` (INTEGER), `shares` (INTEGER), `saves` (INTEGER), `engagements` (INTEGER), `avg_watch_sec` (REAL), `metrics_updated_at` (INTEGER ms), `first_comment_posted` (INTEGER boolean NOT NULL DEFAULT `0`), `early_checked_at` (INTEGER ms), `early_reach_flag` (TEXT `'ok'|'low'|'zero'`), `attempts` (INTEGER NOT NULL DEFAULT `0`), `next_attempt_at` (INTEGER ms), `error` (TEXT), `created_at` (INTEGER ms NOT NULL), `updated_at` (INTEGER ms NOT NULL).
    - Indexes: `posts_schedule_idx (status, scheduled_at)`, `posts_channel_idx (channel_id, scheduled_at)`, `posts_content_idx (content_item_id)`, `posts_status_published_idx (status, published_at)`.
16. **`conversations` (`L1835-1859`):**
    - Cột: `id` (TEXT PK), `channel_id` (TEXT NOT NULL FK `channels.id` ON DELETE CASCADE), `workspace_id` (TEXT FK `workspaces.id` ON DELETE SET NULL), `platform` (TEXT NOT NULL), `source` (TEXT NOT NULL DEFAULT `'messenger'`), `external_id` (TEXT), `customer_name` (TEXT NOT NULL), `customer_handle` (TEXT), `customer_external_id` (TEXT), `customer_avatar` (TEXT), `context_post_title` (TEXT), `unread_count` (INTEGER NOT NULL DEFAULT `0`), `tags` (TEXT JSON `string[]` NOT NULL DEFAULT `'[]'`), `status` (TEXT NOT NULL DEFAULT `'open'`), `last_message_preview` (TEXT), `last_message_at` (INTEGER ms), `created_at` (INTEGER ms NOT NULL), `updated_at` (INTEGER ms NOT NULL).
    - Indexes: `conv_workspace_idx (workspace_id, last_message_at)`, UNIQUE `conv_channel_external_uq (channel_id, external_id)`.
17. **`messages` (`L1860-1892`):**
    - Cột: `id` (TEXT PK), `conversation_id` (TEXT NOT NULL FK `conversations.id` ON DELETE CASCADE), `external_id` (TEXT), `direction` (TEXT NOT NULL `'in'|'out'`), `author` (TEXT NOT NULL `'customer'|'agent'|'bot'`), `body` (TEXT NOT NULL), `attachments` (TEXT JSON `string[]` NOT NULL DEFAULT `'[]'`), `delivery_status` (TEXT NOT NULL DEFAULT `'sent'`), `delivery_error` (TEXT), `ai_meta` (TEXT JSON `{confidence,reason,intent,model}`), `send_after` (INTEGER ms), `created_at` (INTEGER ms NOT NULL).
    - Indexes: `messages_conv_idx (conversation_id, created_at)`, `messages_outbox_idx (delivery_status, send_after)`, `messages_author_idx (author, created_at)`, UNIQUE `messages_conv_external_uq (conversation_id, external_id)`.
18. **`quick_replies` (`L1893-1901`):**
    - Cột: `id` (TEXT PK), `workspace_id` (TEXT FK `workspaces.id` ON DELETE CASCADE), `shortcut` (TEXT NOT NULL), `title` (TEXT NOT NULL), `body` (TEXT NOT NULL), `created_at` (INTEGER ms NOT NULL).
19. **`auto_reply_rules` (`L1902-1916`):**
    - Cột: `id` (TEXT PK), `workspace_id` (TEXT FK `workspaces.id` ON DELETE CASCADE), `channel_id` (TEXT FK `channels.id` ON DELETE CASCADE), `name` (TEXT NOT NULL), `keywords` (TEXT JSON `string[]` NOT NULL DEFAULT `'[]'`), `action` (TEXT NOT NULL `'reply_comment'|'send_dm'|'hide_comment'`), `template` (TEXT), `min_delay_sec` (INTEGER NOT NULL DEFAULT `15`), `max_delay_sec` (INTEGER NOT NULL DEFAULT `35`), `enabled` (INTEGER boolean NOT NULL DEFAULT `1`), `created_at` (INTEGER ms NOT NULL), `updated_at` (INTEGER ms NOT NULL).
20. **`alerts` (`L1917-1933`):**
    - Cột: `id` (TEXT PK), `severity` (TEXT NOT NULL `'info'|'warn'|'error'`), `kind` (TEXT NOT NULL), `entity_type` (TEXT), `entity_id` (TEXT), `title` (TEXT NOT NULL), `message` (TEXT NOT NULL), `resolved_at` (INTEGER ms), `created_at` (INTEGER ms NOT NULL).
    - Index: `alerts_open_idx (resolved_at, created_at)`.
21. **`activity_log` (`L1934-1944`):**
    - Cột: `id` (INTEGER PK AUTOINCREMENT), `level` (TEXT NOT NULL `'ok'|'info'|'warn'|'error'`), `scope` (TEXT NOT NULL `'publish'|'render'|'token'|'proxy'|'inbox'|'ai'|'system'`), `message` (TEXT NOT NULL), `created_at` (INTEGER ms NOT NULL).
    - Index: `activity_created_idx (created_at)`.
22. **`settings` (`L1945-1949`):**
    - Cột: `key` (TEXT PK), `value` (TEXT JSON NOT NULL), `updated_at` (INTEGER ms NOT NULL).
23. **`series` (`L1950-1976`):**
    - Cột: `id` (TEXT PK), `workspace_id` (TEXT FK `workspaces.id` ON DELETE SET NULL), `target_channel_id` (TEXT FK `channels.id` ON DELETE SET NULL), `title` (TEXT NOT NULL), `logline` (TEXT), `genre` (TEXT), `visual_style` (TEXT), `dialogue_language` (TEXT NOT NULL DEFAULT `'Tiếng Việt'`), `notes` (TEXT), `visual_style_en` (TEXT), `visual_style_for` (TEXT), `production_mode` (TEXT NOT NULL DEFAULT `'video'`), `episode_length_sec` (INTEGER NOT NULL DEFAULT `60`), `narrator_voice_id` (TEXT), `tts_provider` (TEXT NOT NULL DEFAULT `'edge_tts'`), `render_mode` (TEXT NOT NULL DEFAULT `'full_ai'`), `created_at` (INTEGER ms NOT NULL), `updated_at` (INTEGER ms NOT NULL).
    - Index: `series_workspace_idx (workspace_id)`.
24. **`series_characters` (`L1977-2009`):**
    - Cột: `id` (TEXT PK), `series_id` (TEXT NOT NULL FK `series.id` ON DELETE CASCADE), `name` (TEXT NOT NULL), `role` (TEXT), `appearance` (TEXT NOT NULL), `personality` (TEXT), `arc` (TEXT), `voice_profile` (TEXT), `voice_provider` (TEXT), `voice_id` (TEXT), `image_prompt` (TEXT), `appearance_en` (TEXT), `image_prompt_for` (TEXT), `prompt_manual` (INTEGER boolean NOT NULL DEFAULT `0`), `reference_image` (TEXT), `sort_order` (INTEGER NOT NULL DEFAULT `0`), `created_at` (INTEGER ms NOT NULL).
    - Index: `series_chars_series_idx (series_id, sort_order)`.
25. **`series_episodes` (`L2010-2028`):**
    - Cột: `id` (TEXT PK), `series_id` (TEXT NOT NULL FK `series.id` ON DELETE CASCADE), `number` (INTEGER NOT NULL), `title` (TEXT NOT NULL), `synopsis` (TEXT NOT NULL), `cliffhanger` (TEXT), `project_id` (TEXT FK `video_projects.id` ON DELETE SET NULL), `film_id` (TEXT), `status` (TEXT NOT NULL DEFAULT `'planned'`), `created_at` (INTEGER ms NOT NULL), `updated_at` (INTEGER ms NOT NULL).
    - Index: `series_episodes_series_idx (series_id, number)`.
26. **`content_ideas` (`L2029-2052`):**
    - Cột: `id` (TEXT PK), `workspace_id` (TEXT FK `workspaces.id` ON DELETE SET NULL), `planned_date` (TEXT `'YYYY-MM-DD'`), `title` (TEXT NOT NULL), `format` (TEXT NOT NULL DEFAULT `'free'`), `hook` (TEXT), `description` (TEXT), `status` (TEXT NOT NULL DEFAULT `'idea'`), `source` (TEXT NOT NULL DEFAULT `'ai'`), `project_id` (TEXT FK `video_projects.id` ON DELETE SET NULL), `image_project_id` (TEXT FK `image_projects.id` ON DELETE SET NULL), `content_item_id` (TEXT FK `content_items.id` ON DELETE SET NULL), `created_at` (INTEGER ms NOT NULL), `updated_at` (INTEGER ms NOT NULL).
    - Index: `content_ideas_date_idx (workspace_id, planned_date)`.
27. **`channel_goals` (`L2053-2064`):**
    - Cột: `id` (TEXT PK), `channel_id` (TEXT NOT NULL FK `channels.id` ON DELETE CASCADE), `metric` (TEXT NOT NULL), `target` (INTEGER NOT NULL), `label` (TEXT), `created_at` (INTEGER ms NOT NULL).
    - Index: `channel_goals_channel_idx (channel_id)`.
28. **`film_projects` (`L2065-2118`):**
    - Cột: `id` (TEXT PK), `workspace_id` (TEXT FK `workspaces.id` ON DELETE SET NULL), `series_id` (TEXT FK `series.id` ON DELETE SET NULL), `episode_id` (TEXT FK `series_episodes.id` ON DELETE SET NULL), `title` (TEXT NOT NULL DEFAULT `'Phim mới'`), `logline` (TEXT), `idea` (TEXT NOT NULL DEFAULT `''`), `genre` (TEXT), `visual_style` (TEXT), `notes` (TEXT), `style_for` (TEXT), `dialogue_language` (TEXT NOT NULL DEFAULT `'Tiếng Việt'`), `subtitle_vi` (INTEGER boolean NOT NULL DEFAULT `0`), `voice_mode` (TEXT NOT NULL DEFAULT `'clip'`), `narration` (INTEGER boolean NOT NULL DEFAULT `0`), `narration_provider` (TEXT), `narration_voice_id` (TEXT), `watermark_mode` (TEXT NOT NULL DEFAULT `'pocket'`), `watermark_path` (TEXT), `watermark_position` (TEXT NOT NULL DEFAULT `'br'`), `watermark_opacity` (REAL NOT NULL DEFAULT `0.85`), `watermark_scale` (REAL NOT NULL DEFAULT `0.185`), `style` (TEXT NOT NULL), `aspect` (TEXT NOT NULL DEFAULT `'16:9'`), `target_sec` (INTEGER NOT NULL DEFAULT `120`), `takes_per_run` (INTEGER NOT NULL DEFAULT `4`), `image_engine` (TEXT NOT NULL DEFAULT `'google'`), `video_engine` (TEXT NOT NULL DEFAULT `'seedance'`), `video_tier` (TEXT NOT NULL DEFAULT `'fast'`), `video_resolution` (TEXT NOT NULL DEFAULT `'720p'`), `video_audio` (INTEGER boolean NOT NULL DEFAULT `1`), `chain_shots` (INTEGER boolean NOT NULL DEFAULT `0`), `end_frames` (INTEGER boolean NOT NULL DEFAULT `0`), `created_at` (INTEGER ms NOT NULL), `updated_at` (INTEGER ms NOT NULL).
    - Index: `film_projects_workspace_idx (workspace_id)`.
29. **`film_assets` (`L2119-2169`):**
    - Cột: `id` (TEXT PK), `film_id` (TEXT NOT NULL FK `film_projects.id` ON DELETE CASCADE), `kind` (TEXT NOT NULL `'character'|'location'|'shot'`), `position` (INTEGER NOT NULL DEFAULT `0`), `name` (TEXT NOT NULL), `summary` (TEXT NOT NULL DEFAULT `''`), `description` (TEXT NOT NULL DEFAULT `''`), `description_src` (TEXT), `prompt_manual` (INTEGER boolean NOT NULL DEFAULT `0`), `camera` (TEXT NOT NULL DEFAULT `''`), `duration_sec` (INTEGER NOT NULL DEFAULT `6`), `dialogue` (TEXT), `subtitle` (TEXT), `subtitle_src` (TEXT), `narration` (TEXT), `narration_file` (TEXT), `narration_source` (TEXT NOT NULL DEFAULT `'tts'`), `voice_profile` (TEXT), `voice_provider` (TEXT), `voice_id` (TEXT), `location_id` (TEXT), `character_ids` (TEXT JSON `string[]` NOT NULL DEFAULT `'[]'`), `series_character_id` (TEXT), `proposal` (TEXT `'pending'|'keep_episode'|'promoted'`), `proposed_scope` (TEXT `'episode'|'series'`), `proposal_reason` (TEXT), `start_source` (TEXT NOT NULL DEFAULT `'auto'`), `selected_take_id` (TEXT), `selected_video_take_id` (TEXT), `created_at` (INTEGER ms NOT NULL), `updated_at` (INTEGER ms NOT NULL).
    - Index: `film_assets_film_idx (film_id, kind, position)`.
30. **`film_takes` (`L2170-2203`):**
    - Cột: `id` (TEXT PK), `film_id` (TEXT NOT NULL FK `film_projects.id` ON DELETE CASCADE), `asset_id` (TEXT NOT NULL FK `film_assets.id` ON DELETE CASCADE), `kind` (TEXT NOT NULL DEFAULT `'image'`), `frame` (TEXT `'start'|'end'|'chain'`), `status` (TEXT NOT NULL DEFAULT `'queued'`), `file` (TEXT), `prompt` (TEXT NOT NULL), `refs` (TEXT JSON `string[]` NOT NULL DEFAULT `'[]'`), `duration_sec` (INTEGER), `upscale` (TEXT `'1080p'|'4k'`), `source_take_id` (TEXT), `model` (TEXT), `cost_usd` (REAL NOT NULL DEFAULT `0`), `attempts` (INTEGER NOT NULL DEFAULT `0`), `not_before` (INTEGER ms), `error` (TEXT), `started_at` (INTEGER ms), `finished_at` (INTEGER ms), `created_at` (INTEGER ms NOT NULL).
    - Indexes: `film_takes_asset_idx (asset_id, created_at)`, `film_takes_queue_idx (status, not_before)`, `film_takes_film_idx (film_id)`.
31. **`image_projects` (`L2204-2221`):**
    - Cột: `id` (TEXT PK), `workspace_id` (TEXT FK `workspaces.id` ON DELETE SET NULL), `title` (TEXT NOT NULL DEFAULT `'Dự án ảnh mới'`), `product` (TEXT NOT NULL DEFAULT `''`), `brief` (TEXT NOT NULL DEFAULT `''`), `image_type` (TEXT NOT NULL DEFAULT `'square'`), `style` (TEXT), `aspect` (TEXT NOT NULL DEFAULT `'1:1'`), `refs` (TEXT JSON `string[]` NOT NULL DEFAULT `'[]'`), `ideas` (TEXT JSON `ImageIdea[]` NOT NULL DEFAULT `'[]'`), `created_at` (INTEGER ms NOT NULL), `updated_at` (INTEGER ms NOT NULL).
    - Index: `image_projects_workspace_idx (workspace_id)`.
32. **`image_results` (`L2222-2236`):**
    - Cột: `id` (TEXT PK), `project_id` (TEXT NOT NULL FK `image_projects.id` ON DELETE CASCADE), `idea_id` (TEXT), `file` (TEXT NOT NULL), `model` (TEXT NOT NULL DEFAULT `''`), `cost_usd` (REAL NOT NULL DEFAULT `0`), `selected` (INTEGER boolean NOT NULL DEFAULT `0`), `created_at` (INTEGER ms NOT NULL).
    - Index: `image_results_project_idx (project_id, created_at)`.
33. **`tts_jobs` (`L2237-2264`):**
    - Cột: `id` (TEXT PK), `title` (TEXT NOT NULL), `text` (TEXT NOT NULL), `provider` (TEXT NOT NULL), `model` (TEXT), `voice_id` (TEXT), `voice_label` (TEXT), `pause_sec` (REAL NOT NULL DEFAULT `0.5`), `cast` (TEXT JSON NOT NULL DEFAULT `'{}'`), `srt_file` (TEXT), `chars` (INTEGER NOT NULL DEFAULT `0`), `status` (TEXT NOT NULL DEFAULT `'queued'`), `progress` (REAL NOT NULL DEFAULT `0`), `chunks_done` (INTEGER NOT NULL DEFAULT `0`), `chunks_total` (INTEGER NOT NULL DEFAULT `0`), `file` (TEXT), `duration_sec` (REAL), `error` (TEXT), `started_at` (INTEGER ms), `finished_at` (INTEGER ms), `created_at` (INTEGER ms NOT NULL).
    - Index: `tts_jobs_created_idx (created_at)`.

---

## PHẦN 4: TOÀN BỘ LOGIC NGHIỆP VỤ & KẾT NỐI HỆ THỐNG (BUSINESS LOGIC ENGINE)

### 4.1. Chi tiết Từng Luồng Nghiệp vụ Cốt lõi (End-to-End Business Flows)

#### Luồng 1: Đăng nhập, Xác thực Ngoại tuyến, Khôi phục Khóa Di động & Đồng bộ Bản quyền (`out/main/index.js:L3595-3917`, `L15555-15813`)
1. **Sự kiện người dùng:** Người dùng nhập `email`, `password`, tích `remember` tại `LoginPage` (`index-01dFNdzs.js:L55749`) và bấm *"Đăng nhập"*.
2. **Validation (Zod):** `contract["auth.login"]` (`L578`): `email` (`trim().toLowerCase().email().max(160)`), `password` (`min(1).max(200)`), `remember` (`boolean().default(true)`).
3. **Kiểm tra Chống Brute-Force (`lockRemainingSec` - `L2626-2640`):**
   - Nếu số lần đăng nhập sai của `email` trong 15 phút qua (`WINDOW_MS = 900,000`) đạt `MAX_ATTEMPTS = 5`, trả về lỗi `ApiError("AUTH", "Sai mật khẩu quá nhiều lần – thử lại sau <wait> giây")` (thời gian khóa `LOCK_MS = 300,000ms` = 5 phút).
4. **Gọi API Cloud & Rẽ nhánh Online / Offline (`L15740-15761`):**
   - **Nhánh A – Có kết nối mạng (Online):**
     - Gọi `POST https://api.omnira.io.vn/api/client/v1/auth/login` với payload `{ email, password }`.
     - Nếu Cloud trả về `401`, tăng bộ đếm `recordFailure(email)` và ném lỗi `AUTH`.
     - Nếu thành công, gọi `clearFailures(email)` và chuyển sang `startCloud(auth, password, remember)` (`L15620-15664`):
       - Cập nhật hoặc tạo bản ghi người dùng trong `<dataRoot>/auth/users.json` kèm băm mật khẩu `scrypt` (`hashPassword(password)`).
       - Ghi `<dataRoot>/auth/cloud-<userId>.bin` (mã hóa `safeStorage`) chứa `{ customerId, email, customerToken: auth.token, licenseToken }`.
       - Mở phiên `start(user, remember, password)`:
         - Gọi `unlockOrInitVault(user.id, password)` (`L2418-2462`): Nếu `master.bin` chưa tồn tại hoặc không giải mã được bằng DPAPI máy hiện tại (do người dùng chép thư mục dữ liệu từ máy cũ sang), dùng `password` giải mã `master.portable` qua `scrypt(N=32768, r=8, p=1)` + `AES-256-GCM` để khôi phục `masterKey` 32 bytes rồi ghi lại `master.bin` mới cho máy hiện tại. Luôn cập nhật lại `master.portable` theo mật khẩu vừa đăng nhập.
       - Gọi `refreshLicense()` (`L3860-3885`): Gửi `POST /api/client/v1/license/heartbeat` kèm `{ deviceId, deviceName: os.hostname(), platform: process.platform, appVersion: app.getVersion() }`. Nếu trạng thái trả về là `"revoked"`, tự động gọi `activateLicense()` (`POST /api/client/v1/license/activate`).
       - Nhận danh sách `managedKeys` từ phản hồi heartbeat (nếu gói cước có cấp sẵn key AI quản lý bởi Omnira) và lưu tự động vào bảng `secrets` (`applyManagedKeys` `L3752-3770`).
   - **Nhánh B – Mất kết nối mạng (`e instanceof CloudError && e.offline` - `L15743-15756`):**
     - Tìm `user = findUser(email)` trong `users.json`. Nếu không có user, vẫn chạy `verifyPassword(password, dummyHash)` để chống tấn công đo thời gian (Timing Attack).
     - Nếu mật khẩu khớp với `user.passwordHash` VÀ tệp `cloud-<userId>.bin` có `licenseToken` vượt qua kiểm tra chữ ký RSA-SHA256 cục bộ (`verifyLicenseToken(licenseToken)` kiểm tra `header.alg === "RS256"`, `claims.typ === "license"`, `claims.did === deviceId()`, `claims.exp * 1000 > Date.now()`), cho phép đăng nhập ngoại tuyến ở trạng thái `status: "offline_grace", usable: true`.
5. **Cập nhật State & Phản hồi UI:** Renderer xóa toàn bộ query cache cũ (`qc.removeQueries`), cập nhật `["auth.state"]`, đóng `LoginPage` và mở `AppShell`.

---

#### Luồng 2: Định tuyến AI Đa Nhà cung cấp, Sửa lỗi JSON, Kiểm tra Dấu Tiếng Việt & Ngắt mạch Ngân sách (`out/main/index.js:L5720-6355`, `L12480-12525`)
1. **Kiểm tra & Giữ chỗ Ngân sách (`assertBudget` & `reserveBudget` - `L6180-6235`):**
   - Trước mọi lệnh gọi AI có tính phí, hệ thống tính tổng `spentMonthUsd` từ bảng `ai_usage` (từ ngày mùng 1 đầu tháng `startOfMonthMs()`) cộng với biến bộ nhớ `inFlightSpend` (tổng chi phí ước tính của các yêu cầu AI đang chạy dở).
   - Nếu `circuitBreaker === true` và `spentMonthUsd + inFlightSpend >= hardCapUsd` (hoặc chi tiêu của Pocket vượt `workspace.aiBudgetUsd`), hệ thống tạo cảnh báo `budget_cap` vào bảng `alerts` và ném lỗi `AiError("budget", "Đã chạm trần ngân sách AI tháng...")`.
2. **Lựa chọn Nhà cung cấp & Failover (`aiText` - `L6266-6355`):**
   - Lấy danh sách các bản ghi trong bảng `ai_providers` có `category = "text"` và `enabled = true`, sắp xếp theo `priority ASC`.
   - Với mỗi provider, tìm API key trong bảng `secrets` (nếu không có key riêng thì tìm qua `sharedKeyProvider(provider)`: `google_tts`/`google_image`/`google_veo`/`google_lyria` dùng chung key của `gemini`; `openai_tts` dùng chung key của `openai`; `elevenlabs_music` dùng chung key của `elevenlabs`; `seedance`/`kling` dùng chung key của `fal`).
   - Nếu không có bất kỳ provider văn bản nào có API key, hệ thống tự động chuyển hướng sang gọi **Omnira Cloud AI** (`POST /api/client/v1/ai/chat`, hàm `omniraText` `L6025-6052`).
   - Nếu provider đang gọi gặp lỗi thuộc tập `RETRYABLE_KINDS` (`"rate_limit"`, `"overloaded"`, `"timeout"`, `"network"`, `"invalid_output"`) và cài đặt `ai.fallbackOnError !== false`, vòng lặp tự động chuyển sang provider ưu tiên kế tiếp.
3. **Trích xuất, Cứu hộ JSON & Kiểm tra Dấu Tiếng Việt (`aiJson` - `L12480-12525`):**
   - Đầu ra văn bản từ LLM được đưa qua `extractJson(raw)` (`L5815-5830`): cắt bỏ khối ```json, chạy máy trạng thái `repairJson(s)` (`L5720-5782`) để sửa các ký tự xuống dòng `\n` chưa escape hoặc dấu ngoặc kép `"` trần bên trong chuỗi JSON, và chạy `closeTruncated(s)` (`L5783-5814`) dùng ngăn xếp (stack) đóng tự động toàn bộ các ngoặc `]` và `}` còn mở nếu văn bản bị cắt cụt do hết `max_tokens`.
   - Sau khi parse JSON và kiểm tra `schema.parse(parsed)` bằng `zod`, hàm `lacksVietnameseDiacritics(parsed)` (`L12481-12488`) đếm tổng số ký tự chữ cái Latin và số ký tự có dấu tiếng Việt (`/[àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ]/i`). Nếu tổng số chữ cái `> 60` mà tỷ lệ ký tự có dấu `< 0.035` (`3.5%`), hàm xác định AI đã viết tiếng Việt không dấu và tự động gọi lại LLM lần 2 với `maxTokens * 2` kèm chỉ thị bắt buộc viết tiếng Việt có dấu đầy đủ.
4. **Ghi nhận Chi phí (`recordUsage` - `L6145-6179`):**
   - Tính chi phí dựa trên bảng giá `MODEL_PRICING` (hoặc giá tùy chỉnh trong `settings["ai.customPricing"]`):
     $$\text{costUsd} = \frac{\text{inputTokens} \times \text{price.input} + \text{outputTokens} \times \text{price.output}}{1,000,000}$$
   - Ghi bản ghi mới vào bảng `ai_usage` và giải phóng số tiền giữ chỗ khỏi `inFlightSpend`.

---

#### Luồng 3: Chấm điểm Hook Score & Quét Chính sách Quảng cáo (`scoreHook` - `out/main/index.js:L18784-19086`)
1. **Sự kiện người dùng:** Người dùng bấm *"Chấm điểm Hook"* trong `ContentEditor` (`HookPanel` `index-01dFNdzs.js:L35067`) hoặc bấm chấm điểm hàng loạt tại `ContentPage`.
2. **Bước 1 – Chấm điểm Kỹ thuật bằng Code (`codeChecks` - `L18852-18964`, Trọng số 40%):**
   - Tách dòng đầu tiên làm `firstLine`, đếm số từ/âm tiết `words = firstLine.split(/\s+/).length`:
     - Nếu `words < 4`: `hookLenScore = 35`.
     - Nếu `words >= 6 && words <= 22`: `hookLenScore = 90`.
     - Nếu `words > 38`: `hookLenScore = 40`.
     - Các trường hợp còn lại: `hookLenScore = 70`.
   - Kiểm tra lời chào sáo rỗng đầu câu (`/^(xin\s+chào|chào\s+mọi\s+người|chào\s+các\s+bạn|hello\s+mọi\s+người|hi\s+mọi\s+người|chào\s+cả\s+nhà)\b/i`): Nếu khớp, phạt `-35 điểm`.
   - Kiểm tra yếu tố kích thích tò mò đầu câu (có dấu `?`, có chữ số `\d`, hoặc khớp `/\b(tại\s+sao|vì\s+sao|bí\s+mật| sự\s+thật|đừng|sai\s+lầm|cảnh\s+báo|ít\s+ai\s+biết|90%|99%|top\s+\d|cách\s+để|làm\s+sao)\b/i`): Thưởng `+10 điểm`.
   - Quét danh sách 21 cụm từ văn mẫu AI (`CLICHES` `L18802-18825`, gồm `"trong thời đại"`, `"không chỉ... mà còn"`, `"chìa khóa vàng"`, `"hãy cùng khám phá"`, `"bữa tiệc thị giác"`, `"nâng tầm trải nghiệm"`, `"đánh thức mọi giác quan"`, `"không thể bỏ qua"`, `"tuyệt vời ông mặt trời"`...): Mỗi cụm phát hiện trừ `12 điểm` khỏi điểm tự nhiên (`clicheScore = Math.max(20, 95 - foundCliches.length * 12)`).
   - Kiểm tra số lượng Hashtag theo nền tảng đích (`facebook`: 1–5, `tiktok`: 3–6, `instagram`: 3–8, `youtube`: 0–5): Đúng chuẩn đạt `90 điểm`, không có hashtag `55 điểm`, quá `10` hashtags phạt còn `30 điểm`.
3. **Bước 2 – Quét 8 Nhóm Vi phạm Chính sách Quảng cáo (`POLICY` - `L18884-18908`):**
   - Kiểm tra văn bản với 8 mẫu biểu thức chính quy:
     1. *Cam kết tuyệt đối:* `/\b(cam\s+kết\s+100%|chữa\s+khỏi\s+100%|khỏi\s+hoàn\s+toàn|dứt\s+điểm\s+100%|hiệu\s+quả\s+tức\s+thì)\b/i` (mức `"high"`).
     2. *Y tế / Thuốc nhạy cảm:* `/\b(thuốc\s+đặc\s+trị|đông\s+y\s+gia\s+truyền|thần\s+dược|chữa\s+bách\s+bệnh|ung\s+thư|tiểu\s+đường|xương\s+khớp\s+nặng)\b/i` (mức `"high"`).
     3. *So sánh Trước / Sau:* `/\b(trước\s+và\s+sau\s+khi|before\s*[/&-]\s*after|lột\s+xác\s+sau\s+\d+\s+ngày)\b/i` (mức `"medium"`).
     4. *Giảm cân cấp tốc:* `/\b(giảm\s+\d+\s*kg\s+trong\s+\d+\s*(ngày|tuần)|đánh\s+bay\s+mỡ\s+bụng\s+cấp\s+tốc)\b/i` (mức `"high"`).
     5. *Tài chính / Làm giàu nhanh:* `/\b(kiếm\s+\d+\s*(triệu|tỷ)\s*mỗi\s*(ngày|tháng)|làm\s+giàu\s+không\s+khó|lãi\s+suất\s+cam\s+kết|x\d+\s+tài\s+khoản)\b/i` (mức `"high"`).
     6. *Hàng giả / Nhái thương hiệu:* `/\b(hàng\s+rep\s*1\s*:\s*1|super\s+fake|like\s+auth|giống\s+auth\s+99%|hàng\s+tuồn)\b/i` (mức `"high"`).
     7. *Cờ bạc / Cá cược:* `/\b(tài\s+xỉu|nổ\s+hũ|nhà\s+cái|cá\s+cược|lô\s+đề|soi\s+cầu)\b/i` (mức `"high"`).
     8. *Câu kéo tương tác (Engagement Bait):* `/\b(like\s+và\s+share\s+để\s+nhận|comment\s+số\s+bất\s+kỳ|chấm\s+\(\.\)\s+để\s+không\s+trôi\s+bài)\b/i` (mức `"low"`).
4. **Bước 3 – Chấm điểm bởi AI Content Director & Tổng hợp (`L18999-19086`):**
   - Gửi bài viết và kết quả kiểm tra sơ bộ cho `aiJson` chấm 7 tiêu chí (`curiosity`, `clarity`, `fresh`, `specific`, `emotion`, `visual`, `contrast` trên thang 0–100) và sinh 3 phương án viết lại câu mở đầu (`rewrites`).
   - Điểm cuối cùng: `overall = Math.round(codeScore * 0.4 + aiAvg * 0.6)`, xếp hạng `grade`: `>= 80` là `"A"`, `>= 65` là `"B"`, `>= 50` là `"C"`, `< 50` là `"D"`. Lưu kết quả JSON vào cột `content_items.hook_score`.

---

#### Luồng 4: Xưởng Video AI, Phối đồ Thời trang (`tryOn`) & Pipeline Render FFmpeg (`out/main/index.js:L9163-10827`, `L19153-19285`)
1. **Trích xuất Visual Bible từ Ảnh Tham chiếu (`studio.bibleFromRefs` - `L19153-19163`):**
   - Khi người dùng tải ảnh tham chiếu lên dự án Video Studio, sau `1500ms` debounce, ứng dụng đọc tối đa 4 ảnh dưới dạng base64 gửi vào model thị giác (`gemini-3-flash-preview` / `gpt-5.4-mini`) để trích xuất cấu trúc JSON `{ style, characters: [{ name, look }], product: { name, look } }`, sau đó tự động cập nhật lại `mediaPrompt` tiếng Anh của toàn bộ phân cảnh để đồng nhất nhân vật và sản phẩm.
2. **Phối đồ Thời trang Ảo (`studio.tryOn` & `tryOnScene` - `L9930-10140`):**
   - Khi dự án có định dạng `format === "fashion_tryon"`, người dùng chọn ảnh người mẫu (`fashion.model`) và danh sách món đồ (`fashion.items` gồm 7 loại: `top`, `bottom`, `dress`, `outerwear`, `shoes`, `bag`, `accessory`).
   - Nếu chọn engine `"kolors"` (`fal-ai/kling/v1-5/kolors-virtual-try-on`): Hệ thống lọc các món quần áo theo đúng thứ tự mặc từ trong ra ngoài `GARMENT_ORDER = ["bottom", "top", "dress", "outerwear"]`, gọi tuần tự Kolors API truyền ảnh kết quả của bước trước làm ảnh `human_image_url` cho bước sau; nếu có phụ kiện (`shoes`, `bag`, `accessory`), truyền tiếp ảnh đã mặc quần áo qua **Nano Banana 2** để đeo thêm phụ kiện và đặt vào bối cảnh của phân cảnh.
   - Nếu chọn engine `"nano"`: Gửi đồng thời ảnh người mẫu + tất cả ảnh món đồ trong 1 lần gọi đa ảnh tới **Nano Banana 2** (`gemini-3.1-flash-image-preview` hoặc `fal-ai/nano-banana-2`) để mặc toàn bộ trang phục và dựng bối cảnh trong một bước duy nhất.
3. **Pipeline Render Video Đa Giai đoạn (`renderProjectIn` - `L10279-10827`):**
   - **Giai đoạn 1 – Tổng hợp giọng đọc TTS (`stage: "tts"`, tiến độ `5% → 25%`):**
     - Với từng phân cảnh (`video_scenes`), nếu `narration === true`, gọi provider TTS tương ứng (`edge_tts`, `local_tts`, `elevenlabs`, `openai_tts`, `google_tts`). Lưu cache theo mã băm SHA-256 của `(provider, voiceId, voiceover)` tại `<userDir>/media/cache/tts/<hash>/`.
     - Đo thời lượng thực tế của file âm thanh bằng `ffprobe` và cập nhật lại `scene.durationSec` khớp chính xác với giọng đọc. Nếu `clipAudio === "clip"` (không dùng TTS mà lấy tiếng của video AI), chạy bộ lọc `ffmpeg -af silencedetect=noise=-35dB:d=0.35` (`detectSpeechEnd` `L9120-9162`) để xác định thời điểm nhân vật nói xong trong video clip.
   - **Giai đoạn 2 – Thu thập / Sinh Hình ảnh & Video cho từng Cảnh (`stage: "media"`, tiến độ `25% → 65%`):**
     - Tùy theo `scene.mediaMode` (hoặc `project.renderMode`):
       - `"veo"` / `"full_ai"`: Gọi engine tạo video AI đã chọn (`veo` qua Google Flow hoặc Gemini API, `seedance` qua Fal/Comet/PiAPI, `kling` qua Fal, `muse` qua Meta Muse CDP, `grok` qua Grok Imagine CDP).
       - `"image"` / `"semi_ai"`: Gọi Nano Banana 2 tạo ảnh tĩnh theo `mediaPrompt` kèm ảnh tham chiếu.
       - `"stock"`: Tìm và tải video dọc/ngang từ Pexels hoặc Pixabay theo `searchQuery`.
   - **Giai đoạn 3 – Render từng Phân đoạn & Đốt Phụ đề Karaoke ASS (`stage: "segments"`, tiến độ `65% → 88%`):**
     - Hàm `buildAss()` (`L9163-9267`) tạo tệp phụ đề `<sceneId>.ass` ở độ phân giải đích (`1080x1920` cho `9:16`, `1920x1080` cho `16:9`, `1080x1080` cho `1:1`) sử dụng font `Montserrat-Black.ttf`, chia lời thoại thành từng dòng tối đa 26 ký tự (video dọc) hoặc 42 ký tự (video ngang) và gắn thẻ thời gian Karaoke `\kf<centiseconds>` cho từng từ.
     - Nếu nguồn hình là ảnh tĩnh và bật `kenBurns = true`: Áp dụng bộ lọc FFmpeg `zoompan` phóng nhẹ từ `1.0` lên `1.12` ở tốc độ `30fps`.
     - Đốt phụ đề ASS lên hình bằng bộ lọc `subtitles='<assPath>':fontsdir='<fontsDir>'`.
     - Mã hóa từng phân cảnh bằng GPU encoder đã dò được (`h264_nvenc`, `h264_videotoolbox`, `h264_amf`, `h264_qsv`, hoặc CPU `libx264` nếu GPU lỗi qua `retryGpuOnce` `L10198`) và lưu vào `<userDir>/media/segments/<projectId>/<segmentHash>.mp4` (nếu phân cảnh không đổi ở lần render sau sẽ tái sử dụng ngay tệp `.mp4` trong cache!).
   - **Giai đoạn 4 – Ghép nối, Chèn Watermark & Trộn Nhạc nền Audio Ducking (`stage: "concat"`, tiến độ `88% → 100%`):**
     - Ghép toàn bộ phân cảnh bằng `concat demuxer` (nếu `transition === "cut"`) hoặc bộ lọc `xfade=transition=fadeblack:duration=0.4` (nếu `transition === "fade_black"`).
     - Nếu `watermarkEnabled === true` và Pocket có `watermarkPath`, phủ lớp logo tại góc đã chọn (`tl`, `tr`, `bl`, `br`, `center`) với độ mờ `colorchannelmixer=aa=<watermarkOpacity>`.
     - Nếu có nhạc nền `bgmTrack`, lặp nhạc nền bằng `-stream_loop -1`, giảm âm lượng gốc theo `bgmVolume`, và trộn với kênh lời thoại qua bộ lọc nén tự động `sidechaincompress=threshold=0.03:ratio=6:attack=80:release=400` để nhạc nền tự động nhỏ xuống khi có tiếng nói.
     - Xuất tệp cuối cùng ra `<userDir>/media/renders/<projectId>-<jobId>.mp4`, trích xuất ảnh bìa `<projectId>-<jobId>.jpg` tại giây `0.5s`, và cập nhật trạng thái `render_jobs.status = "done"`.

---

#### Luồng 5: Tự động hóa Trình duyệt Chống Phát hiện (`patchright-core`) & Vượt reCAPTCHA Enterprise (`out/main/index.js:L3918-5466`, `L6670-8521`)
1. **Khởi chạy Trình duyệt & Kết nối CDP (`ensureFlowBrowser` / `ensureMuseBrowser` / `ensureGrokBrowser`):**
   - Tìm tệp thực thi Chrome hoặc Edge thật trên máy (`C:\Program Files\Google\Chrome\Application\chrome.exe`, Edge, Brave).
   - Chọn một cổng TCP trống ngẫu nhiên trên `127.0.0.1` (`pickFreePort()`), khởi chạy tiến trình trình duyệt độc lập với `--user-data-dir=<userDir>/<engine>-chrome`, `--remote-debugging-port=<port>`, `--disable-blink-features=AutomationControlled`, `--no-first-run`. Nếu chạy ẩn (`hidden = true`), truyền thêm `--window-position=-32000,-32000` để đẩy cửa sổ ra ngoài vùng hiển thị của màn hình mà vẫn giữ nguyên khả năng render WebGL/Canvas đầy đủ (tránh bị phát hiện Headless Chrome).
   - Kết nối vào trình duyệt qua `patchrightCore.chromium.connectOverCDP("http://127.0.0.1:" + port)`.
2. **Cơ chế Vượt lỗi Điểm Thấp reCAPTCHA Enterprise trên Google Labs Flow (`L3918-4108`):**
   - Khi gửi yêu cầu tạo video Veo 3.1 hoặc ảnh Nano Banana trên `https://labs.google/fx/tools/flow`, nếu API của Google trả về lỗi `PUBLIC_ERROR_HIGH_TRAFFIC` hoặc từ chối token reCAPTCHA:
   - Hệ thống kích hoạt hàm `resetRecaptchaState(page, context)` (`L3976-4065`):
     1. Thực thi script trong trang xóa sạch mọi khóa `localStorage` bắt đầu bằng `_grecaptcha`.
     2. Mở phiên CDP (`context.newCDPSession(page)`), gọi `Network.getCookies` và thực thi `Network.deleteCookies` xóa mọi cookie có tên chứa `GRECAPTCHA` trên các miền `.google.com`, `www.google.com`, `labs.google` (kể cả cookie có `partitionKey`).
     3. Tiêm đoạn mã đánh chặn `Element.prototype.setAttribute` (`__omniraNoncePatched` `L3923-3955`) để bắt giá trị thuộc tính `nonce` hợp lệ của Content-Security-Policy trên trang.
     4. Gỡ bỏ các thẻ `<script>` reCAPTCHA cũ, tạo thẻ `<script>` mới nạp lại `https://www.google.com/recaptcha/enterprise.js?render=6LdsFiUsAAAAAIjVDZcuLhaHiDn5nnHVXVRQGeMV` kèm thuộc tính `nonce` vừa thu được, đợi `grecaptcha.enterprise.ready` và gọi `grecaptcha.enterprise.execute(..., { action: "FLOW_GENERATION" })` để lấy token mới tinh có điểm uy tín cao rồi thử lại yêu cầu tạo video.
3. **Cầu nối Proxy Nội bộ cho Trình duyệt (`ensureBridge` & `socks5Connect` - `L6670-6902`):**
   - Khi người dùng cấu hình Proxy có mật khẩu (`http://user:pass@host:port` hoặc `socks5://user:pass@host:port`) cho Meta Muse AI hoặc tài khoản MXH, Main Process mở một HTTP Proxy Server cục bộ tại `127.0.0.1:<localPort>`.
   - Với giao thức `socks5`: Hàm `socks5Connect()` (`L6717-6795`) thực hiện bắt tay nhị phân đúng chuẩn RFC 1928 (`0x05, 0x02, 0x00, 0x02`), gửi gói xác thực Username/Password theo RFC 1929 (`0x01, ulen, user, plen, pass`), rồi gửi lệnh `CONNECT` (`0x05, 0x01, 0x00, 0x03, hostLen, host, portHi, portLo`) để nối thông luồng TCP (`socket.pipe`) giữa Chrome và máy chủ SOCKS5 từ xa.

---

#### Luồng 6: Xưởng Phim AI 6 Bước, Nối Cảnh Liên Hoàn (`chainShots`) & Lồng tiếng Đa Nhân vật (`out/main/index.js:L14459-15340`, `L17182-18085`, `L20846-21621`)
1. **Viết Kịch bản Phim Dài Đa Phần (`film.generateScript` & `writeLongFilmScript` - `L17363-17508`):**
   - Nếu thời lượng phim `targetSec <= 90`, AI viết toàn bộ kịch bản trong 1 lượt.
   - Nếu `targetSec > 90` (tối đa `900s` = 15 phút), hệ thống chia bộ phim thành $N = \lceil \text{targetSec} / 75 \rceil$ phần (tối đa 12 phần). Đầu tiên AI lập dàn ý tổng thể $N$ phần + danh sách nhân vật + bối cảnh chung; sau đó gọi LLM viết tuần tự từng phần từ $1 \to N$, truyền tóm tắt diễn biến và cảnh cuối của phần trước vào prompt của phần sau để mạch phim liền lạc từ đầu đến cuối.
2. **Hàng đợi Tạo Ảnh/Video Đa luồng & Nối Cảnh Liên Hoàn (`runTake` - `L14987-15340`):**
   - Worker hàng đợi Xưởng Phim chạy song song tối đa `imageConcurrency` (1–4) tác vụ tạo ảnh và `videoConcurrency` (1–4) tác vụ tạo video.
   - Khi dự án bật `chainShots = true` (hoặc cảnh quay có `startSource = "chain"`): Cảnh quay thứ $k$ sẽ chờ cho đến khi cảnh quay thứ $k-1$ có video hoàn tất (`selected_video_take_id`), sau đó dùng FFmpeg (`extractLastFrame` `L14620-14645`: `ffmpeg -sseof -0.15 -i <prevVideo> -frames:v 1 -q:v 2 <framePath>`) trích xuất khung hình cuối cùng của video cảnh $k-1$ làm ảnh khung đầu (`startImage`) cho cảnh $k$.
3. **3 Chế độ Xử lý Giọng nói khi Ghép Phim (`assembleIn` - `L17732-18085`):**
   - `voiceMode === "clip"`: Giữ nguyên âm thanh gốc do mô hình Video AI (Veo 3.1 / Seedance) sinh ra.
   - `voiceMode === "convert"`: Tách âm thanh gốc của video từng cảnh và gửi lên **ElevenLabs Speech-to-Speech API** (`POST /v1/speech-to-speech/<voiceId>`, model `eleven_multilingual_sts_v2`, hàm `convertVoice` `L17509-17558`) để biến đổi âm sắc sang đúng giọng cố định của nhân vật trong cảnh đó mà vẫn giữ nguyên nhịp điệu biểu cảm.
   - `voiceMode === "dub"`: Tắt tiếng thoại gốc của clip, dùng TTS tổng hợp lời thoại tiếng Việt/ngoại ngữ theo giọng riêng của từng nhân vật (`dubLines` `L17559-17630`) và tự động khớp tốc độ/thời lượng vào cảnh quay.

---

#### Luồng 7: Lên lịch Giờ Vàng, Giãn cách Chống Spam (`Stagger`) & Đăng Bài Đa Kênh (`out/main/index.js:L10930-12250`, `L16347-16391`, `L16715-16779`)
1. **Giãn cách bài đăng trùng giờ (`applyStagger` - `L16348-16356`):**
   - Khi lên lịch (`posts.schedule`) hoặc dời lịch (`posts.reschedule`), nếu cài đặt `posts.stagger.enabled === true` (mặc định `minMinutes = 3`, `maxMinutes = 8`) và phát hiện có bài đăng khác trong khoảng `±minMinutes` phút, hệ thống tự động cộng thêm một khoảng thời gian ngẫu nhiên trong đoạn `[minMinutes, maxMinutes]` phút vào `scheduledAt` để tránh việc nhiều Fanpage thuộc cùng một VIA đăng bài cùng một giây bị Facebook/TikTok đánh dấu spam.
2. **Tự động Xếp lịch vào Giờ Vàng (`posts.autoSchedule` - `L16717-16779`):**
   - Với mỗi nội dung trong `contentIds`, tìm kênh hoạt động phù hợp định dạng trong cùng Pocket đang có ít bài chờ đăng nhất trong 7 ngày tới, sau đó quét các khung `goldenHours` của Pocket (hoặc giờ vàng học từ số liệu 90 ngày qua `insights.bestHours`), chọn khung giờ vàng sớm nhất trong tương lai cách các bài đã lên lịch trên cùng kênh tối thiểu `spacingHours` (mặc định `4 giờ`).
3. **Worker Xuất bản Đa Kênh (`startPublisher` & `publishOne` - `L12126-12250`):**
   - Quét bảng `scheduled_posts` mỗi `20,000ms` (`status = 'queued' AND scheduled_at <= now AND (next_attempt_at IS NULL OR next_attempt_at <= now)`), chạy tối đa `MAX_CONCURRENT = 2` bài song song.
   - Sau khi đăng thành công lên Facebook Page/Reels hoặc Instagram, nếu `content.firstComment` có nội dung, hệ thống tự động gọi tiếp `POST /<postId>/comments` để đăng bình luận đầu tiên (chứa link mua hàng/affiliate) và đánh dấu `first_comment_posted = 1`.
   - Nếu gặp lỗi mạng hoặc rate limit tạm thời (`attempts < 3`), tự động xếp lịch thử lại theo dãy thời gian lùi `RETRY_DELAYS_MS = [2 * 60e3, 10 * 60e3, 30 * 60e3]` (`2 phút`, `10 phút`, `30 phút`). Quá 3 lần thất bại sẽ chuyển `status = 'failed'` và tạo cảnh báo `publish_failed` vào bảng `alerts`.

---

#### Luồng 8: Đồng bộ Hộp thư, Tự động Ẩn Bình luận chứa SĐT & Trợ lý CSKH AI (`out/main/index.js:L12712-13880`)
1. **Đồng bộ Tin nhắn & Bình luận (`syncChannelInbox` - `L13450-13720`):**
   - Chu kỳ đồng bộ: `15,000ms` khi cửa sổ ứng dụng đang mở và active (`FAST_SYNC_MS`), `60,000ms` khi cửa sổ thu nhỏ/chạy ngầm (`IDLE_SYNC_MS`).
   - Quét hội thoại Messenger (`/<pageId>/conversations?fields=participants,updated_time,messages.limit(10){message,from,created_time,attachments}`) và bình luận trên 15 bài đăng gần nhất của Fanpage/Instagram/YouTube.
2. **Nhận diện Khách hàng Tiềm năng & Chống Cướp Đơn (`quickEngagement` & `runRulesForIncoming` - `L13326-13449`):**
   - Kiểm tra nội dung tin nhắn/bình luận mới từ khách hàng với biểu thức chính quy số điện thoại Việt Nam:
     `PHONE_RE = /(?:\+?84|0)(?:3[2-9]|5[25689]|7[06-9]|8[1-9]|9\d)\d{7}\b/`
     và từ khóa mua hàng `BUY_INTENT_RE = /\b(giá\s+bao\s+nhiêu|báo\s+giá|ib\s+giá|inbox\s+giá|mua\s+hàng|đặt\s+hàng|còn\s+hàng\s+không|ship\s+cod|gửi\s+hàng)\b/i`.
   - Nếu phát hiện SĐT hoặc ý định mua hàng và bật `tagLeads = true`: Tự động gắn nhãn `"[SĐT]"` hoặc `"[Mua hàng]"` vào `conversations.tags`.
   - Kiểm tra danh sách `auto_reply_rules` đang bật: Nếu từ khóa khớp (hoặc từ khóa là `"[phone]"` khi có SĐT):
     - Nếu `action === "hide_comment"`: Gọi ngay `POST https://graph.facebook.com/v23.0/<commentId>` với `{ is_hidden: true }` để ẩn bình luận chứa SĐT của khách khỏi mắt đối thủ.
     - Nếu `action === "reply_comment"` hoặc `"send_dm"`: Thay thế biến `{name}` và `{phone}` vào `template`, tính thời gian trễ ngẫu nhiên trong đoạn `[minDelaySec, maxDelaySec]` và chèn vào bảng `messages` với `delivery_status = "pending", send_after = Date.now() + delayMs` để Outbox Worker gửi đi sau đó.
3. **AI Trả lời Tự động (`decideReply` - `L12712-12810`):**
   - Nếu không có quy tắc từ khóa nào khớp và chế độ AI (`inbox.aiSettings.mode`) là `"draft"` hoặc `"auto"`, hệ thống nạp `brandVoice` + `knowledge` (bảng giá, chính sách ship/đổi trả của Pocket) + 12 tin nhắn gần nhất trong hội thoại gửi cho LLM.
   - LLM trả về `{ reply, confidence, intent, needsHuman, reason }`.
   - Nếu `mode === "auto"` VÀ `confidence >= minConfidence` (mặc định `0.75`) VÀ `needsHuman === false` VÀ số tin AI đã gửi trong 1 giờ qua `< maxPerHour` (mặc định `60`): Xếp vào hàng đợi gửi tự động (`delivery_status = "pending"`, `send_after = now + random(minDelaySec, maxDelaySec)`).
   - Ngược lại: Lưu vào bảng `messages` với `delivery_status = "draft"` để hiển thị thẻ `DraftCard` màu tím trên `InboxPage` chờ nhân viên bấm *"Duyệt & Gửi"*.

---

### 4.2. Ma trận Tích hợp API Bên ngoài & Giao thức Thời gian thực (External Integration Matrix)

#### A. Bảng Toàn bộ Lời gọi HTTP/REST ra Máy chủ Bên ngoài (`out/main/index.js`)

| STT | Hệ thống Đích | HTTP Method & Endpoint URL | Dòng Code | Payload Request Chính | Response Data Schema Chính | Xử lý Lỗi, Timeout & Retry |
| :-: | :--- | :--- | :---: | :--- | :--- | :--- |
| 1 | **Omnira Cloud (Auth)** | `POST ${CLOUD_URL}/api/client/v1/auth/register`<br>`POST .../auth/register/resend`<br>`POST .../auth/register/verify`<br>`POST .../auth/login`<br>`POST .../auth/password/forgot`<br>`POST .../auth/password/reset`<br>`POST .../me/password`<br>`GET & PUT .../me` | `L15688-15796` | `{ email, password, fullName, phone, referralCode }`, `{ email, code }`, `{ currentPassword, newPassword }` | `{ token, customer: { id, email, fullName, phone } }` hoặc `{ email, expiresInSec, resendAfterSec }` | Timeout `15,000ms`. Khi `login` gặp lỗi mạng (`offline`), tự động chuyển sang xác thực `scrypt` + `RS256` cục bộ. Khóa 5 phút nếu sai mật khẩu 5 lần. |
| 2 | **Omnira Cloud (License & Devices)** | `POST ${CLOUD_URL}/api/client/v1/license/activate`<br>`POST .../license/heartbeat`<br>`POST .../license/deactivate`<br>`DELETE .../devices/:id` | `L3854`, `L3870`, `L3913`, `L15936` | `{ deviceId, deviceName, platform, appVersion }` + Header `Authorization: Bearer <customerToken>` | `{ token: "<RS256_JWT>", managedKeys?: Array<{ provider, apiKey, baseUrl, defaultModel }> }` | Xác minh chữ ký RS256 bằng `LICENSE_PUBLIC_KEY`. Nếu mất mạng, giữ nguyên trạng thái `"offline_grace"` và thử lại mỗi `2 phút`. |
| 3 | **Omnira Cloud (Billing & Referral)** | `GET ${CLOUD_URL}/api/public/plans`<br>`GET .../api/public/promotions`<br>`GET .../api/public/referral/:code`<br>`GET & POST .../api/client/v1/orders`<br>`GET .../api/client/v1/orders/:code`<br>`GET .../api/client/v1/referral` | `L15805`, `L15945-15982` | Tạo đơn: `{ planCode, gateway: "VIETQR"\|"PAYOS", usePoints: boolean }` | Đơn hàng: `{ code, status: "PENDING"\|"PAID"\|"EXPIRED", amount, qrDataUrl, bankName, accountNo, accountName, checkoutUrl, expiresAt }` | Giao diện `OrderPayment` polling `billing.order` mỗi `4,000ms`; ngay khi `o.status === "PAID"`, Main Process tự động gọi `refreshLicense()`. |
| 4 | **Omnira Cloud (App Update, Config & Support)** | `GET ${CLOUD_URL}/api/public/app`<br>`GET ${CLOUD_URL}/api/client/v1/app-config`<br>`GET & POST .../notifications`<br>`GET & POST .../support`<br>`POST .../support/:id/reply`<br>`GET .../support/attachments/:id` | `L2955`, `L15992-16011`, `L22509-22550` | Ticket: `{ type, subject, body, appVersion, attachments: [{ filename, mime, data }] }` | `app`: `{ latestVersion, minVersion, downloadUrl, announcement, flowConfig }`.<br>`support`: `{ id, status, messages, attachments }` | Hỗ trợ tự động bóc tách form xác nhận tải file lớn của Google Drive (`resolveDownloadResponse` `L15848-15869`) và kiểm tra kích thước gói cài đặt tối thiểu `>= 5 MB`. |
| 5 | **Omnira Cloud (Managed AI & OAuth Broker)** | `POST ${CLOUD_URL}/api/client/v1/ai/chat`<br>`GET .../ai/quota`<br>`GET .../oauth/config`<br>`POST .../oauth/:provider/start`<br>`GET .../oauth/sessions/:sessionId`<br>`POST .../oauth/:provider/refresh` | `L6032`, `L6055`, `L11216-11307` | AI Chat: `{ system, prompt, maxTokens, temperature, json }`.<br>OAuth: `{ scopes }` | AI: `{ text, model, inputTokens, outputTokens, quota }`.<br>OAuth: `{ authUrl, sessionId, redirectUri }`, `{ status, accessToken, refreshToken, expiresIn }` | Polling phiên OAuth mỗi `1,500ms` trong tối đa `180 giây` (`L11275`). Tự động làm mới OAuth token trước khi hết hạn. |
| 6 | **OpenAI / DeepSeek / OpenAI-Compatible** | `POST ${baseUrl}/chat/completions`<br>`GET ${baseUrl}/models`<br>`POST ${baseUrl}/audio/speech` | `L5692`, `L5860`, `L9988` | Chat: `{ model, messages, temperature, max_tokens, response_format }`.<br>TTS: `{ model: "gpt-4o-mini-tts", voice, input, response_format: "mp3" }` | `{ choices: [{ message: { content }, finish_reason }], usage: { prompt_tokens, completion_tokens } }` | Timeout `45,000ms` (Chat) / `60,000ms` (TTS). Nếu lỗi `429`/`5xx`, kích hoạt failover sang provider tiếp theo trong `ai_providers`. |
| 7 | **Google Gemini / Imagen / Veo / Lyria / TTS** | `POST https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`<br>`POST .../models/${model}:predictLongRunning`<br>`GET https://generativelanguage.googleapis.com/v1beta/${operationName}` | `L5710`, `L6461`, `L8588`, `L10005`, `L19430` | Header `x-goog-api-key: <key>`. Body: `{ contents: [{ parts }], generationConfig: { responseMimeType, responseModalities: ["AUDIO"\|"IMAGE"] } }` | Text/Image/Audio inline `inlineData.data` (base64 PCM 24kHz chuyển sang MP3 qua FFmpeg, hoặc PNG) hoặc Long-Running Operation tạo video Veo 3.1 | Polling tiến trình tạo video Veo mỗi `5,000ms` trong tối đa `8 phút`. Tự động kế thừa API key của `gemini`. |
| 8 | **Anthropic Claude** | SDK `@anthropic-ai/sdk` → `POST https://api.anthropic.com/v1/messages` | `L5660-5680` | `{ model: "claude-sonnet-4-6", max_tokens, temperature, system, messages }` | `{ content: [{ type: "text", text }], stop_reason, usage: { input_tokens, output_tokens } }` | Bắt lỗi `401`/`429`/`529 Overloaded` và chuyển đổi sang `AiError` để router failover. |
| 9 | **Fal.ai (Nano Banana 2, Seedance, Kling v3, Kolors Try-On)** | `POST https://queue.fal.run/${model}`<br>`GET ${status_url}`<br>`GET ${response_url}`<br>`PUT ${cancel_url}` | `L7724-7854`, `L9940` | Header `Authorization: Key <key>`. Body: `{ prompt, image_url, end_image_url, aspect_ratio, duration }` hoặc `{ human_image_url, garment_image_url }` | `{ request_id, status_url, response_url, cancel_url }` → `{ video: { url } }` hoặc `{ images: [{ url }] }` | Hàng đợi bất đồng bộ: polling `status_url` mỗi `2,500ms`, nếu hủy job giữa chừng sẽ gọi `PUT cancel_url` để hoàn tiền/dừng GPU. |
| 10 | **CometAPI & PiAPI (Seedance 2.0 Gateways)** | Comet: `POST ${base}/v1/videos/generations` & `GET ${base}/v1/videos/generations/${id}`<br>PiAPI: `POST https://api.piapi.ai/api/v1/task` & `GET .../task/${id}` | `L6508`, `L14512-14615` | `{ model, prompt, image, duration, aspect_ratio, resolution }` | `{ id / task_id, status, output: { video_url } }` | Tự động chọn nguồn rẻ nhất có key hợp lệ khi `seedanceSource === "auto"`. |
| 11 | **ElevenLabs (TTS v3, STS v2, Music v2.5)** | `POST https://api.elevenlabs.io/v1/text-to-speech/${voice}/with-timestamps`<br>`POST .../v1/speech-to-speech/${voice}`<br>`POST .../v1/music`<br>`GET .../v1/voices` | `L9952`, `L10103`, `L17522`, `L19454` | Header `xi-api-key: <key>`. TTS: `{ text, model_id: "eleven_v3" }`. STS: ` multipart/form-data { audio, model_id: "eleven_multilingual_sts_v2" }`. Music: `{ prompt, music_length_ms, instrumental }` | TTS trả về `{ audio_base64, alignment }` (hoặc luồng binary MP3 `44.1kHz 128kbps` cho STS & Music). | Lưu cache theo hash SHA-256 tại `media/cache/tts/` và `media/cache/voice-sts/` để không bao giờ tốn tiền gọi lại câu thoại đã tổng hợp. |
| 12 | **Local VieNeu-TTS Python Server** | `GET http://127.0.0.1:${port}/health`<br>`POST http://127.0.0.1:${port}/synthesize` | `L9268-9834` | `{ text, voice_id, ref_audio?: "<path>", ref_text?: "<text>" }` | File âm thanh `.wav` ghi trực tiếp ra đĩa (`output_path`) | Tự động khởi động lại daemon Python nếu tiến trình bị dừng; tự động chuyển đổi sang CPU nếu máy không có GPU NVIDIA CUDA `>= 6.0`. |
| 13 | **Pexels & Pixabay Stock Video API** | Pexels: `GET https://api.pexels.com/videos/search?query=...&orientation=...`<br>Pixabay: `GET https://pixabay.com/api/videos/?key=...&q=...` | `L5929`, `L6436-6495` | Header `Authorization: <pexelsKey>` hoặc query param `key=<pixabayKey>` | Danh sách video kèm mảng `video_files` (chọn file MP4 gần độ phân giải HD nhất) | Tải và lưu cache vào `<userDir>/media/cache/stock/`. |
| 14 | **Meta Graph API v23.0 (Facebook & Instagram)** | `GET & POST https://graph.facebook.com/v23.0/...`<br>`POST https://graph-video.facebook.com/v23.0/${pageId}/videos`<br>`POST https://rupload.facebook.com/ig-api-upload/v23.0/${containerId}` | `L10933-11539`, `L13450-13720` | Đăng bài/Reels, đăng `first_comment`, lấy danh sách Fanpage/IG Business, đồng bộ hội thoại Messenger/Comment, gửi tin nhắn/ảnh, ẩn comment (`is_hidden: true`), lấy Insights 90 ngày. | `{ id, post_id, permalink_url, data: [...] }` | Tự động đổi User Token ngắn hạn sang Long-Lived Token 60 ngày (`fb_exchange_token`); retry đăng bài 3 lần (`2p`, `10p`, `30p`). |
| 15 | **TikTok Open API v2** | `POST https://open.tiktokapis.com/v2/post/publish/video/init/`<br>`PUT <upload_url>`<br>`POST .../post/publish/status/fetch/`<br>`POST .../video/list/` | `L11540-11745` | Header `Authorization: Bearer <token>`. Khởi tạo đăng video theo chunk (`chunk_size`, `total_byte_count`), tải binary MP4 và kiểm tra trạng thái xuất bản. | `{ data: { publish_id, upload_url, publicaly_available_post_id } }` | Tự động refresh token qua `/v2/oauth/token/` (hoặc Cloud OAuth Broker) khi token hết hạn (24 giờ). |
| 16 | **YouTube Data API v3 & Analytics v2** | `POST https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status`<br>`PUT <sessionUrl>` (chunk 8MB)<br>`GET .../youtube/v3/channels`<br>`GET https://youtubeanalytics.googleapis.com/v2/reports` | `L11758-12125` | Tải video Resumable theo từng mảnh `CHUNK = 8 * 1024 * 1024` (8 MB) với `Content-Range: bytes from-to/size`, hỗ trợ cờ ` status.selfDeclaredMadeForKids = false` và `status.containsSyntheticMedia`. | `{ id: "<youtubeVideoId>", snippet, statistics }` | Nếu kết nối mạng bị đứt khi đang tải video lớn, truy vấn `Content-Range: bytes */size` (`L11987`) để lấy byte offset đã nhận và tải tiếp từ vị trí bị đứt. |
| 17 | **Google Trends Vietnam RSS** | `GET https://trends.google.com/trending/rss?geo=VN` | `L20568-20588` | Không có body (GET RSS XML) | XML chứa các thẻ `<item><title>`, `<ht:approx_traffic>`, `<ht:news_item_title>` | Timeout `8,000ms`; nếu mất mạng trả về mảng rỗng `[]` để `plan.generate` vẫn hoạt động bình thường. |

#### B. Giao thức Real-Time (Electron IPC & HTTP Server-Sent Events)
Hệ thống duy trì 5 kênh sự kiện đẩy thời gian thực đồng bộ giữa Electron IPC (`ipcRenderer.on`) và Web SSE (`GET http://127.0.0.1:5173/__omni/events` qua `broadcastHttpEvent` `L22763-22773`):
1. **`window:state-changed`:** Phát `{ isMaximized: boolean, isFocused: boolean }` mỗi khi cửa sổ phóng to, thu nhỏ, focus hoặc blur (`L95-102`).
2. **`system:stats`:** Phát `{ cpu: number, appMemoryMb: number, totalMemoryMb: number, freeMemoryMb: number }` mỗi `2,000ms` (`L128-150`, tự động tạm nghỉ khi cửa sổ ẩn và không có client SSE nào kết nối).
3. **`inbox:changed`:** Phát `{ newMessages: number, channels: string[] }` ngay khi Worker Hộp thư phát hiện tin nhắn hoặc bình luận mới (`L22949-22955`), kích hoạt Renderer làm mới cache `inbox.*` và `dashboard.*`.
4. **`license:changed`:** Phát tín hiệu mỗi khi trạng thái bản quyền thay đổi (kích hoạt gói, hết hạn, thu hồi thiết bị) hoặc khi hạn mức kênh `enforceQuota` vừa cập nhật (`L22936-22943`), kích hoạt Renderer làm mới `auth.state`, `license.*`, `channels.*`, `accounts.*`.
5. **`app:navigate`:** Phát chuỗi đường dẫn đích (`"/inbox"` hoặc `"/"`) khi người dùng bấm vào thông báo đẩy của hệ điều hành (`L22964`, `L22977`), kích hoạt `HashRouter` chuyển trang tức thì.

---

## PHẦN 5: BẢNG TRUY VẾT TÍNH NĂNG (FEATURE TRACEABILITY MATRIX)

Tất cả các tệp tin trong bảng dưới đây nằm trong thư mục [`my app/`](file:///c:/Users/nminh/Desktop/aaaaaaaaaaaaaaaaaaaaaaa/my%20app):
- **UI (Renderer):** [`out/renderer/assets/index-01dFNdzs.js`](file:///c:/Users/nminh/Desktop/aaaaaaaaaaaaaaaaaaaaaaa/my%20app/out/renderer/assets/index-01dFNdzs.js) (kết hợp [`out/renderer/assets/index-D9-rggfQ.css`](file:///c:/Users/nminh/Desktop/aaaaaaaaaaaaaaaaaaaaaaa/my%20app/out/renderer/assets/index-D9-rggfQ.css))
- **Logic / Service (Main):** [`out/main/index.js`](file:///c:/Users/nminh/Desktop/aaaaaaaaaaaaaaaaaaaaaaa/my%20app/out/main/index.js)
- **Bridge:** [`out/preload/index.js`](file:///c:/Users/nminh/Desktop/aaaaaaaaaaaaaaaaaaaaaaa/my%20app/out/preload/index.js) & [`out/renderer/omni-http-bridge.js`](file:///c:/Users/nminh/Desktop/aaaaaaaaaaaaaaaaaaaaaaa/my%20app/out/renderer/omni-http-bridge.js)

| ID | Tên chức năng | File Giao diện (UI) | File Logic / Service (Main) | File State / Store & Bảng DB | Luồng kích hoạt & Xử lý chính | Trạng thái |
| :-: | :--- | :--- | :--- | :--- | :--- | :-: |
| **FT-01** | **Đăng ký Tài khoản, Kiểm tra Mã Giới thiệu & Xác thực OTP Email** | `LoginPage` (`L55749-55950`), `VerifyEmailStep` (`L56081-56188`) | `authHandlers` (`L15685-15718`, `L15803-15812`) | Query `["auth.state"]`; File `auth/users.json`, `auth/cloud-<uid>.bin` | Nhập form đăng ký → debounce 400ms gọi `auth.checkReferral` kiểm tra mã AM/Customer → Submit gọi `auth.register` → Nhập 6 số OTP tự động gọi `auth.registerVerify` → Khởi tạo `users/<uid>` & két sắt `master.bin` + `master.portable`. | **Hoàn thiện** |
| **FT-02** | **Đăng nhập Online/Offline, Chống Brute-Force & Quên Mật khẩu** | `LoginPage` (`L55749-55950`), `ForgotPasswordStep` (`L55951-56080`) | `authHandlers` (`L15719-15771`), `lockRemainingSec` (`L2626-2640`) | Query `["auth.state"]`; File `auth/session.bin`, `auth/users.json` | Submit `auth.login` → Kiểm tra khóa 5 phút nếu sai 5 lần → Gọi Cloud `/auth/login` (nếu mất mạng thì đối chiếu `scrypt` hash cục bộ + chữ ký RS256 của `licenseToken`) → Mở khóa `master.portable` → Lưu phiên 30 ngày vào `session.bin`. | **Hoàn thiện** |
| **FT-03** | **Xác thực Bản quyền Chữ ký số RS256, Quản lý Thiết bị & Heartbeat** | `AuthGate` (`L56433-56473`), `LicenseGate` (`L56341-56432`), `DevicesList` (`L56215-56256`) | `verifyLicenseToken` (`L3694-3734`), `startLicenseHeartbeat` (`L3896-3917`), `cloudHandlers` (`L15922-15942`) | Query `["license.state"]`, `["license.devices"]`; File `auth/device.json`, `auth/cloud-<uid>.bin` | Kiểm tra chữ ký RSA-SHA256 của JWT với `LICENSE_PUBLIC_KEY_PEM` và khớp `claims.did === deviceId()` → Định kỳ 6h gửi heartbeat nhận JWT mới + `managedKeys` → Nếu quá số máy (`device_limit`), cho phép gỡ máy cũ (`license.removeDevice`) rồi kích hoạt lại. | **Hoàn thiện** |
| **FT-04** | **Kiểm soát Hạn mức Kênh (`enforceQuota`) & Chọn Kênh Hoạt động** | `QuotaBar` (`L29780-29807`), `QuotaPicker` (`L29684-29779`) | `enforceQuota` (`L15370-15426`), `setQuotaSelection` (`L15427-15464`) | Query `["channels.quota"]`; Bảng `channels` (`status`, `quota_blocked`) | Tự động kích hoạt sau mọi lệnh thêm/kết nối kênh (`QUOTA_ENDPOINTS`) hoặc khi đổi gói → Tạm dừng các kênh vượt quá `claims.maxChannels` (`quota_blocked = 1`) → Người dùng mở `QuotaPicker` tích chọn kênh muốn dùng (`channels.setQuota`). | **Hoàn thiện** |
| **FT-05** | **Tự động Kiểm tra, Tải ngầm & Cài đặt Bản cập nhật Ứng dụng** | `UpdateRequired` (`L56302-56340`), `CloudBanner` (`L29092-29184`) | `resolveDownloadResponse` (`L15848-15869`), `startUpdateDownload` (`L15870-15920`), `cloud.installUpdate` (`L16040-16050`) | Query `["cloud.appInfo"]`, `["cloud.updateStatus"]`; Biến `updateStatusState` | Gọi `cloud.appInfo` so sánh `compareVersion` → Bấm tải gọi `cloud.downloadUpdate` (hỗ trợ vượt trang xác nhận virus scan của Google Drive) → Tải luồng về `os.tmpdir()` → Gọi `cloud.installUpdate` chạy bộ cài `.exe`/`.dmg` và thoát app. | **Hoàn thiện** |
| **FT-06** | **Bảng Điều khiển Tổng quan (Dashboard), Biểu đồ Reach & Cảnh báo** | `DashboardPage` (`L37240-37381`), `ReachCard` (`L37138-37200`), `AlertsCard` (`L36794-36836`) | `dashboardHandlers` (`L16392-16547`) | Query `["dashboard.summary"]`, `["dashboard.topChannels"]`, `["alerts.open"]`; Bảng `channel_metrics_daily`, `alerts` | Truy vấn tổng hợp lượt xem/tiếp cận/tương tác 30 ngày so với 30 ngày liền trước → Vẽ biểu đồ SVG 4 nền tảng → Hiển thị danh sách cảnh báo mở và cho phép đánh dấu đã xử lý (`alerts.resolve`). | **Hoàn thiện** |
| **FT-07** | **Giám sát 5 Tiến trình Ngầm & Nhật ký Hoạt động Hệ thống** | `DaemonPanel` (`L36851-36914`) | `dashboard.daemon` (`L16535`), `activity.recent` (`L16541`) | Query `["dashboard.daemon"]`, `["activity.recent"]`; Bảng `activity_log` | Hiển thị trạng thái thực thi của 5 worker (`Publisher`, `InboxSync`, `InsightsSync`, `EarlyCheck`, `RenderWorker`) và luồng sự kiện trong `activity_log`. | **Hoàn thiện** |
| **FT-08** | **Quản lý Không gian làm việc Cô lập (Pockets / Workspaces)** | `WorkspacesPage` (`L49708-49820`), `PocketCard` (`L49238-49354`), `RulesPanel` (`L49380-49569`) | `workspaceHandlers` (`L17053-17181`) | `useUiStore.activeWorkspaceId`; Query `["workspaces.list"]`; Bảng `workspaces`, `browser_profiles` | Tạo/sửa/lưu trữ/khôi phục Pocket → Cấu hình `brandVoice`, `knowledge` (8,000 ký tự), ảnh `watermarkPath`, `goldenHours`, `aiBudgetUsd`, bật/tắt `canvas_noise` và xuất cấu hình JSON (`workspaces.export`). | **Hoàn thiện** |
| **FT-09** | **Quản lý Tài khoản VIA, Sơ đồ Cây Fanpage & Xác minh Token** | `AccountsPage` (`L30801-31158`), `FacebookTree` (`L30686-30800`), `AccountInspector` (`L30251-30438`) | `accountHandlers` (`L16168-16294`), `publishingHandlers` (`L20472-20548`) | Query `["accounts.tree"]`, `["channels.list"]`; Bảng `accounts`, `channels`, `secrets` | Thêm tài khoản VIA/kênh → Dán User Token gọi `accounts.importFacebook` tự động đổi Long-Lived Token 60 ngày và nhập toàn bộ Fanpage + Instagram Business liên kết vào két sắt `secrets` (AES-256-GCM) → Kiểm tra sức khỏe qua `channels.verify`. | **Hoàn thiện** |
| **FT-10** | **Kết nối OAuth 1-Click Đa Nền tảng (Facebook, Instagram, TikTok, YouTube)** | `ConnectFacebookButton` (`L30078`), `ConnectTiktokButton` (`L30148`), `ConnectYoutubeButton` (`L30190`) | `oauthBroker` (`L11210-11315`), `connectFacebook` (`L20444`), `connectTiktok` (`L20362`), `connectYoutube` (`L20275`) | Query `["integrations.*"]`; Bảng `accounts`, `channels`, `secrets` | Hỗ trợ 2 chế độ: Dùng OAuth Broker trên Omnira Cloud hoặc dùng Client ID/Secret riêng của người dùng (mở loopback server `127.0.0.1` + PKCE S256) → Lưu `access_token` và `refresh_token` vào bảng `secrets`. | **Hoàn thiện** |
| **FT-11** | **Quản lý Proxy & Cầu nối Tunnel HTTP/SOCKS5 Cục bộ** | `AccountsPage` (`L30801`), `MuseFlowCard` (`L40389`) | `proxies.*` (`L16240-16294`), `ensureBridge` & `socks5Connect` (`L6670-6902`) | Query `["proxies.list"]`; Bảng `proxies`, `secrets` | Lưu thông tin Proxy (`socks5`/`http`/`https`) và mật khẩu mã hóa → Khởi tạo proxy server cục bộ tại `127.0.0.1:<freePort>` thực hiện bắt tay nhị phân RFC 1928/1929 SOCKS5 hoặc HTTP Basic Auth cho trình duyệt và trình kiểm tra IP. | **Hoàn thiện** |
| **FT-12** | **Lập Kế hoạch Nội dung 14 Ngày bằng AI & Bắt Trend Google VN** | `PlanPage` (`L51133-51510`) | `planHandlers` (`L20568-20685`) | `localStorage["omni-plan-custom-formats"]`; Query `["plan.list"]`; Bảng `content_ideas` | Bấm *"AI lập kế hoạch"* (`plan.generate`) → Tải RSS Google Trends VN (`?geo=VN`) + top bài hiệu quả của kênh → Gọi LLM sinh danh sách ý tưởng theo ngày → Chuyển đổi 1-click sang Video Studio (`plan.toVideo`), Image Studio (`plan.toImage`), hoặc Bài đăng (`plan.toPost`). | **Hoàn thiện** |
| **FT-13** | **Kho Nội dung Đa phương tiện & Xoay vòng Biến thể Caption (`AI Spin`)** | `ContentPage` (`L36413-36760`), `ContentEditor` (`L35187-35315`), `VariantsPanel` (`L34945-35001`) | `contentHandlers` (`L16295-16346`), `content.spin` & `content.hashtags` (`L19297-19362`) | Query `["content.list"]`, `["content.stats"]`, `["content.variants"]`; Bảng `content_items`, `content_variants` | Tạo/nhập bài viết kèm ảnh/video (`system.pickMedia`), di chuyển/xóa hàng loạt → Gọi `content.spin` sinh 1–10 biến thể caption & bộ hashtag phân tầng tránh trùng lặp nội dung khi đăng lên nhiều kênh. | **Hoàn thiện** |
| **FT-14** | **Chấm điểm Hook Score (40/60) & Quét Vi phạm Chính sách Quảng cáo** | `HookPanel` (`L35067-35174`), `ContentCard` (`L36232-36363`) | `scoreHook` (`L18784-19086`), `content.hookScore` (`L19286-19296`) | Bảng `content_items` (`hook_score` JSON) | Gọi `content.hookScore` → Chạy `codeChecks` (độ dài câu mở đầu, phạt lời chào, quét 21 cụm văn mẫu AI, mật độ hashtag) + quét 8 nhóm Regex vi phạm chính sách + chấm 7 tiêu chí bởi AI Content Director → Sinh 3 câu Hook thay thế. | **Hoàn thiện** |
| **FT-15** | **Phát triển Series Dài tập & Tạo Bảng Thiết kế Nhân vật (`Turnaround Sheet`)** | `SeriesPage` (`L50533-51074`), `CharacterDialog` (`L50344-50497`), `useCharacterBatch` (`L49821-49868`) | `seriesHandlers` (`L18086-18783`) | Query `["series.list"]`, `["series.get"]`; Bảng `series`, `series_characters`, `series_episodes` | Gọi `series.develop` sinh dàn nhân vật + đề cương 1–30 tập (chia theo đợt 10 tập giữ mạch truyện) → Gọi `series.characterImage` vẽ bảng tham chiếu nhân vật đa góc độ trên nền xám → Chuyển tập sang Video Studio (`series.writeEpisode`) hoặc Film Studio (`series.makeFilm`). | **Hoàn thiện** |
| **FT-16** | **Xưởng Video AI Ngắn & Dài Đa Hồi (`Multi-Act Video Studio`)** | `StudioPage` (`L48459-49226`), `ConfigPanel` (`L45717-45963`), `Storyboard` (`L46945-47019`), `ActBoard` (`L48054-48262`) | `studioHandlers` (`L16854-17052`), `generateScript` & `writeAct` (`L19153-19285`) | Query `["studio.projects"]`, `["studio.get"]`; Bảng `video_projects`, `video_scenes` | Trích xuất `VisualBible` từ ảnh tham chiếu (`studio.bibleFromRefs`) → Sinh kịch bản phân cảnh ngắn (`15-90s`) hoặc chia Hồi (`90-900s`, viết từng hồi qua `studio.writeAct`) → Tự động lưu phân cảnh sau 700ms debounce (`studio.saveScenes`). | **Hoàn thiện** |
| **FT-17** | **Phối đồ Thời trang Ảo Đa Lớp (`AI Virtual Try-On`)** | `FashionSetupEditor` (`L45419-45519`), `TryOnPanel` (`L45370-45414`) | `tryOnScene` (`L9930-10140`), `studio.tryOn` (`L19696-19708`) | Bảng `video_projects` (`fashion`), `video_scenes` (`outfit`, `start_image`) | Chọn ảnh người mẫu + tối đa 8 món đồ (`top`, `bottom`, `dress`, `outerwear`, `shoes`, `bag`, `accessory`) → Mặc thử tuần tự theo lớp qua `Kolors Virtual Try-On` hoặc 1-pass qua `Nano Banana 2` → Gán ảnh kết quả làm `startImage` cho phân cảnh video. | **Hoàn thiện** |
| **FT-18** | **Engine Render Video FFmpeg, Phụ đề Karaoke ASS & Audio Ducking** | `PreviewPanel` (`L47136-47599`), `RenderConfirmDialog` (`L47676-47773`), `RenderHistory` (`L47607-47646`) | `renderProjectIn` (`L10279-10827`), `buildAss` (`L9163-9267`) | Query `["render.jobs"]`, `["render.estimate"]`; Bảng `render_jobs` | Ước tính chi phí `render.estimate` → Bấm Render (`F9` / `render.start`) → Tổng hợp TTS → Tạo/tải hình & video AI/Stock → Tạo phụ đề `.ass` hiệu ứng Karaoke `\kf` với font `Montserrat-Black.ttf` → Mã hóa GPU (`nvenc`/`qsv`/`amf`/`videotoolbox`) → Ghép cảnh + đóng watermark + nén nhạc nền `sidechaincompress`. | **Hoàn thiện** |
| **FT-19** | **Tạo Nhạc nền AI (`Google Lyria` & `ElevenLabs Music`)** | `MusicDialog` (`L47020-47090`) | `media.generateMusic` (`L19420-19485`, `L19688`) | Query `["media.bgmList"]`; Thư mục `<userDir>/media/bgm/` | Nhập mô tả giai điệu, thời lượng (`10-180s`), chọn nhạc không lời (`instrumental`) → Gọi `google_lyria` (`lyria-3-clip-preview`) hoặc `elevenlabs_music` (`music_v2_5`) → Lưu file `.mp3` vào kho nhạc nền BGM. | **Hoàn thiện** |
| **FT-20** | **Xưởng Ảnh Quảng cáo AI & Đóng chữ Tiếng Việt Không Tốn Phí (`retext`)** | `ImageStudioPage` (`L55213-55277`), `ProjectEditor` (`L54695-54972`), `IdeaCard` (`L55049-55176`) | `imageStudioHandlers` (`L21805-22217`), `overlayText` (`L21808-21895`) | Query `["imagestudio.list"]`, `["imagestudio.get"]`; Bảng `image_projects`, `image_results` | Phân tích sản phẩm + ảnh mẫu sinh 1–6 ý tưởng quảng cáo (`imagestudio.generateIdeas`) → Tạo ảnh bằng Nano Banana/Flow có chừa vùng trống chữ, lưu `.raw.png` → Đóng tiêu đề `headline` + `subhead` bằng FFmpeg ASS (`imagestudio.retext` sửa chữ tức thì từ ảnh `.raw.png`). | **Hoàn thiện** |
| **FT-21** | **Phòng Thu Đọc Văn bản Dài Đa Nhân vật (`Multi-Speaker TTS Studio`)** | `TtsPage` (`L55364-55549`), `CastRow` (`L55550-55605`), `JobItem` (`L55640-55731`) | `splitTtsText` (`L319-324`), `ttsStudioHandlers` (`L22218-22454`) | `localStorage["tts.draft"]`, `localStorage["tts.castMemory"]`; Query `["tts.list"]`; Bảng `tts_jobs` | Nhập văn bản tới `300,000 ký tự` → Tách nhân vật theo regex `SPEAKER_RE` (`[Tên]: thoại`) → Chia nhỏ đoạn theo giới hạn từng engine (`TTS_CHUNK_CHARS`) → Chạy nền lưu từng file `parts/00000.wav` (cho phép `cancel` và `resume` từ đoạn dở) → Ghép `audio.mp3` và sinh phụ đề `audio.srt`. | **Hoàn thiện** |
| **FT-22** | **Cài đặt Tự động VieNeu-TTS Python Cục bộ & Nhân bản Giọng nói (`Voice Cloning`)** | `LocalTtsCard` (`L39710-39931`), `VoiceLibrary` (`L39517-39616`), `Recorder` (`L39617-39709`) | `localTtsHandlers` (`L9268-9834`) | Query `["localtts.status"]`, `["localtts.clones"]`; Thư mục `<userData>/local-tts/`, `<userDir>/media/voice-clones/` | Tự động tải `uv 0.6.14` + CPython 3.11 + dò GPU qua `nvidia-smi` cài PyTorch CUDA 12.8 (hoặc CPU) + `vieneu==3.8.3` → Chạy server HTTP Python nội bộ với model `VieNeu-TTS-0.3B-q4-gguf` → Thu âm trực tiếp từ Micro 4–20s (`localtts.addRecorded`) hoặc tải file mẫu để nhân bản giọng nói tiếng Việt. | **Hoàn thiện** |
| **FT-23** | **Xưởng Phim AI Điện ảnh 6 Bước (`AI Film Studio`)** | `FilmPage` & `FilmWorkspace` (`L51957-54610`), `ScriptStep` (`L53591`), `AssetBoard` (`L52730`), `AssembleStep` (`L53879`) | `filmQueue` (`L14459-15340`), `filmEngine` (`L17182-18085`), `filmHandlers` (`L20846-21621`) | `localStorage["film.assemble.<id>"]`; Query `["film.get"]`, `["film.queue"]`; Bảng `film_projects`, `film_assets`, `film_takes` | Viết kịch bản phim dài tới 12 phần (`writeLongFilmScript`) → Tạo ảnh Nhân vật & Bối cảnh → Tạo ảnh Khung đầu phân cảnh → Quay Video đa luồng (Veo 3.1, Seedance 2.0, Kling 3.0, Muse, Grok) kèm nối cảnh `chainShots` → Đổi giọng STS / Lồng tiếng Dub / Thuyết minh AI → Ghép thành phim MP4 hoàn chỉnh. | **Hoàn thiện** |
| **FT-24** | **Nâng cấp Độ phân giải Video 1080p / 4K (`Video Upscaler`)** | `UpscaleDialog` (`L46560-46664`), `AssetDrawer` (`L53249-53505`) | `upscaleVideo` (`L8900-9119`), `media.upscale` (`L19748`), `film.upscale` (`L21397`) | Query `["media.upscaleInfo"]`, `["media.upscaleProgress"]`; Bảng `film_takes` (`upscale`) | Hỗ trợ 2 phương pháp: (1) Gửi lên **Google Labs Flow** nâng cấp đám mây nếu clip gốc tạo từ Flow (có file sidecar `.flow.json`); (2) Nâng cấp cục bộ trên máy bằng bộ lọc nội suy sắc nét FFmpeg `lanczos + cas (Contrast Adaptive Sharpening)`. | **Hoàn thiện** |
| **FT-25** | **Tự động hóa Google Labs Flow (Veo 3.1 & Nano Banana 2) + Vượt reCAPTCHA** | `FlowCard` (`L40183-40388`), `FlowCredits` (`L28755-28788`) | `flowEngine` & `resetRecaptchaState` (`L3918-5466`), `flowHandlers` (`L21633-21695`) | Query `["flow.status"]`; Thư mục `<userDir>/flow-chrome/`, `flow-diagnostics/` | Mở Chrome profile riêng qua CDP tại `labs.google/fx/tools/flow` → Tự động điều khiển giao diện tạo video Veo 3.1 (Text-to-Video, Start/End Frame, Ingredients) & ảnh Nano Banana → Tự động xóa cookie/storage và nạp lại CSP Nonce để vượt lỗi reCAPTCHA Enterprise. | **Hoàn thiện** |
| **FT-26** | **Tự động hóa Meta Muse AI Web & Làm mềm Prompt Tự động** | `MuseFlowCard` (`L40389-40769`) | `museEngine` & `softenScene` (`L6903-7723`), `museFlow.*` (`L21697-21753`) | Query `["museFlow.status"]`; Thư mục `<userDir>/muse-chrome/`, `muse-diagnostics/` | Điều khiển Chrome qua CDP (hỗ trợ gắn Proxy riêng) tại `muse.ai` → Khi prompt bị từ chối kiểm duyệt, tự động gọi `softenScene` dùng LLM viết lại thành hình ảnh ẩn dụ an toàn và thử lại tối đa 3 lần. | **Hoàn thiện** |
| **FT-27** | **Tự động hóa Grok Imagine Web (Tạo Video từ Ảnh/Văn bản)** | `GrokFlowCard` (`L40770-41064`) | `grokEngine` (`L7855-8521`), `grokFlow.*` (`L21755-21803`) | Query `["grokFlow.status"]`; Thư mục `<userDir>/grok-chrome/`, `grok-diagnostics/` | Điều khiển Chrome qua CDP tại `grok.com/imagine` hỗ trợ cả tài khoản Free (480p, 6s) và SuperGrok (720p, 10s), tự động tải ảnh khung đầu, nhập prompt và trích xuất luồng MP4. | **Hoàn thiện** |
| **FT-28** | **Lịch Đăng Bài Kéo Thả, Giờ Vàng Tự động & Giãn cách Chống Spam** | `CalendarPage` (`L35853-36181`), `ScheduleDialog` (`L35574-35781`), `StaggerControl` (`L35782-35827`) | `schedulerHandlers` (`L16347-16391`, `L16715-16779`), `startPublisher` (`L12126-12250`) | Query `["posts.range"]`, `["posts.stagger"]`, `["posts.worker"]`; Bảng `scheduled_posts` | Kéo thả bài vào lịch hoặc gọi `posts.autoSchedule` xếp tự động vào khung Giờ vàng → Tự động cộng độ trễ ngẫu nhiên `stagger` tránh đăng trùng giờ → Worker chạy mỗi 20s đẩy bài lên FB/IG/TikTok/YT và tự đăng `firstComment`. | **Hoàn thiện** |
| **FT-29** | **Hộp thư Hợp nhất Đa Kênh, Ẩn Bình luận SĐT & Quy tắc Từ khóa** | `InboxPage` (`L37967-38100`), `ConversationList` (`L37414`), `Thread` (`L38199`), `RuleDialog` (`L37566`) | `startInbox` (`L13181-13880`), `inboxHandlers` (`L16548-16714`) | Query `["inbox.conversations"]`, `["inbox.messages"]`, `["inbox.rules"]`; Bảng `conversations`, `messages`, `auto_reply_rules` | Đồng bộ tin nhắn & bình luận mỗi 15s/60s → Phát hiện SĐT qua `PHONE_RE` tự động gắn nhãn `[SĐT]` → Khớp quy tắc từ khóa tự động ẩn bình luận (`hide_comment`), trả lời bình luận hoặc nhắn riêng DM kèm độ trễ ngẫu nhiên. | **Hoàn thiện** |
| **FT-30** | **Trợ lý CSKH AI Tự động (`Auto / Draft`) & AI Co-Pilot Gợi ý** | `AiReplyCard` (`L37699`), `DraftCard` (`L38100`) | `decideReply` (`L12712-12810`), `inbox.suggestReply` (`L19363-19382`) | Query `["inbox.aiSettings"]`; Bảng `messages` (`delivery_status`, `ai_meta`) | Đọc `brandVoice` + `knowledge` của Pocket để sinh câu trả lời kèm độ tự tin `confidence` → Nếu `mode === "auto"` và `confidence >= minConfidence` thì tự xếp lịch gửi; nếu thấp hơn hoặc ở chế độ `"draft"` thì hiện thẻ chờ nhân viên duyệt (`inbox.approveDraft`). | **Hoàn thiện** |
| **FT-31** | **Phân tích Hiệu suất Đa Chiều, Mục tiêu Kênh & Cảnh báo Bóp Tương tác** | `AnalyticsPage` (`L51651-51758`), `GroupTable` (`L51520`), `GoalDialog` (`L51595`) | `analyticsHandlers` (`L20749-20845`), `startInsights` (`L14240-14355`), `startEarlyCheck` (`L14356-14458`) | Query `["analytics.overview"]`, `["analytics.goals"]`; Bảng `channel_metrics_daily`, `channel_goals`, `scheduled_posts` | Đồng bộ số liệu thực tế từ 4 nền tảng → Phân tích lượt xem trung bình theo *Định dạng kịch bản* và *Thời lượng video* để đưa ra khuyến nghị → Theo dõi mục tiêu kênh → Quét bài mới đăng sau 2–6h để cảnh báo nếu lượt xem `< 25%` mức trung vị. | **Hoàn thiện** |
| **FT-32** | **Quản trị AI Router 20 Providers, Bảng giá Token & Cầu dao Ngân sách** | `SettingsPage` → `AiTab` (`L41231-41362`), `ProviderRow` (`L39293`), `BudgetCard` (`L38882`), `RoutingCard` (`L39198`) | `aiHandlers` (`L16780-16853`, `L19151-19222`), `assertBudget` (`L6180-6235`) | Query `["ai.providers"]`, `["ai.routing"]`, `["settings.budget"]`; Bảng `ai_providers`, `ai_usage`, `secrets`, `settings` | Nhập/xóa API key vào két sắt AES-256-GCM, kiểm tra kết nối & đo độ trễ (`ai.test`), kéo thả thứ tự ưu tiên failover (`ai.reorder`), chỉnh bảng giá token (`ai.setPrice`), và đặt trần chi tiêu tháng kèm Circuit Breaker. | **Hoàn thiện** |
| **FT-33** | **Di chuyển Thư mục Dữ liệu Liên Ổ đĩa & Chế độ Chạy ngầm System Tray** | `DataLocationCard` (`L38979`), `BackgroundCard` (`L39097`) | `dataLocationHandlers` (`L16071-16131`), `setupTray` & `hideOnClose` (`L22563-22655`) | Query `["storage.location"]`, `["system.background"]`; File `data-location.json`, `background.json` | Sao chép toàn bộ cơ sở dữ liệu, két sắt và kho media sang ổ cứng khác (`storage.move`), cập nhật con trỏ `data-location.json` và tự khởi động lại ứng dụng → Cấu hình đóng cửa sổ ẩn xuống System Tray và khởi động cùng Windows (`--hidden`). | **Hoàn thiện** |
| **FT-34** | **Thanh toán Gói cước tự động qua VietQR / PayOS & Chương trình Giới thiệu** | `BillingPage` (`L56625-56710`), `BuyPlanDialog` (`L29531-29683`), `OrderPayment` (`L29465-29530`), `ReferralCard` (`L56477-56562`) | `cloudHandlers` (`L15943-15986`) | Query `["billing.plans"]`, `["billing.orders"]`, `["billing.referral"]`, `["billing.promotions"]` | Chọn gói cước, tự động tính giảm giá khuyến mãi + giảm giá khách được giới thiệu + trừ điểm thưởng (`usePoints`) → Sinh mã QR ngân hàng VietQR → Polling đơn hàng mỗi 4s, tự động kích hoạt bản quyền ngay khi nhận thanh toán (`status === "PAID"`). | **Hoàn thiện** |
| **FT-35** | **Hệ thống Ticket Hỗ trợ Kỹ thuật Đính kèm Ảnh & Nhật ký Chẩn đoán** | `SupportPage` (`L56947-56997`), `CreateForm` (`L56845`), `TicketDetail` (`L56900`) | `supportHandlers` (`L22490-22562`), `diagnosticLogTail` (`L214-240`) | Query `["support.list"]`, `["support.get"]`, `["support.attachment"]` | Tạo ticket báo lỗi/góp ý, tự động nén tối đa 5 ảnh chụp màn hình (`compress`) và tự động trích xuất 60 dòng log gần nhất kèm thông số OS/RAM/Version (`diagnosticLogTail`) gửi lên đội ngũ kỹ thuật Omnira; nhắn tin trao đổi 2 chiều trong ticket. | **Hoàn thiện** |
| **FT-36** | **Cẩm nang Hướng dẫn Kết nối Đa Kênh Trực quan (`Interactive Guide`)** | `GuidePage` (`L51759-51956`) | Đọc dữ liệu từ `accounts.tree` và gọi các handler kết nối `accounts.connect*` | Query `["accounts.tree"]` | Hiển thị hướng dẫn từng bước cho 4 nền tảng (`Facebook`, `Instagram`, `TikTok`, `YouTube`), bảng so sánh ưu/nhược điểm của từng phương pháp kết nối, số lượng kênh đã kết nối thực tế và nút bấm kết nối ngay tại chỗ. | **Hoàn thiện** |

---

### 4.3. Danh mục Toàn bộ 268 RPC Endpoints Nội bộ (`contract` & `handlers` trong `out/main/index.js:L547-1421`, `L22665-22718`)

Bảng dưới đây liệt kê đầy đủ 100% các RPC endpoint (`api:<endpoint>`), cấp độ bảo vệ (Guard Tier: `PUBLIC`, `UNLICENSED`, `LICENSED`, hoặc `FEATURE:<CODE>`), lược đồ đầu vào `zod`, và vị trí hàm xử lý:

| Nhóm (Namespace) | Danh sách Đầy đủ Các Endpoints, Schema Đầu vào & Dòng Code Handler |
| :--- | :--- |
| **1. `auth.*` (11 endpoints)** | - `auth.state` (`PUBLIC`, input: `none`, `L15672`)<br>- `auth.register` (`PUBLIC`, input: `{ email, displayName, password, phone?, referralCode?, remember=true, adoptLegacy=false }`, `L15685`)<br>- `auth.registerVerify` (`PUBLIC`, input: `{ email, code: /^\d{6}$/ }`, `L15705`)<br>- `auth.registerResend` (`PUBLIC`, input: `{ email }`, `L15698`)<br>- `auth.forgotPassword` (`PUBLIC`, input: `{ email }`, `L15719`)<br>- `auth.resetPassword` (`PUBLIC`, input: `{ email, code: /^\d{6}$/, newPassword, remember=true }`, `L15726`)<br>- `auth.login` (`PUBLIC`, input: `{ email, password, remember=true }`, `L15736`)<br>- `auth.logout` (`UNLICENSED`, input: `none`, `L15763`)<br>- `auth.changePassword` (`UNLICENSED`, input: `{ currentPassword, newPassword }`, `L15772`)<br>- `auth.updateProfile` (`UNLICENSED`, input: `{ displayName }`, `L15790`)<br>- `auth.checkReferral` (`PUBLIC`, input: `{ code }`, `L15803`) |
| **2. `storage.*` (4 endpoints)** | - `storage.location` (`PUBLIC`, input: `none`, `L16072`)<br>- `storage.openRoot` (`PUBLIC`, input: `none`, `L16088`)<br>- `storage.move` (`LICENSED`, input: `none`, `L16093`)<br>- `storage.useExisting` (`PUBLIC`, input: `none`, `L16119`) |
| **3. `license.*` (5 endpoints)** | - `license.state` (`UNLICENSED`, input: `none`, `L15922`)<br>- `license.refresh` (`UNLICENSED`, input: `none`, `L15925`)<br>- `license.activate` (`UNLICENSED`, input: `none`, `L15926`)<br>- `license.devices` (`UNLICENSED`, input: `none`, `L15927`)<br>- `license.removeDevice` (`UNLICENSED`, input: `{ id }`, `L15934`) |
| **4. `billing.*` (6 endpoints)** | - `billing.plans` (`UNLICENSED`, input: `none`, `L15943`)<br>- `billing.createOrder` (`UNLICENSED`, input: `{ planCode, gateway?: "VIETQR"\|"PAYOS", usePoints?: boolean }`, `L15950`)<br>- `billing.order` (`UNLICENSED`, input: `{ code }`, `L15957`)<br>- `billing.orders` (`UNLICENSED`, input: `none`, `L15966`)<br>- `billing.promotions` (`UNLICENSED`, input: `none`, `L15973`)<br>- `billing.referral` (`UNLICENSED`, input: `none`, `L15980`) |
| **5. `cloud.*` (6 endpoints)** | - `cloud.appInfo` (`PUBLIC`, input: `none`, `L16006`)<br>- `cloud.updateStatus` (`PUBLIC`, input: `none`, `L16031`)<br>- `cloud.downloadUpdate` (`PUBLIC`, input: `none`, `L16032`)<br>- `cloud.installUpdate` (`PUBLIC`, input: `none`, `L16040`)<br>- `cloud.notifications` (`UNLICENSED`, input: `none`, `L15987`)<br>- `cloud.notificationsSeen` (`UNLICENSED`, input: `none`, `L15999`) |
| **6. `support.*` (6 endpoints)** | - `support.list` (`UNLICENSED`, input: `none`, `L22507`)<br>- `support.get` (`UNLICENSED`, input: `{ id }`, `L22515`)<br>- `support.create` (`UNLICENSED`, input: `{ type: "BUG"\|"FEEDBACK"\|"FEATURE"\|"BILLING"\|"OTHER", subject, body, includeLogs?, attachments? }`, `L22522`)<br>- `support.reply` (`UNLICENSED`, input: `{ id, body, attachments? }`, `L22535`)<br>- `support.attachment` (`UNLICENSED`, input: `{ id }`, `L22548`)<br>- `support.pickImages` (`UNLICENSED`, input: `none`, `L22491`) |
| **7. `system.*` (9 endpoints)** | - `system.openExternal` (`UNLICENSED`, input: `{ url }`, `L16051`)<br>- `system.dbInfo` (`LICENSED`, input: `none`, `L22689`)<br>- `system.pickImage` (`LICENSED`, input: `none`, `L22690`)<br>- `system.pickMedia` (`LICENSED`, input: `none`, `L22700`)<br>- `system.storage` (`LICENSED`, input: `none`, `L22710`)<br>- `system.logInfo` (`PUBLIC`, input: `none`, `L22711`)<br>- `system.openLogs` (`PUBLIC`, input: `none`, `L22714`)<br>- `system.background` (`LICENSED`, input: `none`, `L22712`)<br>- `system.setBackground` (`LICENSED`, input: `{ closeToTray?, launchAtLogin? }`, `L22713`) |
| **8. `workspaces.*` (8 endpoints)** | - `workspaces.list` (`LICENSED`, input: `none`, `L17053`)<br>- `workspaces.create` (`LICENSED`, input: `WorkspaceInput`, `L17054`)<br>- `workspaces.update` (`LICENSED`, input: `{ id, patch: Partial<WorkspaceInput> }`, `L17063`)<br>- `workspaces.archive` (`LICENSED`, input: `{ id }`, `L17069`)<br>- `workspaces.listArchived` (`LICENSED`, input: `none`, `L17073`)<br>- `workspaces.restore` (`LICENSED`, input: `{ id }`, `L17083`)<br>- `workspaces.setCanvasNoise` (`LICENSED`, input: `{ id, enabled }`, `L17089`)<br>- `workspaces.export` (`LICENSED`, input: `none`, `L17092`) |
| **9. `accounts.*` (10 endpoints)** | - `accounts.tree` (`LICENSED`, input: `{ workspaceId? }`, `L16168`)<br>- `accounts.get` (`LICENSED`, input: `{ id }`, `L16169`)<br>- `accounts.create` (`LICENSED + QUOTA`, input: `AccountInput`, `L16181`)<br>- `accounts.update` (`LICENSED`, input: `{ id, patch }`, `L16200`)<br>- `accounts.delete` (`LICENSED`, input: `{ id }`, `L16213`)<br>- `accounts.connectFacebook` (`LICENSED + QUOTA`, input: `{ accountId?, workspaceId? }`, `L20444`)<br>- `accounts.importFacebook` (`LICENSED + QUOTA`, input: `{ accountId, userToken, appId?, appSecret? }`, `L20528`)<br>- `accounts.connectTiktok` (`LICENSED + QUOTA`, input: `{ accountId?, workspaceId? }`, `L20362`)<br>- `accounts.connectYoutube` (`LICENSED + QUOTA`, input: `{ accountId?, workspaceId? }`, `L20275`)<br>- `accounts.cancelYoutubeLogin` (`LICENSED`, input: `none`, `L20270`) |
| **10. `channels.*` (8 endpoints)** | - `channels.list` (`LICENSED`, input: `{ workspaceId?, platform? }`, `L16239`)<br>- `channels.createPage` (`LICENSED + QUOTA`, input: `PageInput`, `L16224`)<br>- `channels.delete` (`LICENSED`, input: `{ id }`, `L16231`)<br>- `channels.connect` (`LICENSED + QUOTA`, input: `{ channelId, token, refreshToken?, clientKey?, clientSecret? }`, `L20472`)<br>- `channels.verify` (`LICENSED`, input: `{ id }`, `L20486`)<br>- `channels.disconnect` (`LICENSED`, input: `{ id }`, `L20518`)<br>- `channels.quota` (`LICENSED`, input: `none`, `L15923`)<br>- `channels.setQuota` (`LICENSED`, input: `{ activeIds: string[] }`, `L15924`) |
| **11. `integrations.*` (8 endpoints)** | - `integrations.meta` (`LICENSED`, input: `none`, `L20415`)<br>- `integrations.setMeta` (`LICENSED`, input: `{ appId, appSecret?, configId?, redirectUri?, instagram? }`, `L20425`)<br>- `integrations.setInstagram` (`LICENSED`, input: `{ enabled }`, `L20269`)<br>- `integrations.tiktok` (`LICENSED`, input: `none`, `L20338`)<br>- `integrations.setTiktok` (`LICENSED`, input: `{ clientKey, clientSecret?, redirectUri?, scopes? }`, `L20347`)<br>- `integrations.youtube` (`LICENSED`, input: `none`, `L20251`)<br>- `integrations.setYoutube` (`LICENSED`, input: `{ clientId, clientSecret? }`, `L20257`)<br>- `integrations.setYoutubePublish` (`LICENSED`, input: `{ privacy?, categoryId?, declareSynthetic?, notifySubscribers? }`, `L20266`) |
| **12. `proxies.*` (3 endpoints)** | - `proxies.list` (`LICENSED`, input: `{ workspaceId? }`, `L16240`)<br>- `proxies.create` (`LICENSED`, input: `ProxyInput`, `L16241`)<br>- `proxies.delete` (`LICENSED`, input: `{ id }`, `L16244`) |
| **13. `content.*` (13 endpoints)** | - `content.list` (`LICENSED`, input: `{ workspaceId?, status?, search? }`, `L16295`)<br>- `content.create` (`LICENSED`, input: `ContentInput`, `L16302`)<br>- `content.update` (`LICENSED`, input: `{ id, patch }`, `L16306`)<br>- `content.delete` (`LICENSED`, input: `{ id }`, `L16343`)<br>- `content.bulkMove` (`LICENSED`, input: `{ ids, workspaceId }`, `L16312`)<br>- `content.bulkDelete` (`LICENSED`, input: `{ ids }`, `L16317`)<br>- `content.stats` (`LICENSED`, input: `{ workspaceId? }`, `L16318`)<br>- `content.spin` (`LICENSED`, input: `{ ids, count=3 }`, `L19297`)<br>- `content.variants` (`LICENSED`, input: `{ id }`, `L19328`)<br>- `content.applyVariant` (`LICENSED`, input: `{ id }`, `L19329`)<br>- `content.deleteVariant` (`LICENSED`, input: `{ id }`, `L19335`)<br>- `content.hookScore` (`LICENSED`, input: `{ id, platform?, force=false }`, `L19286`)<br>- `content.hashtags` (`LICENSED`, input: `{ ids }`, `L19344`) |
| **14. `posts.*` (10 endpoints)** | - `posts.range` (`VIEW_ONLY`, input: `{ from, to, workspaceId? }`, `L16347`)<br>- `posts.schedule` (`FEATURE:CALENDAR`, input: `{ contentItemId, channelId, scheduledAt }`, `L16357`)<br>- `posts.reschedule` (`FEATURE:CALENDAR`, input: `{ id, scheduledAt }`, `L16371`)<br>- `posts.cancel` (`FEATURE:CALENDAR`, input: `{ id }`, `L16387`)<br>- `posts.publishNow` (`FEATURE:CALENDAR`, input: `{ id }`, `L20549`)<br>- `posts.worker` (`VIEW_ONLY`, input: `none`, `L20560`)<br>- `posts.setWorker` (`FEATURE:CALENDAR`, input: `{ enabled }`, `L20561`)<br>- `posts.stagger` (`FEATURE:CALENDAR`, input: `none`, `L16715`)<br>- `posts.setStagger` (`FEATURE:CALENDAR`, input: `{ enabled?, minMinutes?, maxMinutes? }`, `L16716`)<br>- `posts.autoSchedule` (`FEATURE:CALENDAR`, input: `{ contentIds, spacingHours=4 }`, `L16717`) |
| **15. `plan.*` (8 endpoints)** | - `plan.list` (`FEATURE:CALENDAR`, input: `{ workspaceId?, from, to }`, `L20589`)<br>- `plan.generate` (`FEATURE:CALENDAR`, input: `{ workspaceId?, startDate, days, perDay, formats=[], useTrends=false }`, `L20590`)<br>- `plan.save` (`FEATURE:CALENDAR`, input: `{ id?, workspaceId?, plannedDate?, title, format, hook?, description?, status? }`, `L20625`)<br>- `plan.delete` (`FEATURE:CALENDAR`, input: `{ id }`, `L20633`)<br>- `plan.deleteMany` (`FEATURE:CALENDAR`, input: `{ ids }`, `L20637`)<br>- `plan.toVideo` (`FEATURE:CALENDAR`, input: `{ id }`, `L20639`)<br>- `plan.toImage` (`FEATURE:CALENDAR`, input: `{ id }`, `L20654`)<br>- `plan.toPost` (`FEATURE:CALENDAR`, input: `{ id }`, `L20668`) |
| **16. `inbox.*` (21 endpoints)** | - `inbox.conversations` (`FEATURE:INBOX`, input: `{ workspaceId?, platform?, unreadOnly? }`, `L16548`)<br>- `inbox.messages` (`FEATURE:INBOX`, input: `{ conversationId }`, `L16559`)<br>- `inbox.markRead` (`FEATURE:INBOX`, input: `{ conversationId }`, `L16560`)<br>- `inbox.quickReplies` (`FEATURE:INBOX`, input: `{ workspaceId? }`, `L16565`)<br>- `inbox.stats` (`VIEW_ONLY`, input: `{ workspaceId? }`, `L16566`)<br>- `inbox.pickAttachments` (`FEATURE:INBOX`, input: `{ images=false, multiple=true }`, `L16595`)<br>- `inbox.send` (`FEATURE:INBOX`, input: `{ conversationId, body, attachments=[] }`, `L16616`)<br>- `inbox.update` (`FEATURE:INBOX`, input: `{ conversationId, tags?, status? }`, `L16630`)<br>- `inbox.rules` (`FEATURE:INBOX`, input: `{ workspaceId? }`, `L16634`)<br>- `inbox.toggleRule` (`FEATURE:INBOX`, input: `{ id, enabled }`, `L16635`)<br>- `inbox.saveRule` (`FEATURE:INBOX`, input: `{ id?, workspaceId?, channelId?, name, keywords, action, template?, minDelaySec, maxDelaySec, enabled? }`, `L16639`)<br>- `inbox.deleteRule` (`FEATURE:INBOX`, input: `{ id }`, `L16658`)<br>- `inbox.sync` (`FEATURE:INBOX`, input: `{ channelId? }`, `L16662`)<br>- `inbox.worker` (`VIEW_ONLY`, input: `none`, `L16663`)<br>- `inbox.setAutoSync` (`FEATURE:INBOX`, input: `{ enabled }`, `L16664`)<br>- `inbox.resend` (`FEATURE:INBOX`, input: `{ id }`, `L16677`)<br>- `inbox.aiSettings` (`FEATURE:INBOX`, input: `none`, `L16668`)<br>- `inbox.setAiSettings` (`FEATURE:INBOX`, input: `{ mode?, comments?, messages?, minConfidence?, minDelaySec?, maxDelaySec?, maxPerHour?, autoLike?, tagLeads? }`, `L16669`)<br>- `inbox.approveDraft` (`FEATURE:INBOX`, input: `{ id, body? }`, `L16670`)<br>- `inbox.discardDraft` (`FEATURE:INBOX`, input: `{ id }`, `L16674`)<br>- `inbox.suggestReply` (`FEATURE:INBOX`, input: `{ conversationId }`, `L19363`) |
| **17. `dashboard.*` / `alerts.*` / `activity.*` (6 endpoints)** | - `dashboard.summary` (`LICENSED`, input: `{ workspaceId? }`, `L16533`)<br>- `dashboard.topChannels` (`LICENSED`, input: `{ workspaceId?, limit=3 }`, `L16534`)<br>- `dashboard.daemon` (`LICENSED`, input: `{ workspaceId? }`, `L16535`)<br>- `alerts.open` (`LICENSED`, input: `none`, `L16536`)<br>- `alerts.resolve` (`LICENSED`, input: `{ id }`, `L16537`)<br>- `activity.recent` (`LICENSED`, input: `{ limit=20 }`, `L16541`) |
| **18. `analytics.*` / `insights.*` (7 endpoints)** | - `analytics.overview` (`FEATURE:ANALYTICS`, input: `{ workspaceId?, channelId?, days=30 }`, `L20749`)<br>- `analytics.goals` (`FEATURE:ANALYTICS`, input: `{ workspaceId?, channelId? }`, `L20819`)<br>- `analytics.saveGoal` (`FEATURE:ANALYTICS`, input: `{ id?, channelId, metric, target, label? }`, `L20833`)<br>- `analytics.deleteGoal` (`FEATURE:ANALYTICS`, input: `{ id }`, `L20842`)<br>- `insights.sync` (`FEATURE:ANALYTICS`, input: `none`, `L20557`)<br>- `insights.last` (`VIEW_ONLY`, input: `none`, `L20558`)<br>- `insights.bestHours` (`FEATURE:ANALYTICS`, input: `{ workspaceId? }`, `L20559`) |
| **19. `ai.*` / `vault.*` / `settings.*` (16 endpoints)** | - `ai.providers` (`LICENSED`, input: `none`, `L16780`)<br>- `ai.updateProvider` (`LICENSED`, input: `{ id, patch: { defaultModel?, enabled?, baseUrl? } }`, `L16789`)<br>- `ai.setKey` (`LICENSED`, input: `{ providerId, key }`, `L16793`)<br>- `ai.testModel` (`LICENSED`, input: `{ id }`, `L16803`)<br>- `ai.removeKey` (`LICENSED`, input: `{ providerId }`, `L16804`)<br>- `ai.test` (`LICENSED`, input: `{ id }`, `L19183`)<br>- `ai.testAll` (`LICENSED`, input: `none`, `L19184`)<br>- `ai.routing` (`LICENSED`, input: `none`, `L19189`)<br>- `ai.omnira` (`LICENSED`, input: `none`, `L19151`)<br>- `ai.reorder` (`LICENSED`, input: `{ ids }`, `L19204`)<br>- `ai.setFallback` (`LICENSED`, input: `{ enabled }`, `L19209`)<br>- `ai.pricing` (`LICENSED`, input: `none`, `L19210`)<br>- `ai.setPrice` (`LICENSED`, input: `{ model, price: { input, output } \| null }`, `L19216`)<br>- `vault.info` (`LICENSED`, input: `none`, `L16808`)<br>- `settings.budget` (`LICENSED`, input: `none`, `L16809`)<br>- `settings.setBudget` (`LICENSED`, input: `{ hardCapUsd, circuitBreaker }`, `L16823`) |
| **20. `studio.*` / `render.*` (17 endpoints)** | - `studio.projects` (`FEATURE:STUDIO`, input: `{ workspaceId? }`, `L16907`)<br>- `studio.get` (`FEATURE:STUDIO`, input: `{ id }`, `L16914`)<br>- `studio.create` (`FEATURE:STUDIO`, input: `ProjectInput`, `L16921`)<br>- `studio.update` (`FEATURE:STUDIO`, input: `{ id, patch }`, `L16922`)<br>- `studio.delete` (`FEATURE:STUDIO`, input: `{ id }`, `L16932`)<br>- `studio.saveScenes` (`FEATURE:STUDIO`, input: `{ projectId, scenes: SceneInput[] }`, `L16936`)<br>- `studio.tryOn` (`FEATURE:STUDIO`, input: `{ projectId, mediaPrompt, outfit? }`, `L19696`)<br>- `studio.toContent` (`FEATURE:STUDIO`, input: `{ id }`, `L16980`)<br>- `studio.promptExport` (`FEATURE:STUDIO`, input: `{ id }`, `L16854`)<br>- `studio.generateScript` (`FEATURE:STUDIO`, input: `{ id }`, `L19223`)<br>- `studio.bibleFromRefs` (`FEATURE:STUDIO`, input: `{ id }`, `L19153`)<br>- `studio.updateBible` (`FEATURE:STUDIO`, input: `{ id, bible }`, `L19164`)<br>- `studio.writeAct` (`FEATURE:STUDIO`, input: `{ projectId, act }`, `L19174`)<br>- `render.start` (`FEATURE:STUDIO`, input: `{ projectId }`, `L19713`)<br>- `render.estimate` (`FEATURE:STUDIO`, input: `{ projectId }`, `L19714`)<br>- `render.cancel` (`FEATURE:STUDIO`, input: `{ id }`, `L19778`)<br>- `render.jobs` (`FEATURE:STUDIO`, input: `{ projectId?, limit=20 }`, `L19779`) |
| **21. `media.*` (22 endpoints)** | - `media.info` (`LICENSED`, input: `none`, `L19652`)<br>- `media.detect` (`LICENSED`, input: `none`, `L19653`)<br>- `media.setEncoder` (`LICENSED`, input: `{ encoder }`, `L19654`)<br>- `media.status` (`LICENSED`, input: `none`, `L19655`)<br>- `media.voices` (`LICENSED`, input: `{ provider }`, `L19656`)<br>- `media.previewVoice` (`LICENSED`, input: `{ provider, voiceId?, workspaceId? }`, `L19657`)<br>- `media.bgmList` (`LICENSED`, input: `none`, `L19658`)<br>- `media.importBgm` (`LICENSED`, input: `none`, `L19659`)<br>- `media.cleanup` (`LICENSED`, input: `none`, `L19669`)<br>- `media.generateMusic` (`FEATURE:STUDIO`, input: `{ provider, prompt, durationSec=30, instrumental=true, workspaceId? }`, `L19688`)<br>- `media.imageEngine` (`LICENSED`, input: `none`, `L19689`)<br>- `media.setImageEngine` (`LICENSED`, input: `{ engine }`, `L19693`)<br>- `media.videoEngine` (`LICENSED`, input: `none`, `L19709`)<br>- `media.setVideoEngine` (`LICENSED`, input: `{ engine }`, `L19710`)<br>- `media.seedanceTier` (`LICENSED`, input: `none`, `L19711`)<br>- `media.setSeedanceTier` (`LICENSED`, input: `{ tier }`, `L19712`)<br>- `media.importClips` (`LICENSED`, input: `{ multiple=false, images=false }`, `L19715`)<br>- `media.showInFolder` (`LICENSED`, input: `{ path }`, `L19780`)<br>- `media.upscaleInfo` (`FEATURE:STUDIO`, input: `{ path }`, `L19742`)<br>- `media.upscale` (`FEATURE:STUDIO`, input: `{ path, quality, method }`, `L19748`)<br>- `media.upscaleProgress` (`FEATURE:STUDIO`, input: `{ path }`, `L19776`)<br>- `media.cancelUpscale` (`FEATURE:STUDIO`, input: `{ path }`, `L19777`) |
| **22. `series.*` (15 endpoints)** | - `series.list` (`FEATURE:SERIES`, input: `{ workspaceId? }`, `L18318`)<br>- `series.get` (`FEATURE:SERIES`, input: `{ id }`, `L18325`)<br>- `series.create` (`FEATURE:SERIES`, input: `SeriesInput`, `L18326`)<br>- `series.update` (`FEATURE:SERIES`, input: `{ id, patch }`, `L18327`)<br>- `series.delete` (`FEATURE:SERIES`, input: `{ id }`, `L18356`)<br>- `series.makeFilm` (`FEATURE:SERIES`, input: `{ episodeId }`, `L18335`)<br>- `series.develop` (`FEATURE:SERIES`, input: `{ id, episodes=5 }`, `L18364`)<br>- `series.saveCharacter` (`FEATURE:SERIES`, input: `{ id?, seriesId, name, role?, appearance, personality?, arc?, voiceId?, voiceProvider?, voiceProfile?, promptManual?, imagePrompt? }`, `L18454`)<br>- `series.characterPrompt` (`FEATURE:SERIES`, input: `{ id, force=false }`, `L18467`)<br>- `series.deleteCharacter` (`FEATURE:SERIES`, input: `{ id }`, `L18468`)<br>- `series.characterImage` (`FEATURE:SERIES`, input: `{ id }`, `L18472`)<br>- `series.setCharacterImage` (`FEATURE:SERIES`, input: `{ id, sourcePath }`, `L18522`)<br>- `series.saveEpisode` (`FEATURE:SERIES`, input: `{ id?, seriesId, title, synopsis, cliffhanger? }`, `L18542`)<br>- `series.deleteEpisode` (`FEATURE:SERIES`, input: `{ id }`, `L18553`)<br>- `series.writeEpisode` (`FEATURE:SERIES`, input: `{ id }`, `L18556`) |
| **23. `film.*` (36 endpoints)** | - `film.gate` (`VIEW_ONLY`, input: `none`, `L21107`)<br>- `film.setSeedanceSource` (`FEATURE:FILM`, input: `{ source: "auto"\|"fal"\|"comet"\|"piapi" }`, `L21108`)<br>- `film.list` (`FEATURE:FILM`, input: `{ workspaceId? }`, `L21112`)<br>- `film.create` (`FEATURE:FILM`, input: `{ title, idea, style, genre?, visualStyle?, dialogueLanguage, subtitleVi?, notes?, aspect, targetSec, videoEngine?, workspaceId? }`, `L21138`)<br>- `film.get` (`FEATURE:FILM`, input: `{ id }`, `L21152`)<br>- `film.update` (`FEATURE:FILM`, input: `{ id, patch }`, `L21160`)<br>- `film.delete` (`FEATURE:FILM`, input: `{ id }`, `L21170`)<br>- `film.generateScript` (`FEATURE:FILM`, input: `{ id }`, `L21184`)<br>- `film.resolveProposals` (`FEATURE:FILM`, input: `{ filmId, decisions }`, `L21267`)<br>- `film.seriesLocations` (`FEATURE:FILM`, input: `{ filmId }`, `L21274`)<br>- `film.adoptLocation` (`FEATURE:FILM`, input: `{ filmId, assetId, sourceAssetId, copyText=true }`, `L21279`)<br>- `film.promoteToSeries` (`FEATURE:FILM`, input: `{ assetId }`, `L21289`)<br>- `film.saveAsset` (`FEATURE:FILM`, input: `{ filmId, id?, kind, patch }`, `L21296`)<br>- `film.refreshPrompt` (`FEATURE:FILM`, input: `{ filmId, id }`, `L21354`)<br>- `film.deleteAsset` (`FEATURE:FILM`, input: `{ id }`, `L21330`)<br>- `film.reorder` (`FEATURE:FILM`, input: `{ filmId, ids }`, `L21347`)<br>- `film.estimate` (`FEATURE:FILM`, input: `{ filmId, assetIds, takes?, kind="image" }`, `L21360`)<br>- `film.generate` (`FEATURE:FILM`, input: `{ filmId, assetIds, takes?, kind="image" }`, `L21367`)<br>- `film.upscale` (`FEATURE:FILM`, input: `{ takeId, quality, method }`, `L21397`)<br>- `film.selectTake` (`FEATURE:FILM`, input: `{ assetId, takeId, video? }`, `L21413`)<br>- `film.deleteTake` (`FEATURE:FILM`, input: `{ id }`, `L21424`)<br>- `film.uploadTake` (`FEATURE:FILM`, input: `{ assetId, sourcePath }`, `L21441`)<br>- `film.cancel` (`FEATURE:FILM`, input: `{ filmId, takeIds? }`, `L21462`)<br>- `film.assemble` (`FEATURE:FILM`, input: `{ filmId, options }`, `L21466`)<br>- `film.assembleStatus` (`FEATURE:FILM`, input: `{ filmId }`, `L21474`)<br>- `film.assembleCancel` (`FEATURE:FILM`, input: `{ filmId }`, `L21475`)<br>- `film.renders` (`FEATURE:FILM`, input: `{ filmId }`, `L21476`)<br>- `film.deleteRender` (`FEATURE:FILM`, input: `{ filmId, file }`, `L21477`)<br>- `film.exportVideos` (`FEATURE:FILM`, input: `{ filmId, assetIds, options }`, `L21483`)<br>- `film.watermarkInfo` (`FEATURE:FILM`, input: `{ filmId }`, `L21545`)<br>- `film.setWatermarkImage` (`FEATURE:FILM`, input: `{ filmId, sourcePath }`, `L21546`)<br>- `film.uploadNarration` (`FEATURE:FILM`, input: `{ assetId }`, `L21560`)<br>- `film.previewNarration` (`FEATURE:FILM`, input: `{ assetId }`, `L21584`)<br>- `film.writeNarration` (`FEATURE:FILM`, input: `{ filmId, overwrite=false }`, `L21598`)<br>- `film.renderToContent` (`FEATURE:FILM`, input: `{ filmId, file }`, `L21604`)<br>- `film.optimizeStyle` (`FEATURE:FILM`, input: `{ id }`, `L21612`)<br>- `film.queue` (`VIEW_ONLY`, input: `{ filmId? }`, `L21616`)<br>- `film.setQueue` (`FEATURE:FILM`, input: `{ paused?, imageConcurrency?, videoConcurrency? }`, `L21617`) |
| **24. `imagestudio.*` (15 endpoints)** | - `imagestudio.list` (`FEATURE:STUDIO`, input: `{ workspaceId? }`, `L22033`)<br>- `imagestudio.get` (`FEATURE:STUDIO`, input: `{ id }`, `L22054`)<br>- `imagestudio.create` (`FEATURE:STUDIO`, input: `{ workspaceId?, title?, imageType? }`, `L22059`)<br>- `imagestudio.update` (`FEATURE:STUDIO`, input: `{ id, patch }`, `L22064`)<br>- `imagestudio.delete` (`FEATURE:STUDIO`, input: `{ id }`, `L22080`)<br>- `imagestudio.generateIdeas` (`FEATURE:STUDIO`, input: `{ id, count }`, `L22087`)<br>- `imagestudio.generate` (`FEATURE:STUDIO`, input: `{ id, ideaId, variants }`, `L22120`)<br>- `imagestudio.estimate` (`FEATURE:STUDIO`, input: `{ id, ideaIds, variants }`, `L22129`)<br>- `imagestudio.enqueue` (`FEATURE:STUDIO`, input: `{ id, ideaIds, variants }`, `L22135`)<br>- `imagestudio.jobStatus` (`FEATURE:STUDIO`, input: `{ id }`, `L22149`)<br>- `imagestudio.cancelJobs` (`FEATURE:STUDIO`, input: `{ id }`, `L22150`)<br>- `imagestudio.refreshPrompt` (`FEATURE:STUDIO`, input: `{ id, ideaId }`, `L22158`)<br>- `imagestudio.deleteResult` (`FEATURE:STUDIO`, input: `{ id }`, `L22164`)<br>- `imagestudio.retext` (`FEATURE:STUDIO`, input: `{ id, ideaId }`, `L22172`)<br>- `imagestudio.toContent` (`FEATURE:STUDIO`, input: `{ id, resultIds, asCarousel? }`, `L22194`) |
| **25. `flow.*` / `museFlow.*` / `grokFlow.*` (37 endpoints)** | - `flow.status` (`VIEW_ONLY`, `L21633`), `flow.setSource` (`FEATURE:FLOW`, `L21634`), `flow.setPrefs` (`L21638`), `flow.setModel` (`L21645`), `flow.openLogin` (`L21649`), `flow.check` (`L21653`), `flow.refreshCredits` (`L21654`), `flow.close` (`L21655`), `flow.reset` (`L21659`), `flow.test` (`L21663`), `flow.cancelTest` (`L21687`), `flow.openDiagnostics` (`L21691`), `flow.diagnosticReport` (`L21695`).<br>- `museFlow.status` (`VIEW_ONLY`, `L21697`), `museFlow.setSource` (`FEATURE:FLOW`, `L21698`), `museFlow.setPrefs` (`L21702`), `museFlow.setProxy` (`L21708`), `museFlow.testProxy` (`L21712`), `museFlow.openLogin` (`L21713`), `museFlow.check` (`L21717`), `museFlow.close` (`L21718`), `museFlow.reset` (`L21722`), `museFlow.test` (`L21726`), `museFlow.cancelTest` (`L21745`), `museFlow.openDiagnostics` (`L21749`), `museFlow.diagnosticReport` (`L21753`).<br>- `grokFlow.status` (`VIEW_ONLY`, `L21755`), `grokFlow.setPrefs` (`FEATURE:FLOW`, `L21756`), `grokFlow.openLogin` (`L21762`), `grokFlow.check` (`L21766`), `grokFlow.close` (`L21767`), `grokFlow.reset` (`L21771`), `grokFlow.test` (`L21775`), `grokFlow.cancelTest` (`L21794`), `grokFlow.openDiagnostics` (`L21798`), `grokFlow.diagnosticReport` (`L21803`). |
| **26. `localtts.*` / `tts.*` (17 endpoints)** | - `localtts.status` (`LICENSED`, input: `{ detect=false }`, `L9805`), `localtts.install` (`L9806`), `localtts.cancel` (`L9807`), `localtts.uninstall` (`L9808`), `localtts.clones` (`L9811`), `localtts.addClone` (`input: { name, consent: true }`, `L9812`), `localtts.addRecorded` (`input: { name, consent: true, data, ext }`, `L9815`), `localtts.renameClone` (`L9820`), `localtts.removeClone` (`L9822`).<br>- `tts.list` (`FEATURE:STUDIO`, input: `{ limit=50 }`, `L22388`), `tts.get` (`L22392`), `tts.create` (`input: { title, text, provider, model?, voiceId?, voiceLabel?, pauseSec=0.5, cast={} }`, `L22396`), `tts.cancel` (`L22417`), `tts.resume` (`L22422`), `tts.rename` (`L22428`), `tts.delete` (`L22429`), `tts.export` (`L22435`). |
