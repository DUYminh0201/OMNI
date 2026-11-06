# Marketing Flow

Marketing Flow là ứng dụng desktop Electron tích hợp các mini app marketing trong một codebase duy nhất.

## Cấu trúc dự án

```text
MKT FLOW/
├── apps/
│   └── marketing-flow-desktop/
│       ├── server/                  # Express API
│       └── src/
│           ├── app/                 # App shell
│           ├── features/            # Toàn bộ mini app
│           │   ├── bulk-content/
│           │   ├── bulk-watermark/
│           │   ├── caption-editor/
│           │   ├── market-intelligence/
│           │   ├── settings/
│           │   ├── tiktok-downloader/
│           │   └── video-dubbing/
│           └── shared/              # Component dùng chung
├── packages/
│   └── media-processing/           # FFmpeg và tách voice
├── runtime/
│   ├── database/                   # Dữ liệu local
│   └── uploads/                    # Media trong quá trình xử lý
├── scripts/                            # Script thiết lập
└── tests/
    └── unit/
```

Không còn bản chạy standalone. `video-dubbing` và `bulk-content` được quản lý trực tiếp như các feature của app desktop.

## Lệnh chính

```bash
npm run dev
npm test
npm run build
npm run setup:audio
```
