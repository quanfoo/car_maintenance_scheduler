# AutoCare Service Scheduler

A NestJS backend for booking vehicle services. Each appointment reserves a qualified technician and a service bay for the full service duration. Technician time off also affects availability.

We use TypeScript, Prisma 7 and PostgreSQL 17. Swagger provides an interactive demo. This is a local demo with no login or access controls.

## Start the app

Install Docker Desktop (or Docker Engine with Compose v2), then run from the project folder:

```sh
docker compose up -d --build --wait
docker compose run --rm migrate node dist/db/cli.js seed
```

Open **[Swagger](http://localhost:3000/docs)**. The database setup runs before the API starts. Swagger updates automatically when the app starts; rebuild after pulling code changes.

The seed adds two dealerships, three services, five technicians, three bays, ten appointments and two absences. Demo dates are fixed in **January 2030, in UTC**.

```sh
docker compose logs api  # view application logs
docker compose down      # stop; keep database data
```

Seeding restores missing demo records and keeps records you added. It does not reset the database. Compose credentials are for local use only.

## Update locally

From the project folder, pull the latest code and rebuild the app:

```sh
git pull origin main
docker compose up -d --build --wait
```

Refresh Swagger after the app is ready. Your existing database data is preserved.

## Try the demo

Swagger fields are prefilled with seed data. Expand an endpoint and click **Execute**.

1. List dealerships and services.
2. Check North Motors oil-change availability on **2030-01-15**: 09:00 is busy, 09:30 is free.
3. Create the prefilled appointment on **2030-01-16 at 10:00 UTC**. It returns **201**. Repeat it to get the same appointment with **200**.
4. Check availability on **2030-01-17** to see how time off reduces capacity.

Keep the booking's `Idempotency-Key` for retries. Reusing it with a changed body returns **409**. Time-off creation returns **201**, then **409** if repeated. Deletion returns **204**, then **404** if repeated.

For a repeatable scripted demo, install the local tools below, then run `npm run demo` against the running app. For recording, follow the [video walkthrough](docs/video-walkthrough.md).

## Set up your local editor

Install **Node.js 24** and run this on the same machine as your editor:

```sh
npm run setup:local
```

This installs dependencies and generates Prisma types. It does **not** start Docker. Container dependencies are separate from the files your local editor uses.

If VS Code still underlines Prisma imports:

1. Run `npm run prisma:generate`. It should create `src/generated/prisma/client.ts`.
2. In the Command Palette, select **TypeScript: Select TypeScript Version → Use Workspace Version**.
3. Run **TypeScript: Restart TS Server**.

The `.js` suffixes in TypeScript imports are intentional. Generated files stay out of Git.

For an editor inside Docker, install VS Code's **Dev Containers** extension, stop the normal app with `docker compose down`, then choose **Dev Containers: Reopen in Container**. Setup creates a separate development database. Run `npm run dev` inside the container and open forwarded port 3000. Run the full test suite from your host machine; the Dev Container has no Docker socket.

## Develop without the API container

After local editor setup, stop the Compose app to free port 3000, then run:

```sh
docker compose down
docker compose up -d --wait db
export DATABASE_URL=postgres://scheduler:scheduler@127.0.0.1:5432/scheduler
npm run db:migrate
npm run db:seed
npm run dev
```

The app reads `DATABASE_URL`, `HOST`, `PORT` and `LOG_LEVEL`. `.env.example` is a reference; `.env` is not loaded automatically.

For the managed cloud workspace, [scripts/cloud-setup.sh](scripts/cloud-setup.sh) handles setup and checks, including writable caches and optional proxy certificate trust.

## Check the app

Use Node.js 24 and start Docker Desktop, then run from the project folder:

```sh
npm run setup:local
npm test                  # all unit and PostgreSQL integration tests
```

Unit tests live in `tests/unit`; PostgreSQL/API tests live in `tests/integration`. To run a specific suite or the wider checks:

```sh
npm run test:unit         # unit tests; no Docker needed
npm run test:integration  # API, database and concurrency tests; requires Docker
npm run check             # lint, types, build and all tests
npm run demo              # HTTP demo; requires the seeded app running on port 3000
```

Integration tests start and seed their own PostgreSQL containers. You do not need to start the Compose app or set `DATABASE_URL`. They leave your demo data alone. See [testing](docs/verification.md) for coverage.

## How booking stays safe

PostgreSQL exclusion constraints prevent overlapping appointments for a technician or bay. Booking and time-off changes also lock the same technician row and recheck the schedule before saving. This prevents a booking from racing with a new absence. See the [system design](docs/system-design.md) for the short explanation.

## AI Collaboration Narrative

We set the backend scope, scheduling rules and NestJS/Prisma stack, then asked AI to implement and test the app. The main direction was to keep one application and make PostgreSQL responsible for booking consistency.

Verification focused on failure cases as well as successful bookings: overlapping requests, missing resources, safe retries and bookings racing with time off. AI ran lint, type checks, the build, real PostgreSQL tests and the HTTP demo in the cloud workspace. The [testing notes](docs/verification.md) record the results.

One refinement came from checking reseeding: restoring a deleted demo appointment could conflict with new time off. Seed writes now use the same technician lock and schedule checks as booking, with a regression test for that case.

These automated results support review. Local testing, final acceptance and the video recording remain with the project owner.

## More information

- [Video walkthrough](docs/video-walkthrough.md)
- [System design](docs/system-design.md)
- [Prisma and migrations](prisma/README.md)
