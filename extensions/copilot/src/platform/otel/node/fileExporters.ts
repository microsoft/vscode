/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type ExportResult, ExportResultCode } from '@opentelemetry/core';
import type { LogRecordExporter, ReadableLogRecord } from '@opentelemetry/sdk-logs';
import { type PushMetricExporter, type ResourceMetrics, AggregationTemporality } from '@opentelemetry/sdk-metrics';
import type { ReadableSpan, SpanExporter } from '@opentelemetry/sdk-trace-node';
import * as fs from 'node:fs';

function safeStringify(data: unknown): string {
	try {
		return JSON.stringify(data);
	} catch {
		return '{}';
	}
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
}

export class FileSpanExporter extends BaseFileExporter implements SpanExporter {
	export(spans: ReadableSpan[], resultCallback: (result: ExportResult) => void): void {
		const data = spans.map(s => safeStringify(s) + '\n').join('');
		this.writeStream.write(data, err => {
			resultCallback({ code: err ? ExportResultCode.FAILED : ExportResultCode.SUCCESS, error: err ?? undefined });
		});
	}
}

export class FileLogExporter extends BaseFileExporter implements LogRecordExporter {
	export(logs: ReadableLogRecord[], resultCallback: (result: ExportResult) => void): void {
		const data = logs.map(l => safeStringify(l) + '\n').join('');
		this.writeStream.write(data, err => {
			resultCallback({ code: err ? ExportResultCode.FAILED : ExportResultCode.SUCCESS, error: err ?? undefined });
		});
	}
}

export class FileMetricExporter extends BaseFileExporter implements PushMetricExporter {
	export(metrics: ResourceMetrics, resultCallback: (result: ExportResult) => void): void {
		const data = safeStringify(metrics) + '\n';
		this.writeStream.write(data, err => {
			resultCallback({ code: err ? ExportResultCode.FAILED : ExportResultCode.SUCCESS, error: err ?? undefined });
		});
	}

	selectAggregationTemporality(): AggregationTemporality {
		return AggregationTemporality.CUMULATIVE;
	}
}
