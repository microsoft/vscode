/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createServiceIdentifier } from '../../../util/common/services';
import type { Event } from '../../../util/vs/base/common/event';
import type { OTelConfig } from './otelConfig';

export const IOTelService = createServiceIdentifier<IOTelService>('IOTelService');

/**
 * Serializable trace context for cross-boundary span propagation.
 */
export interface TraceContext {
	readonly traceId: string;
	readonly spanId: string;
	/**
	 * W3C trace flags from the source span context (e.g. `0x01` for sampled). Optional
	 * because not all impls preserve it; consumers that build a W3C `traceparent` should
	 * fall back to a sampled value when unset.
	 */
	readonly traceFlags?: number;
	/** W3C tracestate serialized as a comma-separated key=value list, when present. */
	readonly traceState?: string;
}

/**
 * Abstracts the OpenTelemetry SDK so consumers don't import OTel directly.
 * When disabled, all methods are no-ops with zero overhead.
 */
export interface IOTelService {
	readonly _serviceBrand: undefined;
	readonly config: OTelConfig;

	/**
	 * Start a new span. Returns a handle to set attributes and end the span.
	 * If OTel is disabled, returns a no-op handle.
	 */
	startSpan(name: string, options?: SpanOptions): ISpanHandle;

	/**
	 * Start a span and set it as active context so child spans are parented.
	 * Calls `fn` within the active span context.
	 */
	startActiveSpan<T>(name: string, options: SpanOptions, fn: (span: ISpanHandle) => Promise<T>): Promise<T>;

	/**
	 * Get the trace context (traceId + spanId) of the currently active span.
	 * Returns undefined if no span is active or OTel is disabled.
	 */
	getActiveTraceContext(): TraceContext | undefined;

	/**
	 * Store a trace context for later retrieval, keyed by a string ID.
	 * Used to propagate context across async boundaries (e.g., subagent invocations).
	 */
	storeTraceContext(key: string, context: TraceContext): void;

	/**
	 * Retrieve and remove a previously stored trace context by key.
	 */
	getStoredTraceContext(key: string): TraceContext | undefined;

	/**
	 * Run a function with a remote trace context set as active, without creating a span.
	 * Child spans created inside `fn` will be parented to the given trace context.
	 */
	runWithTraceContext<T>(traceContext: TraceContext, fn: () => Promise<T>): Promise<T>;

	/**
	 * Record a histogram metric value.
	 */
	recordMetric(name: string, value: number, attributes?: Record<string, string | number | boolean>): void;

	/**
	 * Increment a counter metric.
	 */
	incrementCounter(name: string, value?: number, attributes?: Record<string, string | number | boolean>): void;

	/**
	 * Emit an OTel log record / event.
	 */
	emitLogRecord(body: string, attributes?: Record<string, unknown>): void;

	/**
	 * Force flush all pending telemetry data.
	 */
	flush(): Promise<void>;

	/**
	 * Gracefully shut down the OTel SDK.
	 */
	shutdown(): Promise<void>;

	/**
	 * Inject an externally-created completed span into the OTel service's event stream.
	 * The span will fire `onDidCompleteSpan` (for the debug panel) but will NOT be
	 * exported via the OTLP exporter (the source system handles its own export).
	 */
	injectCompletedSpan(span: ICompletedSpanData): void;

	/**
	 * Fires when any span ends, providing a serializable snapshot of the span's data.
	 * Used by the debug panel to react to completed spans without depending on the OTel SDK.
	 */
	readonly onDidCompleteSpan: Event<ICompletedSpanData>;

	/**
	 * Fires synchronously when a span event is emitted via `ISpanHandle.addEvent()`.
	 * Enables real-time streaming of in-flight span events (e.g., user messages)
	 * without waiting for the span to complete.
	 */
	readonly onDidEmitSpanEvent: Event<ISpanEventData>;
}

export const enum SpanKind {
	INTERNAL = 0,
	CLIENT = 2,
}

export const enum SpanStatusCode {
	UNSET = 0,
	OK = 1,
	ERROR = 2,
}

export interface SpanOptions {
	kind?: SpanKind;
	attributes?: Record<string, string | number | boolean | string[]>;
	/** When set, the span will be created as a child of this remote trace context. */
	parentTraceContext?: TraceContext;
}

/**
 * Lightweight handle for a span, independent of the OTel SDK types.
 */
export interface ISpanHandle {
	setAttribute(key: string, value: string | number | boolean | string[]): void;
	setAttributes(attrs: Record<string, string | number | boolean | string[] | undefined>): void;
	setStatus(code: SpanStatusCode, message?: string): void;
	recordException(error: unknown): void;
	/**
	 * Add a named event to this span with optional attributes.
	 * This fires `IOTelService.onDidEmitSpanEvent` synchronously.
	 */
	addEvent(name: string, attributes?: Record<string, string | number | boolean | string[]>): void;
	/**
	 * Get the trace context (traceId + spanId) of this span.
	 * Used for cross-boundary propagation (e.g., linking subagent spans to their parent tool call).
	 */
	getSpanContext(): TraceContext | undefined;
	end(): void;
}

/**
 * Shape of `modelOptions` passed through VS Code IPC for cross-process
 * CapturingToken restoration and OTel trace context propagation.
 */
export interface OTelModelOptions {
	readonly _capturingTokenCorrelationId?: string;
	readonly _otelTraceContext?: TraceContext | null;
}

/**
 * Serializable snapshot of a completed span, fired via `IOTelService.onDidCompleteSpan`.
 * Contains all in-memory attributes (including content attributes regardless of captureContent).
 */
export interface ICompletedSpanData {
	readonly name: string;
	readonly spanId: string;
	readonly traceId: string;
	readonly parentSpanId?: string;
	readonly startTime: number; // milliseconds since epoch
	readonly endTime: number; // milliseconds since epoch
	readonly status: { readonly code: SpanStatusCode; readonly message?: string };
	readonly attributes: Readonly<Record<string, string | number | boolean | string[]>>;
	readonly events: readonly ISpanEventRecord[];
}

/**
 * A single event on a span (recorded via `ISpanHandle.addEvent`).
 */
export interface ISpanEventRecord {
	readonly name: string;
	readonly timestamp: number; // milliseconds since epoch
	readonly attributes?: Readonly<Record<string, string | number | boolean | string[]>>;
}

/**
 * Data emitted via `IOTelService.onDidEmitSpanEvent` when a span event is added.
 * Enables real-time streaming of in-flight span events to the debug panel.
 */
export interface ISpanEventData {
	readonly spanId: string;
	readonly traceId: string;
	readonly parentSpanId?: string;
	readonly eventName: string;
	readonly attributes: Readonly<Record<string, string | number | boolean | string[]>>;
	readonly timestamp: number; // milliseconds since epoch
}
