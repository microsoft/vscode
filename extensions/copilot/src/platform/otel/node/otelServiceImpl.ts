/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, type Event } from '../../../util/vs/base/common/event';
import { GenAiAttr, GenAiOperationName } from '../common/genAiAttributes';
import type { OTelConfig } from '../common/otelConfig';
import { type ICompletedSpanData, type IOTelService, type ISpanEventData, type ISpanEventRecord, type ISpanHandle, SpanKind, type SpanOptions, SpanStatusCode, type TraceContext } from '../common/otelService';

// Type-only imports — erased by esbuild, zero bundle impact
import type { Attributes, Context, Meter, MetricOptions, Span, SpanContext, Tracer } from '@opentelemetry/api';
import type { AnyValueMap, Logger } from '@opentelemetry/api-logs';
import type { ExportResult } from '@opentelemetry/core';
import type { BatchLogRecordProcessor, LogRecordExporter } from '@opentelemetry/sdk-logs';
import type { PeriodicExportingMetricReader, PushMetricExporter } from '@opentelemetry/sdk-metrics';
import type { BatchSpanProcessor, ReadableSpan, SpanExporter } from '@opentelemetry/sdk-trace-node';
import type { OTelSqliteStore } from './sqlite/otelSqliteStore';

interface ExporterSet {
	spanExporter: SpanExporter;
	logExporter: LogRecordExporter;
	metricExporter: PushMetricExporter;
}

const noopSpanHandle: ISpanHandle = {
	setAttribute() { },
	setAttributes() { },
	setStatus() { },
	recordException() { },
	addEvent() { },
	getSpanContext() { return undefined; },
	end() { },
};

/**
 * Callback for routing OTel service log messages to the extension's output channel.
 */
export type OTelLogFn = (level: 'info' | 'warn' | 'error', message: string) => void;

/**
 * Real OTel service implementation, only instantiated when OTel is enabled.
 * Uses dynamic imports so the OTel SDK is not loaded when disabled.
 */
export class NodeOTelService implements IOTelService {
	declare readonly _serviceBrand: undefined;
	readonly config: OTelConfig;

	private _tracer: Tracer | undefined;
	private _meter: Meter | undefined;
	private _logger: Logger | undefined;
	private _spanProcessors: BatchSpanProcessor[] = [];
	private _logProcessor: BatchLogRecordProcessor | undefined;
	private _metricReader: PeriodicExportingMetricReader | undefined;
	// OTel API reference for context propagation (stored after dynamic import)
	private _otelApi: typeof import('@opentelemetry/api') | undefined;
	private _initialized = false;
	private _initFailed = false;
	private static readonly _MAX_BUFFER_SIZE = 1000;
	private readonly _log: OTelLogFn;
	private readonly _sqliteStore: OTelSqliteStore | undefined;

	// Event emitters for span lifecycle
	private readonly _onDidCompleteSpan = new Emitter<ICompletedSpanData>();
	readonly onDidCompleteSpan: Event<ICompletedSpanData> = this._onDidCompleteSpan.event;
	private readonly _onDidEmitSpanEvent = new Emitter<ISpanEventData>();
	readonly onDidEmitSpanEvent: Event<ISpanEventData> = this._onDidEmitSpanEvent.event;

	injectCompletedSpan(span: ICompletedSpanData): void {
		try { this._onDidCompleteSpan.fire(span); } catch { /* emitter may be disposed */ }
	}

	// Buffer events until SDK is ready
	private readonly _buffer: Array<() => void> = [];

	constructor(config: OTelConfig, logFn?: OTelLogFn, sqliteStore?: OTelSqliteStore) {
		this.config = config;
		this._log = logFn ?? ((_level, _msg) => { /* silent when no logger wired */ });
		this._sqliteStore = sqliteStore;
		// Start async initialization immediately
		void this._initialize();
	}

	private async _initialize(): Promise<void> {
		if (this._initialized || !this.config.enabled) {
			return;
		}

		try {
			// Dynamic imports — only loaded when OTel is enabled
			const [
				api,
				apiLogs,
				traceSDK,
				logsSDK,
				metricsSDK,
				resourcesMod,
			] = await Promise.all([
				import('@opentelemetry/api'),
				import('@opentelemetry/api-logs'),
				import('@opentelemetry/sdk-trace-node'),
				import('@opentelemetry/sdk-logs'),
				import('@opentelemetry/sdk-metrics'),
				import('@opentelemetry/resources'),
			]);

			const BSP = traceSDK.BatchSpanProcessor;
			const BLRP = logsSDK.BatchLogRecordProcessor;
			const PEMR = metricsSDK.PeriodicExportingMetricReader;
			const NodeTracerProvider = traceSDK.NodeTracerProvider;
			const MeterProvider = metricsSDK.MeterProvider;
			const LoggerProvider = logsSDK.LoggerProvider;

			// Use resourceFromAttributes (available in @opentelemetry/resources v2+)
			const resource = resourcesMod.resourceFromAttributes({
				'service.name': this.config.serviceName,
				'service.version': this.config.serviceVersion,
				'session.id': this.config.sessionId,
				...this.config.resourceAttributes,
			});

			// Create exporters based on config
			const { spanExporter, logExporter, metricExporter } = await this._createExporters();

			// Primary span processor: filters debug-panel-only spans for the user's exporter
			const diagnosticSpanExporter = new DiagnosticSpanExporter(spanExporter, this.config.exporterType, this._log);
			this._spanProcessors.push(new BSP(diagnosticSpanExporter));

			// SQLite DB span processor: standard GenAI spans only (same filter as primary).
			// Registered as a separate processor so it works in parallel with any user exporter.
			if (this.config.dbSpanExporter && this._sqliteStore) {
				const { SqliteSpanExporter } = await import('./sqlite/sqliteSpanExporter');
				const sqliteExporter = new FilteredSpanExporter(new SqliteSpanExporter(this._sqliteStore));
				this._spanProcessors.push(new BSP(sqliteExporter));
			}

			// Trace provider — pass spanProcessors in constructor (SDK v2 API)
			const tracerProvider = new NodeTracerProvider({
				resource,
				spanProcessors: this._spanProcessors,
			});
			tracerProvider.register();
			this._tracer = api.trace.getTracer(this.config.serviceName, this.config.serviceVersion);
			this._otelApi = api;

			// Log provider — pass processors in constructor (SDK v2 uses 'processors' key)
			this._logProcessor = new BLRP(logExporter, {
				scheduledDelayMillis: 1000,
				maxExportBatchSize: 512,
			});
			const loggerProvider = new LoggerProvider({
				resource,
				processors: [this._logProcessor],
			} as ConstructorParameters<typeof LoggerProvider>[0]);
			apiLogs.logs.setGlobalLoggerProvider(loggerProvider);
			this._logger = apiLogs.logs.getLogger(this.config.serviceName, this.config.serviceVersion);

			// Metric provider
			this._metricReader = new PEMR({
				exporter: metricExporter,
				exportIntervalMillis: 10000,
			});
			const meterProvider = new MeterProvider({
				resource,
				readers: [this._metricReader],
			});
			api.metrics.setGlobalMeterProvider(meterProvider);
			this._meter = api.metrics.getMeter(this.config.serviceName, this.config.serviceVersion);

			this._initialized = true;

			// Flush buffered events in batches to avoid blocking the event loop
			const batch = this._buffer.splice(0);
			const BATCH_SIZE = 50;
			for (let i = 0; i < batch.length; i += BATCH_SIZE) {
				const chunk = batch.slice(i, i + BATCH_SIZE);
				for (const fn of chunk) {
					try { fn(); } catch { /* swallow */ }
				}
				if (i + BATCH_SIZE < batch.length) {
					// Yield to event loop between batches
					await new Promise<void>(resolve => setTimeout(resolve, 0));
				}
			}

		} catch (err) {
			// OTel init failure should never break the extension
			this._initFailed = true;
			this._buffer.length = 0; // Discard buffered events on failure
			this._log('error', `[OTel] Failed to initialize: ${err}`);
		}
	}

	private async _createExporters(): Promise<ExporterSet> {
		const { config } = this;

		// When OTel is enabled only for dbSpanExporter (no OTLP endpoint/file/console configured),
		// use a noop exporter as the primary span exporter so the pipeline still runs.
		// If the user also explicitly enabled OTel (via setting or env var), honour their
		// exporter config and don't switch to noop.
		const dbOnlyMode = config.dbSpanExporter
			&& !config.enabledExplicitly
			&& !config.fileExporterPath
			&& config.exporterType !== 'console';

		if (config.exporterType === 'file' && config.fileExporterPath) {
			const { FileSpanExporter, FileLogExporter, FileMetricExporter } = await import('./fileExporters');
			return {
				spanExporter: new FileSpanExporter(config.fileExporterPath),
				logExporter: new FileLogExporter(config.fileExporterPath),
				metricExporter: new FileMetricExporter(config.fileExporterPath),
			};
		}

		if (config.exporterType === 'console' && !dbOnlyMode) {
			const [traceSDK, logsSDK, metricsSDK] = await Promise.all([
				import('@opentelemetry/sdk-trace-node'),
				import('@opentelemetry/sdk-logs'),
				import('@opentelemetry/sdk-metrics'),
			]);
			return {
				spanExporter: new traceSDK.ConsoleSpanExporter(),
				logExporter: new logsSDK.ConsoleLogRecordExporter(),
				metricExporter: new metricsSDK.ConsoleMetricExporter(),
			};
		}

		if (config.exporterType === 'otlp-grpc' && !dbOnlyMode) {
			const [
				{ OTLPTraceExporter },
				{ OTLPLogExporter },
				{ OTLPMetricExporter },
			] = await Promise.all([
				import('@opentelemetry/exporter-trace-otlp-grpc'),
				import('@opentelemetry/exporter-logs-otlp-grpc'),
				import('@opentelemetry/exporter-metrics-otlp-grpc'),
			]);
			const opts = { url: config.otlpEndpoint };
			return {
				spanExporter: new OTLPTraceExporter(opts),
				logExporter: new OTLPLogExporter(opts),
				metricExporter: new OTLPMetricExporter(opts),
			};
		}

		// Default: otlp-http (or noop when in db-only mode)
		if (dbOnlyMode) {
			const metricsSDK = await import('@opentelemetry/sdk-metrics');
			const logsSDK = await import('@opentelemetry/sdk-logs');
			return {
				spanExporter: new NoopSpanExporter(),
				logExporter: new logsSDK.ConsoleLogRecordExporter(),
				metricExporter: new metricsSDK.ConsoleMetricExporter(),
			};
		}
		const [
			{ OTLPTraceExporter },
			{ OTLPLogExporter },
			{ OTLPMetricExporter },
		] = await Promise.all([
			import('@opentelemetry/exporter-trace-otlp-http'),
			import('@opentelemetry/exporter-logs-otlp-http'),
			import('@opentelemetry/exporter-metrics-otlp-http'),
		]);
		const base = config.otlpEndpoint.replace(/\/$/, '');
		return {
			spanExporter: new OTLPTraceExporter({ url: `${base}/v1/traces` }),
			logExporter: new OTLPLogExporter({ url: `${base}/v1/logs` }),
			metricExporter: new OTLPMetricExporter({ url: `${base}/v1/metrics` }),
		};
	}

	// ── Span API ──

	startSpan(name: string, options?: SpanOptions): ISpanHandle {
		if (!this._tracer) {
			if (this._initFailed || this._buffer.length >= NodeOTelService._MAX_BUFFER_SIZE) {
				return noopSpanHandle;
			}
			const handle = new BufferedSpanHandle();
			this._buffer.push(() => {
				const real = this._createSpan(name, options);
				handle.replay(real);
			});
			return handle;
		}
		return this._createSpan(name, options);
	}

	async startActiveSpan<T>(name: string, options: SpanOptions, fn: (span: ISpanHandle) => Promise<T>): Promise<T> {
		if (!this._tracer) {
			const handle = this.startSpan(name, options);
			try {
				return await fn(handle);
			} finally {
				handle.end();
			}
		}

		const spanOpts = { kind: toOTelSpanKind(options?.kind), attributes: options?.attributes as Attributes };

		// If a parent trace context is provided, create a remote context and start span within it
		if (options.parentTraceContext && this._otelApi) {
			const parentCtx = this._createRemoteContext(options.parentTraceContext);
			return this._tracer.startActiveSpan(
				name,
				spanOpts,
				parentCtx,
				async (span: Span) => {
					const handle = new RealSpanHandle(span, this._onDidCompleteSpan, this._onDidEmitSpanEvent, options?.attributes, options.parentTraceContext!.spanId);
					try {
						return await fn(handle);
					} finally {
						handle.end();
					}
				}
			);
		}

		const activeParentId = this._getActiveParentSpanId();
		return this._tracer.startActiveSpan(
			name,
			spanOpts,
			async (span: Span) => {
				const handle = new RealSpanHandle(span, this._onDidCompleteSpan, this._onDidEmitSpanEvent, options?.attributes, activeParentId);
				try {
					return await fn(handle);
				} finally {
					handle.end();
				}
			}
		);
	}

	getActiveTraceContext(): TraceContext | undefined {
		if (!this._otelApi) {
			return undefined;
		}
		const activeSpan = this._otelApi.trace.getSpan(this._otelApi.context.active());
		if (!activeSpan) {
			return undefined;
		}
		const ctx = activeSpan.spanContext();
		if (!ctx.traceId || !ctx.spanId) {
			return undefined;
		}
		return { traceId: ctx.traceId, spanId: ctx.spanId };
	}

	// ── Trace Context Store ── (for cross-boundary propagation)

	private static readonly _MAX_TRACE_CONTEXT_STORE_SIZE = 100;
	private readonly _traceContextStore = new Map<string, TraceContext>();
	private readonly _traceContextTimers = new Map<string, ReturnType<typeof setTimeout>>();

	storeTraceContext(key: string, context: TraceContext): void {
		// Evict oldest entry if at capacity
		if (this._traceContextStore.size >= NodeOTelService._MAX_TRACE_CONTEXT_STORE_SIZE) {
			const oldestKey = this._traceContextStore.keys().next().value;
			if (oldestKey !== undefined) {
				this._clearStoredTraceContext(oldestKey);
			}
		}
		this._traceContextStore.set(key, context);
		// Auto-cleanup after 5 minutes; tracked for proper disposal
		const timer = setTimeout(() => this._clearStoredTraceContext(key), 5 * 60 * 1000);
		this._traceContextTimers.set(key, timer);
	}

	getStoredTraceContext(key: string): TraceContext | undefined {
		const ctx = this._traceContextStore.get(key);
		if (ctx) {
			this._clearStoredTraceContext(key);
		}
		return ctx;
	}

	private _clearStoredTraceContext(key: string): void {
		this._traceContextStore.delete(key);
		const timer = this._traceContextTimers.get(key);
		if (timer) {
			clearTimeout(timer);
			this._traceContextTimers.delete(key);
		}
	}

	/**
	 * Creates an OTel Context with a remote span context as parent,
	 * allowing spans created within it to be children of the remote span.
	 */
	private _createRemoteContext(tc: TraceContext): Context {
		const api = this._otelApi!;
		const remoteSpanContext: SpanContext = {
			traceId: tc.traceId,
			spanId: tc.spanId,
			traceFlags: 1, // SAMPLED
			isRemote: true,
		};
		const remoteCtx = api.trace.setSpanContext(api.context.active(), remoteSpanContext);
		return remoteCtx;
	}

	async runWithTraceContext<T>(traceContext: TraceContext, fn: () => Promise<T>): Promise<T> {
		if (!this._otelApi) {
			return fn();
		}
		const parentCtx = this._createRemoteContext(traceContext);
		return this._otelApi.context.with(parentCtx, fn);
	}

	private _createSpan(name: string, options?: SpanOptions): ISpanHandle {
		const spanOpts = { kind: toOTelSpanKind(options?.kind), attributes: options?.attributes as Attributes };

		// If an explicit parent trace context is provided, create the span as its child.
		// This ensures correct parent-child hierarchy even when async context propagation
		// doesn't carry the active span (common in the VS Code extension host).
		if (options?.parentTraceContext && this._otelApi) {
			const parentCtx = this._createRemoteContext(options.parentTraceContext);
			const span = this._tracer!.startSpan(name, spanOpts, parentCtx);
			return new RealSpanHandle(span, this._onDidCompleteSpan, this._onDidEmitSpanEvent, options?.attributes, options.parentTraceContext.spanId);
		}

		const parentSpanId = this._getActiveParentSpanId();
		const span = this._tracer!.startSpan(name, spanOpts);
		return new RealSpanHandle(span, this._onDidCompleteSpan, this._onDidEmitSpanEvent, options?.attributes, parentSpanId);
	}

	private _getActiveParentSpanId(): string | undefined {
		if (!this._otelApi) { return undefined; }
		const activeSpan = this._otelApi.trace.getSpan(this._otelApi.context.active());
		if (!activeSpan) { return undefined; }
		const ctx = activeSpan.spanContext();
		return ctx.spanId || undefined;
	}

	// ── Metric API ──

	/**
	 * Explicit bucket boundaries per the OTel GenAI semantic conventions.
	 * @see https://opentelemetry.io/docs/specs/semconv/gen-ai/gen-ai-metrics/
	 */
	private static readonly _histogramOptions: ReadonlyMap<string, MetricOptions> = new Map([
		['gen_ai.client.operation.duration', { advice: { explicitBucketBoundaries: [0.01, 0.02, 0.04, 0.08, 0.16, 0.32, 0.64, 1.28, 2.56, 5.12, 10.24, 20.48, 40.96, 81.92] } }],
		['gen_ai.client.token.usage', { advice: { explicitBucketBoundaries: [1, 4, 16, 64, 256, 1024, 4096, 16384, 65536, 262144, 1048576, 4194304, 16777216, 67108864] } }],
	]);

	private readonly _histograms = new Map<string, ReturnType<Meter['createHistogram']>>();
	private readonly _counters = new Map<string, ReturnType<Meter['createCounter']>>();

	recordMetric(name: string, value: number, attributes?: Record<string, string | number | boolean>): void {
		if (!this._meter) {
			if (!this._initFailed && this._buffer.length < NodeOTelService._MAX_BUFFER_SIZE) {
				this._buffer.push(() => this.recordMetric(name, value, attributes));
			}
			return;
		}
		let histogram = this._histograms.get(name);
		if (!histogram) {
			histogram = this._meter.createHistogram(name, NodeOTelService._histogramOptions.get(name));
			this._histograms.set(name, histogram);
		}
		histogram.record(value, attributes);
	}

	incrementCounter(name: string, value = 1, attributes?: Record<string, string | number | boolean>): void {
		if (!this._meter) {
			if (!this._initFailed && this._buffer.length < NodeOTelService._MAX_BUFFER_SIZE) {
				this._buffer.push(() => this.incrementCounter(name, value, attributes));
			}
			return;
		}
		let counter = this._counters.get(name);
		if (!counter) {
			counter = this._meter.createCounter(name);
			this._counters.set(name, counter);
		}
		counter.add(value, attributes);
	}

	// ── Log API ──

	private _logEmitCount = 0;

	emitLogRecord(body: string, attributes?: Record<string, unknown>): void {
		if (!this._logger) {
			if (!this._initFailed && this._buffer.length < NodeOTelService._MAX_BUFFER_SIZE) {
				this._buffer.push(() => this.emitLogRecord(body, attributes));
			}
			return;
		}
		// Pass the active context so the log record inherits the trace ID from
		// the current span (if any). Without this, logs emitted inside a span
		// created via startSpan() (rather than startActiveSpan()) lack trace context.
		const ctx = this._otelApi?.context.active();
		this._logger.emit({ body, attributes: attributes as AnyValueMap, ...(ctx ? { context: ctx } : {}) });
		this._logEmitCount++;
		if (this._logEmitCount === 1) {
			this._log('info', `[OTel] First log record emitted: ${body}`);
		}
	}

	// ── Lifecycle ──

	async flush(): Promise<void> {
		await Promise.all([
			...this._spanProcessors.map(p => p.forceFlush()),
			this._logProcessor?.forceFlush(),
			this._metricReader?.forceFlush(),
		]);
	}

	async shutdown(): Promise<void> {
		try {
			// Clear all trace context timers
			for (const timer of this._traceContextTimers.values()) {
				clearTimeout(timer);
			}
			this._traceContextTimers.clear();
			this._traceContextStore.clear();

			await this.flush();
			await Promise.all([
				...this._spanProcessors.map(p => p.shutdown()),
				this._logProcessor?.shutdown(),
				this._metricReader?.shutdown(),
			]);
			const api = await import('@opentelemetry/api');
			const apiLogs = await import('@opentelemetry/api-logs');
			api.trace.disable();
			api.metrics.disable();
			apiLogs.logs.disable();
		} catch {
			// Swallow shutdown errors
		} finally {
			this._onDidCompleteSpan.dispose();
			this._onDidEmitSpanEvent.dispose();
		}
	}
}

// ── Span Handle Implementations ──

class RealSpanHandle implements ISpanHandle {
	private readonly _attributes: Record<string, string | number | boolean | string[]> = {};
	private readonly _events: ISpanEventRecord[] = [];
	private _statusCode = SpanStatusCode.UNSET;
	private _statusMessage?: string;
	private readonly _startTime = Date.now();
	private _ended = false;
	private readonly _parentSpanId: string | undefined;

	constructor(
		private readonly _span: Span,
		private readonly _onDidCompleteSpan: Emitter<ICompletedSpanData>,
		private readonly _onDidEmitSpanEvent: Emitter<ISpanEventData>,
		initialAttributes?: Record<string, string | number | boolean | string[]>,
		parentSpanId?: string,
	) {
		this._parentSpanId = parentSpanId;
		if (initialAttributes) {
			for (const k in initialAttributes) {
				if (Object.prototype.hasOwnProperty.call(initialAttributes, k)) {
					this._attributes[k] = initialAttributes[k];
				}
			}
		}
	}

	setAttribute(key: string, value: string | number | boolean | string[]): void {
		this._attributes[key] = value;
		this._span.setAttribute(key, value);
	}

	setAttributes(attrs: Record<string, string | number | boolean | string[] | undefined>): void {
		for (const k in attrs) {
			if (Object.prototype.hasOwnProperty.call(attrs, k)) {
				const v = attrs[k];
				if (v !== undefined) {
					this._attributes[k] = v;
					this._span.setAttribute(k, v);
				}
			}
		}
	}

	setStatus(code: SpanStatusCode, message?: string): void {
		this._statusCode = code;
		this._statusMessage = message;
		const otelCode = code === SpanStatusCode.OK ? 1 : code === SpanStatusCode.ERROR ? 2 : 0;
		this._span.setStatus({ code: otelCode, message });
	}

	recordException(error: unknown): void {
		if (error instanceof Error) {
			this._span.recordException(error);
		} else {
			this._span.recordException(new Error(String(error)));
		}
	}

	addEvent(name: string, attributes?: Record<string, string | number | boolean | string[]>): void {
		const timestamp = Date.now();
		const record: ISpanEventRecord = { name, timestamp, attributes };
		this._events.push(record);
		this._span.addEvent(name, attributes);

		// Fire real-time span event notification (guard against disposed emitter)
		try {
			const ctx = this._span.spanContext();
			this._onDidEmitSpanEvent.fire({
				spanId: ctx.spanId,
				traceId: ctx.traceId,
				parentSpanId: this._parentSpanId,
				eventName: name,
				attributes: attributes ?? {},
				timestamp,
			});
		} catch { /* emitter may be disposed after shutdown */ }
	}

	getSpanContext(): TraceContext | undefined {
		const ctx = this._span.spanContext();
		return ctx.traceId && ctx.spanId ? { traceId: ctx.traceId, spanId: ctx.spanId } : undefined;
	}

	end(): void {
		if (this._ended) {
			return;
		}
		this._ended = true;
		this._span.end();

		try {
			const ctx = this._span.spanContext();
			this._onDidCompleteSpan.fire({
				name: (this._span as unknown as { name?: string }).name ?? '',
				spanId: ctx.spanId,
				traceId: ctx.traceId,
				parentSpanId: this._parentSpanId,
				startTime: this._startTime,
				endTime: Date.now(),
				status: { code: this._statusCode, message: this._statusMessage },
				attributes: { ...this._attributes },
				events: [...this._events],
			});
		} catch { /* emitter may be disposed after shutdown */ }
	}
}

/**
 * Buffers span operations until the SDK is initialized, then replays them.
 */
class BufferedSpanHandle implements ISpanHandle {
	private static readonly _MAX_OPS = 200;
	private readonly _ops: Array<(span: ISpanHandle) => void> = [];
	private _real: ISpanHandle | undefined;

	setAttribute(key: string, value: string | number | boolean | string[]): void {
		if (this._real) { this._real.setAttribute(key, value); return; }
		if (this._ops.length < BufferedSpanHandle._MAX_OPS) {
			this._ops.push(s => s.setAttribute(key, value));
		}
	}

	setAttributes(attrs: Record<string, string | number | boolean | string[] | undefined>): void {
		if (this._real) { this._real.setAttributes(attrs); return; }
		if (this._ops.length < BufferedSpanHandle._MAX_OPS) {
			this._ops.push(s => s.setAttributes(attrs));
		}
	}

	setStatus(code: SpanStatusCode, message?: string): void {
		if (this._real) { this._real.setStatus(code, message); return; }
		if (this._ops.length < BufferedSpanHandle._MAX_OPS) {
			this._ops.push(s => s.setStatus(code, message));
		}
	}

	recordException(error: unknown): void {
		if (this._real) { this._real.recordException(error); return; }
		if (this._ops.length < BufferedSpanHandle._MAX_OPS) {
			this._ops.push(s => s.recordException(error));
		}
	}

	addEvent(name: string, attributes?: Record<string, string | number | boolean | string[]>): void {
		if (this._real) { this._real.addEvent(name, attributes); return; }
		if (this._ops.length < BufferedSpanHandle._MAX_OPS) {
			this._ops.push(s => s.addEvent(name, attributes));
		}
	}

	getSpanContext(): TraceContext | undefined {
		return this._real?.getSpanContext();
	}

	end(): void {
		if (this._real) { this._real.end(); return; }
		// Always buffer end() regardless of cap — it's critical for span lifecycle
		this._ops.push(s => s.end());
	}

	replay(real: ISpanHandle): void {
		this._real = real;
		for (const op of this._ops) {
			op(real);
		}
		this._ops.length = 0;
	}
}

function toOTelSpanKind(kind: SpanKind | undefined): number {
	switch (kind) {
		case SpanKind.CLIENT: return 2; // OTel SpanKind.CLIENT
		case SpanKind.INTERNAL: return 0; // OTel SpanKind.INTERNAL
		default: return 0; // INTERNAL
	}
}

/**
 * Operation names that follow the GenAI semantic conventions and should be
 * exported to the user's OTLP endpoint. Debug-panel-only spans (e.g.,
 * `content_event`, `user_message`) are excluded from external export but
 * still visible in the in-memory span store for the Agent Debug Log panel.
 */
const EXPORTABLE_OPERATION_NAMES: ReadonlySet<string> = new Set([
	GenAiOperationName.CHAT,
	GenAiOperationName.INVOKE_AGENT,
	GenAiOperationName.EXECUTE_TOOL,
	GenAiOperationName.EMBEDDINGS,
	GenAiOperationName.EXECUTE_HOOK,
]);

/**
 * Wraps a SpanExporter to log diagnostic info about export results.
 * Logs once on first successful export (info), and on every failure (warn).
 *
 * Also filters out debug-panel-only spans (those with non-standard
 * `gen_ai.operation.name` values) so they don't appear in the user's
 * configured OTel collector.
 */
class DiagnosticSpanExporter implements SpanExporter {
	private _firstSuccessLogged = false;
	private _lastFailureLogTime = 0;
	private static readonly _FAILURE_LOG_INTERVAL_MS = 60_000;
	private readonly _inner: SpanExporter;
	private readonly _exporterType: string;
	private readonly _log: OTelLogFn;

	constructor(inner: SpanExporter, exporterType: string, logFn: OTelLogFn) {
		this._inner = inner;
		this._exporterType = exporterType;
		this._log = logFn;
	}

	export(spans: ReadableSpan[], resultCallback: (result: ExportResult) => void): void {
		// Filter out debug-panel-only spans — only export standard GenAI operations
		const exportable = spans.filter(span => {
			const opName = span.attributes[GenAiAttr.OPERATION_NAME];
			// If no operation name set, export it (safety: don't drop unknown spans)
			if (opName === undefined) {
				return true;
			}
			return EXPORTABLE_OPERATION_NAMES.has(String(opName));
		});
		if (exportable.length === 0) {
			resultCallback({ code: 0 }); // ExportResultCode.SUCCESS
			return;
		}
		this._inner.export(exportable, result => {
			// ExportResultCode.SUCCESS === 0
			if (result.code === 0) {
				if (!this._firstSuccessLogged) {
					this._firstSuccessLogged = true;
					this._log('info', `[OTel] First span batch exported successfully via ${this._exporterType} (${exportable.length} spans)`);
				}
			} else {
				// Rate-limit failure logging to avoid flooding stdout
				const now = Date.now();
				if (now - this._lastFailureLogTime >= DiagnosticSpanExporter._FAILURE_LOG_INTERVAL_MS) {
					this._lastFailureLogTime = now;
					this._log('warn', `[OTel] Span export failed via ${this._exporterType}: ${result.error ?? 'unknown error'}`);
				}
			}
			resultCallback(result);
		});
	}

	shutdown(): Promise<void> {
		return this._inner.shutdown?.() ?? Promise.resolve();
	}

	forceFlush(): Promise<void> {
		return this._inner.forceFlush?.() ?? Promise.resolve();
	}
}

/**
 * Wraps a SpanExporter to filter out debug-panel-only spans,
 * passing only standard GenAI operations through to the inner exporter.
 */
class FilteredSpanExporter implements SpanExporter {
	constructor(private readonly _inner: SpanExporter) { }

	export(spans: ReadableSpan[], resultCallback: (result: ExportResult) => void): void {
		const filtered = spans.filter(span => {
			const opName = span.attributes[GenAiAttr.OPERATION_NAME];
			return opName === undefined || EXPORTABLE_OPERATION_NAMES.has(String(opName));
		});
		if (filtered.length === 0) {
			resultCallback({ code: 0 });
			return;
		}
		this._inner.export(filtered, resultCallback);
	}

	shutdown(): Promise<void> { return this._inner.shutdown?.() ?? Promise.resolve(); }
	forceFlush(): Promise<void> { return this._inner.forceFlush?.() ?? Promise.resolve(); }
}

/**
 * No-op span exporter for db-only mode — the SQLite exporter handles persistence,
 * this satisfies the OTel pipeline requirement for a primary exporter.
 */
class NoopSpanExporter implements SpanExporter {
	export(_spans: ReadableSpan[], resultCallback: (result: ExportResult) => void): void {
		resultCallback({ code: 0 }); // ExportResultCode.SUCCESS
	}
	shutdown(): Promise<void> { return Promise.resolve(); }
	forceFlush(): Promise<void> { return Promise.resolve(); }
}
