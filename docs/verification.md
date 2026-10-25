# Testing

## Run all tests

Use Node.js 24 and a running Docker daemon:

```sh
npm run setup:local
npm test
```

`npm test` runs both suites: **11 unit tests and 62 PostgreSQL/API integration tests**. Tests start their own database containers, apply migrations and seed the data. You do not need the Compose app running or a `DATABASE_URL`. Your demo database is left alone.

Run these commands in your local terminal, with Docker Desktop running for integration tests. The first run may take longer while PostgreSQL is downloaded.

| Command | What it runs | Needs Docker? |
| --- | --- | --- |
| `npm run test:unit` | Domain unit tests | No |
| `npm run test:integration` | API, database, concurrency and time-off tests | Yes |
| `npm test` | Both suites | Yes |
| `npm run check` | Lint, type checking, build and both suites | Yes |

If tests cannot find Docker, start Docker Desktop and check that `docker info` succeeds in the same terminal. Run integration tests from the host, not the Dev Container.

To check the running, seeded app over HTTP, run `npm run demo`. This is separate from the test suite. It reuses its booking key and removes the temporary absence it creates, so it can be repeated.

## Coverage

| Test file | What it checks |
| --- | --- |
| [domain.test.ts](../tests/unit/domain.test.ts) | Time overlap, service duration and booking normalization |
| [integration.test.ts](../tests/integration/integration.test.ts) | API validation, ownership, availability, booking, idempotency, database constraints, concurrent requests, migrations and Swagger examples |
| [time-off.test.ts](../tests/integration/time-off.test.ts) | Absences, restored capacity, booking/time-off races, seed conflicts, rollback and retry limits |

Concurrency tests run two app instances against the same database and deliberately coordinate competing transactions. They check that no conflicting bookings or absences are saved.

## Latest completed checks

The current app passed **73 tests**: 11 domain tests and 62 PostgreSQL/API tests. Lint, type checking, compilation, the Docker build/startup and the HTTP demo also passed in the cloud workspace.

Local dependency setup and the development container also passed checks on Linux. Load testing and production deployment are outside these checks.
