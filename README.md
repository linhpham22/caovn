# Thực Đơn Cao Lớn – T11/2026

App web thực đơn 30 ngày tăng chiều cao + sổ tay theo dõi.

Trang: https://caovn.linhizi.com

## Sổ tay gia đình (đồng bộ)

- `index.html` — app (GitHub Pages, workflow `pages.yml`)
- `api/` — Cloudflare Worker + D1 lưu dữ liệu theo mã gia đình, tên miền `caovn-api.linhizi.com` (workflow `api.yml`)
- Repo secrets cần có: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`
