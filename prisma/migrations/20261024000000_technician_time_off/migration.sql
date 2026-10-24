CREATE TABLE technician_time_off (
  id uuid PRIMARY KEY,
  technician_id uuid NOT NULL REFERENCES technicians(id),
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  reason text,
  CONSTRAINT technician_time_off_valid_interval CHECK (starts_at < ends_at),
  CONSTRAINT technician_time_off_no_overlap EXCLUDE USING gist
    (technician_id WITH =, tstzrange(starts_at, ends_at, '[)') WITH &&)
);
CREATE INDEX technician_time_off_start ON technician_time_off (technician_id, starts_at, id);
-- Appointment/time-off conflicts span two tables. All writers must lock the
-- technician row, then recheck BOTH tables in fresh statements before writing.
