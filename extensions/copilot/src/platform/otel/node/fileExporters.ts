/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { SpanContext } from '@opentelemetry/api';
import { type ExportResult, ExportResultCode } from '@opentelemetry/core';
import type { LogRecordExporter, ReadableLogRecord } from '@opentelemetry/sdk-logs';
import { type PushMetricExporter, type ResourceMetrics, AggregationTemporality } from '@opentelemetry/sdk-metrics';
import type { ReadableSpan, SpanExporter } from '@opentelemetry/sdk-trace-node';
import * as fs from 'node:fs';

/**
 * @throws If serialization fails or produces no JSON value. The export boundary
 * in BaseFileExporter.write reports the failure without writing a placeholder.
 */
function stringify(data: unknown): string {
	const result = JSON.stringify(data);
	if (result === undefined) {
		throw new TypeError('Unable to serialize OpenTelemetry data');
	}
	return result;
}

function spanContextToJson(context: SpanContext) {
	return {
		traceId: context.traceId,
		spanId: context.spanId,
		traceFlags: context.traceFlags,
		traceState: context.traceState?.serialize(),
		isRemote: context.isRemote,
	};
}

/**
 * Export public span data, not the SDK implementation's circular processor state.
 * Contexts need explicit conversion because TraceState is not a plain JSON value.
 */
function readableSpanToJson(span: ReadableSpan) {
	return {
		...spanContextToJson(span.spanContext()),
		parentSpanContext: span.parentSpanContext ? spanContextToJson(span.parentSpanContext) : undefined,
		name: span.name,
		kind: span.kind,
		startTime: span.startTime,
		endTime: span.endTime,
		duration: span.duration,
		ended: span.ended,
		attributes: span.attributes,
		status: span.status,
		events: span.events,
		links: span.links.map(link => ({
			context: spanContextToJson(link.context),
			attributes: link.attributes,
			droppedAttributesCount: link.droppedAttributesCount,
		})),
		resource: {
			attributes: span.resource.attributes,
			schemaUrl: span.resource.schemaUrl,
		},
		instrumentationScope: span.instrumentationScope,
		droppedAttributesCount: span.droppedAttributesCount,
		droppedEventsCount: span.droppedEventsCount,
		droppedLinksCount: span.droppedLinksCount,
	};
}

abstract class BaseFileExporter {
	protected readonly writeStream: fs.WriteStream;

	constructor(filePath: string) {
		this.writeStream = fs.createWriteStream(filePath, { flags: 'a' });
	}

	shutdown(): Promise<void> {
		return new Promise(resolve => this.writeStream.end(resolve));
	}

	forceFlush(): Promise<void> {
		return Promise.resolve();
	}

	protected write(dataFactory: () => string, resultCallback: (result: ExportResult) => void): void {
		let data: string;
		try {
			data = dataFactory();
		} catch (error) {
			resultCallback({ code: ExportResultCode.FAILED, error: error instanceof Error ? error : new Error(String(error)) });
			return;
		}

		this.writeStream.write(data, error => {
			resultCallback({ code: error ? ExportResultCode.FAILED : ExportResultCode.SUCCESS, error: error ?? undefined });
		});
	}
}

export class FileSpanExporter extends BaseFileExporter implements SpanExporter {
	export(spans: ReadableSpan[], resultCallback: (result: ExportResult) => void): void {
		this.write(() => spans.map(span => stringify(readableSpanToJson(span)) + '\n').join(''), resultCallback);
	}
}

export class FileLogExporter extends BaseFileExporter implements LogRecordExporter {
	export(logs: ReadableLogRecord[], resultCallback: (result: ExportResult) => void): void {
		this.write(() => logs.map(log => stringify(log) + '\n').join(''), resultCallback);
	}
}

export class FileMetricExporter extends BaseFileExporter implements PushMetricExporter {
	export(metrics: ResourceMetrics, resultCallback: (result: ExportResult) => void): void {
		this.write(() => stringify(metrics) + '\n', resultCallback);
	}

	selectAggregationTemporality(): AggregationTemporality {
		return AggregationTemporality.CUMULATIVE;
	}
}
