# saMGRO Binary v2 — multi-user Forex demo platform

## Included in this phase
- Individual registration and sign-in for multiple traders
- Passwords hashed with bcrypt (never stored as plain text)
- Each new trader receives a separate $10,000 virtual demo balance
- Server-side SQLite database for users, accounts, sessions and trades
- Each trader can access only their own account and trade history
- Demo buy/sell positions can be opened and closed through authenticated API routes
- Login/register rate limiting, secure HTTP headers and HTTP-only session cookies
- Basic administrator summary endpoint

## Run locally
1. Install Node.js 20 or later.
2. Extract this ZIP and open a terminal in the extracted `saMGRO-Binary` folder.
3. Run `npm install`.
4. Copy `.env.example` to `.env`.
5. Set `SESSION_SECRET` to a random secret of at least 32 characters.
6. Run `npm start`.
7. Open `http://localhost:3000` and create an account.

New accounts are assigned $10,000 virtual funds. Registration requires a name, valid email and password of at least 10 characters.

## Deploy on Render (demo deployment)

Create a **Web Service** from this repository with runtime **Node**, build command `npm install`, and start command `npm start`. Add these environment variables:

- `NODE_ENV=production`
- `SESSION_SECRET` = a long, random secret of at least 32 characters
- `DATA_DIR=/var/data`

Attach a persistent disk to the service at mount path `/var/data` before allowing users to create accounts. The app stores both the SQLite database and session database in `DATA_DIR`; without a persistent disk, user accounts, trades and sessions can be lost when the service restarts or redeploys. Keep one service instance when using SQLite; do not scale this SQLite setup horizontally. Configure the Render health check path as `/healthz`.

This is still a demo deployment, not a production-ready real-money trading service. Review the security and operational requirements below before inviting public users.

## Administrator access (local development only)
1. Register your own account.
2. Stop the server and open `data/samgro-binary.sqlite` with a SQLite database viewer.
3. Run `UPDATE users SET role = 'admin' WHERE email = 'your-email@example.com';`.
4. Restart the server and sign in. The restricted summary endpoint is `GET /api/admin/summary`.

Do not expose database editing or this manual role assignment process on a public server. A production admin console needs audited role management and MFA.

## What is not live
- Quotes are illustrative demo values, not live market prices.
- Trades are virtual records; no order is sent to a broker.
- Deposits, withdrawals, custody and real-money execution are not implemented.
- The prototype's P/L model is simplified and is not a broker-grade margin, spread, swap, financing or execution model.

## Before public/production launch
Use a managed PostgreSQL database and durable session store; enable HTTPS; set a strong production `SESSION_SECRET`; add CSRF protection, email verification, password reset, MFA, account recovery, audit logs, monitoring, backups, security testing and operational support. Complete legal and regulatory review for the countries served. Real trading requires an appropriately authorized broker and a secure server-side API integration. Do not place broker credentials or API secrets in frontend JavaScript.

saMGRO Binary is an educational software prototype, not investment advice or a solicitation to trade.