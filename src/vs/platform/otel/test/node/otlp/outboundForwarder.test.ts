/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { deepStrictEqual, ok, strictEqual } from 'assert';
import { promises as fs } from 'fs';
import type { AddressInfo } from 'net';
import { tmpdir } from 'os';
import { join } from '../../../../../base/common/path.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { AbstractLogger, ILogService, LogLevel } from '../../../../log/common/log.js';
import { ICompletedSpanData, SpanStatusCode } from '../../../common/spanData.js';
import { IDecodeResult } from '../../../node/otlp/otlpJsonDecode.js';
import {
	CompositeForwarder,
	ConsoleForwarder,
	FileForwarder,
	OtlpHttpForwarder,
	resolveOtlpTracesEndpoint,
} from '../../../node/otlp/outboundForwarder.js';

class CapturingLogger extends AbstractLogger implements ILogService {
	declare readonly _serviceBrand: undefined;
	public readonly messages: { level: string; msg: string }[] = [];
	constructor() { super(); this.setLevel(LogLevel.Trace); }
	log(level: LogLevel, message: string): void {
		this.messages.push({ level: LogLevel[level], msg: message });
	}
	trace(m: string) { this.log(LogLevel.Trace, m); }
	debug(m: string) { this.log(LogLevel.Debug, m); }
	info(m: string) { this.log(LogLevel.Info, m); }
	warn(m: string) { this.log(LogLevel.Warning, m); }
	error(m: string) { this.log(LogLevel.Error, m); }
	flush() { /* noop */ }
}

function makeSpan(name: string, spanId: string, attrs: Record<string, string | number | boolean | string[]> = {}): ICompletedSpanData {
	return {
		name,
		spanId,
		traceId: 'aabbccddeeff00112233445566778899',
		startTime: 1_700_000_000_000,
		endTime: 1_700_000_000_500,
		status: { code: SpanStatusCode.OK },
		attributes: attrs,
		events: [],
	};
}

function makeResult(spans: ICompletedSpanData[]): IDecodeResult {
	return { spans, rejected: 0, errors: [] };
}

interface IFakeUpstream {
	port: number;
	received: { body: Buffer; contentType: string; auth?: string; path: string }[];
	dispose(): Promise<void>;
}

async function startFakeUpstream(behavior: 'ok' | 'fail' = 'ok'): Promise<IFakeUpstream> {
	const httpModule = await import('http');
	const received: { body: Buffer; contentType: string; auth?: string; path: string }[] = [];
	const server = httpModule.createServer((req, res) => {
		const chunks: Buffer[] = [];
		req.on('data', (chunk: Buffer) => chunks.push(chunk));
		req.on('end', () => {
			received.push({
				body: Buffer.concat(chunks),
				contentType: (req.headers['content-type'] ?? '').toString(),
				auth: req.headers['authorization']?.toString(),
				path: req.url ?? '',
			});
			if (behavior === 'ok') {
				res.statusCode = 200;
				res.setHeader('content-type', 'application/json');
				res.end('{}');
			} else {
				res.statusCode = 500;
				res.end('boom');
			}
		});
	});
	await new Promise<void>((resolve, reject) => {
		server.once('error', reject);
		server.listen(0, '127.0.0.1', () => resolve());
	});
	const port = (server.address() as AddressInfo).port;
	return {
		port,
		received,
		dispose: () => new Promise<void>(resolve => { server.closeAllConnections(); server.close(() => resolve()); }),
	};
}

suite('platform/otel - outboundForwarder', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('OtlpHttpForwarder re-POSTs raw body with custom headers', async () => {
		const upstream = await startFakeUpstream();
		const logger = store.add(new CapturingLogger());
		const fwd = store.add(new OtlpHttpForwarder({
			endpoint: `http://127.0.0.1:${upstream.port}/v1/traces`,
			headers: { 'authorization': 'Bearer test-token' },
		}, logger));

		const body = Buffer.from('{"resourceSpans":[]}', 'utf8');
		fwd.forwardRaw(body, 'application/json');
		await fwd.flush();
		await upstream.dispose();

		strictEqual(upstream.received.length, 1);
		strictEqual(upstream.received[0].body.toString('utf8'), '{"resourceSpans":[]}');
		ok(upstream.received[0].contentType.includes('application/json'));
		strictEqual(upstream.received[0].auth, 'Bearer test-token');
		strictEqual(logger.messages.filter(m => m.level === 'Warning').length, 0);
	});

	test('OtlpHttpForwarder logs warning on upstream 500 and does not throw', async () => {
		const upstream = await startFakeUpstream('fail');
		const logger = store.add(new CapturingLogger());
		const fwd = store.add(new OtlpHttpForwarder(
			{ endpoint: `http://127.0.0.1:${upstream.port}/v1/traces` },
			logger,
		));
		fwd.forwardRaw(Buffer.from('{}'), 'application/json');
		await fwd.flush();
		await upstream.dispose();
		ok(logger.messages.some(m => m.level === 'Warning' && m.msg.includes('500')));
	});

	test('OtlpHttpForwarder auto-appends /v1/traces to a bare base endpoint', async () => {
		const upstream = await startFakeUpstream();
		const logger = store.add(new CapturingLogger());
		const fwd = store.add(new OtlpHttpForwarder({
			endpoint: `http://127.0.0.1:${upstream.port}`,
		}, logger));

		fwd.forwardRaw(Buffer.from('{}'), 'application/json');
		await fwd.flush();
		await upstream.dispose();

		strictEqual(upstream.received.length, 1);
		strictEqual(upstream.received[0].path, '/v1/traces');
		strictEqual(logger.messages.filter(m => m.level === 'Warning').length, 0);
	});

	test('resolveOtlpTracesEndpoint appends path on base URL, leaves explicit path alone', () => {
		strictEqual(resolveOtlpTracesEndpoint('http://localhost:4318'), 'http://localhost:4318/v1/traces');
		strictEqual(resolveOtlpTracesEndpoint('http://localhost:4318/'), 'http://localhost:4318/v1/traces');
		strictEqual(resolveOtlpTracesEndpoint('http://localhost:4318/v1/traces'), 'http://localhost:4318/v1/traces');
		strictEqual(resolveOtlpTracesEndpoint('http://localhost:4318/custom/path'), 'http://localhost:4318/custom/path');
		strictEqual(resolveOtlpTracesEndpoint('not a url'), 'not a url');
	});

	test('FileForwarder appends one JSON line per span', async () => {
		const path = join(tmpdir(), `vscode-otel-forwarder-${Date.now()}-${Math.random().toString(36).slice(2)}.jsonl`);
		const fwd = store.add(new FileForwarder({ filePath: path }, store.add(new CapturingLogger())));
		fwd.forwardSpans(makeResult([makeSpan('a', '1111111111111111'), makeSpan('b', '2222222222222222')]));
		fwd.forwardSpans(makeResult([makeSpan('c', '3333333333333333')]));
		await fwd.flush();

		const content = await fs.readFile(path, 'utf8');
		await fs.unlink(path);
		const lines = content.split('\n').filter(l => l.length > 0);
		strictEqual(lines.length, 3);
		deepStrictEqual(lines.map(l => JSON.parse(l).name), ['a', 'b', 'c']);
	});

	test('FileForwarder ignores empty result', async () => {
		const path = join(tmpdir(), `vscode-otel-forwarder-empty-${Date.now()}.jsonl`);
		const fwd = store.add(new FileForwarder({ filePath: path }, store.add(new CapturingLogger())));
		fwd.forwardSpans(makeResult([]));
		await fwd.flush();
		await fs.access(path).then(() => fs.unlink(path)).catch(() => undefined);
	});

	test('ConsoleForwarder logs one info per span', () => {
		const logger = store.add(new CapturingLogger());
		const fwd = store.add(new ConsoleForwarder(logger));
		fwd.forwardSpans(makeResult([
			makeSpan('invoke_agent copilot', '1111111111111111', { 'gen_ai.operation.name': 'invoke_agent', 'gen_ai.request.model': 'gpt-4o' }),
		]));
		const info = logger.messages.filter(m => m.level === 'Info');
		strictEqual(info.length, 1);
		ok(info[0].msg.includes('invoke_agent copilot'));
		ok(info[0].msg.includes('500ms'));
		ok(info[0].msg.includes('op=invoke_agent'));
		ok(info[0].msg.includes('model=gpt-4o'));
	});

	test('CompositeForwarder fans out forwardRaw and forwardSpans', async () => {
		const calls: string[] = [];
		const child = (name: string) => ({
			forwardRaw: () => { calls.push(`${name}.raw`); },
			forwardSpans: () => { calls.push(`${name}.spans`); },
			flush: async () => { calls.push(`${name}.flush`); },
			dispose: () => { calls.push(`${name}.dispose`); },
		});

		const a = child('a');
		const b = child('b');
		const composite = store.add(new CompositeForwarder([a, b]));
		composite.forwardRaw(Buffer.alloc(0), 'application/json');
		composite.forwardSpans(makeResult([]));
		await composite.flush();

		deepStrictEqual(calls, [
			'a.raw', 'b.raw',
			'a.spans', 'b.spans',
			'a.flush', 'b.flush',
		]);
		// dispose happens via store teardown
	});
});
