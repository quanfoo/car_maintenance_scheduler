# Video walkthrough: about 9 minutes

## Before recording

Start Docker, seed the app and open [Swagger](http://localhost:3000/docs). Run `npm run setup:local` and `npm run check` ahead of time so the editor and test output are ready.

Keep these tabs open: Swagger, [system design](system-design.md), [Prisma schema](../prisma/schema.prisma), [booking service](../src/modules/appointments/booking.service.ts) and a terminal. Use **UTC** when describing demo times.

This is a recording guide. The final submission also needs the recorded video and a link reviewers can access.

## 0:00–0:30 — Introduction

Introduce yourself by name. State that you chose **Scenario A: the Unified Service Scheduler**, implementing the backend with Swagger as the client interface.

“We book a vehicle service at a dealership. Each booking needs a qualified technician and a free bay for the whole service. We also account for technician time off.”

Show the README.

## 0:30–1:45 — Design and data

Show the diagram in [system design](system-design.md), then the Prisma schema. Follow the relationships from customer and vehicle to appointment, technician and bay.

“NestJS organizes the API and scheduling logic. Prisma gives us typed database queries. PostgreSQL stores bookings and enforces the resource rules.”

Explain why one application and one database are enough here. Mention that app instances can share the database, with connection limits and indexes supporting growth. Logs, request IDs and metrics help diagnose failures.

## 1:45–2:45 — Why concurrent bookings are safe

Show the exclusion constraint in [system design](system-design.md) and the transaction in the booking service.

“The database rejects overlapping appointments for the same technician or bay. An appointment can end exactly when the next one starts. Booking and time off also lock the same technician and recheck both schedules, because those records live in different tables.”

Point to the [shared schedule checks](../src/common/technician-schedule.ts). Mention that failed transactions roll back and retryable failures have a five-attempt limit.

## 2:45–4:45 — Book a service in Swagger

Use the prefilled fields unless a step says otherwise:

1. Execute **GET `/dealerships`**, then the dealership's **GET service types**.
2. Execute **GET `/availability`** for North Motors, oil change, **2030-01-15**. Show 09:00 unavailable and 09:30 available.
3. Execute **POST `/appointments`** with the default body: Alice's vehicle, North Motors, **2030-01-16 at 10:00 UTC**. First use returns **201** with assigned technician and bay IDs. If rehearsed already, **200** returns the saved appointment.
4. Execute the same request again. Show **200** and the same appointment ID.
5. Change `startTime` to `2030-01-16T10:30:00Z`, keeping the same key. Show **409**, then restore the original body.

“The key makes retries safe. Checking availability does not reserve a slot; the booking transaction does.”

## 4:45–5:15 — Show technician time off

1. Change the availability date to **2030-01-17**. North oil changes are available at 08:00, unavailable at 09:00 and available again at 12:00.
2. Execute **GET `/technicians/{id}/time-off`** with its default technician. Show the 09:00–12:00 absence.

“A free bay is not enough when no qualified technician is available.”

Keep this extension brief so the main booking journey stays central.

## 5:15–5:45 — Tests

Show the completed `npm run check` output and one test from [time-off.test.ts](../tests/integration/time-off.test.ts).

“We use real PostgreSQL tests for concurrent bookings, time-off conflicts, rollback and safe retries.”

The [testing notes](verification.md) summarize the cloud checks. `npm run demo` also checks the running API, including temporary leave creation, a rejected booking and restored capacity after deletion.

## 5:45–7:15 — AI collaboration

Use the README's [AI Collaboration Narrative](../README.md#ai-collaboration-narrative) as a guide. Spend about 30 seconds on each point:

1. **Understand and design:** explain how you read the requirements, chose Scenario A and brainstormed the architecture and key decisions with AI.
2. **Implement and question:** describe asking for a draft, asking AI to explain parts of the code, requesting changes and iterating on the implementation.
3. **Verify and refine:** explain how you requested unit and integration tests, then used a separate prompt to review the implementation against the requirements. Describe how those findings guided further changes.

Keep the distinction between automated results and your own observations clear.

## 7:15–8:15 — Challenge and lesson

“Booking and time off live in separate tables. Each table can prevent its own overlaps, but that alone cannot stop a booking from conflicting with an absence. Both operations lock the same technician and recheck the schedule before saving.”

Show the shared schedule checks and a race test. Explain the lesson: test competing operations together, and check that failed transactions leave no partial records. Add one observation from your own review or rehearsal.

## 8:15–9:00 — Limits and next steps

“This is a local demo. Next we would add authentication, dealership working hours, cancellation and rescheduling. We would also measure performance before deploying it publicly.”

Close by showing the saved appointment and its assigned resources.

## Rehearsal notes

- Keep the default booking key and body for repeat runs; they return the existing appointment.
- If you delete the seeded absence in Swagger, rerun the README's seed command before showing January 17 availability.
- The Swagger time-off POST is separate from the scripted demo. Repeating it returns **409** until that record is deleted using its returned ID.
- Seeding keeps extra records you create. Avoid changing the demonstrated slots while rehearsing.
