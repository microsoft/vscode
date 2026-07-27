/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Query, SDKMessage, SDKUserMessage, WarmQuery } from '@anthropic-ai/claude-agent-sdk';

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
import { buildDefaultChatUri } from '../../common/state/sessionState.js';
import { ClaudeSdkPipeline, IRematerializer } from '../../node/claude/claudeSdkPipeline.js';
import { SubagentRegistry } from '../../node/claude/claudeSubagentRegistry.js';
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
	async applyFlagSettings(_settings: Parameters<Query['applyFlagSettings']>[0]): Promise<void> { /* not exercised here */ }
	async setPermissionMode(): Promise<void> { /* not exercised here */ }
	async setMcpPermissionModeOverride(): Promise<{ warning?: string }> { return {}; }
	async interrupt(): Promise<void> { /* not exercised here */ }
	streamInput(): never { throw new Error('not modeled'); }
	stopTask(): never { throw new Error('not modeled'); }
	reloadSkills(): never { throw new Error('not modeled'); }
	backgroundTasks(): never { throw new Error('not modeled'); }
	async close(): Promise<void> { /* not exercised here */ }
	async [Symbol.asyncDispose](): Promise<void> { /* not exercised here */ }
	setMaxThinkingTokens(): never { throw new Error('not modeled'); }
	initializationResult(): never { throw new Error('not modeled'); }
	reinitialize(): never { throw new Error('not modeled'); }
	supportedCommands(): never { throw new Error('not modeled'); }
	supportedModels(): never { throw new Error('not modeled'); }
	supportedAgents(): never { throw new Error('not modeled'); }
	mcpServerStatus(): never { throw new Error('not modeled'); }
	getContextUsage(): never { throw new Error('not modeled'); }
	usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET(): never { throw new Error('not modeled'); }
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

/**
 * `WarmQuery` whose bound `Query` records every `applyFlagSettings` call so
 * tests can assert the exact effort payload pushed to the SDK (including the
 * `{ effortLevel: null }` clear emitted when switching to a model that does
 * not support reasoning effort).
 *
 * Unlike {@link ImmediatelyDoneQuery}, its async iterator BLOCKS rather than
 * ending immediately — otherwise the consumer loop would hit "stream ended
 * without a result", null out `_query`, and the runtime setters would no-op
 * before the test can observe them. A blocking iterator models a live turn.
 *
 * The block is abort-aware: `next()` resolves `{ done: true }` once the
 * pipeline's {@link AbortController} fires (on dispose/teardown), so the
 * consumer loop and the fire-and-forget `send()` promise unwind instead of
 * pinning the pipeline/query graph for the rest of the run.
 */
class RecordingQuery extends ImmediatelyDoneQuery {
	constructor(
		private readonly _flagSettings: Array<Parameters<Query['applyFlagSettings']>[0]>,
		private readonly _signal: AbortSignal,
	) { super(); }
	override next(): Promise<IteratorResult<never, void>> {
		if (this._signal.aborted) {
			return Promise.resolve({ done: true, value: undefined });
		}
		return new Promise<IteratorResult<never, void>>(resolve => {
			this._signal.addEventListener('abort', () => resolve({ done: true, value: undefined }), { once: true });
		});
	}
	override async applyFlagSettings(settings: Parameters<Query['applyFlagSettings']>[0]): Promise<void> { this._flagSettings.push(settings); }
}

class RecordingWarmQuery extends FakeWarmQuery {
	readonly flagSettings: Array<Parameters<Query['applyFlagSettings']>[0]> = [];

	constructor(private readonly _signal: AbortSignal) { super(); }

	override query(_prompt: string | AsyncIterable<SDKUserMessage>): Query {
		this.queryCallCount++;
		return new RecordingQuery(this.flagSettings, this._signal);
	}
}

/** A {@link Query}-shaped stub whose async stream the test ends on demand. */
type IControllableQuery = Query & {
	/** Ends the stream (models a dispose-driven close of the underlying query). */
	end(): void;
	/** How many times the consumer loop has pulled from this query's iterator. */
	readonly nextCallCount: number;
};

/**
 * Builds a {@link Query} whose async iterator blocks (modelling a live turn)
 * until {@link IControllableQuery.end}, and records how many times the consumer
 * loop pulled from it. Lets a test hold the consumer loop on one query while a
 * rebind swaps in the next, then observe whether the new query gets drained.
 */
function makeControllableQuery(): IControllableQuery {
	let ended = false;
	let wake: (() => void) | undefined;
	const q = Object.assign(new ImmediatelyDoneQuery(), {
		nextCallCount: 0,
		end(): void { ended = true; wake?.(); wake = undefined; },
		[Symbol.asyncIterator]() { return this; },
		async next(this: { nextCallCount: number }): Promise<IteratorResult<SDKMessage, void>> {
			this.nextCallCount++;
			while (!ended) {
				await new Promise<void>(resolve => { wake = resolve; });
			}
			return { done: true, value: undefined };
		},
		async return() { return { done: true, value: undefined }; },
		async throw(err: unknown) { throw err; },
	});
	return q as unknown as IControllableQuery;
}

/** {@link WarmQuery} that hands out {@link makeControllableQuery} instances and records them. */
class ControllableWarmQuery extends FakeWarmQuery {
	readonly queries: IControllableQuery[] = [];

	override query(_prompt: string | AsyncIterable<SDKUserMessage>): Query {
		this.queryCallCount++;
		const q = makeControllableQuery();
		this.queries.push(q);
		return q;
	}
}

// ===== Harness =====

interface IPipelineHarness {
	readonly pipeline: ClaudeSdkPipeline;
	readonly warm: FakeWarmQuery;
	readonly controller: AbortController;
}

function createPipeline(
	disposables: Pick<DisposableStore, 'add'>,
	warmOrFactory: FakeWarmQuery | ((signal: AbortSignal) => FakeWarmQuery) = new FakeWarmQuery(),
): IPipelineHarness {
	const controller = new AbortController();
	const warm = typeof warmOrFactory === 'function' ? warmOrFactory(controller.signal) : warmOrFactory;
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
	const subagents = disposables.add(new SubagentRegistry());
	const pipeline = disposables.add(inst.createInstance(
		ClaudeSdkPipeline,
		'sess-1',
		URI.parse('claude:/sess-1'),
		URI.parse(buildDefaultChatUri('claude:/sess-1')),
		warm,
		controller,
		dbRef,
		subagents,
		undefined,
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

/**
 * Let the pipeline's fire-and-forget `send()` run far enough to bind the
 * Query and finish its synchronous `_replayCurrentConfig` (a no-op when the
 * seeded config already matches). A few microtask turns is enough; the stub
 * Query never awaits real I/O.
 */
async function flushMicrotasks(): Promise<void> {
	for (let i = 0; i < 5; i++) {
		await Promise.resolve();
	}
}

suite('ClaudeSdkPipeline', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	suite('reloadPlugins', () => {

		test('forwards to the SDK Query', async () => {
			let reloadCallCount = 0;
			class WarmWithReload extends FakeWarmQuery {
				override query(_prompt: string | AsyncIterable<SDKUserMessage>): Query {
					this.queryCallCount++;
					const q = new ImmediatelyDoneQuery();
					(q as unknown as { reloadPlugins: () => Promise<{ commands: { name: string }[] }> }).reloadPlugins =
						async () => { reloadCallCount++; return { commands: [] }; };
					return q;
				}
			}
			const controller = new AbortController();
			const warm = new WarmWithReload();
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
			const subagents = disposables.add(new SubagentRegistry());
			const pipeline = disposables.add(inst.createInstance(
				ClaudeSdkPipeline,
				'sess-2',
				URI.parse('claude:/sess-2'),
				URI.parse(buildDefaultChatUri('claude:/sess-2')),
				warm,
				controller,
				dbRef,
				subagents,
				undefined,
			));
			// Bind the query by issuing a send (iterator closes immediately).
			pipeline.send(makePrompt('p1'), 'turn-A').catch(() => { /* expected */ });
			await Promise.resolve();

			await pipeline.reloadPlugins();
			assert.strictEqual(reloadCallCount, 1);
		});
	});

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

		test('a rebind hands the consumer loop off to the new query so the post-rebind turn is not lost', async () => {
			// Regression: a rebind swaps in a fresh `_query` while the consumer
			// loop is still draining the OLD one. The post-rebind `send` queues
			// its prompt while the old loop is still marked running, so
			// `_ensureConsumerLoop` no-ops. If the old loop then just stopped,
			// nothing would ever read the new query and `send` would hang
			// ("Restore Checkpoint then send" never responds).
			const warm1 = new ControllableWarmQuery();
			const { pipeline } = createPipeline(disposables, warm1);

			// Bind Q1 and start the consumer loop draining it. No result is
			// pushed, so this send never resolves — we only need the live loop.
			pipeline.send(makePrompt('p1'), 'turn-1').catch(() => { /* unwound on teardown */ });
			await flushMicrotasks();
			const q1 = warm1.queries[0];
			assert.ok(q1.nextCallCount > 0, 'consumer loop drains Q1');

			// Rebind to a fresh warm/Q2 while Q1's loop is still parked.
			const warm2 = new ControllableWarmQuery();
			pipeline.attachRematerializer(async () => ({ warm: warm2, abortController: new AbortController() }));
			await pipeline.rebindForRestart();
			const q2 = warm2.queries[0];
			assert.strictEqual(q2.nextCallCount, 0, 'new query not drained yet — the old loop is still running');

			// The old query's stream now ends (as a real dispose would). The
			// loop must hand off to Q2 rather than stopping.
			q1.end();
			await flushMicrotasks();

			assert.ok(q2.nextCallCount > 0, 'consumer loop handed off to the new query after the old one ended');

			// Clean teardown: let the re-armed loop unwind before dispose.
			q2.end();
			await flushMicrotasks();
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

	suite('setEffort', () => {

		// Bind a live Query (send() lazily binds it) seeded as if the session
		// materialized on an effort-capable model. Returns the recorder so each
		// test asserts the exact applyFlagSettings payloads pushed afterwards.
		async function seededHighThenBind(disposables: Pick<DisposableStore, 'add'>): Promise<{ pipeline: ClaudeSdkPipeline; warm: RecordingWarmQuery }> {
			let warm!: RecordingWarmQuery;
			const { pipeline } = createPipeline(disposables, signal => (warm = new RecordingWarmQuery(signal)));
			pipeline.seedCurrentConfig('claude-opus-4-7', 'high', 'default');
			pipeline.send(makePrompt('p1'), 'turn-A').catch(() => { /* stream ends without result */ });
			await flushMicrotasks();
			assert.strictEqual(warm.queryCallCount, 1, 'query should be bound after send');
			warm.flagSettings.length = 0; // drop any replay from bind; isolate the switch
			return { pipeline, warm };
		}

		test('switching to a model with no effort clears the stale effort via applyFlagSettings({ effortLevel: null })', async () => {
			// Repro of the Haiku 400: a session materialized on Opus applies
			// effort 'high' at SDK startup; switching to Haiku must CLEAR it, not
			// leave 'high' to be replayed onto a model the API 400s on.
			const { pipeline, warm } = await seededHighThenBind(disposables);
			await pipeline.setEffort(undefined);
			assert.deepStrictEqual(warm.flagSettings, [{ effortLevel: null }]);
		});

		test('switching between two effort-capable levels pushes the new value', async () => {
			const { pipeline, warm } = await seededHighThenBind(disposables);
			await pipeline.setEffort('low');
			assert.deepStrictEqual(warm.flagSettings, [{ effortLevel: 'low' }]);
		});

		test('re-applying the already-applied effort is a no-op (no redundant SDK call)', async () => {
			const { pipeline, warm } = await seededHighThenBind(disposables);
			await pipeline.setEffort('high');
			assert.deepStrictEqual(warm.flagSettings, []);
		});

		test('clearing an already-clear effort is a no-op', async () => {
			let warm!: RecordingWarmQuery;
			const { pipeline } = createPipeline(disposables, signal => (warm = new RecordingWarmQuery(signal)));
			pipeline.seedCurrentConfig('claude-haiku-4-5', undefined, 'default');
			pipeline.send(makePrompt('p1'), 'turn-A').catch(() => { /* stream ends without result */ });
			await flushMicrotasks();
			warm.flagSettings.length = 0;
			await pipeline.setEffort(undefined);
			assert.deepStrictEqual(warm.flagSettings, []);
		});

		test('setEffort while awaiting rebind (post-abort) is buffered, not pushed to the dead query, then replayed on rebind', async () => {
			// After an abort the `_query` handle is intentionally retained (it is
			// what teardown awaits) but the stream is dead; `_needsRebind` is the
			// health signal. setEffort must NOT steer that dead query — it should
			// buffer the value and let `_replayCurrentConfig` push it onto the
			// freshly-bound query after the rebind.
			const { pipeline, warm } = await seededHighThenBind(disposables);
			pipeline.abort();
			warm.flagSettings.length = 0; // isolate: ignore anything from the dead query
			await pipeline.setEffort('low');
			assert.deepStrictEqual(warm.flagSettings, [], 'effort must not be pushed while needsRebind');

			let warm2!: RecordingWarmQuery;
			pipeline.attachRematerializer(async () => {
				const ctl = new AbortController();
				warm2 = new RecordingWarmQuery(ctl.signal);
				return { warm: warm2, abortController: ctl };
			});
			pipeline.send(makePrompt('p2'), 'turn-B').catch(() => { /* stream ends without result */ });
			await flushMicrotasks();
			assert.deepStrictEqual(warm2.flagSettings, [{ effortLevel: 'low' }], 'buffered effort replayed on the rebound query');
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
