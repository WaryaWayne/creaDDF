import {
  Cause,
  DateTime,
  Effect,
  Exit,
  FileSystem,
  Layer,
  Metric,
  Option,
  Schema,
  Tracer,
} from "effect";
import * as FetchHttpClient from "effect/unstable/http/FetchHttpClient";
import * as PrometheusMetrics from "effect/unstable/observability/PrometheusMetrics";
import * as Otlp from "effect/unstable/observability/Otlp";

export interface DdfOtlpTelemetryOptions {
  readonly baseUrl: string;
  readonly serviceName?: string;
  readonly serviceVersion?: string;
  readonly attributes?: Record<string, unknown>;
}

export const makeDdfOtlpTelemetryLayer = (options: DdfOtlpTelemetryOptions) =>
  Otlp.layerJson({
    baseUrl: options.baseUrl,
    resource: {
      serviceName: options.serviceName ?? "@warya/crea-ddf",
      serviceVersion: options.serviceVersion,
      attributes: options.attributes,
    },
  }).pipe(Layer.provide(FetchHttpClient.layer));

export interface DdfFileTelemetryOptions<A> {
  readonly directory?: string;
  readonly runId?: string;
  readonly includeResult?: boolean;
  readonly includePrometheus?: boolean;
  readonly fileName?: (details: DdfFileTelemetryFileDetails<A>) => string;
}

export interface DdfFileTelemetryFileDetails<A> {
  readonly runId: string;
  readonly status: "success" | "failure";
  readonly value: A | undefined;
}

export interface DdfFileTelemetryResult<A> {
  readonly value: A;
  readonly filePath: string;
  readonly runId: string;
  readonly spanCount: number;
  readonly metricCount: number;
}

interface RecordedSpanEvent {
  readonly name: string;
  readonly startTimeNanos: string;
  readonly attributes: Record<string, unknown>;
}

interface RecordedSpan {
  readonly name: string;
  readonly traceId: string;
  readonly spanId: string;
  readonly parentSpanId: string | null;
  readonly kind: Tracer.SpanKind;
  readonly sampled: boolean;
  readonly startTimeNanos: string;
  readonly endTimeNanos: string;
  readonly durationMillis: number;
  readonly attributes: Record<string, unknown>;
  readonly events: ReadonlyArray<RecordedSpanEvent>;
  readonly exit: {
    readonly _tag: "Success" | "Failure";
    readonly cause?: string;
  };
}

const defaultTelemetryDirectory = ".otel";

const durationMillis = (start: bigint, end: bigint) =>
  Number(end - start) / 1_000_000;

const sanitizeFileSegment = (value: string) => {
  const sanitized = value
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return sanitized.length > 0 ? sanitized : "otel";
};

const runIdFromValue = (value: unknown): string | undefined => {
  if (typeof value !== "object" || value === null) return undefined;
  const maybeRun = (value as Record<string, unknown>).runId;
  return typeof maybeRun === "string" && maybeRun.length > 0
    ? maybeRun
    : undefined;
};

type JsonValue =
  | null
  | string
  | number
  | boolean
  | ReadonlyArray<JsonValue>
  | { readonly [key: string]: JsonValue };

const toJsonValue = (value: unknown): JsonValue => {
  if (value === null) return null;
  if (value === undefined) return null;
  if (typeof value === "string") return value;
  if (typeof value === "number") return value;
  if (typeof value === "boolean") return value;
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.map(toJsonValue);
  if (value instanceof Map) {
    return Object.fromEntries(
      Array.from(value.entries()).map(([key, entryValue]) => [
        String(key),
        toJsonValue(entryValue),
      ]),
    );
  }
  if (value instanceof Set) return Array.from(value).map(toJsonValue);
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack ?? null,
    };
  }
  if (typeof value === "object") {
    const toJson = (value as { readonly toJSON?: unknown }).toJSON;
    if (typeof toJson === "function") {
      return toJsonValue(toJson.call(value));
    }
    return Object.fromEntries(
      Object.entries(value).map(([key, entryValue]) => [
        key,
        toJsonValue(entryValue),
      ]),
    );
  }
  return String(value);
};

const encodeJson = Schema.encodeUnknownSync(Schema.UnknownFromJsonString);

const serializeExit = (exit: Exit.Exit<unknown, unknown>) =>
  Exit.isSuccess(exit)
    ? { _tag: "Success" as const }
    : { _tag: "Failure" as const, cause: Cause.pretty(exit.cause) };

const recordSpan = (
  span: Tracer.Span,
  endTime: bigint,
  exit: Exit.Exit<unknown, unknown>,
  events: ReadonlyArray<RecordedSpanEvent>,
): RecordedSpan => {
  const startTime = span.status.startTime;
  return {
    name: span.name,
    traceId: span.traceId,
    spanId: span.spanId,
    parentSpanId: Option.match(span.parent, {
      onNone: () => null,
      onSome: (parent) => parent.spanId,
    }),
    kind: span.kind,
    sampled: span.sampled,
    startTimeNanos: startTime.toString(),
    endTimeNanos: endTime.toString(),
    durationMillis: durationMillis(startTime, endTime),
    attributes: Object.fromEntries(span.attributes),
    events,
    exit: serializeExit(exit),
  };
};

const makeFileTelemetryTracer = Effect.fn("DdfTelemetry.makeFileTracer")(
  function* () {
    const currentTracer = yield* Effect.tracer;
    const spans: Array<RecordedSpan> = [];

    const tracer = Tracer.make({
      span(options) {
        const span = currentTracer.span(options);
        const events: Array<RecordedSpanEvent> = [];
        const originalEvent = span.event;
        span.event = function (this: Tracer.Span, name, startTime, attributes) {
          events.push({
            name,
            startTimeNanos: startTime.toString(),
            attributes: attributes ?? {},
          });
          return originalEvent.call(this, name, startTime, attributes);
        };

        const originalEnd = span.end;
        span.end = function (this: Tracer.Span, endTime, exit) {
          originalEnd.call(this, endTime, exit);
          if (span.sampled) spans.push(recordSpan(span, endTime, exit, events));
        };

        return span;
      },
      context: currentTracer.context,
    });

    return {
      tracer,
      spans: () => spans.slice(),
    };
  },
);

const buildTelemetryDocument = <A>(
  runId: string,
  capturedAt: string,
  exit: Exit.Exit<A, unknown>,
  spans: ReadonlyArray<RecordedSpan>,
  metrics: ReadonlyArray<Metric.Metric.Snapshot>,
  metricDump: string,
  prometheus: string | undefined,
  options: DdfFileTelemetryOptions<A>,
) => {
  const sortedSpans = spans
    .slice()
    .sort((left, right) =>
      left.startTimeNanos.localeCompare(right.startTimeNanos),
    );
  const slowestSpans = sortedSpans
    .slice()
    .sort((left, right) => right.durationMillis - left.durationMillis)
    .slice(0, 25)
    .map((span) => ({
      name: span.name,
      durationMillis: span.durationMillis,
      spanId: span.spanId,
      parentSpanId: span.parentSpanId,
      attributes: span.attributes,
      exit: span.exit,
    }));

  return {
    schema: "@warya/crea-ddf.file-telemetry.v1",
    runId,
    capturedAt,
    status: Exit.isSuccess(exit) ? "success" : "failure",
    result:
      options.includeResult === false || Exit.isFailure(exit)
        ? undefined
        : exit.value,
    failure: Exit.isFailure(exit) ? Cause.pretty(exit.cause) : undefined,
    summary: {
      spanCount: sortedSpans.length,
      metricCount: metrics.length,
      slowestSpans,
    },
    traces: {
      spans: sortedSpans,
    },
    metrics: {
      snapshots: metrics,
      dump: metricDump,
      prometheus,
    },
  };
};

export const captureDdfFileTelemetry = Effect.fn("DdfTelemetry.captureFile")(
  function* <A, E, R>(
    effect: Effect.Effect<A, E, R>,
    options: DdfFileTelemetryOptions<A> = {},
  ) {
    const collector = yield* makeFileTelemetryTracer();
    const exit = yield* effect.pipe(
      Effect.withTracer(collector.tracer),
      Effect.exit,
    );
    const spans = collector.spans();
    const metrics = yield* Metric.snapshot;
    const metricDump = yield* Metric.dump;
    const prometheus =
      options.includePrometheus === false
        ? undefined
        : yield* PrometheusMetrics.format();
    const capturedAt = DateTime.formatIso(yield* DateTime.now);
    const runId =
      options.runId ??
      (Exit.isSuccess(exit) ? runIdFromValue(exit.value) : undefined) ??
      `otel-${sanitizeFileSegment(capturedAt)}`;
    const status = Exit.isSuccess(exit) ? "success" : "failure";
    const fileName =
      options.fileName?.({
        runId,
        status,
        value: Exit.isSuccess(exit) ? exit.value : undefined,
      }) ?? `${sanitizeFileSegment(runId)}.json`;
    const directory = options.directory ?? defaultTelemetryDirectory;
    const filePath = `${directory}/${fileName}`;
    const fileSystem = yield* FileSystem.FileSystem;
    const document = buildTelemetryDocument(
      runId,
      capturedAt,
      exit,
      spans,
      metrics,
      metricDump,
      prometheus,
      options,
    );

    yield* fileSystem.makeDirectory(directory, { recursive: true });
    yield* fileSystem.writeFileString(
      filePath,
      encodeJson(toJsonValue(document)),
    );

    if (Exit.isFailure(exit)) return yield* Effect.failCause(exit.cause);

    return {
      value: exit.value,
      filePath,
      runId,
      spanCount: spans.length,
      metricCount: metrics.length,
    } satisfies DdfFileTelemetryResult<A>;
  },
);
