# Local administrator setup

1. Register a normal account in the website.
2. Stop the server.
3. Open `data/samgro-binary.sqlite` using a SQLite database viewer.
4. Run: `UPDATE users SET role = 'admin' WHERE email = 'your-email@example.com';`
5. Restart the server.
6. Sign in, then visit `/api/admin/summary` to retrieve the basic admin user summary.

Do not expose direct database access or this manual role-edit process on a public production server. A production admin console needs audited, restricted role management and MFA.
