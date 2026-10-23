# Unified Service Scheduler

Keyloop Scenario A — a Fastify/TypeScript backend that books a qualified technician and service bay for an entire service interval. PostgreSQL persists appointments and prevents double-booking across application instances. Swagger and a repeatable HTTP demonstration substitute for a frontend.

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

Open Swagger at `/docs` on port 3000; raw OpenAPI is `/openapi.json`. Database and HTTP ports bind only to loopback. The database uses a named volume; restarting preserves data. The image runs as the unprivileged `node` user.

```sh
docker compose logs api
docker compose down             # preserves the database
# Only to deliberately erase local demo data:
# docker compose down -v
```

The database credentials in Compose and `.env.example` are intentionally public local demo credentials. Do not reuse them in production. Migrations are explicit and checksummed; concurrent runners serialize through a database transaction lock. Never edit an applied migration: add a new one. Schema changes and application deployment need coordinated compatibility planning in production. Seed is transactional and additive: it adds fixed demo identifiers with `ON CONFLICT DO NOTHING`, never truncates data. If user bookings occupy a seed interval, the seed correctly fails instead of bypassing consistency constraints.

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

Tests launch their own PostgreSQL 17 container through Testcontainers, migrate it and isolate each test with fresh seed data. They never use or truncate your `DATABASE_URL`. Docker must be available, including permission to start the Testcontainers cleanup container. There is no in-memory substitute and no silent integration-test skip.

Tests exercise ownership and reference validation, cross-dealership and qualification constraints, full interval overlap, adjacent appointments, midnight rollover, alternatives, exhaustion, accurate availability, persistence, filtering, idempotency and concurrency. Two independent Fastify apps with separate connection pools contend on one database. Explicit SQL transaction tests wait until PostgreSQL reports a lock wait before committing the competing write; they verify exclusion errors and recovery from aborted transactions. A test-only database trigger injects exclusion failures to prove the five-attempt limit and rollback behavior. These are correctness tests, not load tests or evidence of production throughput.

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
| GET | `/health/live`, `/health/ready` | Process and database/schema readiness |
| GET | `/metrics` | Prometheus latency, outcome, retry, database error counters |

Lists sort by `startTime,id`; default limit is 20, maximum 100, maximum offset 10000. `hasMore` avoids an extra count. The date filter selects appointments **starting** that date. Only `confirmed` status exists; cancellation is outside scope. Availability exposes no appointment/customer identifiers and is advisory; only a committed booking confirms resources.

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

Demo date: **2030-01-15 UTC**, intentionally fixed; past bookings remain allowed for repeatability. Two dealerships, three services (30/60/90 minutes), five technicians with differing skills, three bays, two customers and ten appointments.

North Motors ends in `…0001`; South Motors ends in `…0002`. Alice/customer `200…001` owns vehicle `300…001`; Bob/customer `200…002` owns `300…002`. Exact full identifiers appear above and in `src/db/seed.ts`.

| North Motors oil start | Expected availability | Reason |
| --- | --- | --- |
| 09:00 | unavailable | Both oil-qualified technicians and both bays occupied |
| 09:30 | available | Both 09:00 oil appointments end at this boundary |
| 10:00 | available | One technician/bay occupied until 11:00, another pair free |
| 10:30 | unavailable | Both bays and oil-qualified technicians occupied |
| 11:00 | unavailable | Major and tyre services occupy both bays |

For North's 60-minute tyre service, 08:30 is unavailable because its interval overlaps the 09:00 bookings. South has one bay; a free technician alone cannot make a slot available.

## AI Collaboration Narrative

The human selected Scenario A, the backend scope and preferred stack, supplied the assessment and detailed acceptance/testing requirements, and explicitly asked the agent to iterate independently. The agent read both documents, recorded a plan and assumptions before coding, then implemented the service, SQL constraints, tests and documentation. The direct request superseded the attachment's review pauses; no human design approval, code review, or test execution is claimed.

Verification used actual PostgreSQL through Testcontainers and actual HTTP through Docker Compose. Static checking caught an unsupported per-query timeout configuration; it was replaced by bounded connection/query/statement timeouts in the database pool. The initial 45-test suite had an intermittent single-resource contention failure, despite passing in isolation. Allocation was refined to acquire resource row locks with `SKIP LOCKED`, plus transactional key claims for reliable idempotent replays. Exclusion constraints remain the final consistency safeguard. Regression tests verify the revised behavior, including two app instances and explicit overlapping SQL writes. The final verification record is in `docs/verification.md`.

Generated code was validated and corrected through executable checks; it was not treated as automatically correct. The human still owns final review, approval, submission and any production decisions. After implementation and verification, the human explicitly requested publication to GitHub, authorizing focused milestone commits and the initial push. No human verification activities are invented. Before submitting, review the transaction strategy and security assumptions, run the documented demo and tests yourself, and record your own findings for the video.

## Further documentation

- [System design and trade-offs](docs/system-design.md)
- [Implementation plan and assessment acceptance contract](docs/implementation-plan.md)
- [Verification record](docs/verification.md)
- [5–10 minute video outline](docs/video-walkthrough.md)
