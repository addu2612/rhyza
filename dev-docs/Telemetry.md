# Telemetry Usage Guide

This guide explains how to use the telemetry system available in this project, which is built on top of OpenTelemetry.

---

## Overview

The telemetry system is exposed via the `ITelemetryService` interface (from `common-types-lib`). Its implementation can be found in the `implementations-lib` package.

All code that requires telemetry should require an instance of `ITelemetryService` and not the `OpenTelemetryService` (or any other) concrete implementation.

As usual, it is for the application layer code to instanciate the concrete implementation and pass it to domain code requiring `ITelemetryService`.

The telemetry facility supports four metric types:

| Type          | Interface              | Use Case                                                  |
| ------------- | ---------------------- | --------------------------------------------------------- |
| **Histogram** | `ITelemetryHistogram`  | Measuring durations, latencies                            |
| **Gauge**     | `ITelemetryGauge`      | Snapshot of current values (e.g. batch size, queue depth) |
| **Counter**   | `ITelemetryCounter`    | Incrementing/decrementing event counts                    |
| **Timer**     | (inline via histogram) | Shorthand for timing a block of code                      |

---

## 1. Initialising the Telemetry Service

Before using telemetry, `OpenTelemetryService` must be started once at application startup. This is typically done at the application layer and in your service's `start()` method:

```typescript
import { OpenTelemetryService } from 'implementations-lib';

// OpenTelemetryService is a singleton class, requires setup via the Start() method

OpenTelemetryService.Start(
  BC_NAME, // Bounded context name, e.g. 'PAL'
  APP_NAME, // Application name, e.g. 'PAL_API_SVC'
  APP_VERSION, // Semver string, e.g. '1.0.0'
  INSTANCE_ID, // Unique instance identifier
  logger, // An ILogger instance
  OPEN_TELEMETRY_COLLECTOR_URL // usually from OPEN_TELEMETRY_COLLECTOR_URL env var
);

// get the reference to the instance, or use OpenTelemetryService.getInstance() directly
const telemetryService = OpenTelemetryService.getInstance();
```

> **Environment Variable:** Set `OPEN_TELEMETRY_COLLECTOR_URL` to point to your OpenTelemetry collector. Defaults to `http://127.0.0.1:4317`.

> ⚠️ `Start()` must be called **exactly once**. Calling it twice will throw an error. Calling `getInstance()` before `Start()` will also throw.

### Property Names

Using these common property names for telemetry properties ensures consistent naming, they are exported from `common-types-lib`:

| Prop                           | Usage                                                                    |
| ------------------------------ | ------------------------------------------------------------------------ |
| TELEMETRY_PROPS_CALL_NAME_PROP | The name of the operation being timed, can be function, event or command |
| TELEMETRY_PROPS_SUCCESS_PROP   | Whether the operation was successful or not                              |

---

## 2. Histograms — Measuring Duration

Histograms are ideal for measuring how long operations take.

### Create a histogram instance

Get it once (e.g. in a constructor) and reuse it:

```typescript
import { ITelemetryHistogram } from 'common-types-lib';

private readonly _myHistogram: ITelemetryHistogram;

constructor(telemetryService: ITelemetryService) {
  this._myHistogram = telemetryService.getHistogram('MyService_operationDuration');
}
```

### Time an operation

```typescript
// Start the timer, optionally with initial attributes
const stopTimer = this._myHistogram.startTimer({
  [TELEMETRY_PROPS_CALL_NAME_PROP]: 'myOperationName'
});

await doSomethingAsync(); // doesn't have to be async

// Stop the timer, optionally adding more attributes at the end
stopTimer({ success: true });
```

### Record a value directly

```typescript
this._myHistogram.observe(42, { callName: 'myOperation' });
```

---

## 3. Gauges — Tracking Current Values

Gauges represent a single current value (e.g. number of items in a batch).

### Inline (one-off)

```typescript
telemetryService.updateGauge('MyService_batchSize', messages.length);
```

### Via a reusable instance

```typescript
import { ITelemetryGauge } from 'common-types-lib';

private readonly _batchSizeGauge: ITelemetryGauge;

constructor(telemetryService: ITelemetryService) {
  this._batchSizeGauge = telemetryService.getGauge('MyService_batchSize');
}

// Later:
this._batchSizeGauge.set(messages.length);
// With attributes:
this._batchSizeGauge.set(messages.length, { topic: 'myTopic' });
```

---

## 4. Counters — Incrementing / Decrementing

Counters track cumulative totals.

```typescript
import { ITelemetryCounter } from 'common-types-lib';

private readonly _errorCounter: ITelemetryCounter;

constructor(telemetryService: ITelemetryService) {
  this._errorCounter = telemetryService.getCounter('MyService_errors');
}

// Increment by 1 (default)
this._errorCounter.inc();

// Increment by a specific amount
this._errorCounter.inc(5, { errorType: 'timeout' });

// Decrement
this._errorCounter.dec(1, { errorType: 'timeout' });
```

---

## 5. Attributes

All metric calls accept optional attributes — key/value pairs used to filter and group data in your observability backend (e.g. Grafana).

```typescript
import {
  ITelemetryServiceAttributes,
  TELEMETRY_PROPS_CALL_NAME_PROP
} from 'common-types-lib';

const attrs: ITelemetryServiceAttributes = {
  [TELEMETRY_PROPS_CALL_NAME_PROP]: 'createAsset', // standard 'callName' key
  [TELEMETRY_PROPS_SUCCESS_PROP]: true, // standard 'success' key
  topic: 'AssetEvents' // custom key
};
```

> Use the exported constant `TELEMETRY_PROPS_CALL_NAME_PROP` (`"callName"`) for naming your operations consistently across services.

---

## 6. Naming Conventions

Use descriptive, namespaced metric names to avoid collisions across services:

```
<ServiceName>_<metricDescription>

Examples:
  PalGrpcApi_Requests
  PalInternalEventHandler_batchSize
  PalLedgerCmdHandler_batches
```

---

## 7. Complete Example

This example shows how to wrap an asynchronous operation with a timer and add attributes to the telemetry service:

```typescript
import {
  ITelemetryService,
  ITelemetryHistogram,
  ITelemetryGauge,
  TELEMETRY_PROPS_CALL_NAME_PROP
} from 'common-types-lib';

const BATCH_HISTOGRAM = 'MyService_batches';
const BATCH_SIZE_GAUGE = 'MyService_batchSize';

export class MyHandler {
  private readonly _batchHistogram: ITelemetryHistogram;
  private readonly _telemetry: ITelemetryService;

  constructor(telemetryService: ITelemetryService) {
    this._telemetry = telemetryService;
    this._batchHistogram = telemetryService.getHistogram(BATCH_HISTOGRAM);
  }

  async processBatch(items: unknown[]): Promise<void> {
    // Record current batch size as a gauge
    this._telemetry.updateGauge(BATCH_SIZE_GAUGE, items.length);

    // Time the entire batch
    const stopBatchTimer = this._batchHistogram.startTimer();

    for (const item of items) {
      await this.processItem(item);
    }

    stopBatchTimer({ success: true });
  }

  private async processItem(item: unknown): Promise<void> {
    // ... processing logic
  }
}
```

---

## 8. Infrastructure

The telemetry data is exported via **OTLP/gRPC** to an OpenTelemetry Collector. The local development stack (in `docker/`) includes a pre-configured collector, Prometheus, Grafana, and Tempo for viewing metrics and traces.
