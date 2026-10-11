# FarmLink Cloud API

See the README in the project root for setup. Main routes:

| Area | Routes |
|---|---|
| Public | `POST /api/auth/register-business`, `POST /api/auth/login`, `GET /api/auth/business-code`, `POST /api/mpesa/callback/:businessId/:secret` (Safaricom) |
| Business | `GET /api/business`, `PATCH /api/business` (admin) |
| Settings (admin) | `GET, PUT, DELETE /api/settings/mpesa` |
| Everything else | same as FarmLink: products, categories, stock, customers, sales, dashboard, audit, mpesa, auth/users |

All routes except the public ones need `Authorization: Bearer <token>`. The token identifies both the user and the business.
