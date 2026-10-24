import { Injectable } from '@nestjs/common';
import { Counter, Histogram, Registry } from 'prom-client';
@Injectable()
export class Metrics {
  readonly registry = new Registry();
  readonly requests = new Histogram({ name: 'scheduler_http_request_duration_seconds', help: 'HTTP request latency', labelNames: ['method','route','status'], registers: [this.registry], buckets: [0.005,0.01,0.025,0.05,0.1,0.5,1,5] });
  readonly bookings = new Counter({ name: 'scheduler_booking_total', help: 'Booking outcomes (replays counted separately)', labelNames: ['outcome'], registers: [this.registry] });
  readonly retries = new Counter({ name: 'scheduler_allocation_retries_total', help: 'Retryable resource allocation failures', registers: [this.registry] });
  readonly dbErrors = new Counter({ name: 'scheduler_database_errors_total', help: 'Unhandled database failures', labelNames: ['code'], registers: [this.registry] });
}
