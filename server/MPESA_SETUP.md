# M-Pesa Express (STK Push) in FarmLink Cloud

M-Pesa details are saved **per business**, inside the app: sign in as the business administrator and open **Settings, M-Pesa payment requests**. Customers pay into that business's own Paybill or Till. If a business leaves this blank, its cashiers simply type M-Pesa codes.

## 1. What each business needs from Safaricom
1. A Daraja app at https://developer.safaricom.co.ke with **M-Pesa Express** enabled.
2. The app's **Consumer key** and **Consumer secret**.
3. The **shortcode** (Paybill number, or store number for a Till) and the **passkey**.
4. For a Till (Buy Goods): choose "Till" in Settings and enter the Till number too.

For testing, use the **Sandbox** environment. Sandbox shortcode `174379` and its passkey are on the portal's M-Pesa Express page. No real money moves in the sandbox.

Going live is a separate approval by Safaricom for each business's own Paybill or Till. Production credentials are then entered in the same Settings page, with Environment set to Production.

## 2. Where Safaricom sends the result (the server owner does this once)
Safaricom must be able to reach your server, and one address serves all businesses:
- Locally, run a tunnel such as `ngrok http 5000` and put the https address in `MPESA_CALLBACK_BASE_URL` in `server/.env`, then restart the server.
- In production, use your server's permanent HTTPS address.
- Each business gets its own secret inside the callback address, so one business cannot fake another business's payment.
- If `MPESA_CALLBACK_BASE_URL` is blank, payments are still confirmed by asking Safaricom directly. The M-Pesa receipt number only arrives with the callback, so the sale then stores a reference starting with `STK-`.

## 3. How secrets are protected
- The consumer secret and passkey are encrypted (AES-256-GCM) with `SETTINGS_ENCRYPTION_KEY` before they are saved, and the Settings page never shows them again.
- Do not lose or change `SETTINGS_ENCRYPTION_KEY`: saved secrets could no longer be read, and each business would have to enter them again.
- Never commit `.env`.
