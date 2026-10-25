# Prisma and database changes

[schema.prisma](schema.prisma) defines the models. Prisma generates the TypeScript client into `src/generated/prisma`, which is excluded from Git.

## Generate editor types

```sh
npm run prisma:generate
```

This creates local code without changing the database. `npm run setup:local` installs dependencies and runs generation too. Docker builds generate a separate copy inside the image.

## Apply migrations and seed data

For a local database started with `docker compose up -d --wait db`:

```sh
export DATABASE_URL=postgres://scheduler:scheduler@127.0.0.1:5432/scheduler
npm run db:migrate
npm run db:seed
```

Compose runs migrations automatically before the API starts. Use the seed command in the [main README](../README.md) when running the whole app in Docker.

The migration wrapper also supports databases from the earlier schema: it verifies migration checksums and key constraints before applying new changes, keeping existing appointments and booking keys. Use `npm run db:migrate` for this path rather than running Prisma deploy directly.

## Keep database constraints

Prisma cannot describe all our PostgreSQL rules. SQL migrations also contain:

- Exclusion constraints preventing overlapping technician bookings, bay bookings and technician absences.
- Checks for valid time ranges, service duration and booking-key fields.
- The `btree_gist` extension used by the exclusion constraints.

Booking and time off additionally share a technician row lock and schedule recheck. See [system design](../docs/system-design.md).

For schema changes, create and review a new migration on a disposable development database. Keep the custom constraints. Do not edit applied migrations or use `prisma db push` on this database. The original SQL in `migrations/` is retained for migration checks and compatibility tests.
