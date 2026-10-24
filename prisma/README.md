# Prisma schema and database lifecycle

Prisma 7 generates a TypeScript client into `src/generated/prisma` (ignored in Git). The PostgreSQL driver adapter supplies the connection pool. `PrismaService` connects/disconnects with Nest's module lifecycle. Prisma CLI is included in runtime dependencies because the small assessment image also runs migrations; larger deployments should use a separate migration job/image and runtime database role.

`schema.prisma` maps model/field names to the existing snake_case tables/columns. Composite relations preserve vehicle ownership, dealership/resource membership, technician qualifications, offerings and fixed service duration. Status remains PostgreSQL text constrained to `confirmed`, preserving the old database/API contract rather than changing to a new enum.

## Constraints owned by SQL

Prisma schema declarations do not express these PostgreSQL features; retain them in custom migrations:

- `btree_gist` extension.
- Technician and service-bay half-open appointment exclusion constraints.
- Technician time-off half-open exclusion and valid-interval check.
- Duration bounds and exact appointment end calculation.
- Confirmed-only status and paired idempotency key/fingerprint checks.

Cross-table appointment/time-off conflicts are protected by the shared technician row-lock protocol in application services and seed writes. The independent exclusions do **not** enforce that cross-table rule for arbitrary SQL writers. Direct writers must follow the protocol or require a future database trigger/privilege boundary.

## Fresh database

```sh
export DATABASE_URL=postgres://scheduler:scheduler@127.0.0.1:5432/scheduler
npm run db:migrate
npm run db:seed
```

The wrapper invokes Prisma Migrate deploy. The baseline creates the original tables and retains their legacy checksum records; the next migration adds time off. Prisma adds its own `_prisma_migrations` metadata. There are now 13 tables: ten original application tables, technician_time_off, the retained schema_migrations ledger, and Prisma's ledger.

## Existing database adoption

Use `npm run db:migrate` (or Compose's compiled migration command), not an unprepared direct deploy into an unbaselined database. Before marking the baseline applied, the wrapper checks the original SQL checksums and presence of the critical resource exclusions. It retains all tables, rows and original migration history. Prisma then applies only new migrations. Run initial adoption as a single migration job; Prisma manages locking for subsequent migration deployment. This is a controlled adoption of the known previous application schema, not a general schema-drift repair tool. Unexpected legacy state requires investigation; never force baseline resolution to hide a mismatch.

The integration suite creates a populated legacy database with the original migrator/seed, adds a keyed appointment, adopts it, deploys again, and compares every appointment field and idempotency data. Legacy helpers remain solely for that compatibility test; they are not the runtime migration/seed path.

## Future changes

Generate a draft migration against a disposable development database, inspect its SQL and preserve all custom constraints before applying it. Do not use `prisma db push`, reset a populated database, or edit applied migrations. Keep both original `migrations/` SQL files immutable. Prisma's normal migration history records new migrations; `schema_migrations` is retained legacy evidence only.

`npm run prisma:generate` regenerates types without changing the database. Build/typecheck/dev/test/migration/seed npm commands generate the client as needed. Docker explicitly generates and compiles the client during the build. CLI generation/migration needs the official engine host `binaries.prisma.sh` and certificate trust; never disable TLS or checksum verification.
