# MenuQR

MenuQR stores restaurant accounts and menus in MongoDB, so one restaurant's QR menu works on every device.

## Hosted configuration

Set these environment variables on the API service:

- `MONGODB_URI` — MongoDB Atlas connection string for the `menuqr` database.
- `JWT_SECRET` — a long, random secret used to sign owner sessions.

Restaurant owner passwords are never stored as plaintext. The API stores a bcrypt password hash with the owner's email and restaurant ID; the browser only retains the short-lived JWT session token after sign-in.

A multi-restaurant, QR-based digital menu application. Guests scan a table QR code and browse a restaurant-specific menu without sign-in, ordering, payments, carts, or delivery tracking.

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:5173/r/spice-garden`. The Express API runs on port 4000. It operates with its included seed data by default; optionally configure `MONGODB_URI` and `JWT_SECRET` in `server/.env` for MongoDB persistence.

Default administrator: `admin@menuqr.local` / `MenuQR123!`
