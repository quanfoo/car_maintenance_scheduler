CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE dealerships (
  id uuid PRIMARY KEY, name text NOT NULL
);
CREATE TABLE customers (
  id uuid PRIMARY KEY, name text NOT NULL
);
CREATE TABLE vehicles (
  id uuid PRIMARY KEY, customer_id uuid NOT NULL REFERENCES customers(id),
  vin text NOT NULL UNIQUE, UNIQUE (id, customer_id)
);
CREATE TABLE service_types (
  id uuid PRIMARY KEY, name text NOT NULL,
  duration_minutes integer NOT NULL CHECK (duration_minutes BETWEEN 1 AND 1440),
  UNIQUE (id, duration_minutes)
);
CREATE TABLE dealership_services (
  dealership_id uuid REFERENCES dealerships(id),
  service_type_id uuid REFERENCES service_types(id),
  PRIMARY KEY (dealership_id, service_type_id)
);
CREATE TABLE technicians (
  id uuid PRIMARY KEY, dealership_id uuid NOT NULL REFERENCES dealerships(id),
  name text NOT NULL, UNIQUE (id, dealership_id)
);
CREATE TABLE technician_skills (
  technician_id uuid REFERENCES technicians(id),
  service_type_id uuid REFERENCES service_types(id),
  PRIMARY KEY (technician_id, service_type_id)
);
CREATE TABLE service_bays (
  id uuid PRIMARY KEY, dealership_id uuid NOT NULL REFERENCES dealerships(id),
  name text NOT NULL, UNIQUE (id, dealership_id)
);
CREATE TABLE appointments (
  id uuid PRIMARY KEY,
  customer_id uuid NOT NULL REFERENCES customers(id),
  vehicle_id uuid NOT NULL,
  dealership_id uuid NOT NULL REFERENCES dealerships(id),
  service_type_id uuid NOT NULL,
  technician_id uuid NOT NULL,
  service_bay_id uuid NOT NULL,
  start_time timestamptz NOT NULL,
  end_time timestamptz NOT NULL,
  duration_minutes integer NOT NULL,
  status text NOT NULL DEFAULT 'confirmed' CHECK (status = 'confirmed'),
  idempotency_key varchar(128),
  request_fingerprint text,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (vehicle_id, customer_id) REFERENCES vehicles(id, customer_id),
  FOREIGN KEY (technician_id, dealership_id) REFERENCES technicians(id, dealership_id),
  FOREIGN KEY (service_bay_id, dealership_id) REFERENCES service_bays(id, dealership_id),
  FOREIGN KEY (technician_id, service_type_id) REFERENCES technician_skills(technician_id, service_type_id),
  FOREIGN KEY (dealership_id, service_type_id) REFERENCES dealership_services(dealership_id, service_type_id),
  FOREIGN KEY (service_type_id, duration_minutes) REFERENCES service_types(id, duration_minutes),
  CHECK (end_time > start_time),
  CHECK (end_time = start_time + duration_minutes * interval '1 minute'),
  CHECK ((idempotency_key IS NULL) = (request_fingerprint IS NULL)),
  CONSTRAINT appointments_idempotency_key_unique UNIQUE (idempotency_key),
  CONSTRAINT appointments_technician_no_overlap EXCLUDE USING gist
    (technician_id WITH =, tstzrange(start_time, end_time, '[)') WITH &&)
    WHERE (status = 'confirmed'),
  CONSTRAINT appointments_bay_no_overlap EXCLUDE USING gist
    (service_bay_id WITH =, tstzrange(start_time, end_time, '[)') WITH &&)
    WHERE (status = 'confirmed')
);
CREATE INDEX appointments_dealership_start ON appointments (dealership_id, start_time, id);
CREATE INDEX appointments_customer_start ON appointments (customer_id, start_time, id);
CREATE INDEX appointments_start ON appointments (start_time, id);
CREATE INDEX technicians_dealership ON technicians (dealership_id, id);
CREATE INDEX service_bays_dealership ON service_bays (dealership_id, id);
