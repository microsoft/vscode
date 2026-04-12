/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../util/vs/base/common/event';
import type { OTelConfig } from './otelConfig';
import type { ICompletedSpanData, IOTelService, ISpanEventData, ISpanHandle, SpanOptions, TraceContext } from './otelService';

const noopSpan: ISpanHandle = {
	setAttribute() { },
	setAttributes() { },
	setStatus() { },
	recordException() { },
	addEvent() { },
	getSpanContext() { return undefined; },
	end() { },
};

/**
 * No-op implementation of IOTelService.
 * All methods are zero-cost when OTel is disabled.
 */
export class NoopOTelService implements IOTelService {
	declare readonly _serviceBrand: undefined;
	readonly config: OTelConfig;

	constructor(config: OTelConfig) {
		this.config = config;
	}

	startSpan(_name: string, _options?: SpanOptions): ISpanHandle {
		return noopSpan;
	}

	startActiveSpan<T>(_name: string, _options: SpanOptions, fn: (span: ISpanHandle) => Promise<T>): Promise<T> {
		return fn(noopSpan);
	}

	getActiveTraceContext(): TraceContext | undefined {
		return undefined;
	}

	storeTraceContext(_key: string, _context: TraceContext): void { }

	getStoredTraceContext(_key: string): TraceContext | undefined {
		return undefined;
	}

	runWithTraceContext<T>(_traceContext: TraceContext, fn: () => Promise<T>): Promise<T> {
		return fn();
	}

	recordMetric(_name: string, _value: number, _attributes?: Record<string, string | number | boolean>): void { }

	incrementCounter(_name: string, _value?: number, _attributes?: Record<string, string | number | boolean>): void { }

	emitLogRecord(_body: string, _attributes?: Record<string, unknown>): void { }

	async flush(): Promise<void> { }

	async shutdown(): Promise<void> { }

	injectCompletedSpan(_span: ICompletedSpanData): void { }

	readonly onDidCompleteSpan: Event<ICompletedSpanData> = Event.None;
	readonly onDidEmitSpanEvent: Event<ISpanEventData> = Event.None;
}
