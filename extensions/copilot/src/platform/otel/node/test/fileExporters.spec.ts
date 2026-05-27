/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ExportResultCode } from '@opentelemetry/core';
import { AggregationTemporality } from '@opentelemetry/sdk-metrics';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FileLogExporter, FileMetricExporter, FileSpanExporter } from '../fileExporters';

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
		const fakeSpan = { name: 'test-span', kind: 0, attributes: { a: 1 } };
		await new Promise<void>((resolve, reject) => {
			exporter.export([fakeSpan as any], result => {
				result.code === ExportResultCode.SUCCESS ? resolve() : reject(result.error);
			});
		});
		await exporter.shutdown();
		const content = fs.readFileSync(tmpFile, 'utf-8');
		const parsed = JSON.parse(content.trim());
		expect(parsed.name).toBe('test-span');
		expect(parsed.attributes).toEqual({ a: 1 });
	});

	it('appends multiple exports', async () => {
		for (let i = 0; i < 3; i++) {
			await new Promise<void>((resolve, reject) => {
				exporter.export([{ name: `span-${i}` } as any], result => {
					result.code === ExportResultCode.SUCCESS ? resolve() : reject(result.error);
				});
			});
		}
		await exporter.shutdown();
		const lines = fs.readFileSync(tmpFile, 'utf-8').trim().split('\n');
		expect(lines).toHaveLength(3);
		expect(JSON.parse(lines[0]).name).toBe('span-0');
		expect(JSON.parse(lines[2]).name).toBe('span-2');
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
