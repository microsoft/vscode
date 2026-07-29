/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, type Event } from '../../../../util/vs/base/common/event';
import { resolveOTelConfig, type OTelConfig } from '../otelConfig';
import { SpanStatusCode, type ICompletedSpanData, type IOTelService, type ISpanEventData, type ISpanEventRecord, type ISpanHandle, type SpanOptions, type TraceContext } from '../otelService';

/**
 * Captured span record for test assertions.
 */
export interface CapturedSpan {
	name: string;
	kind?: number;
	attributes: Record<string, string | number | boolean | string[] | undefined>;
	statusCode?: SpanStatusCode;
	statusMessage?: string;
	exceptions: unknown[];
	ended: boolean;
	parentTraceContext?: TraceContext;
	events: ISpanEventRecord[];
}

/**
 * Captured metric record.
 */
export interface CapturedMetric {
	name: string;
	value: number;
	attributes?: Record<string, string | number | boolean>;
}

/**
 * Captured log record.
 */
export interface CapturedLogRecord {
	body: string;
	attributes?: Record<string, unknown>;
}

/**
 * IOTelService implementation that captures all operations for test verification.
 * Unlike NoopOTelService, this records spans, metrics, and logs so tests can
 * assert on the OTel output without a real SDK.
 */
export class CapturingOTelService implements IOTelService {
	declare readonly _serviceBrand: undefined;
	readonly config: OTelConfig;

	readonly spans: CapturedSpan[] = [];
	readonly metrics: CapturedMetric[] = [];
	readonly counters: CapturedMetric[] = [];
	readonly logRecords: CapturedLogRecord[] = [];
	private readonly _traceContextStore = new Map<string, TraceContext>();
	private readonly _onDidCompleteSpan = new Emitter<ICompletedSpanData>();
	readonly onDidCompleteSpan: Event<ICompletedSpanData> = this._onDidCompleteSpan.event;
	private readonly _onDidEmitSpanEvent = new Emitter<ISpanEventData>();
	readonly onDidEmitSpanEvent: Event<ISpanEventData> = this._onDidEmitSpanEvent.event;

	injectCompletedSpan(span: ICompletedSpanData): void {
		this._onDidCompleteSpan.fire(span);
	}

	constructor(config?: Partial<OTelConfig>) {
		this.config = {
			...resolveOTelConfig({ env: { 'COPILOT_OTEL_ENABLED': 'true' }, extensionVersion: '1.0.0', sessionId: 'test' }),
			...config,
		};
	}

	startSpan(name: string, options?: SpanOptions): ISpanHandle {
		const captured: CapturedSpan = {
			name,
			kind: options?.kind,
			attributes: { ...options?.attributes },
			exceptions: [],
			ended: false,
			parentTraceContext: options?.parentTraceContext,
			events: [],
		};
		this.spans.push(captured);
		return new CapturingSpanHandle(captured, this._onDidCompleteSpan, this._onDidEmitSpanEvent);
	}

	async startActiveSpan<T>(name: string, options: SpanOptions, fn: (span: ISpanHandle) => Promise<T>): Promise<T> {
		const span = this.startSpan(name, options);
		try {
			return await fn(span);
		} finally {
			span.end();
		}
	}

	getActiveTraceContext(): TraceContext | undefined {
		return undefined;
	}

	storeTraceContext(key: string, context: TraceContext): void {
		this._traceContextStore.set(key, context);
	}

	getStoredTraceContext(key: string): TraceContext | undefined {
		const ctx = this._traceContextStore.get(key);
		if (ctx) {
			this._traceContextStore.delete(key);
		}
		return ctx;
	}

	async runWithTraceContext<T>(_traceContext: TraceContext, fn: () => Promise<T>): Promise<T> {
		return fn();
	}

	recordMetric(name: string, value: number, attributes?: Record<string, string | number | boolean>): void {
		this.metrics.push({ name, value, attributes });
	}

	incrementCounter(name: string, value = 1, attributes?: Record<string, string | number | boolean>): void {
		this.counters.push({ name, value, attributes });
	}

	emitLogRecord(body: string, attributes?: Record<string, unknown>): void {
		this.logRecords.push({ body, attributes });
	}

	async flush(): Promise<void> { }
	async shutdown(): Promise<void> { }

	/** Find spans by name prefix. */
	findSpans(namePrefix: string): CapturedSpan[] {
		return this.spans.filter(s => s.name.startsWith(namePrefix));
	}

	/** Reset all captured data. */
	reset(): void {
		this.spans.length = 0;
		this.metrics.length = 0;
		this.counters.length = 0;
		this.logRecords.length = 0;
	}
}

class CapturingSpanHandle implements ISpanHandle {
	private static _nextSpanId = 1;
	private readonly _spanId: string;

	constructor(
		private readonly _captured: CapturedSpan,
		private readonly _onDidCompleteSpan: Emitter<ICompletedSpanData>,
		private readonly _onDidEmitSpanEvent: Emitter<ISpanEventData>,
	) {
		this._spanId = String(CapturingSpanHandle._nextSpanId++).padStart(16, '0');
	}

	setAttribute(key: string, value: string | number | boolean | string[]): void {
		this._captured.attributes[key] = value;
	}

	setAttributes(attrs: Record<string, string | number | boolean | string[] | undefined>): void {
		for (const k in attrs) {
			if (Object.prototype.hasOwnProperty.call(attrs, k)) {
				this._captured.attributes[k] = attrs[k];
			}
		}
	}

	setStatus(code: SpanStatusCode, message?: string): void {
		this._captured.statusCode = code;
		this._captured.statusMessage = message;
	}

	recordException(error: unknown): void {
		this._captured.exceptions.push(error);
	}

	addEvent(name: string, attributes?: Record<string, string | number | boolean | string[]>): void {
		const timestamp = Date.now();
		const record: ISpanEventRecord = { name, timestamp, attributes };
		this._captured.events.push(record);
		this._onDidEmitSpanEvent.fire({
			spanId: this._spanId,
			traceId: '00000000000000000000000000000000',
			eventName: name,
			attributes: attributes ?? {},
			timestamp,
		});
	}

	getSpanContext(): TraceContext | undefined {
		return { spanId: this._spanId, traceId: '00000000000000000000000000000000' };
	}

	end(): void {
		this._captured.ended = true;
		const attrs: Record<string, string | number | boolean | string[]> = {};
		for (const [k, v] of Object.entries(this._captured.attributes)) {
			if (v !== undefined) {
				attrs[k] = v;
			}
		}
		this._onDidCompleteSpan.fire({
			name: this._captured.name,
			spanId: this._spanId,
			traceId: '00000000000000000000000000000000',
			startTime: Date.now(),
			endTime: Date.now(),
			status: { code: this._captured.statusCode ?? SpanStatusCode.UNSET, message: this._captured.statusMessage },
			attributes: attrs,
			events: [...this._captured.events],
		});
	}
}
