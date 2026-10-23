-- Serialize only requests sharing an idempotency key, before resource allocation.
-- Claims and their appointments commit or roll back together.
CREATE TABLE booking_keys (key varchar(128) PRIMARY KEY);
INSERT INTO booking_keys SELECT idempotency_key FROM appointments WHERE idempotency_key IS NOT NULL;
ALTER TABLE appointments ADD CONSTRAINT appointments_booking_key_fk
  FOREIGN KEY (idempotency_key) REFERENCES booking_keys(key);
