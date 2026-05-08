/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { ChildProcessWithoutNullStreams } from 'child_process';
import { EventEmitter } from 'events';
import { PassThrough } from 'stream';
import { DeferredPromise, timeout } from '../../../../../base/common/async.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { NullLogger } from '../../../../log/common/log.js';
import { McpServerType, type IMcpStdioServerConfiguration } from '../../../../mcp/common/mcpPlatformTypes.js';
import { McpServerStatusKind } from '../../../common/state/protocol/state.js';
import { McpStdioUpstream, type StdioSpawn } from '../../../node/mcpHost/mcpStdioUpstream.js';

interface IFakeChild extends ChildProcessWithoutNullStreams {
	_emitStdout(line: string): void;
	_emitStderr(line: string): void;
	_emitStdoutRaw(chunk: string): void;
	_emitStderrRaw(chunk: string): void;
	_emitError(err: Error): void;
	_exit(code: number | null, signal?: NodeJS.Signals | null): void;
	_killCalls: number;
}

interface ISpawnRecord {
	command: string;
	args: readonly string[];
	options: { cwd?: string; env?: NodeJS.ProcessEnv };
}

function createFakeChild(): IFakeChild {
	const stdin = new PassThrough();
	const stdout = new PassThrough();
	const stderr = new PassThrough();
	const ee = new EventEmitter();
	const fake = ee as unknown as IFakeChild;
	(fake as unknown as { stdin: PassThrough }).stdin = stdin;
	(fake as unknown as { stdout: PassThrough }).stdout = stdout;
	(fake as unknown as { stderr: PassThrough }).stderr = stderr;
	(fake as unknown as { pid: number }).pid = 0; // 0 avoids the killTree path on dispose
	fake._killCalls = 0;
	(fake as unknown as { kill: (s?: NodeJS.Signals) => boolean }).kill = () => {
		fake._killCalls++;
		return true;
	};
	fake._emitStdout = line => stdout.write(line + '\n');
	fake._emitStderr = line => stderr.write(line + '\n');
	fake._emitStdoutRaw = chunk => stdout.write(chunk);
	fake._emitStderrRaw = chunk => stderr.write(chunk);
	fake._emitError = err => ee.emit('error', err);
	fake._exit = (code, signal) => {
		// Real child processes close stdio on exit; the splitter pipeline
		// only flushes a trailing partial line once its source stream ends.
		stdout.end();
		stderr.end();
		ee.emit('exit', code, signal ?? null);
	};
	return fake;
}

interface IRecordedLog {
	level: 'info' | 'warn' | 'error';
	message: string;
}

class RecordingLogger extends NullLogger {
	public readonly records: IRecordedLog[] = [];
	override info(message: string): void { this.records.push({ level: 'info', message }); }
	override warn(message: string): void { this.records.push({ level: 'warn', message }); }
	override error(message: string | Error): void {
		this.records.push({ level: 'error', message: message instanceof Error ? message.message : message });
	}
}

const baseConfig: IMcpStdioServerConfiguration = {
	type: McpServerType.LOCAL,
	command: 'mcp-server',
	args: ['--flag'],
};

suite('McpStdioUpstream', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	function makeUpstream(overrides: { spawn?: StdioSpawn; logger?: RecordingLogger; spawnRecords?: ISpawnRecord[]; childRef?: { current: IFakeChild | undefined }; throwOnSpawn?: Error } = {}) {
		const logger = overrides.logger ?? new RecordingLogger();
		const records: ISpawnRecord[] = overrides.spawnRecords ?? [];
		const childRef = overrides.childRef ?? { current: undefined };
		const spawn: StdioSpawn = overrides.spawn ?? ((command, args, options) => {
			records.push({ command, args, options });
			if (overrides.throwOnSpawn) {
				throw overrides.throwOnSpawn;
			}
			const child = createFakeChild();
			childRef.current = child;
			return child;
		});
		const upstream = new McpStdioUpstream({ config: baseConfig, logger, spawn });
		return { upstream, logger, records, childRef };
	}

	test('constructor does not spawn', () => {
		let spawnCalls = 0;
		const spawn: StdioSpawn = () => {
			spawnCalls++;
			return createFakeChild();
		};
		const upstream = new McpStdioUpstream({ config: baseConfig, logger: new NullLogger(), spawn });
		try {
			assert.strictEqual(spawnCalls, 0);
			assert.deepStrictEqual(upstream.status.get(), { kind: McpServerStatusKind.Stopped });
		} finally {
			upstream.dispose();
		}
	});

	test('start() spawns and transitions Stopped → Ready', async () => {
		const { upstream, records, childRef } = makeUpstream();
		try {
			assert.deepStrictEqual(upstream.status.get(), { kind: McpServerStatusKind.Stopped });
			const result = await upstream.start();
			assert.deepStrictEqual({
				result,
				records,
				hasChild: !!childRef.current,
				finalStatus: upstream.status.get(),
			}, {
				result: { kind: McpServerStatusKind.Ready },
				records: [{
					command: 'mcp-server',
					args: ['--flag'],
					options: { cwd: undefined, env: undefined },
				}],
				hasChild: true,
				finalStatus: { kind: McpServerStatusKind.Ready },
			});
		} finally {
			upstream.dispose();
		}
	});

	test('parses stdout NDJSON and emits via onMessage', async () => {
		const store = new DisposableStore();
		const { upstream, childRef } = makeUpstream();
		try {
			const got: unknown[] = [];
			store.add(upstream.onMessage(m => got.push(m)));
			await upstream.start();
			childRef.current!._emitStdout(JSON.stringify({ jsonrpc: '2.0', id: 1, result: { ok: true } }));
			await timeout(0);
			assert.deepStrictEqual(got, [{ jsonrpc: '2.0', id: 1, result: { ok: true } }]);
		} finally {
			store.dispose();
			upstream.dispose();
		}
	});

	test('drops malformed stdout lines and logs error', async () => {
		const store = new DisposableStore();
		const { upstream, logger, childRef } = makeUpstream();
		try {
			const got: unknown[] = [];
			store.add(upstream.onMessage(m => got.push(m)));
			await upstream.start();
			childRef.current!._emitStdout('not-json');
			await timeout(0);
			assert.deepStrictEqual(got, []);
			assert.ok(logger.records.some(r => r.level === 'error' && /failed to parse stdout line/.test(r.message)));
		} finally {
			store.dispose();
			upstream.dispose();
		}
	});

	test('forwards stderr lines as logger.info', async () => {
		const { upstream, logger, childRef } = makeUpstream();
		try {
			await upstream.start();
			childRef.current!._emitStderr('hello world');
			await timeout(0);
			assert.ok(logger.records.some(r => r.level === 'info' && /hello world/.test(r.message)));
		} finally {
			upstream.dispose();
		}
	});

	test('send() writes \\n-terminated JSON to stdin', async () => {
		const { upstream, childRef } = makeUpstream();
		try {
			await upstream.start();
			const written = new DeferredPromise<string>();
			let buf = '';
			childRef.current!.stdin.on('data', (chunk: Buffer | string) => {
				buf += typeof chunk === 'string' ? chunk : chunk.toString('utf8');
				if (buf.endsWith('\n')) {
					written.complete(buf);
				}
			});
			await upstream.send({ jsonrpc: '2.0', id: 7, method: 'ping' });
			const got = await written.p;
			assert.strictEqual(got, JSON.stringify({ jsonrpc: '2.0', id: 7, method: 'ping' }) + '\n');
		} finally {
			upstream.dispose();
		}
	});

	test('send() rejects when not Ready', async () => {
		const { upstream } = makeUpstream();
		try {
			await assert.rejects(
				upstream.send({ jsonrpc: '2.0', id: 1, method: 'ping' }),
				/cannot send while in state 'stopped'/,
			);
		} finally {
			upstream.dispose();
		}
	});

	test('child exit (clean) transitions to Stopped', async () => {
		const { upstream, childRef } = makeUpstream();
		try {
			await upstream.start();
			childRef.current!._exit(0);
			await timeout(0);
			assert.deepStrictEqual(upstream.status.get(), { kind: McpServerStatusKind.Stopped });
		} finally {
			upstream.dispose();
		}
	});

	test('child exit (non-zero) transitions to Error', async () => {
		const { upstream, childRef } = makeUpstream();
		try {
			await upstream.start();
			childRef.current!._exit(2);
			await timeout(0);
			const status = upstream.status.get();
			assert.strictEqual(status.kind, McpServerStatusKind.Error);
			assert.strictEqual(status.kind === McpServerStatusKind.Error && status.error.errorType, 'childExited');
		} finally {
			upstream.dispose();
		}
	});

	test('spawn failure resolves with Error', async () => {
		const { upstream } = makeUpstream({ throwOnSpawn: new Error('ENOENT: mcp-server') });
		try {
			const result = await upstream.start();
			assert.strictEqual(result.kind, McpServerStatusKind.Error);
			assert.strictEqual(result.kind === McpServerStatusKind.Error && result.error.errorType, 'spawnFailed');
			assert.ok(result.kind === McpServerStatusKind.Error && /ENOENT/.test(result.error.message));
		} finally {
			upstream.dispose();
		}
	});

	test('asynchronous child error transitions status to Error', async () => {
		const { upstream, childRef } = makeUpstream();
		try {
			const synchronousStart = await upstream.start();
			assert.strictEqual(synchronousStart.kind, McpServerStatusKind.Ready);

			// Fire the error asynchronously, after start() returned.
			await new Promise<void>(resolve => setImmediate(() => {
				childRef.current!._emitError(new Error('spawn ENOENT: bogus-mcp-server'));
				resolve();
			}));
			await timeout(0);

			const status = upstream.status.get();
			assert.strictEqual(status.kind, McpServerStatusKind.Error);
			if (status.kind === McpServerStatusKind.Error) {
				assert.strictEqual(status.error.errorType, 'spawnFailed');
				assert.match(status.error.message, /ENOENT/);
			}
			await assert.rejects(
				upstream.send({ jsonrpc: '2.0', id: 1, method: 'ping' }),
				/cannot send while in state 'error'/,
			);
		} finally {
			upstream.dispose();
		}
	});

	test('delivers a final unterminated stdout line on child exit', async () => {
		const store = new DisposableStore();
		const { upstream, childRef } = makeUpstream();
		try {
			const got: unknown[] = [];
			store.add(upstream.onMessage(m => got.push(m)));
			await upstream.start();
			// Partial line without a trailing newline. `StreamSplitter._flush`
			// emits it on stream end, so the consumer still sees the message
			// even when the child crashes mid-line.
			childRef.current!._emitStdoutRaw('{"jsonrpc":"2.0","id":1,"result":{}}');
			childRef.current!._exit(0);
			// Stream-end → `StreamSplitter._flush` → final `data` event takes
			// more than one event-loop turn through the PassThrough chain.
			await timeout(10);
			assert.deepStrictEqual(got, [{ jsonrpc: '2.0', id: 1, result: {} }]);
		} finally {
			store.dispose();
			upstream.dispose();
		}
	});

	test('dispose is idempotent', async () => {
		const { upstream } = makeUpstream();
		await upstream.start();
		upstream.dispose();
		assert.doesNotThrow(() => upstream.dispose());
	});

	test('setBearerToken is a no-op for stdio', () => {
		const { upstream } = makeUpstream();
		try {
			assert.doesNotThrow(() => upstream.setBearerToken('abc'));
			assert.doesNotThrow(() => upstream.setBearerToken(undefined));
		} finally {
			upstream.dispose();
		}
	});
});
