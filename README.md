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

## Run it (Windows PowerShell)
You need Node.js 18+ and MongoDB running locally (or a MongoDB Atlas connection string).

```powershell
cd server
Copy-Item .env.example .env
notepad .env                     # set JWT_SECRET and SETTINGS_ENCRYPTION_KEY to long random strings
npm install
npm run dev                      # http://localhost:5000/api/health
```

In a second window:

```powershell
cd client
npm install
npm run dev                      # http://localhost:5173
```

Open http://localhost:5173/register and create your first business. Nothing needs to be seeded.

Generate a random secret with:
```powershell
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

## Check the isolation yourself
1. Register two businesses, for example "Alpha Agrovet" and "Beta Agrovet".
2. Add different products in each.
3. Open MongoDB Compass: you will see `farmlink_platform`, `fl_alpha_agrovet` and `fl_beta_agrovet`.
4. Sign in as each business: the product lists, customers, sales and reports are completely separate.

## Platform owner tools
```powershell
cd server
npm run businesses -- list
npm run businesses -- suspend alpha-agrovet
npm run businesses -- activate alpha-agrovet
```
A suspended business cannot sign in and its existing sessions stop working within 30 seconds.

## M-Pesa (per business)
See `server/MPESA_SETUP.md`.
