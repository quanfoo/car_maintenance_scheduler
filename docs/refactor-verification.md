# NestJS/Prisma and time-off verification

## Authorization and scope

The human requested a NestJS/Prisma refactor followed by technician time off, then explicitly authorized autonomous implementation, technical decisions and commits without intermediate approvals. No human design review or test execution is claimed. Pushing these new commits is not part of that authorization.

## Phase 1 gate — passed, 2026-10-24

- NestJS 12 with the Fastify adapter; Prisma 7 with its PostgreSQL driver adapter.
- Feature controllers/services, DI lifecycle, explicit validation pipes, exception filter, structured logging and metrics.
- Standard lookups, relations, creation, listing and availability use generated Prisma Client types. Raw SQL is confined to locking, idempotency coordination and migration/integrity operations.
- All **49 tests** passed (the 48 original cases plus populated legacy adoption). Lint, type checking and compiled build passed.
- Fresh databases use a Prisma SQL baseline preserving PostgreSQL exclusions/checks. Existing databases verify legacy checksums and critical exclusions before baseline adoption. Original SQL and migration ledger are retained. A test verifies appointments and idempotency records survive adoption and repeated deployment unchanged.
- Docker image builds and migration-before-start succeeded against the existing persistent volume. Database/API readiness passed. The existing HTTP demo passed.
- Six responses captured from the original running Fastify implementation were compared against NestJS: catalog, offerings, availability, appointment listing, validation error and missing route. Status and JSON matched after excluding generated request IDs. Swagger UI and error schemas were verified.
- Fixture adjustment: Prisma schema-qualifies its queries, so readiness now uses a genuinely empty disposable database rather than changing `search_path`.
- Corrections: cast the void-returning seed advisory lock to text for Prisma decoding; translate TypeBox const/numeric-exclusive schemas for OpenAPI 3.0; include OpenSSL in Docker images for Prisma's engine detection.
- The official Prisma engine download initially required the supported elevated execution path. Checksum/TLS verification stayed enabled. A source-build fallback was stopped and its temporary cache removed after the official download succeeded. Build caches were reclaimed after Docker builds exhausted the cloud disk; the database volume and source files were preserved.

Phase 2 starts only after this gate. Its final evidence is recorded below when executed.

## Phase 2 gate — passed, 2026-10-24

- TechnicianTimeOff model/custom SQL migration, administrative GET/POST/DELETE endpoints, nullable reason, valid intervals, technician FK and half-open GiST exclusion.
- Availability uses a consistent Prisma transaction snapshot and excludes whole-interval appointment/leave overlaps. Booking, time-off mutations and seed leave writes share technician locking and post-lock checks. Both existing appointment exclusions remain intact.
- Final `npm run check`: **72 tests passed, 0 skipped** (11 domain tests; 61 PostgreSQL/API tests), plus lint, type checking and compiled build. `npm audit`: 0 vulnerabilities.
- A final audit found a reseeding edge: restoring a deleted demo appointment could bypass time-off checks. Appointment seed writes now use the shared technician lock/recheck protocol too, and a regression test proves conflicting reseeding fails atomically while preserving the new leave.
- New cases cover create/list/delete, unknown technicians, invalid/body types, adjacent/overlapping intervals, appointment conflicts, seed alternatives, midnight rollover, restored capacity, database constraints, rollback and exactly five retry attempts under real SQL serialization-failure injection.
- Deterministic PostgreSQL insert gates observe actual lock waits and force booking-first, time-off-first and competing-leave orderings across two independent Nest apps. Final cross-table overlap queries return no conflicting stored rows. These are correctness tests, not performance benchmarks.
- Final shared Docker image built successfully; the existing persistent database adopted the new migration without losing the original demo appointment. Database/API are healthy; migrator exited 0. The extended real-HTTP demo passed twice with the same appointment ID, temporary leave creation/deletion, rejected booking and restored availability.
- Runtime UID is 1000 (`node`). The runtime has neither the build CA secret nor source/test directories. The database has 13 public tables, 11 current appointments (ten seed plus the original demo), two seed absences and two applied Prisma migrations.
- OpenAPI/Swagger include administrative paths and error schemas. Nullable reason and TypeBox const/exclusivity are translated to valid OpenAPI 3.0 forms. Regenerated operation IDs/document organization may differ from the initial framework's output; no existing business payload/status change was intended.
- Docker's vfs storage driver copied full dependency layers and repeatedly exhausted the 32 GB cloud disk. The final Dockerfile combines source/install/build/prune steps, uses an external npm cache mount, copies a prepared runtime once and shares one image across services. It built with about 10 GB remaining. This trades some source-change install caching for much lower storage amplification; package downloads still reuse the mounted cache. Unused task build caches were reclaimed without deleting the database volume.
- A missing staged root Prisma config was caught and added in a separate corrective commit; no Git history was rewritten. New work is on the local `refactor/nestjs-prisma-time-off` branch and has not been pushed.

## Remaining boundaries

Authentication/authorization, leave approval/recurrence, calendars, cancellation and public deployment hardening remain outside scope. Administrative listing is a simple chronological array. Cross-table safety depends on the shared writer protocol; arbitrary direct SQL can bypass it. Initial legacy adoption is a single migration job for the known prior schema, not arbitrary drift repair. No load/HA/failover claims, human review/test execution or video recording are asserted. Saved cloud instructions/network additions are drafts until the user saves/publishes the environment; new-task restoration has not been independently verified.

## Final reproducibility check

`sh scripts/cloud-setup.sh` passed end to end after the final reseeding fix: clean npm installation, shared Docker build, data-preserving migration/startup, additive seed, all 72 tests and static/build checks, and the extended real-HTTP demonstration. The original demo appointment still replayed with the same ID. The first clean-install attempt exposed Prisma touching its cache under read-only HOME; exporting XDG_CACHE_HOME=/workspace/.cache and reusing the already verified engine cache corrected it without changing HOME or weakening verification. The helper and saved startup instructions now set that writable cache explicitly. Host `prisma db seed` and `prisma migrate status` also passed with explicit DATABASE_URL. No new commits were pushed.

## Seed-backed Swagger demonstration

Swagger query/path defaults and JSON examples now share stable identifiers with the seed through `src/db/seed-data.ts`; this extraction changes no stored seed values. Availability, catalog lookup, appointment retrieval/list filters, booking, technician lookup, time-off creation and deletion all have ready-to-execute inputs. Try-it-out mode is enabled, and JSON Schema examples are emitted as OpenAPI schema examples. Documentation defaults do not supply missing business inputs to raw API requests.

The booking example uses a free 2030-01-16 10:00 UTC slot and a prefilled idempotency key: first create returns 201, identical retries 200. Administrative POST/DELETE remain stateful (201/204 initially, conflict/not-found on repeats); Swagger and README describe restoring seed records and using returned IDs.

Validation: lint/typecheck/build and **73 tests passed**. A new integration test constructs requests directly from the generated OpenAPI defaults/examples and successfully executes every documented operation on fresh real PostgreSQL, including booking replay and seeded time-off deletion. It also verifies missing required availability inputs still fail validation and checks the UI's try-it-out setting. The rebuilt Docker application served all eight documented GET examples with 200; its booking example/replay and time-off creation worked over real HTTP. The temporary live time-off record was deleted by its returned ID; seeded absences were preserved. The existing HTTP demo also passed.

## Local IDE dependency setup

The normal runtime image keeps dependencies inside Docker; a native editor therefore needs native dependencies in its own checkout. Added `npm run setup:local` (version check, frozen npm installation and Prisma generation), a Node 24 version hint, and workspace TypeScript SDK settings. A clean source copy without dependencies/generated files successfully installed, generated Prisma types, resolved NestJS/Swagger/TypeBox/TypeScript imports and passed type checking. This native-host check ran on Linux; the Mac editor itself was not remotely controlled or visually tested.

For Docker-only review, a separate `development` target retains the full toolchain and runs as user node. The optional Dev Container binds source, isolates Linux node_modules in a named volume, uses its own internal PostgreSQL database/volume, initializes dependencies/migrations/seed and forwards the development server. It does not mount the host Docker socket; full Testcontainers integration tests remain a native-host workflow. The Compose equivalent of postCreate ran successfully, including lint/typecheck/build and 11 unit tests. The container resolved all screenshot imports and served the seeded API and Swagger. Mount inspection confirmed container dependencies use a volume rather than overwriting native host modules.

The full existing check suite passed (73 tests plus static/build checks). The normal runtime image also rebuilt and started successfully, the HTTP demo passed, and production still excluded Vitest/ESLint. GUI-specific Dev Container extension behavior remains for the user's local review.
