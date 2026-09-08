/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SpanKind, SpanStatusCode, type Span } from '@opentelemetry/api';
import { type ExportResult, ExportResultCode } from '@opentelemetry/core';
import { AggregationTemporality } from '@opentelemetry/sdk-metrics';
import { InMemorySpanExporter, NodeTracerProvider, type ReadableSpan, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-node';
import { resourceFromAttributes } from '@opentelemetry/resources';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { packageJson } from '../../../env/common/packagejson';
import { CopilotChatAttr, GenAiAttr, GenAiOperationName } from '../../common/genAiAttributes';
import { FileLogExporter, FileMetricExporter, FileSpanExporter } from '../fileExporters';

const userPrompt = 'Read every .md file in this project in parallel and summarise each in one line.';

async function createFinishedSpans(names: readonly string[], configure?: (span: Span) => void): Promise<ReadableSpan[]> {
	const memoryExporter = new InMemorySpanExporter();
	const provider = new NodeTracerProvider({
		resource: resourceFromAttributes({
			'service.name': 'copilot-chat',
			'session.id': 'test-session',
		}),
		spanProcessors: [new SimpleSpanProcessor(memoryExporter)],
	});
	const tracer = provider.getTracer('copilot-chat', packageJson.version);

	for (const name of names) {
		const span = tracer.startSpan(name, { kind: SpanKind.INTERNAL });
		configure?.(span);
		span.end();
	}

	const spans = [...memoryExporter.getFinishedSpans()];
	await provider.shutdown();
	return spans;
}

function exportSpans(exporter: FileSpanExporter, spans: ReadableSpan[]): Promise<ExportResult> {
	return new Promise(resolve => exporter.export(spans, resolve));
}

describe('FileSpanExporter', () => {
	let tmpFile: string;
	let exporter: FileSpanExporter;

	beforeEach(() => {
		tmpFile = path.join(os.tmpdir(), `otel-test-spans-${Date.now()}.jsonl`);
		exporter = new FileSpanExporter(tmpFile);
	});

	afterEach(async () => {
		await exporter.shutdown();
		try { fs.unlinkSync(tmpFile); } catch { }
	});

	it('writes span data as JSON lines', async () => {
		const [span] = await createFinishedSpans(['invoke_agent'], span => {
			span.setAttributes({
				[GenAiAttr.OPERATION_NAME]: GenAiOperationName.INVOKE_AGENT,
				[GenAiAttr.INPUT_MESSAGES]: JSON.stringify([{ role: 'user', parts: [{ type: 'text', content: userPrompt }] }]),
				[CopilotChatAttr.USER_REQUEST]: userPrompt,
			});
			span.addEvent('user_message', { content: userPrompt });
			span.setStatus({ code: SpanStatusCode.OK });
		});
		const result = await exportSpans(exporter, [span]);
		expect(result.code).toBe(ExportResultCode.SUCCESS);
		await exporter.shutdown();
		const content = fs.readFileSync(tmpFile, 'utf-8');
		expect(JSON.parse(content.trim())).toMatchObject({
			resource: {
				attributes: {
					'service.name': 'copilot-chat',
					'session.id': 'test-session',
				},
			},
			instrumentationScope: { name: 'copilot-chat', version: packageJson.version },
			traceId: span.spanContext().traceId,
			spanId: span.spanContext().spanId,
			name: 'invoke_agent',
			kind: SpanKind.INTERNAL,
			ended: true,
			attributes: {
				[GenAiAttr.OPERATION_NAME]: GenAiOperationName.INVOKE_AGENT,
				[GenAiAttr.INPUT_MESSAGES]: JSON.stringify([{ role: 'user', parts: [{ type: 'text', content: userPrompt }] }]),
				[CopilotChatAttr.USER_REQUEST]: userPrompt,
			},
			status: { code: SpanStatusCode.OK },
			events: [{ name: 'user_message', attributes: { content: userPrompt } }],
			droppedAttributesCount: 0,
			droppedEventsCount: 0,
			droppedLinksCount: 0,
		});
	});

	it('appends multiple exports', async () => {
		const spans = await createFinishedSpans(['span-0', 'span-1', 'span-2']);
		for (const span of spans) {
			const result = await exportSpans(exporter, [span]);
			expect(result.code).toBe(ExportResultCode.SUCCESS);
		}
		await exporter.shutdown();
		const lines = fs.readFileSync(tmpFile, 'utf-8').trim().split('\n');
		expect(lines).toHaveLength(3);
		expect(JSON.parse(lines[0]).name).toBe('span-0');
		expect(JSON.parse(lines[2]).name).toBe('span-2');
	});

	it('reports serialization failures without writing an empty object', async () => {
		const serializationError = new Error('span context unavailable');
		const [span] = await createFinishedSpans(['invoke_agent']);
		const brokenSpan: ReadableSpan = new Proxy(span, {
			get: (target, property, receiver) => property === 'spanContext'
				? () => { throw serializationError; }
				: Reflect.get(target, property, receiver),
		});

		const result = await exportSpans(exporter, [brokenSpan]);
		expect(result).toEqual({ code: ExportResultCode.FAILED, error: serializationError });
		await exporter.shutdown();
		expect(fs.readFileSync(tmpFile, 'utf-8')).toBe('');
	});
});

describe('FileLogExporter', () => {
	let tmpFile: string;
	let exporter: FileLogExporter;

	beforeEach(() => {
		tmpFile = path.join(os.tmpdir(), `otel-test-logs-${Date.now()}.jsonl`);
		exporter = new FileLogExporter(tmpFile);
	});

	afterEach(async () => {
		await exporter.shutdown();
		try { fs.unlinkSync(tmpFile); } catch { }
	});

	it('writes log records as JSON lines', async () => {
		const fakeLog = { body: 'test log', severityText: 'INFO' };
		await new Promise<void>((resolve, reject) => {
			exporter.export([fakeLog as any], result => {
				result.code === ExportResultCode.SUCCESS ? resolve() : reject(result.error);
			});
		});
		await exporter.shutdown();
		const content = fs.readFileSync(tmpFile, 'utf-8');
		const parsed = JSON.parse(content.trim());
		expect(parsed.body).toBe('test log');
	});
});

describe('FileMetricExporter', () => {
	let tmpFile: string;
	let exporter: FileMetricExporter;

	beforeEach(() => {
		tmpFile = path.join(os.tmpdir(), `otel-test-metrics-${Date.now()}.jsonl`);
		exporter = new FileMetricExporter(tmpFile);
	});

	afterEach(async () => {
		await exporter.shutdown();
		try { fs.unlinkSync(tmpFile); } catch { }
	});

	it('writes metric data as JSON lines', async () => {
		const fakeMetrics = { resource: {}, scopeMetrics: [{ metrics: [{ name: 'test' }] }] };
		await new Promise<void>((resolve, reject) => {
			exporter.export(fakeMetrics as any, result => {
				result.code === ExportResultCode.SUCCESS ? resolve() : reject(result.error);
			});
		});
		await exporter.shutdown();
		const content = fs.readFileSync(tmpFile, 'utf-8');
		const parsed = JSON.parse(content.trim());
		expect(parsed.scopeMetrics[0].metrics[0].name).toBe('test');
	});

	it('returns CUMULATIVE aggregation temporality', () => {
		expect(exporter.selectAggregationTemporality()).toBe(AggregationTemporality.CUMULATIVE);
	});
});
