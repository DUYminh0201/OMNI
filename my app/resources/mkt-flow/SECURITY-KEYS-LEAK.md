# 🚨 CẢNH BÁO BẢO MẬT: 15 API KEY THẬT ĐANG NẰM TRONG THƯ MỤC ĐÓNG GÓI

**Ngày phát hiện:** 2026-11-04
**Người phát hiện:** Lead (audit toàn workspace)

---

## Sự thật đã xác minh

File `my app/resources/mkt-flow/runtime/database/keys.json` **tồn tại thật** và chứa:

```
Tong so key: 15
Co key ACTIVE: 15
  - gemini: 13 keys (12 key dạng AQ.Ab8... dài 53 ký tự, 1 key dạng AIzaSy... dài 39)
  - nvidia:  2 keys (dạng nvapi-... dài 70 ký tự)
  - openai/claude/deepseek: 0
```

Tất cả **15 key đang ở trạng thái ACTIVE** — tức còn dùng được ngay.

Đây **không phải** suy luận từ code. Đây là file thật, đọc được, chứa key thật.

---

## Vì sao đây là sự cố nghiêm trọng

### 1. Key nằm trong thư mục được đóng gói vào installer

`build_package.ps1` (bản CŨ, trước khi bạn sửa) có dòng:

```powershell
Copy-Item "$workspace\mkt-flow\runtime\database\*" "$mktDest\runtime\database" -Force
```

Dấu `*` bao gồm cả `keys.json`. Thư mục đích `$mktDest` = `$staging\resources\mkt-flow`,
và `$staging` sau đó được nén thành `app.7z` rồi nhúng vào `Omnira-Studio-Setup-1.2.7.exe`.

### 2. Bằng chứng cứng: bản sao đóng gói còn nguyên trên đĩa

`my app/resources/mkt-flow/` chính là **kết quả của lần đóng gói đó** — nó vẫn còn
`runtime/database/keys.json` với đủ 15 key.

- `resources/mkt-flow/runtime/database/keys.json` — sửa lần cuối **31/10/2026 18:03**
- `Omnira-Studio-Setup-1.2.7.exe` — tạo **02/11/2026 16:57**

Key có trước build 2 ngày → **gần như chắc chắn installer 1.2.7 đã chứa 15 key này**.

### 3. Phạm vi ảnh hưởng

- Bất kỳ ai tải/cài `Omnira-Studio-Setup-1.2.7.exe` đều có thể trích xuất 15 key.
- Key Gemini/NVIDIA là **tài khoản trả phí** → người khác dùng sẽ tiêu hạn mức của bạn, có thể phát sinh chi phí.
- Nếu key từng bị đẩy lên GitHub/nơi công khai, bot quét key sẽ tìm thấy trong vài phút.

---

## VIỆC PHẢI LÀM NGAY (theo thứ tự)

1. **THU HỒI TOÀN BỘ 15 KEY.** Không cần chờ xác minh thêm — coi như đã lộ.
   - Google AI Studio → xoá 13 key cũ, tạo key mới.
   - build.nvidia.com → xoá 2 key `nvapi-...`, tạo key mới.
2. **Xoá file khỏi mọi nơi:**
   - `my app/resources/mkt-flow/runtime/database/keys.json` ← file này
   - Kiểm tra cả `my app/resources/mkt-flow/runtime/` còn file nhạy cảm nào khác
3. **Nếu installer 1.2.7 đã phát tán** (gửi cho khách, đăng tải, commit): phải thông báo
   và phát hành bản mới sau khi đã xoay key.
4. **Chỉ sau khi xoay key xong** mới nhập key mới vào app.

---

## Về bản vá bạn vừa thêm vào `build_package.ps1`

Bạn đã thêm đoạn bảo vệ ở dòng 51-56 — **ý tưởng đúng, nhưng cách viết có 2 lỗi.**

### Lỗi 1: `throw` khiến mọi lần build đều thất bại

```powershell
Get-ChildItem "...\database\*" -Exclude "keys.json*" | Copy-Item ...
if (Test-Path "$mktDest\runtime\database\keys.json") {
    Remove-Item "$mktDest\runtime\database\keys.json" -Force
    throw "SECURITY ALERT: ... Build aborted immediately."
}
```

Dòng 52 đã **loại trừ** `keys.json` khỏi việc copy. Nên khi tới dòng 53, file **chắc chắn
không tồn tại** trong đích → `Test-Path` luôn trả `False` → khối lệnh không bao giờ chạy.

**Đã kiểm chứng bằng thực nghiệm:**
```
Sau khi copy voi -Exclude:
   model_registry.json
   nvidia_models.json
keys.json co trong dst? False
```

➡️ Nghĩa là: guard hiện tại là **dead code** — nó không bao giờ phát hiện được gì, và
cũng không bao giờ chặn được build. Nó chỉ tạo cảm giác an toàn giả.

Nghiêm trọng hơn: **nếu** trong tương lai `keys.json` lọt vào đích bằng đường khác
(ví dụ bạn bỏ `-Exclude` đi), thì guard sẽ `throw` **sau khi đã copy xong toàn bộ** —
build hỏng giữa chừng nhưng `$staging` vẫn còn key trên đĩa cho tới bước dọn dẹp.

### Lỗi 2: Không có kiểm tra trước khi copy

Guard nên chạy **trước** bước copy, kiểm tra **nguồn**, và fail-fast.

### Bản vá đề xuất

```powershell
Write-Host "5. Chuan bi mkt-flow"
$mktDest = "$staging\resources\mkt-flow"
New-Item -ItemType Directory -Path $mktDest -Force | Out-Null
New-Item -ItemType Directory -Path "$mktDest\runtime\database" -Force | Out-Null

# --- GUARD: kiem tra NGUON truoc khi copy bat cu thu gi ---
$sourceDb = "$workspace\mkt-flow\runtime\database"
$forbidden = @("keys.json", "nvidia_models.json", "*.key", "*.pem", ".env")
foreach ($pattern in $forbidden) {
    $hits = Get-ChildItem $sourceDb -Filter $pattern -ErrorAction SilentlyContinue
    if ($hits) {
        throw "SECURITY ABORT: phat hien file cam '$pattern' trong $sourceDb. Build dung ngay."
    }
}

# Chi copy khi nguon da sach
Get-ChildItem "$sourceDb\*" -Exclude "keys.json*","nvidia_models.json*" |
    Copy-Item -Destination "$mktDest\runtime\database" -Force

# Kiem tra lai DICH sau khi copy (defense in depth)
$leaked = Get-ChildItem "$mktDest\runtime\database" -Recurse -File -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -match 'keys|secret|token|credential' }
if ($leaked) {
    $leaked | ForEach-Object { Remove-Item $_.FullName -Force }
    throw "SECURITY ABORT: file nhay cam lot vao staging: $($leaked.Name -join ', ')"
}
```

**Nguyên tắc:** fail-fast trên **nguồn**, rồi kiểm tra lại **đích**. Không bao giờ để
`throw` phụ thuộc vào một điều kiện đã bị loại trừ từ trước.

---

## Ghi chú về trạng thái repo hiện tại

Thư mục `mkt-flow/` ở workspace root **đã bị xoá** trong lúc tôi audit. Điều này có nghĩa:

- Bản `mkt-flow` duy nhất còn lại là `my app/resources/mkt-flow/` (bản đóng gói).
- `build_package.ps1` vẫn tham chiếu `$workspace\mkt-flow\...` ở **9 dòng**
  (7, 42, 43, 44, 52, 57, 60) → script này **sẽ hỏng ngay** nếu chạy bây giờ.
- Sau khi xoay key, bạn cần quyết định: khôi phục `mkt-flow/` từ đâu, hay chuyển hẳn
  sang phát triển trực tiếp trong `my app/resources/mkt-flow/`.
