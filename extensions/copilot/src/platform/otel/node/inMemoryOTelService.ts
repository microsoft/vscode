/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AsyncLocalStorage } from 'async_hooks';
import { Emitter, type Event } from '../../../util/vs/base/common/event';
import type { OTelConfig } from '../common/otelConfig';
import { SpanStatusCode, type ICompletedSpanData, type IOTelService, type ISpanEventData, type ISpanEventRecord, type ISpanHandle, type SpanOptions, type TraceContext } from '../common/otelService';

let nextId = 1;
function hexId(len: number): string {
	return (nextId++).toString(16).padStart(len, '0');
}

/**
 * Span context stored in AsyncLocalStorage for correct parent-child propagation
 * across concurrent async operations.
 */
interface SpanContext {
	readonly spanId: string;
	readonly traceId: string;
}

/**
 * Full-fidelity span handle that tracks all attributes, events, and status in-memory.
 * Fires onDidCompleteSpan on end() and onDidEmitSpanEvent on addEvent().
 */
class InMemorySpanHandle implements ISpanHandle {
	private readonly _attributes: Record<string, string | number | boolean | string[]> = {};
	private readonly _events: ISpanEventRecord[] = [];
	private _statusCode = SpanStatusCode.UNSET;
	private _statusMessage?: string;
	private readonly _startTime = Date.now();
	private _ended = false;

	readonly spanId: string;
	readonly traceId: string;
	readonly parentSpanId: string | undefined;

	constructor(
		readonly name: string,
		private readonly _onDidCompleteSpan: Emitter<ICompletedSpanData>,
		private readonly _onDidEmitSpanEvent: Emitter<ISpanEventData>,
		parentContext?: SpanContext,
		initialAttributes?: Record<string, string | number | boolean | string[]>,
	) {
		this.spanId = hexId(16);
		this.traceId = parentContext?.traceId ?? hexId(32);
		this.parentSpanId = parentContext?.spanId;
		if (initialAttributes) {
			Object.assign(this._attributes, initialAttributes);
		}
	}

	setAttribute(key: string, value: string | number | boolean | string[]): void {
		this._attributes[key] = value;
	}

	setAttributes(attrs: Record<string, string | number | boolean | string[] | undefined>): void {
		for (const k in attrs) {
			if (Object.prototype.hasOwnProperty.call(attrs, k)) {
				const v = attrs[k];
				if (v !== undefined) {
					this._attributes[k] = v;
				}
			}
		}
	}

	setStatus(code: SpanStatusCode, message?: string): void {
		this._statusCode = code;
		this._statusMessage = message;
	}

	recordException(_error: unknown): void { /* no-op for in-memory */ }

	addEvent(name: string, attributes?: Record<string, string | number | boolean | string[]>): void {
		const timestamp = Date.now();
		this._events.push({ name, timestamp, attributes });
		try {
			this._onDidEmitSpanEvent.fire({
				spanId: this.spanId,
				traceId: this.traceId,
				parentSpanId: this.parentSpanId,
				eventName: name,
				attributes: attributes ?? {},
				timestamp,
			});
		} catch { /* emitter disposed */ }
	}

	end(): void {
		if (this._ended) { return; }
		this._ended = true;
		try {
			this._onDidCompleteSpan.fire({
				name: this.name,
				spanId: this.spanId,
				traceId: this.traceId,
				parentSpanId: this.parentSpanId,
				startTime: this._startTime,
				endTime: Date.now(),
				status: { code: this._statusCode, message: this._statusMessage },
				attributes: { ...this._attributes },
				events: [...this._events],
			});
		} catch { /* emitter disposed */ }
	}

	get context(): SpanContext {
		return { spanId: this.spanId, traceId: this.traceId };
	}

	getSpanContext(): TraceContext | undefined {
		return { spanId: this.spanId, traceId: this.traceId };
	}
}

/**
 * In-memory OTel service for the debug panel.
 *
 * Uses Node.js AsyncLocalStorage for correct parent-child span propagation
 * across concurrent async operations (e.g., parallel tool calls, subagents).
 * Does NOT load the OTel SDK or export to any backend.
 *
 * Used when OTel external export is disabled (the default).
 * When OTel export IS enabled, NodeOTelService is used instead (which has
 * both in-memory tracking AND SDK-based export).
 */
export class InMemoryOTelService implements IOTelService {
	declare readonly _serviceBrand: undefined;
	readonly config: OTelConfig;

	private readonly _onDidCompleteSpan = new Emitter<ICompletedSpanData>();
	readonly onDidCompleteSpan: Event<ICompletedSpanData> = this._onDidCompleteSpan.event;
	private readonly _onDidEmitSpanEvent = new Emitter<ISpanEventData>();
	readonly onDidEmitSpanEvent: Event<ISpanEventData> = this._onDidEmitSpanEvent.event;

	injectCompletedSpan(span: ICompletedSpanData): void {
		try { this._onDidCompleteSpan.fire(span); } catch { /* emitter may be disposed */ }
	}

	/** AsyncLocalStorage for correct context propagation across concurrent async ops */
	private readonly _contextStorage = new AsyncLocalStorage<SpanContext>();

	/** Trace context store for cross-boundary propagation (e.g., subagent invocations) */
	private static readonly _MAX_TRACE_CONTEXT_STORE_SIZE = 1000;
	private readonly _traceContextStore = new Map<string, TraceContext>();
	private readonly _traceContextTimers = new Map<string, ReturnType<typeof setTimeout>>();

	constructor(config: OTelConfig) {
		this.config = config;
	}

	startSpan(name: string, options?: SpanOptions): ISpanHandle {
		const parentCtx = this._resolveParentContext(options);
		return new InMemorySpanHandle(
			name,
			this._onDidCompleteSpan,
			this._onDidEmitSpanEvent,
			parentCtx,
			options?.attributes as Record<string, string | number | boolean | string[]>,
		);
	}

	async startActiveSpan<T>(name: string, options: SpanOptions, fn: (span: ISpanHandle) => Promise<T>): Promise<T> {
		const parentCtx = this._resolveParentContext(options);
		const handle = new InMemorySpanHandle(
			name,
			this._onDidCompleteSpan,
			this._onDidEmitSpanEvent,
			parentCtx,
			options?.attributes as Record<string, string | number | boolean | string[]>,
		);
		return this._contextStorage.run(handle.context, async () => {
			try {
				return await fn(handle);
			} finally {
				handle.end();
			}
		});
	}

	getActiveTraceContext(): TraceContext | undefined {
		const ctx = this._contextStorage.getStore();
		return ctx ? { traceId: ctx.traceId, spanId: ctx.spanId } : undefined;
	}

	storeTraceContext(key: string, context: TraceContext): void {
		// Evict oldest entry if at capacity
		if (this._traceContextStore.size >= InMemoryOTelService._MAX_TRACE_CONTEXT_STORE_SIZE) {
			const oldestKey = this._traceContextStore.keys().next().value;
			if (oldestKey !== undefined) {
				this._clearStoredTraceContext(oldestKey);
			}
		}
		this._traceContextStore.set(key, context);
		// Auto-cleanup after 30 minutes (generous for long-running agent sessions)
		const timer = setTimeout(() => this._clearStoredTraceContext(key), 30 * 60 * 1000);
		this._traceContextTimers.set(key, timer);
	}

	getStoredTraceContext(key: string): TraceContext | undefined {
		const ctx = this._traceContextStore.get(key);
		if (ctx) { this._clearStoredTraceContext(key); }
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

	runWithTraceContext<T>(traceContext: TraceContext, fn: () => Promise<T>): Promise<T> {
		return this._contextStorage.run({ spanId: traceContext.spanId, traceId: traceContext.traceId }, fn);
	}

	// ── No-ops for metrics/logs (not needed for debug panel for now) ──

	recordMetric(_name: string, _value: number, _attributes?: Record<string, string | number | boolean>): void { }
	incrementCounter(_name: string, _value?: number, _attributes?: Record<string, string | number | boolean>): void { }
	emitLogRecord(_body: string, _attributes?: Record<string, unknown>): void { }
	async flush(): Promise<void> { }

	async shutdown(): Promise<void> {
		for (const timer of this._traceContextTimers.values()) {
			clearTimeout(timer);
		}
		this._traceContextTimers.clear();
		this._traceContextStore.clear();
		this._onDidCompleteSpan.dispose();
		this._onDidEmitSpanEvent.dispose();
	}

	// ── Private ──

	private _resolveParentContext(options?: SpanOptions): SpanContext | undefined {
		// Explicit parent takes priority (e.g., subagent linking)
		if (options?.parentTraceContext) {
			return {
				spanId: options.parentTraceContext.spanId,
				traceId: options.parentTraceContext.traceId,
			};
		}
		// Otherwise inherit from async context
		return this._contextStorage.getStore();
	}
}
