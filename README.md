# VSCode AI Project

Đây là phiên bản VSCode được fork với các tính năng AI nâng cao.

## 🎬 Demo Video

![Demo](demo.gif)


## Cách chạy

### 1. Cài đặt Node.js
- Tải và cài đặt Node.js phiên bản 22.x trở lên

### 2. Cài đặt dependencies
```bash
npm install
```

### 3. Build project
```bash
npm run compile
```

### 4. Chạy VSCode

**Trên Windows:**
```bash
scripts\code.bat
```

**Trên macOS/Linux:**
```bash
./scripts/code.sh
```
Sau đó mở trình duyệt và truy cập: `http://localhost:8080`

### 5. Chế độ phát triển (tự động build khi có thay đổi)
```bash
npm run watch
```
### 6. Khi chạy app lên thành công
Ctrl + Shift + P => Search từ khoá AI: Open AI Editor

## Lưu ý
- Đảm bảo đã cài đặt Git và Python 3.8+
- Nếu gặp lỗi build, kiểm tra phiên bản Node.js
