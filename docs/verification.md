# Verification record

Agent-executed checks on 2026-10-23 in the cloud workspace. These are observed results, not a claim of human review or production readiness.

## Final results

| Check | Result |
| --- | --- |
| `npm ci` with lockfile and writable cloud cache | Passed |
| `npm run lint` | Passed |
| `npm run typecheck` | Passed |
| `npm run build` | Passed |
| `npm test` | **48 passed: 11 domain tests and 37 PostgreSQL/API tests; 0 skipped** |
| Docker image builds, including non-root runtime | Passed with TLS verification enabled |
| `docker compose up -d --wait` | Database and API healthy; migrator exited 0 |
| Repeated migration and seed | Passed; existing user/demo appointments retained |
| `npm run demo`, repeated and after API restart/recreation | Passed; same persisted appointment replayed |
| Runtime UID and build CA absence | UID 1000 (`node`); `/run/secrets/npm_ca` absent at runtime |
| `sh scripts/cloud-setup.sh` | Passed end to end: clean dependency installation, both image builds, migrations, additive seed, complete static/build/test checks and real HTTP demo |

## Behavioral evidence

- API accepts available bookings and persists all customer/vehicle/service/dealership/resource associations with correct duration; retrieval and filtered/paginated listing return them.
- Bad references, malformed inputs, ownership mismatch, incompatible dealerships, unqualified technicians, unavailable bays, incorrect durations and overlaps are rejected.
- A separate resource pair can book an overlapping time; adjacent appointments are allowed. Availability correctly handles complete duration, partial resource capacity, non-grid bookings and midnight rollover without exposing customer data.
- Two independent apps with separate pools process competing requests on the same PostgreSQL database. Twelve simultaneous requests for a single pair produce one booking; two available pairs produce two; no stored resource overlaps remain.
- Twelve identical keyed requests against the single-pair dealership produce one 201 and eleven 200 replays with the same ID. Competing changed payloads under a key produce one success and one key-reuse conflict.
- Explicit two-client SQL transactions observe PostgreSQL lock waits before the competing commit, then prove each resource exclusion and aborted-transaction recovery.
- Real-database fault injection produces exactly five allocation attempts and no partial appointment/key records. A subsequent normal request succeeds after removing the test trigger.
- Failed validation rolls back key claims. Migration digest tampering is rejected; restoring the digest recovers. Readiness returns 503 when the connection works but the application schema is unavailable; liveness still returns 200.

## Corrections during iteration

1. npm's default home cache was unwritable; moved it under `/workspace/.cache`.
2. Type checking rejected an unsupported per-query timeout configuration; placed supported timeouts in pool settings.
3. One early contention test failed intermittently. Added resource row locks with SKIP LOCKED and transactional idempotency-key claims while retaining GiST exclusions. Full suites passed after this change.
4. Docker dependency installation initially lacked the cloud proxy CA. Added an optional BuildKit secret mount of the injected trusted CA; no verification was disabled and the CA is not baked into the final image.
5. Workspace file permissions initially prevented the non-root container from reading copied package metadata. Explicit runtime ownership corrected this; actual container startup and UID were verified.
6. A raw HTTP probe immediately after restart saw a transient connection reset. Waiting through Compose health checks before the demonstration verified recovery and persisted replay.

## Boundaries

The original remote repository was empty. Initial implementation and verification were completed without commits or pushes. The user subsequently explicitly requested publication to GitHub, authorizing focused milestone commits and the initial main branch push. No pull request is part of this initial publication. Automated checks validate the current cloud instance. Saving environment instructions is separate from user publication and does not establish restoration in a new task.

No throughput benchmark, HA/failover test, real dealership integration, authenticated deployment or recorded video is claimed. Resource row locks can conservatively reject transiently busy resources; the design describes client retry behavior. Authentication/authorization and production operational controls remain explicit scope limitations.

The human should review the implementation/design, rerun the tests and demo, record their own verification observations, review the focused commits, and record the video using `video-walkthrough.md` before submission.
