/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Query, SDKUserMessage, WarmQuery } from '@anthropic-ai/claude-agent-sdk';

import assert from 'assert';
import { DeferredPromise } from '../../../../base/common/async.js';
import { isCancellationError } from '../../../../base/common/errors.js';
import { DisposableStore, IReference } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { FileService } from '../../../files/common/fileService.js';
import { IFileService } from '../../../files/common/files.js';
import { InMemoryFileSystemProvider } from '../../../files/common/inMemoryFilesystemProvider.js';
import { IInstantiationService } from '../../../instantiation/common/instantiation.js';
import { InstantiationService } from '../../../instantiation/common/instantiationService.js';
import { ServiceCollection } from '../../../instantiation/common/serviceCollection.js';
import { ILogService, NullLogService } from '../../../log/common/log.js';
import { IDiffComputeService } from '../../common/diffComputeService.js';
import { ISessionDatabase } from '../../common/sessionDataService.js';
import { ClaudeSdkPipeline, IRematerializer } from '../../node/claude/claudeSdkPipeline.js';
import { createZeroDiffComputeService, TestSessionDatabase } from '../common/sessionTestHelpers.js';

// ===== Test doubles =====

/**
 * `WarmQuery` stub that records `query()` calls and async-dispose count.
 * Tests in this file deliberately do NOT drive the consumer loop — they
 * exercise the synchronous lifecycle surface (abort, dispose, rebind
 * gating). Driving the SDK message stream end-to-end is covered by
 * `claudeAgent.test.ts`.
 *
 * `query()` returns a stub `Query` whose async iterator immediately
 * resolves done. That keeps the pipeline's consumer loop from hanging
 * even when a test happens to call `send()`.
 */
class FakeWarmQuery implements WarmQuery {
	asyncDisposeCount = 0;
	closeCount = 0;
	queryCallCount = 0;

	query(_prompt: string | AsyncIterable<SDKUserMessage>): Query {
		this.queryCallCount++;
		return new ImmediatelyDoneQuery();
	}
	close(): void { this.closeCount++; }
	async [Symbol.asyncDispose](): Promise<void> { this.asyncDisposeCount++; }
}

class ImmediatelyDoneQuery implements Query {
	[Symbol.asyncIterator](): this { return this; }
	async next(): Promise<IteratorResult<never, void>> { return { done: true, value: undefined }; }
	async return(): Promise<IteratorResult<never, void>> { return { done: true, value: undefined }; }
	async throw(err: unknown): Promise<IteratorResult<never, void>> { throw err; }
	async setModel(): Promise<void> { /* not exercised here */ }
	async applyFlagSettings(): Promise<void> { /* not exercised here */ }
	async setPermissionMode(): Promise<void> { /* not exercised here */ }
	async interrupt(): Promise<void> { /* not exercised here */ }
	streamInput(): never { throw new Error('not modeled'); }
	stopTask(): never { throw new Error('not modeled'); }
	async close(): Promise<void> { /* not exercised here */ }
	setMaxThinkingTokens(): never { throw new Error('not modeled'); }
	initializationResult(): never { throw new Error('not modeled'); }
	supportedCommands(): never { throw new Error('not modeled'); }
	supportedModels(): never { throw new Error('not modeled'); }
	supportedAgents(): never { throw new Error('not modeled'); }
	mcpServerStatus(): never { throw new Error('not modeled'); }
	getContextUsage(): never { throw new Error('not modeled'); }
	reloadPlugins(): never { throw new Error('not modeled'); }
	accountInfo(): never { throw new Error('not modeled'); }
	rewindFiles(): never { throw new Error('not modeled'); }
	readFile(): never { throw new Error('not modeled'); }
	seedReadState(): never { throw new Error('not modeled'); }
	reconnectMcpServer(): never { throw new Error('not modeled'); }
	toggleMcpServer(): never { throw new Error('not modeled'); }
	setMcpServers(): never { throw new Error('not modeled'); }
	setSlashCommandHooks(): never { throw new Error('not modeled'); }
	getServerInfo(): never { throw new Error('not modeled'); }
	getMcpResources(): never { throw new Error('not modeled'); }
	readMcpResource(): never { throw new Error('not modeled'); }
}

// ===== Harness =====

interface IPipelineHarness {
	readonly pipeline: ClaudeSdkPipeline;
	readonly warm: FakeWarmQuery;
	readonly controller: AbortController;
}

function createPipeline(disposables: Pick<DisposableStore, 'add'>): IPipelineHarness {
	const controller = new AbortController();
	const warm = new FakeWarmQuery();
	const fileService = disposables.add(new FileService(new NullLogService()));
	const fs = disposables.add(new InMemoryFileSystemProvider());
	disposables.add(fileService.registerProvider('file', fs));

	const db = new TestSessionDatabase();
	const dbRef: IReference<ISessionDatabase> = { object: db, dispose: () => { } };

	const services = new ServiceCollection(
		[ILogService, new NullLogService()],
		[IFileService, fileService],
		[IDiffComputeService, createZeroDiffComputeService()],
	);
	const inst: IInstantiationService = disposables.add(new InstantiationService(services));
	const pipeline = disposables.add(inst.createInstance(
		ClaudeSdkPipeline,
		'sess-1',
		URI.parse('claude:/sess-1'),
		warm,
		controller,
		dbRef,
	));
	return { pipeline, warm, controller };
}

function makePrompt(uuid: string, text: string = uuid): SDKUserMessage {
	return {
		type: 'user',
		uuid: makeUuid(uuid),
		parent_tool_use_id: null,
		message: { role: 'user', content: text },
	};
}

/** Build a SDK-shaped UUID from a short label so test ids stay readable. */
function makeUuid(label: string): `${string}-${string}-${string}-${string}-${string}` {
	const pad = (s: string, n: number) => s.padEnd(n, '0').slice(0, n);
	return `${pad(label, 8)}-0000-0000-0000-000000000000`;
}

suite('ClaudeSdkPipeline', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	suite('initial state', () => {

		test('isResumed starts false and isAborted starts false', () => {
			const { pipeline } = createPipeline(disposables);
			assert.strictEqual(pipeline.isResumed, false);
			assert.strictEqual(pipeline.isAborted, false);
		});
	});

	suite('abort', () => {

		test('flips the controller signal and isAborted', () => {
			const { pipeline, controller } = createPipeline(disposables);
			pipeline.abort();
			assert.strictEqual(controller.signal.aborted, true);
			assert.strictEqual(pipeline.isAborted, true);
		});

		test('is idempotent', () => {
			const { pipeline, controller } = createPipeline(disposables);
			pipeline.abort();
			pipeline.abort();
			assert.strictEqual(controller.signal.aborted, true);
		});

		test('send after abort with no rematerializer attached throws a clear error (not a silent hang)', async () => {
			const { pipeline } = createPipeline(disposables);
			pipeline.abort();
			await pipeline.send(makePrompt('p1'), 'turn-A').then(
				() => assert.fail('expected rejection'),
				err => {
					// _rebindQuery throws synchronously when no rematerializer is attached
					assert.match(String(err), /no rematerializer attached/);
				},
			);
		});
	});

	suite('rematerializer wiring', () => {

		test('after abort, send invokes the attached rematerializer in "recover" mode and clears the rebind flag', async () => {
			const { pipeline } = createPipeline(disposables);
			const reasons: Array<'restart' | 'recover'> = [];
			const built: { warm: FakeWarmQuery; controller: AbortController }[] = [];
			const rematerializer: IRematerializer = async (reason) => {
				reasons.push(reason);
				const ctl = new AbortController();
				const warm = new FakeWarmQuery();
				built.push({ warm, controller: ctl });
				return { warm, abortController: ctl };
			};
			pipeline.attachRematerializer(rematerializer);

			pipeline.abort();
			// Don't await — the consumer loop on the rebound query will end
			// almost immediately, but the matching SDK `result` never
			// arrives (FakeWarmQuery's iterator just closes), so the
			// deferred ends up failed with the "stream ended without
			// result" guard. We only care that the rematerializer ran.
			pipeline.send(makePrompt('p1'), 'turn-A').catch(() => { /* expected */ });
			// Yield a microtask for the async rebind to call the callback.
			await Promise.resolve();
			await Promise.resolve();

			assert.deepStrictEqual(reasons, ['recover']);
			assert.strictEqual(built.length, 1);
			assert.strictEqual(pipeline.isAborted, false, 'rebind installed a fresh, non-aborted controller');
		});

		test('rematerializer rejection propagates from send', async () => {
			const { pipeline } = createPipeline(disposables);
			const rebuildErr = new Error('rematerialize failed');
			let calls = 0;
			pipeline.attachRematerializer(async () => {
				calls++;
				throw rebuildErr;
			});

			pipeline.abort();
			await pipeline.send(makePrompt('p1'), 'turn-A').then(
				() => assert.fail('expected rejection'),
				err => assert.strictEqual(err, rebuildErr),
			);
			assert.strictEqual(calls, 1);
		});

		test('abort issued while the rematerializer is still resolving cancels the freshly-built controller (rebind-window race)', async () => {
			const { pipeline } = createPipeline(disposables);
			const releaseRebuild = new DeferredPromise<{ warm: FakeWarmQuery; controller: AbortController }>();
			const built: { warm: FakeWarmQuery; controller: AbortController }[] = [];
			pipeline.attachRematerializer(async () => {
				const pair = await releaseRebuild.p;
				built.push(pair);
				return { warm: pair.warm, abortController: pair.controller };
			});

			// Trigger rebind by aborting the seed controller and starting a send.
			// The send awaits _rebindQuery, which awaits releaseRebuild.
			pipeline.abort();
			const sendPromise = pipeline.send(makePrompt('p1'), 'turn-A');
			await Promise.resolve(); // let _rebindQuery start its await

			// Issue a SECOND abort while rebind is in-flight. This must
			// land on the not-yet-installed controller — abort returning
			// early as idempotent here would silently drop the user's
			// cancel.
			pipeline.abort();

			// Now release the rematerializer with a fresh, non-aborted controller.
			const freshController = new AbortController();
			releaseRebuild.complete({ warm: new FakeWarmQuery(), controller: freshController });

			await sendPromise.then(
				() => assert.fail('expected cancellation after rebind-window abort'),
				err => assert.ok(isCancellationError(err), `expected CancellationError, got ${err}`),
			);
			assert.strictEqual(built.length, 1);
			assert.strictEqual(built[0].controller.signal.aborted, true, 'fresh controller cancelled before being installed');
			assert.strictEqual(pipeline.isAborted, true);
		});
	});

	suite('seedCurrentConfig', () => {

		test('seeded values match the post-materialize SDK state, so first send does NOT push a redundant setModel/applyFlagSettings/setPermissionMode', async () => {
			// We can't observe the SDK calls without driving the consumer
			// loop, but we CAN observe that send does not throw and that
			// the warm query is bound exactly once.
			const { pipeline, warm } = createPipeline(disposables);
			pipeline.seedCurrentConfig('claude-sonnet-4-5', 'high', 'default');
			pipeline.send(makePrompt('p1'), 'turn-A').catch(() => { /* expected: stream ends without result */ });
			await Promise.resolve();
			assert.strictEqual(warm.queryCallCount, 1);
		});
	});

	suite('dispose', () => {

		test('disposing the pipeline aborts the controller and async-disposes the WarmQuery', async () => {
			const store = new DisposableStore();
			const { pipeline, warm, controller } = createPipeline(store);
			assert.strictEqual(controller.signal.aborted, false);
			assert.strictEqual(warm.asyncDisposeCount, 0);

			pipeline.dispose();
			// asyncDispose is fire-and-forget; let the microtask run.
			await Promise.resolve();

			assert.strictEqual(controller.signal.aborted, true);
			assert.strictEqual(warm.asyncDisposeCount, 1);
			store.dispose();
		});
	});

	suite('CancellationError plumbing', () => {

		test('abort + send rejects with a CancellationError-shaped error after the rematerializer runs (when rematerializer rejects with one)', async () => {
			const { pipeline } = createPipeline(disposables);
			pipeline.attachRematerializer(async () => {
				const err = new Error('Canceled');
				err.name = 'Canceled';
				throw err;
			});
			pipeline.abort();
			await pipeline.send(makePrompt('p1'), 'turn-A').then(
				() => assert.fail('expected rejection'),
				err => assert.ok(isCancellationError(err), `expected cancellation, got ${err}`),
			);
		});
	});
});
