# Implementation plan and acceptance contract

The assessment's Scenario A requires (1) a vehicle, service, dealership and desired-time booking request, (2) a qualified technician AND bay available for the complete duration, and (3) a persistent appointment associating customer, vehicle and both resources. The backend deliverable must expose REST and a persistent database; OpenAPI and a scripted demonstration substitute for a UI.

Evaluation covers architecture, technical execution, AI direction/verification, and communication. Supporting deliverables are system design, README with actual AI collaboration narrative, meaningful tests, and a 5–10 minute walkthrough outline. The provided implementation prompt expands scope with idempotency, concurrency constraints, advisory availability, Docker and deterministic seed data.

## Architecture proposal

A stateless Fastify/TypeScript modular monolith uses pg and PostgreSQL. Request schemas and OpenAPI use TypeBox. Booking owns transaction boundaries; PostgreSQL GiST exclusion constraints prevent technician/bay overlaps across processes. Composite foreign keys protect resource dealership membership, technician qualifications, vehicle ownership, and offered services. Half-open UTC intervals allow adjacent bookings. Persist an idempotency key and canonical request hash on the resulting appointment in the same transaction. Bounded retries use fresh transactions after resource conflicts. Prometheus metrics and structured logs provide basic observability.

## Assumptions and scope

UTC calendar dates; fixed service durations; availability enumerates 48 half-hour starts per day (appointments may finish next day); bookings may start at arbitrary instants. All bays support all services. No opening hours, holidays, leave, cancellation, authentication, payment, vehicle collision checks, or integrations. Past bookings are allowed to keep the deterministic demonstration usable. Service availability is dealership-specific. Idempotency keys are globally scoped for this unauthenticated demo and retained with appointments. Production requires authentication, authorization and tenant-scoped keys.

## REST contract

GET /dealerships; GET /dealerships/:dealershipId/service-types; GET /availability?dealershipId&serviceTypeId&date; POST /appointments with customerId, vehicleId, dealershipId, serviceTypeId, startTime and optional Idempotency-Key; GET /appointments/:id; GET /appointments with bounded pagination and dealership/customer/UTC-date/confirmed-status filters. GET /docs, /openapi.json, /health/live, /health/ready, /metrics provide development/operations support.

## Milestones

1. Record design, scope and assumptions.
2. Establish TypeScript, Fastify, Docker Compose, quality checks.
3. Add migration runner, relational constraints and repeatable deterministic seed.
4. Implement dealership/service discovery and full-duration availability.
5. Implement transactional booking, bounded retries and idempotency.
6. Implement retrieval, filtering, pagination and schemas.
7. Exercise business, database and concurrency behavior on real PostgreSQL.
8. Complete OpenAPI, observability, demonstration, design and walkthrough documents; run all checks and Docker smoke tests.

The user's direct instruction to iterate independently supersedes the attached prompt's review pauses. The user subsequently explicitly authorized committing and pushing the implementation to GitHub. Architecture choices remain recorded for final human review; no human design approval or test execution is assumed.
