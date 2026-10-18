/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { useFakeTimers } from 'sinon';
import { DeferredPromise } from '../../../../base/common/async.js';
import { CancellationTokenSource, type CancellationToken } from '../../../../base/common/cancellation.js';
import { Emitter } from '../../../../base/common/event.js';
import { isCancellationError } from '../../../../base/common/errors.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { AgentPolicyError } from '../../common/agent.js';
import type { ProgressParams } from '../../common/state/sessionActions.js';
import { CopilotManagedSettingsResolver, resolveCopilotManagedSettings } from '../../node/copilot/copilotManagedSettings.js';
import { createUnmanagedCopilotSettings } from './copilotTestEvents.js';

suite('Copilot managed settings resolution', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('sessionless resolution includes account and working directory for policy helpers', async () => {
		const rpc = createUnmanagedCopilotSettings();
		const requests: Parameters<typeof rpc.resolve>[0][] = [];
		const resolve = rpc.resolve;
		rpc.resolve = async params => { requests.push(params); return resolve(params); };
		await resolveCopilotManagedSettings(rpc, 'test-token', 1000, '/test/workspace');
		assert.deepStrictEqual(requests, [{ clientName: 'vscode-agent-host', gitHubToken: 'test-token', workingDirectory: '/test/workspace' }]);
	});

	test('omits absent account and working directory instead of supplying empty overrides', async () => {
		const rpc = createUnmanagedCopilotSettings();
		const requests: Parameters<typeof rpc.resolve>[0][] = [];
		const resolve = rpc.resolve;
		rpc.resolve = async params => { requests.push(params); return resolve(params); };
		await resolveCopilotManagedSettings(rpc, undefined, 1000);
		assert.deepStrictEqual(requests, [{ clientName: 'vscode-agent-host' }]);
	});

	test('preserves composed model options without treating them as catalog-validated selections', async () => {
		const rpc = createUnmanagedCopilotSettings();
		const result = {
			...await rpc.resolve({ clientName: 'vscode-agent-host' }),
			values: { model: 'unavailable-model', effortLevel: 'unsupported-effort', contextTier: 'long_context' as const },
		};
		rpc.resolve = async () => result;
		assert.strictEqual(await resolveCopilotManagedSettings(rpc, undefined, 1000), result);
	});

	test('propagates resolution failure rather than returning an unmanaged policy', async () => {
		const rpc = createUnmanagedCopilotSettings();
		const error = new Error('Policy resolution failed');
		rpc.resolve = async () => { throw error; };
		await assert.rejects(resolveCopilotManagedSettings(rpc, undefined, 1000), candidate => candidate instanceof AgentPolicyError && candidate.cause === error);
	});

	for (const message of ['Client not connected', 'Connection is closed.', 'Connection is disposed.', 'The in-process runtime connection is closed.']) {
		test(`preserves runtime recovery for ${message}`, async () => {
			const rpc = createUnmanagedCopilotSettings();
			const error = new Error(message);
			rpc.resolve = async () => { throw error; };
			const resolver = disposables.add(new CopilotManagedSettingsResolver(new NullLogService()));
			await assert.rejects(resolver.resolve(rpc, 'token'), candidate => candidate === error);
		});
	}

	test('3.5 seconds starts progress, not failure, and restrictive policy is returned unchanged', async () => {
		const rpc = createUnmanagedCopilotSettings();
		const result = {
			...await rpc.resolve({ clientName: 'vscode-agent-host' }),
			values: { model: 'managed-model' },
		};
		const gate = new DeferredPromise<typeof result>();
		let calls = 0;
		rpc.resolve = () => { calls++; return gate.p; };
		const resolver = disposables.add(new CopilotManagedSettingsResolver(new NullLogService()));
		const progress: Omit<ProgressParams, 'channel'>[] = [];
		disposables.add(resolver.onDidReportProgress(event => progress.push(event)));
		const clock = useFakeTimers();
		try {
			let settled = false;
			const first = resolver.resolve(rpc, 'token', '/workspace').finally(() => { settled = true; });
			await clock.tickAsync(3499);
			assert.deepStrictEqual({ settled, progress: progress.length }, { settled: false, progress: 0 });
			await clock.tickAsync(1);
			const second = resolver.resolve(rpc, 'token', '/workspace');
			await clock.tickAsync(5000);
			assert.deepStrictEqual({ calls, settled, frames: progress.map(event => event.progress) }, { calls: 1, settled: false, frames: [0] });
			gate.complete(result);
			assert.deepStrictEqual(await Promise.all([first, second]), [result, result]);
			assert.deepStrictEqual(progress.map(event => [event.progressToken === progress[0].progressToken, event.progress, event.total]), [[true, 0, undefined], [true, 1, 1]]);
		} finally {
			gate.complete(result);
			clock.restore();
		}
	});

	test('shares only equivalent in-flight queries and never caches completed results', async () => {
		const rpc = createUnmanagedCopilotSettings();
		const result = await rpc.resolve({ clientName: 'vscode-agent-host' });
		const gate = new DeferredPromise<typeof result>();
		const requests: Parameters<typeof rpc.resolve>[0][] = [];
		rpc.resolve = params => { requests.push(params); return gate.p; };
		const otherHost = { resolve: rpc.resolve };
		const resolver = disposables.add(new CopilotManagedSettingsResolver(new NullLogService()));
		const pending = [
			resolver.resolve(rpc, 'a', '/one'),
			resolver.resolve(rpc, 'a', '/one'),
			resolver.resolve(rpc, 'b', '/one'),
			resolver.resolve(rpc, 'a', '/two'),
			resolver.resolve(otherHost, 'a', '/one'),
		];
		gate.complete(result);
		await Promise.all(pending);
		await resolver.resolve(rpc, 'a', '/one');
		assert.deepStrictEqual(requests.map(request => [request.gitHubToken, request.workingDirectory]), [
			['a', '/one'], ['b', '/one'], ['a', '/two'], ['a', '/one'], ['a', '/one'],
		]);
	});

	test('cancelling one caller does not cancel shared policy work or apply its late result', async () => {
		const rpc = createUnmanagedCopilotSettings();
		const result = await rpc.resolve({ clientName: 'vscode-agent-host' });
		const gate = new DeferredPromise<typeof result>();
		let calls = 0;
		rpc.resolve = () => { calls++; return gate.p; };
		const resolver = disposables.add(new CopilotManagedSettingsResolver(new NullLogService()));
		const cancellation = disposables.add(new CancellationTokenSource());
		const cancelled = assert.rejects(resolver.resolve(rpc, 'token', '/workspace', cancellation.token), isCancellationError);
		const waiting = resolver.resolve(rpc, 'token', '/workspace');
		cancellation.cancel();
		await cancelled;
		gate.complete(result);
		assert.deepStrictEqual({ result: await waiting, calls }, { result, calls: 1 });
	});

	test('already cancelled callers do not query the runtime', async () => {
		const rpc = createUnmanagedCopilotSettings();
		rpc.resolve = async () => { assert.fail('Unexpected policy query'); };
		const resolver = disposables.add(new CopilotManagedSettingsResolver(new NullLogService()));
		const cancellation = disposables.add(new CancellationTokenSource());
		cancellation.cancel();
		await assert.rejects(resolver.resolve(rpc, undefined, undefined, cancellation.token), isCancellationError);
	});

	test('invalidation rejects old context and its late completion cannot replace a retry', async () => {
		const rpc = createUnmanagedCopilotSettings();
		const result = await rpc.resolve({ clientName: 'vscode-agent-host' });
		const old = new DeferredPromise<typeof result>();
		const current = new DeferredPromise<typeof result>();
		let calls = 0;
		rpc.resolve = () => ++calls === 1 ? old.p : current.p;
		const resolver = disposables.add(new CopilotManagedSettingsResolver(new NullLogService()));
		const rejected = assert.rejects(resolver.resolve(rpc, 'a', '/one'), /settings changed while loading/);
		resolver.invalidate();
		await rejected;
		const retry = resolver.resolve(rpc, 'a', '/one');
		old.complete(result);
		const joined = resolver.resolve(rpc, 'a', '/one');
		current.complete(result);
		assert.deepStrictEqual({ results: await Promise.all([retry, joined]), calls }, { results: [result, result], calls: 2 });
	});

	test('overall timeout is retryable and a late response cannot complete the next query', async () => {
		const rpc = createUnmanagedCopilotSettings();
		const result = await rpc.resolve({ clientName: 'vscode-agent-host' });
		const old = new DeferredPromise<typeof result>();
		const current = new DeferredPromise<typeof result>();
		let calls = 0;
		rpc.resolve = () => ++calls === 1 ? old.p : current.p;
		const resolver = disposables.add(new CopilotManagedSettingsResolver(new NullLogService()));
		const progress: number[] = [];
		disposables.add(resolver.onDidReportProgress(event => progress.push(event.progress)));
		const clock = useFakeTimers();
		try {
			const rejected = assert.rejects(resolver.resolve(rpc, 'token'), error => error instanceof AgentPolicyError && /longer than 30 seconds/.test(error.message));
			await clock.tickAsync(30_000);
			await rejected;
			let settled = false;
			const retry = resolver.resolve(rpc, 'token').finally(() => { settled = true; });
			old.complete(result);
			await clock.tickAsync(0);
			assert.deepStrictEqual({ calls, settled, progress }, { calls: 2, settled: false, progress: [0, 1] });
			current.complete(result);
			assert.strictEqual(await retry, result);
		} finally {
			old.complete(result);
			current.complete(result);
			clock.restore();
		}
	});

	test('repeated RPC timeouts release their cancellation listeners without invalidation', async () => {
		const rpc = createUnmanagedCopilotSettings();
		rpc.resolve = () => new Promise(() => { });
		const emitter = disposables.add(new Emitter<void>());
		const cancellation: CancellationToken = { isCancellationRequested: false, onCancellationRequested: emitter.event };
		const listeners: boolean[] = [];
		const clock = useFakeTimers();
		try {
			for (let attempt = 0; attempt < 3; attempt++) {
				const rejected = assert.rejects(resolveCopilotManagedSettings(rpc, 'token', 30_000, undefined, cancellation), AgentPolicyError);
				listeners.push(emitter.hasListeners());
				await clock.tickAsync(30_000);
				await rejected;
				listeners.push(emitter.hasListeners());
			}
			assert.deepStrictEqual(listeners, [true, false, true, false, true, false]);
		} finally {
			clock.restore();
		}
	});

	test('runtime cache fallback is preserved and strict refresh rejection is not bypassed', async () => {
		const rpc = createUnmanagedCopilotSettings();
		const result = {
			...await rpc.resolve({ clientName: 'vscode-agent-host' }),
			diagnostics: [{ path: 'server', severity: 'warning' as const, message: 'Using eligible runtime cache' }],
		};
		const resolver = disposables.add(new CopilotManagedSettingsResolver(new NullLogService()));
		rpc.resolve = async () => result;
		assert.strictEqual(await resolver.resolve(rpc, 'token'), result);
		const failure = new Error('Strict remote refresh failed');
		rpc.resolve = async () => { throw failure; };
		await assert.rejects(resolver.resolve(rpc, 'token'), error => error instanceof AgentPolicyError && error.cause === failure);
		rpc.resolve = async () => result;
		assert.strictEqual(await resolver.resolve(rpc, 'token'), result);
	});

	test('disposal releases pending waiters and progress', async () => {
		const rpc = createUnmanagedCopilotSettings();
		const result = await rpc.resolve({ clientName: 'vscode-agent-host' });
		const gate = new DeferredPromise<typeof result>();
		rpc.resolve = () => gate.p;
		const resolver = disposables.add(new CopilotManagedSettingsResolver(new NullLogService()));
		const frames: number[] = [];
		disposables.add(resolver.onDidReportProgress(event => frames.push(event.progress)));
		const clock = useFakeTimers();
		try {
			const rejected = assert.rejects(resolver.resolve(rpc, 'token'), isCancellationError);
			await clock.tickAsync(3500);
			resolver.dispose();
			await rejected;
			assert.deepStrictEqual(frames, [0, 1]);
		} finally {
			await gate.complete(result);
			clock.restore();
		}
	});

	test('Stop dismisses progress but retry joins the same runtime query', async () => {
		const rpc = createUnmanagedCopilotSettings();
		const result = await rpc.resolve({ clientName: 'vscode-agent-host' });
		const gate = new DeferredPromise<typeof result>();
		let calls = 0;
		rpc.resolve = () => { calls++; return gate.p; };
		const resolver = disposables.add(new CopilotManagedSettingsResolver(new NullLogService()));
		const cancellation = disposables.add(new CancellationTokenSource());
		const frames: number[] = [];
		disposables.add(resolver.onDidReportProgress(event => frames.push(event.progress)));
		const clock = useFakeTimers();
		try {
			const cancelled = assert.rejects(resolver.resolve(rpc, 'token', undefined, cancellation.token), isCancellationError);
			await clock.tickAsync(3500);
			cancellation.cancel();
			await cancelled;
			assert.deepStrictEqual(frames, [0, 1]);
			const retry = resolver.resolve(rpc, 'token');
			await gate.complete(result);
			assert.deepStrictEqual({ result: await retry, calls, frames }, { result, calls: 1, frames: [0, 1, 0, 1] });
		} finally {
			await gate.complete(result);
			clock.restore();
		}
	});

	test('a cancelled query does not show delayed progress without waiters', async () => {
		const rpc = createUnmanagedCopilotSettings();
		const result = await rpc.resolve({ clientName: 'vscode-agent-host' });
		const gate = new DeferredPromise<typeof result>();
		rpc.resolve = () => gate.p;
		const resolver = disposables.add(new CopilotManagedSettingsResolver(new NullLogService()));
		const cancellation = disposables.add(new CancellationTokenSource());
		const frames: number[] = [];
		disposables.add(resolver.onDidReportProgress(event => frames.push(event.progress)));
		const clock = useFakeTimers();
		try {
			const cancelled = assert.rejects(resolver.resolve(rpc, 'token', undefined, cancellation.token), isCancellationError);
			cancellation.cancel();
			await cancelled;
			await clock.tickAsync(4000);
			await gate.complete(result);
			assert.deepStrictEqual(frames, []);
		} finally {
			await gate.complete(result);
			clock.restore();
		}
	});
});
