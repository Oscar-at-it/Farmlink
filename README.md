# FarmLink Cloud

Multi-business (SaaS) version of FarmLink. Any agrovet can register with its business name and gets **its own private MongoDB database**. Products, sales, customers, users and settings of one business can never be seen by another.

```
farmlink-cloud/
  server/   Node.js + Express + Mongoose API
  client/   React + Vite web app (installable PWA)
```

## How the businesses are kept apart
- A small **platform database** (`farmlink_platform`) only lists the registered businesses.
- Each business has **its own database**, named from its business code, for example `fl_mama_njeri_agrovet`.
- The sign-in token carries the business. Every request then runs inside that business's context, so every query goes to that business's database and to no other. There is no `businessId` filter that could be forgotten.
- Business codes, usernames and passwords: a staff member signs in with **business code + username + password**. Usernames only need to be unique inside one business.
- M-Pesa credentials are saved **per business** (encrypted), because each agrovet receives money into its own Paybill or Till.
