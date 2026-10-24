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
