# HemayatVam
پلتفرم فول‌استک سرمایه‌گذاری و وام‌دهی P2P با تمرکز بر بازار ایران.

## ساختار پروژه
```text
HemayatVam/
├── server/        # Node.js + Express + MongoDB
├── client/        # React + Vite + Tailwind RTL
├── infra/         # Nginx/Prometheus/Grafana provisioning
├── scripts/       # backup/deploy scripts
├── docs/          # legal/load/owasp/launch checklists
└── cypress/       # E2E specs
```

## اجرای محلی
```bash
cp .env.example .env
cd server && npm i
cd ../client && npm i
```

### Start backend
```bash
cd server
npm run dev
```

### Start frontend
```bash
cd client
npm run dev
```

## اجرای Docker
```bash
docker compose up --build
```


## نصب یک‌کلیکی روی ویندوز
1. روی فایل `Install-HemayatVam-Windows.bat` دوبار کلیک کنید.
2. اسکریپت به‌صورت خودکار:
   - Docker Desktop را (در صورت نیاز) با `winget` نصب می‌کند.
   - Docker Desktop را اجرا و آماده‌شدن آن را بررسی می‌کند.
   - فایل `.env` را از `.env.example` می‌سازد (اگر موجود نباشد).
   - سرویس‌ها را با `docker compose up -d --build` بالا می‌آورد.

> پیش‌نیاز: اجرای PowerShell در سیستم فعال باشد و کاربر دسترسی نصب نرم‌افزار داشته باشد.
> در صورت نیاز می‌توانید اسکریپت را مستقیم اجرا کنید:
```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\windows\install-hemayatvam.ps1
```
