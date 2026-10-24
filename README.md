# Unified Service Scheduler

AutoCare Scenario A — a NestJS/TypeScript backend using the Fastify adapter and Prisma 7 that books a qualified technician and service bay for an entire service interval. PostgreSQL persists appointments and prevents double-booking across application instances. Swagger and a repeatable HTTP demonstration substitute for a frontend.

This is an **unauthenticated assessment demo**, intended for local review. It requires authentication, authorization and operational hardening before public deployment.

## Run with Docker Compose

Requirements: Docker Engine with Compose v2. For host development and tests: Node.js 24 and npm. The lockfile pins dependencies; no external API credentials are needed.

```sh
docker compose up --build -d
# Migrations run automatically before the API starts.
docker compose run --rm migrate node dist/db/cli.js seed
docker compose ps
curl --fail http://localhost:3000/health/ready
```

Open Swagger at `/docs` on port 3000; raw OpenAPI is `/openapi.json`. Database and HTTP ports bind only to loopback. The database uses a named volume; restarting preserves data. The API and migration job share one image, which runs as the unprivileged `node` user. The build keeps dependency-heavy layers few to support the managed cloud Docker vfs driver.

```sh
docker compose logs api
docker compose down             # preserves the database
# Only to deliberately erase local demo data:
# docker compose down -v
```

The database credentials in Compose and `.env.example` are intentionally public local demo credentials. Do not reuse them in production. Schema evolution uses Prisma Migrate with custom SQL for PostgreSQL constraints. Existing known-schema databases are baselined only after legacy checksum/constraint verification; appointments and idempotency data are preserved. Never edit an applied migration: add a new one. See `prisma/README.md` for adoption details. Schema changes and application deployment need coordinated compatibility planning in production. Seed uses transactional Prisma create/upsert operations with fixed demo identifiers and never truncates data. New time-off records use the shared technician lock/recheck protocol. If user bookings occupy a seed interval, the seed correctly fails instead of bypassing consistency constraints.

## Host development

```sh
npm ci
docker compose up -d db
export DATABASE_URL=postgres://scheduler:scheduler@127.0.0.1:5432/scheduler
npm run db:migrate
npm run db:seed
npm run dev
```

The app reads `DATABASE_URL`, `HOST` (default `127.0.0.1`), `PORT` (3000), and `LOG_LEVEL` (info) from its environment. `.env.example` is a reference; the app does not automatically load `.env`. Do not run the host API on port 3000 while the Compose API owns that port. `npm run build && npm start` runs compiled code.

In this managed cloud workspace the home directory is read-only. Use writable caches when needed:

```sh
export XDG_CACHE_HOME=/workspace/.cache
export npm_config_cache=/workspace/.cache/npm
export BUILDX_CONFIG=/workspace/.cache/buildx
```

If a managed or corporate TLS proxy requires a build CA, supply its trusted public certificate through the optional override. TLS verification stays enabled and the certificate is mounted only during dependency installation:

```sh
# In this cloud environment NODE_EXTRA_CA_CERTS points to the injected trust CA.
BUILD_CA_FILE="$NODE_EXTRA_CA_CERTS" docker compose -f compose.yaml -f compose.proxy.yaml build
docker compose up -d --wait
```

For a complete tested cloud refresh, run `sh scripts/cloud-setup.sh`. It handles caches, the optional injected build CA, dependency installation, Docker build/startup, migrations, additive seed, checks and the HTTP demo.

Use the existing `/workspace/car_maintenance_scheduler` checkout. Cloud tasks are already isolated; creating another worktree is unnecessary.

## Verify

```sh
npm run check     # lint, type checking, compiled build, unit + PostgreSQL tests
npm run test:unit # isolated domain tests only
npm test          # requires a working Docker daemon
npm run demo      # requires the seeded running API; uses real HTTP
```

Prisma Client is generated automatically before dev/test/migration/seed npm commands and during build/type checking. Tests launch their own PostgreSQL 17 container through Testcontainers, migrate it and isolate each test with fresh seed data. They never use or truncate your `DATABASE_URL`. Docker must be available, including permission to start the Testcontainers cleanup container. There is no in-memory substitute and no silent integration-test skip. The suite also verifies populated legacy database adoption and shared appointment/time-off locking across two Nest app instances.

The current suite contains **73 tests**: 11 domain tests and 62 PostgreSQL/API tests.

Tests exercise ownership and reference validation, cross-dealership and qualification constraints, full interval overlap, adjacent appointments, midnight rollover, alternatives, exhaustion, accurate availability, persistence, filtering, idempotency and concurrency. Two independent Fastify apps with separate connection pools contend on one database. Explicit SQL transaction tests wait until PostgreSQL reports a lock wait before committing the competing write; they verify exclusion errors and recovery from aborted transactions. A test-only database trigger injects exclusion failures to prove the five-attempt limit and rollback behavior. Time-off races use database insert gates and observed PostgreSQL lock waits to force booking-first, time-off-first and competing-leave orderings. Fault injection verifies failed writes roll back and retries stop at five transactions. These are correctness tests, not load tests or evidence of production throughput.

## Customer journey and API

All IDs are UUIDs. All responses use UTC ISO timestamps. The `date` parameter means a UTC calendar date, independent of the host or dealership timezone. Availability enumerates 48 half-hour **start times**, including slots whose service ends the next day. Appointment creation can use any RFC3339 start time with a timezone and at most millisecond precision. The 30-minute availability grid is a product assumption, not an assessment requirement.

| Method | Route | Purpose |
| --- | --- | --- |
| GET | `/dealerships` | Discover dealerships |
| GET | `/dealerships/:dealershipId/service-types` | Discover offered services and durations |
| GET | `/availability?dealershipId=…&serviceTypeId=…&date=2030-01-15` | Advisory, anonymous resource availability |
| POST | `/appointments` | Allocate resources and confirm atomically |
| GET | `/appointments/:id` | Retrieve appointment with assigned resource IDs |
| GET | `/appointments` | List with optional dealershipId/customerId/date/status/limit/offset |
| GET | `/technicians/:id/time-off` | Administrative list of technician absences |
| POST | `/technicians/:id/time-off` | Administrative creation with conflict checks |
| DELETE | `/technicians/:id/time-off/:timeOffId` | Administrative deletion; returns 204 |
| GET | `/health/live`, `/health/ready` | Process and database/schema readiness |
| GET | `/metrics` | Prometheus latency, outcome, retry, database error counters |

Lists sort by `startTime,id`; default limit is 20, maximum 100, maximum offset 10000. `hasMore` avoids an extra count. The date filter selects appointments **starting** that date. Only `confirmed` status exists; cancellation is outside scope. Availability exposes no appointment/customer identifiers and is advisory; only a committed booking confirms resources.

### Click-ready Swagger demonstration

After seeding, open `/docs`, expand an operation and click **Execute**. Try-it-out mode is enabled and query/path fields and POST bodies are prefilled from the same stable identifiers used by the seed. These are documentation/UI defaults; raw API requests still need their required inputs.

| Operation | Prefilled scenario | Successful result |
| --- | --- | --- |
| Dealership service catalog | North Motors | 200 |
| Availability | North, oil change, 2030-01-15 UTC | 200 with 48 mixed-capacity slots |
| Get appointment | First seeded appointment (`70000000-0000-4000-8000-000000000001`) | 200 |
| List appointments | North, Alice, 2030-01-15, confirmed | 200 with existing records |
| Create appointment | Alice's vehicle, North oil change, 2030-01-16 10:00 UTC | 201 initially; 200 on identical replay |
| List/create time off | Technician 2; new leave on 2030-01-18 13:00–14:00 UTC | GET 200; POST 201 |
| Delete time off | Technician 2's seeded morning absence (`80000000-0000-4000-8000-000000000002`) | 204 |

The booking's prefilled `Idempotency-Key` is `swagger-booking-demo-v1`. Keep it for identical retries; change it when editing the booking body. Repeating the time-off POST returns 409 until you delete that created record using its returned id. The DELETE example removes a seed record; repeating deletion returns 404. Re-run the seed to restore deleted seed records before repeating the original availability demo. Seeding preserves extra appointments/time off, so it does not erase records you created through Swagger.

Example discovery and booking:

```sh
curl --fail http://localhost:3000/dealerships
curl --fail http://localhost:3000/dealerships/10000000-0000-4000-8000-000000000001/service-types
curl --fail 'http://localhost:3000/availability?dealershipId=10000000-0000-4000-8000-000000000001&serviceTypeId=40000000-0000-4000-8000-000000000001&date=2030-01-15'
curl -i http://localhost:3000/appointments \
  -H 'Content-Type: application/json' \
  -H 'Idempotency-Key: reviewer-oil-v1' \
  -d '{"customerId":"20000000-0000-4000-8000-000000000001","vehicleId":"30000000-0000-4000-8000-000000000001","dealershipId":"10000000-0000-4000-8000-000000000001","serviceTypeId":"40000000-0000-4000-8000-000000000001","startTime":"2030-01-15T09:30:00Z"}'
```

`npm run demo` checks a complete real HTTP journey and can be repeated without adding appointments. It uses a different slot from this cURL example. To exercise it against another server, set `API_URL`.

### Idempotency and errors

An optional `Idempotency-Key` contains 1–128 letters, digits, `.`, `_`, `:`, or `-`. Use one for all client retries of a booking. The first successful request returns `201` with `Location`. The same key and normalized payload return the stored appointment with `200` and `Idempotency-Replayed: true`. Equivalent timezone offsets, UUID case and property ordering normalize to the same fingerprint. Changed payloads return `409 IDEMPOTENCY_KEY_REUSED`.

Keys and results persist together, across restarts. Failed bookings do not reserve the key. Keys are globally scoped and retained indefinitely for this demo; production needs authenticated customer/tenant scoping and a retention policy. Requests without keys are independent requests and may produce distinct appointments when capacity remains.

| Status | Examples |
| --- | --- |
| 400 | Invalid UUID, timestamp, date, body, pagination, key or unknown input field |
| 404 | Unknown customer, vehicle, dealership, offered service or appointment |
| 422 | Vehicle belongs to another customer |
| 409 | No currently allocatable pair, allocation contention, key reused or reference changed |
| 503 | Database unavailable or timed out |
| 500 | Unexpected internal failure, logged without SQL/customer details |

Errors have `{ "error": { "code": "NO_CAPACITY", "message": "…", "requestId": "…" } }`. Every response includes `X-Request-Id`. On transient allocation conflict, refresh availability and retry with the same key, using client backoff. No request is promised success just because availability was previously true.

## Seed scenarios

Demo date: **2030-01-15 UTC**, intentionally fixed; past bookings remain allowed for repeatability. Two dealerships, three services (30/60/90 minutes), five technicians with differing skills, three bays, two customers, ten appointments, and two time-off intervals on 2030-01-17.

North Motors ends in `…0001`; South Motors ends in `…0002`. Alice/customer `200…001` owns vehicle `300…001`; Bob/customer `200…002` owns `300…002`. Exact full identifiers appear above and in `src/db/seed.ts`.

| North Motors oil start | Expected availability | Reason |
| --- | --- | --- |
| 09:00 | unavailable | Both oil-qualified technicians and both bays occupied |
| 09:30 | available | Both 09:00 oil appointments end at this boundary |
| 10:00 | available | One technician/bay occupied until 11:00, another pair free |
| 10:30 | unavailable | Both bays and oil-qualified technicians occupied |
| 11:00 | unavailable | Major and tyre services occupy both bays |

For North's 60-minute tyre service, 08:30 is unavailable because its interval overlaps the 09:00 bookings. South has one bay; a free technician alone cannot make a slot available.

## Technician time off

These are **administrative operations**. Authentication/authorization are outside this local demo; production must restrict these endpoints. The body uses timezone-qualified `startsAt` and `endsAt`, plus optional/null `reason` (up to 500 characters). Intervals are half-open. Invalid/reversed intervals return 400, unknown entities 404, appointment/leave conflicts 409; creation returns 201 and deletion 204. The list is chronological. Time-off creation does not support booking idempotency keys.

```sh
# List the full-day demo absence for Technician 1.
curl --fail http://localhost:3000/technicians/50000000-0000-4000-8000-000000000001/time-off
# Create a new absence for South's oil-qualified technician.
curl -i http://localhost:3000/technicians/50000000-0000-4000-8000-000000000004/time-off \
  -H 'Content-Type: application/json' \
  -d '{"startsAt":"2030-01-18T09:00:00Z","endsAt":"2030-01-18T10:00:00Z","reason":"Training"}'
# Delete using the returned id:
# curl -i -X DELETE http://localhost:3000/technicians/50000000-0000-4000-8000-000000000004/time-off/<returned-id>
```

New seed scenarios on **2030-01-17 UTC**: North Technician 1 is absent for the full day; Technician 2 is absent 09:00–12:00. North oil service at 08:00 remains available through Technician 2, 09:00 is unavailable, and 12:00 becomes available again. The original 2030-01-15 scenarios are unchanged. Existing January 15 confirmed appointments do not conflict with the new absences.

A technician must be qualified and free of both appointments and time off for the entire interval. Another qualified technician can preserve availability. Booking and time-off creation acquire the same technician row lock and recheck both tables after acquiring it; the separate GiST exclusions alone cannot prevent cross-table conflicts. All application/seed writers follow this protocol. Arbitrary direct SQL writers must also follow it; production should enforce access boundaries or add database triggers if additional writers are introduced.

`npm run demo` verifies the original journey plus the seeded leave scenarios, creates a temporary absence, observes unavailable capacity and a rejected booking, deletes the absence and verifies restored availability. It cleans up the temporary absence so it can be repeated.

## AI Collaboration Narrative

The human selected Scenario A and the backend scope, provided the assessment and detailed acceptance criteria, and initially authorized independent implementation. The agent recorded assumptions and implemented/tested the original Fastify/pg service. Its 48-test verification record is retained in `docs/verification.md` as historical evidence.

The human later requested NestJS, Prisma and technician time off, including a shared PostgreSQL locking protocol. The agent inspected the existing implementation and proposed a two-phase plan. The human explicitly authorized autonomous technical decisions and commits without intermediate approval; final human review remains pending. The agent verified the NestJS/Prisma refactor before starting time off: original tests, a populated database upgrade test, Docker startup, the HTTP demo and comparisons against six original API responses. The extension adds real PostgreSQL cross-table race, interval, deletion, integrity, rollback and bounded-retry tests.

Corrections actually made include Prisma's void-returning advisory-lock decoding, OpenAPI translation of TypeBox schemas, OpenSSL inclusion in the container, and adapting a readiness fixture because Prisma qualifies schema names. Official engine downloads used verified artifacts through the supported execution path; TLS/checksum checks were never disabled. Details and final results are in `docs/refactor-verification.md`.

AI-generated work was checked through static analysis, real PostgreSQL tests and real HTTP demonstrations. No human design/code review, personal test execution or production verification is claimed. The human owns final review, submission and the actual video; the agent's checks provide evidence for that review.

## Further documentation

- [System design and trade-offs](docs/system-design.md)
- [Implementation plan and assessment acceptance contract](docs/implementation-plan.md)
- [Current refactor/time-off verification](docs/refactor-verification.md)
- [Original implementation verification](docs/verification.md)
- [Prisma schema and migration lifecycle](prisma/README.md)
- [5–10 minute video outline](docs/video-walkthrough.md)
