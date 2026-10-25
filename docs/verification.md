# Testing

## Run the checks

Use Node.js 24 and a running Docker daemon:

```sh
npm run setup:local
npm run check
```

`check` runs lint, type checking, the build and tests. Integration tests use a separate PostgreSQL container; they do not clear or change your demo database.

For a quick domain check, run `npm run test:unit`. To check the running, seeded app over HTTP, run `npm run demo`. The demo reuses its booking key and removes the temporary absence it creates, so it can be repeated.

## Coverage

| Test file | What it checks |
| --- | --- |
| [domain.test.ts](../test/domain.test.ts) | Time overlap, service duration and booking normalization |
| [integration.test.ts](../test/integration.test.ts) | API validation, ownership, availability, booking, idempotency, database constraints, concurrent requests, migrations and Swagger examples |
| [time-off.test.ts](../test/time-off.test.ts) | Absences, restored capacity, booking/time-off races, seed conflicts, rollback and retry limits |

Concurrency tests run two app instances against the same database and deliberately coordinate competing transactions. They check that no conflicting bookings or absences are saved.

## Latest completed checks

The current app passed **73 tests**: 11 domain tests and 62 PostgreSQL/API tests. Lint, type checking, compilation, the Docker build/startup and the HTTP demo also passed in the cloud workspace.

Local dependency setup and the development container also passed checks on Linux. Load testing and production deployment are outside these checks.
