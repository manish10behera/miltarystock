# Fieldstock

Fieldstock is a responsive asset-management starter for multi-base logistics. It includes a React operations console, an Express/Mongoose REST API, JWT authentication, base-scoped role checks, movement history, and an audit ledger.

## Run locally

Requirements: Node.js 20.19+ and MongoDB 7+.

1. Start MongoDB in one terminal:

   ```sh
   mongod --dbpath /tmp/fieldstock-db --bind_ip 127.0.0.1
   ```

2. Copy `server/.env.example` to `server/.env`. Set `MONGODB_URI` to `mongodb://127.0.0.1:27017/fieldstock` and replace `JWT_SECRET` with a long random value.
3. Install dependencies and load the demo database:

   ```sh
   npm install
   npm run seed -w server
   ```

   Seeding replaces collections in the configured Fieldstock database. Use a disposable local database for demos.
4. Start the API and frontend:

   ```sh
   npm run dev
   ```

   Open <http://localhost:5173>. The API listens at <http://localhost:4000/api>.

All demo users use `DemoPass!26` by default. Emails, setup steps, the API reference, and known limitations are in [the project guide](docs/PROJECT_GUIDE.md).

## Project files

- `client/` React, Vite, Tailwind integration, and responsive UI.
- `server/` Express API, Mongoose models, RBAC middleware, and demo seeder.
- `database-dump/` portable BSON export of the seeded sample database.
- `docs/PROJECT_GUIDE.md` architecture, schema, RBAC, endpoints, assumptions, and deployment instructions.
- `docs/VIDEO_WALKTHROUGH.md` timed recording outline.

Demo credentials are for local evaluation only. Rotate all credentials and secrets before deployment.