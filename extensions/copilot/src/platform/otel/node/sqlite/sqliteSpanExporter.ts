/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ExportResultCode, type ExportResult } from '@opentelemetry/core';
import type { ReadableSpan, SpanExporter } from '@opentelemetry/sdk-trace-node';
import { SpanStatusCode, type ICompletedSpanData, type ISpanEventRecord } from '../../common/otelService';
import type { OTelSqliteStore } from './otelSqliteStore';

/**
 * OTel SpanExporter that writes completed spans into the SQLite store.
 *
 * Registered as a BatchSpanProcessor exporter so spans flow through the
 * standard OTel pipeline. Each ReadableSpan is converted to ICompletedSpanData
 * and inserted into the store.
 */
export class SqliteSpanExporter implements SpanExporter {
	constructor(private readonly _store: OTelSqliteStore) { }

	export(spans: ReadableSpan[], resultCallback: (result: ExportResult) => void): void {
		try {
			for (const span of spans) {
				this._store.insertSpan(readableSpanToCompletedSpanData(span));
			}
			resultCallback({ code: ExportResultCode.SUCCESS });
		} catch (err) {
			resultCallback({ code: ExportResultCode.FAILED, error: err instanceof Error ? err : new Error(String(err)) });
		}
	}

	shutdown(): Promise<void> {
		return Promise.resolve();
	}

	forceFlush(): Promise<void> {
		return Promise.resolve();
	}
}

/**
 * Convert an OTel SDK ReadableSpan to our ICompletedSpanData format.
 */
function readableSpanToCompletedSpanData(span: ReadableSpan): ICompletedSpanData {
	const ctx = span.spanContext();
	const parentSpanId = span.parentSpanContext?.spanId;

	// Convert HrTime [seconds, nanoseconds] to epoch ms
	const startTime = hrTimeToMs(span.startTime);
	const endTime = hrTimeToMs(span.endTime);

	// Convert attributes from OTel format to our flat record
	const attributes: Record<string, string | number | boolean | string[]> = {};
	for (const [key, value] of Object.entries(span.attributes)) {
		if (value !== undefined && value !== null) {
			if (Array.isArray(value)) {
				attributes[key] = value.map(String);
			} else {
				attributes[key] = value as string | number | boolean;
			}
		}
	}

	// Convert span events
	const events: ISpanEventRecord[] = span.events.map(evt => ({
		name: evt.name,
		timestamp: hrTimeToMs(evt.time),
		attributes: evt.attributes
			? Object.fromEntries(
				Object.entries(evt.attributes).filter(([, v]) => v !== undefined && v !== null).map(([k, v]) => [k, Array.isArray(v) ? v.map(String) : v as string | number | boolean])
			)
			: undefined,
	}));

	// Convert status
	let statusCode: SpanStatusCode;
	switch (span.status.code) {
		case 1: statusCode = SpanStatusCode.OK; break;
		case 2: statusCode = SpanStatusCode.ERROR; break;
		default: statusCode = SpanStatusCode.UNSET;
	}

	return {
		name: span.name,
		spanId: ctx.spanId,
		traceId: ctx.traceId,
		parentSpanId,
		startTime,
		endTime,
		status: { code: statusCode, message: span.status.message },
		attributes,
		events,
	};
}

function hrTimeToMs(hrTime: [number, number]): number {
	return hrTime[0] * 1000 + hrTime[1] / 1_000_000;
}
