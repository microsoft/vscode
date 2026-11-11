/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createTraceState, ROOT_CONTEXT, SpanKind, SpanStatusCode, trace, ValueType, type SpanContext } from '@opentelemetry/api';
import { ExportResultCode, type ExportResult } from '@opentelemetry/core';
import { resourceFromAttributes } from '@opentelemetry/resources';
import type { ReadableLogRecord } from '@opentelemetry/sdk-logs';
import { AggregationTemporality, DataPointType, type ResourceMetrics } from '@opentelemetry/sdk-metrics';
import { BatchSpanProcessor, InMemorySpanExporter, NodeTracerProvider, SimpleSpanProcessor, type ReadableSpan } from '@opentelemetry/sdk-trace-node';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GenAiAttr } from '../../common/genAiAttributes';
import { FileLogExporter, FileMetricExporter, FileSpanExporter } from '../fileExporters';

const schemaUrl = 'https://opentelemetry.io/schemas/1.37.0';
const resource = resourceFromAttributes({ 'service.name': 'file-exporter-test' }, { schemaUrl });
const processors = [
	{ name: 'simple', type: SimpleSpanProcessor },
	{ name: 'batch', type: BatchSpanProcessor },
];

async function createFinishedSpan(): Promise<ReadableSpan> {
	const exporter = new InMemorySpanExporter();
	const provider = new NodeTracerProvider({ spanProcessors: [new SimpleSpanProcessor(exporter)] });
	try {
		provider.getTracer('file-exporter-test').startSpan('test-span').end();
		await provider.forceFlush();
		return exporter.getFinishedSpans()[0];
	} finally {
		await provider.shutdown();
	}
}

describe('FileSpanExporter', () => {
	let tmpDir: string;
	let tmpFile: string;
	let exporter: FileSpanExporter;
	let provider: NodeTracerProvider | undefined;

	beforeEach(() => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'otel-test-spans-'));
		tmpFile = path.join(tmpDir, 'spans.jsonl');
		fs.writeFileSync(tmpFile, '');
		exporter = new FileSpanExporter(tmpFile);
		provider = undefined;
	});

	afterEach(async () => {
		try {
			await (provider ? provider.shutdown() : exporter.shutdown());
		} finally {
			fs.rmSync(tmpDir, { recursive: true });
		}
	});

	it.each(processors)('preserves public data from real SDK spans ($name)', async ({ type: Processor }) => {
		provider = new NodeTracerProvider({
			resource,
			spanProcessors: [new Processor(exporter)],
			spanLimits: {
				attributeCountLimit: 10,
				eventCountLimit: 1,
				linkCountLimit: 1,
				attributePerEventCountLimit: 1,
				attributePerLinkCountLimit: 1,
			},
		});
		const parentContext: SpanContext = {
			traceId: '1'.repeat(32),
			spanId: '2'.repeat(16),
			traceFlags: 1,
			traceState: createTraceState('vendor=parent'),
			isRemote: true,
		};
		const linkContext: SpanContext = {
			traceId: '3'.repeat(32),
			spanId: '4'.repeat(16),
			traceFlags: 1,
			traceState: createTraceState('vendor=link'),
			isRemote: true,
		};
		const attributes = {
			[GenAiAttr.OPERATION_NAME]: 'chat',
			[GenAiAttr.INPUT_MESSAGES]: '[{"role":"user","parts":[{"type":"text","content":"hello"}]}]',
			[GenAiAttr.OUTPUT_MESSAGES]: '[{"role":"assistant","parts":[{"type":"text","content":"hi"}]}]',
			[GenAiAttr.TOOL_CALL_ARGUMENTS]: '{"path":"test.txt"}',
			[GenAiAttr.TOOL_CALL_RESULT]: 'file contents',
			numbers: [1, 2],
			flags: [true, false],
			labels: ['a', 'b'],
			count: 3,
			success: true,
		};
		const tracer = provider.getTracer('file-exporter-test', '1.0.0', { schemaUrl });
		const span = tracer.startSpan('chat test-model', {
			kind: SpanKind.CLIENT,
			startTime: [1_700_000_000, 123_456_789],
			attributes,
			links: [
				{ context: parentContext },
				{ context: linkContext, attributes: { retained: true, dropped: true } },
			],
		}, trace.setSpanContext(ROOT_CONTEXT, parentContext));
		span.setAttribute('dropped', true);
		span.addEvent('dropped');
		span.addEvent('retained', { message: 'event content', dropped: true }, [1_700_000_000, 150_000_001]);
		span.setStatus({ code: SpanStatusCode.ERROR, message: 'test error' });
		span.end([1_700_000_000, 223_456_790]);
		await provider.forceFlush();

		expect(JSON.parse(fs.readFileSync(tmpFile, 'utf-8'))).toEqual({
			traceId: parentContext.traceId,
			spanId: span.spanContext().spanId,
			traceFlags: 1,
			traceState: 'vendor=parent',
			parentSpanContext: {
				traceId: parentContext.traceId,
				spanId: parentContext.spanId,
				traceFlags: 1,
				traceState: 'vendor=parent',
				isRemote: true,
			},
			name: 'chat test-model',
			kind: SpanKind.CLIENT,
			startTime: [1_700_000_000, 123_456_789],
			endTime: [1_700_000_000, 223_456_790],
			duration: [0, 100_000_001],
			ended: true,
			attributes,
			status: { code: SpanStatusCode.ERROR, message: 'test error' },
			events: [{
				name: 'retained',
				time: [1_700_000_000, 150_000_001],
				attributes: { message: 'event content' },
				droppedAttributesCount: 1,
			}],
			links: [{
				context: {
					traceId: linkContext.traceId,
					spanId: linkContext.spanId,
					traceFlags: 1,
					traceState: 'vendor=link',
					isRemote: true,
				},
				attributes: { retained: true },
				droppedAttributesCount: 1,
			}],
			resource: { attributes: { 'service.name': 'file-exporter-test' }, schemaUrl },
			instrumentationScope: { name: 'file-exporter-test', version: '1.0.0', schemaUrl },
			droppedAttributesCount: 1,
			droppedEventsCount: 1,
			droppedLinksCount: 1,
		});
	});

	it.each(processors)('appends exports and preserves parent-child relationships ($name)', async ({ type: Processor }) => {
		provider = new NodeTracerProvider({ spanProcessors: [new Processor(exporter)] });
		const tracer = provider.getTracer('file-exporter-test');
		const parent = tracer.startSpan('parent');
		parent.end();
		await provider.forceFlush();
		const child = tracer.startSpan('child', {}, trace.setSpan(ROOT_CONTEXT, parent));
		child.end();
		await provider.forceFlush();

		const records = fs.readFileSync(tmpFile, 'utf-8').trim().split('\n').map(line => JSON.parse(line));
		expect(records).toMatchObject([
			{ name: 'parent', traceId: parent.spanContext().traceId, spanId: parent.spanContext().spanId, attributes: {} },
			{
				name: 'child',
				traceId: parent.spanContext().traceId,
				spanId: child.spanContext().spanId,
				parentSpanContext: { traceId: parent.spanContext().traceId, spanId: parent.spanContext().spanId },
				attributes: {},
			},
		]);
	});

	it.each([
		{ name: 'Error', error: new Error('span context unavailable') },
		{ name: 'non-Error', error: 'span context unavailable' },
	])('reports a failed batch once without partial output and allows subsequent exports ($name)', async ({ error }) => {
		const span = await createFinishedSpan();
		const brokenSpan = new Proxy(span, {
			get: (target, property, receiver) => property === 'spanContext'
				? () => { throw error; }
				: Reflect.get(target, property, receiver),
		});
		const results: ExportResult[] = [];
		await new Promise<void>(resolve => exporter.export([span, brokenSpan], result => {
			results.push(result);
			resolve();
		}));
		const failedBatchOutput = fs.readFileSync(tmpFile, 'utf-8');
		await new Promise<void>(resolve => exporter.export([span], result => {
			results.push(result);
			resolve();
		}));

		expect({
			results,
			failedBatchOutput,
			name: JSON.parse(fs.readFileSync(tmpFile, 'utf-8')).name,
		}).toEqual({
			results: [
				{ code: ExportResultCode.FAILED, error: error instanceof Error ? error : new Error(error) },
				{ code: ExportResultCode.SUCCESS, error: undefined },
			],
			failedBatchOutput: '',
			name: 'test-span',
		});
	});

	it('accepts an empty batch without writing a record', async () => {
		const result = await new Promise<ExportResult>(resolve => exporter.export([], resolve));
		expect({ result, output: fs.readFileSync(tmpFile, 'utf-8') }).toEqual({
			result: { code: ExportResultCode.SUCCESS, error: undefined },
			output: '',
		});
	});
});

describe('FileLogExporter', () => {
	let tmpDir: string;
	let tmpFile: string;
	let exporter: FileLogExporter;
	const log: ReadableLogRecord = {
		body: 'test log',
		severityText: 'INFO',
		hrTime: [1, 0],
		hrTimeObserved: [1, 0],
		resource,
		instrumentationScope: { name: 'file-exporter-test' },
		attributes: { model: 'test-model' },
		droppedAttributesCount: 0,
	};

	beforeEach(() => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'otel-test-logs-'));
		tmpFile = path.join(tmpDir, 'logs.jsonl');
		fs.writeFileSync(tmpFile, '');
		exporter = new FileLogExporter(tmpFile);
	});

	afterEach(async () => {
		try {
			await exporter.shutdown();
		} finally {
			fs.rmSync(tmpDir, { recursive: true });
		}
	});

	it('preserves the existing log JSON representation', async () => {
		const result = await new Promise<ExportResult>(resolve => exporter.export([log], resolve));
		expect({ result, output: fs.readFileSync(tmpFile, 'utf-8') }).toEqual({
			result: { code: ExportResultCode.SUCCESS, error: undefined },
			output: JSON.stringify(log) + '\n',
		});
	});

	it('reports JSON serialization failures without partially writing a batch', async () => {
		const error = new Error('log serialization failed');
		const brokenLog = { ...log, toJSON: () => { throw error; } };
		const result = await new Promise<ExportResult>(resolve => exporter.export([log, brokenLog], resolve));
		expect({ result, output: fs.readFileSync(tmpFile, 'utf-8') }).toEqual({
			result: { code: ExportResultCode.FAILED, error },
			output: '',
		});
	});

	it('rejects records that do not serialize to JSON', async () => {
		const brokenLog = { ...log, toJSON: () => undefined };
		const result = await new Promise<ExportResult>(resolve => exporter.export([brokenLog], resolve));
		expect({ result, output: fs.readFileSync(tmpFile, 'utf-8') }).toEqual({
			result: { code: ExportResultCode.FAILED, error: new TypeError('Unable to serialize OpenTelemetry data') },
			output: '',
		});
	});
});

describe('FileMetricExporter', () => {
	let tmpDir: string;
	let tmpFile: string;
	let exporter: FileMetricExporter;
	const metrics: ResourceMetrics = {
		resource,
		scopeMetrics: [{
			scope: { name: 'file-exporter-test' },
			metrics: [{
				descriptor: { name: 'test', description: '', unit: '1', valueType: ValueType.INT },
				dataPointType: DataPointType.SUM,
				aggregationTemporality: AggregationTemporality.CUMULATIVE,
				isMonotonic: true,
				dataPoints: [{ startTime: [1, 0], endTime: [2, 0], attributes: {}, value: 3 }],
			}],
		}],
	};

	beforeEach(() => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'otel-test-metrics-'));
		tmpFile = path.join(tmpDir, 'metrics.jsonl');
		fs.writeFileSync(tmpFile, '');
		exporter = new FileMetricExporter(tmpFile);
	});

	afterEach(async () => {
		try {
			await exporter.shutdown();
		} finally {
			fs.rmSync(tmpDir, { recursive: true });
		}
	});

	it('preserves the existing metric JSON representation', async () => {
		const result = await new Promise<ExportResult>(resolve => exporter.export(metrics, resolve));
		expect({ result, output: fs.readFileSync(tmpFile, 'utf-8') }).toEqual({
			result: { code: ExportResultCode.SUCCESS, error: undefined },
			output: JSON.stringify(metrics) + '\n',
		});
	});

	it('reports JSON serialization failures instead of writing placeholders', async () => {
		const error = new Error('metric serialization failed');
		const brokenMetrics = { ...metrics, toJSON: () => { throw error; } };
		const result = await new Promise<ExportResult>(resolve => exporter.export(brokenMetrics, resolve));
		expect({ result, output: fs.readFileSync(tmpFile, 'utf-8') }).toEqual({
			result: { code: ExportResultCode.FAILED, error },
			output: '',
		});
	});

	it('returns CUMULATIVE aggregation temporality', () => {
		expect(exporter.selectAggregationTemporality()).toBe(AggregationTemporality.CUMULATIVE);
	});
});
