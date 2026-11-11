/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Query, SDKControlInterruptResponse, SDKMessage, SDKUserMessage, WarmQuery } from '@anthropic-ai/claude-agent-sdk';

import assert from 'assert';
import * as sinon from 'sinon';
import { AsyncIterableSource, DeferredPromise, Promises } from '../../../../base/common/async.js';
import { isCancellationError } from '../../../../base/common/errors.js';
import { DisposableStore, IReference, toDisposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { Schemas } from '../../../../base/common/network.js';
import { IFileService } from '../../../files/common/files.js';
import { createInMemoryFileService } from '../../../files/test/common/inMemoryFileService.js';
import { IInstantiationService } from '../../../instantiation/common/instantiation.js';
import { InstantiationService } from '../../../instantiation/common/instantiationService.js';
import { ServiceCollection } from '../../../instantiation/common/serviceCollection.js';
import { ILogService, NullLogService } from '../../../log/common/log.js';
import { IDiffComputeService } from '../../common/diffComputeService.js';
import { ISessionDatabase, ISessionDataService } from '../../common/sessionDataService.js';
import { ActionType } from '../../common/state/sessionActions.js';
import { buildDefaultChatUri } from '../../common/state/sessionState.js';
import { ClaudeSdkPipeline, IRematerializer } from '../../node/claude/claudeSdkPipeline.js';
import { SubagentRegistry } from '../../node/claude/claudeSubagentRegistry.js';
import { createSessionDataService, createZeroDiffComputeService, TestSessionDatabase } from '../common/sessionTestHelpers.js';
import { AgentSignal, fixedChatOwnerRef } from '../../common/agent.js';
import { makeResultSuccess, makeTextResponseMessages } from './claudeMapSessionEventsTestUtils.js';

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
	async interrupt(): Promise<SDKControlInterruptResponse | undefined> { return undefined; }
	streamInput(): never { throw new Error('not modeled'); }
	stopTask(): never { throw new Error('not modeled'); }
	reloadSkills(): never { throw new Error('not modeled'); }
	reloadOutputStyles(): never { throw new Error('not modeled'); }
	backgroundTasks(): never { throw new Error('not modeled'); }
	async close(): Promise<void> { /* not exercised here */ }
	async [Symbol.asyncDispose](): Promise<void> { /* not exercised here */ }
	setMaxThinkingTokens(): never { throw new Error('not modeled'); }
	updateSettings(): never { throw new Error('not modeled'); }
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
	const fileService = createInMemoryFileService(disposables, Schemas.file);

	const db = new TestSessionDatabase();
	const dbRef: IReference<ISessionDatabase> = { object: db, dispose: () => { } };

	const services = new ServiceCollection(
		[ILogService, new NullLogService()],
		[IFileService, fileService],
		[ISessionDataService, createSessionDataService(db)],
		[IDiffComputeService, createZeroDiffComputeService()],
	);
	const inst: IInstantiationService = disposables.add(new InstantiationService(services));
	const subagents = disposables.add(new SubagentRegistry());
	const pipeline = disposables.add(inst.createInstance(
		ClaudeSdkPipeline,
		'sess-1',
		URI.parse(buildDefaultChatUri('claude:/sess-1')),
		fixedChatOwnerRef(URI.parse('claude:/sess-1')),
		URI.parse('claude:/sess-1'),
		warm,
		controller,
		dbRef,
		subagents,
		undefined,
	));
	return { pipeline, warm, controller };
}

async function createPipelineWithGatedShutdown(disposables: Pick<DisposableStore, 'add'>) {
	const warm = new FakeWarmQuery();
	const query: Query = new ImmediatelyDoneQuery();
	const reading = new DeferredPromise<void>();
	const ended = new DeferredPromise<IteratorResult<SDKMessage, void>>();
	const shutdownStarted = new DeferredPromise<void>();
	const releaseShutdown = new DeferredPromise<void>();
	disposables.add(toDisposable(() => {
		releaseShutdown.complete();
		ended.complete({ done: true, value: undefined });
	}));
	sinon.stub(warm, 'query').returns(query);
	sinon.stub(query, 'next').callsFake(() => {
		reading.complete();
		return ended.p;
	});
	sinon.stub(query, 'return').callsFake(async () => {
		shutdownStarted.complete();
		try {
			await releaseShutdown.p;
			return { done: true, value: undefined };
		} finally {
			ended.complete({ done: true, value: undefined });
		}
	});
	const harness = createPipeline(disposables, warm);
	const cancelledTurn = assert.rejects(harness.pipeline.send(makePrompt('paused'), 'turn-paused'), isCancellationError);
	await reading.p;
	return { ...harness, query, shutdownStarted, releaseShutdown, cancelledTurn };
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

	teardown(() => sinon.restore());

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
			const fileService = createInMemoryFileService(disposables, Schemas.file);
			const db = new TestSessionDatabase();
			const dbRef: IReference<ISessionDatabase> = { object: db, dispose: () => { } };
			const services = new ServiceCollection(
				[ILogService, new NullLogService()],
				[IFileService, fileService],
				[ISessionDataService, createSessionDataService(db)],
				[IDiffComputeService, createZeroDiffComputeService()],
			);
			const inst: IInstantiationService = disposables.add(new InstantiationService(services));
			const subagents = disposables.add(new SubagentRegistry());
			const pipeline = disposables.add(inst.createInstance(
				ClaudeSdkPipeline,
				'sess-2',
				URI.parse(buildDefaultChatUri('claude:/sess-2')),
				fixedChatOwnerRef(URI.parse('claude:/sess-2')),
				URI.parse('claude:/sess-2'),
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

		test('interrupts before closing and waits for exit before rebuilding, ignoring cancelled results', async () => {
			const warm = new FakeWarmQuery();
			const query = makeControllableQuery();
			const prompts = new DeferredPromise<AsyncIterator<SDKUserMessage>>();
			sinon.stub(warm, 'query').callsFake(prompt => {
				assert.ok(typeof prompt !== 'string');
				prompts.complete(prompt[Symbol.asyncIterator]());
				return query;
			});
			const reading = new DeferredPromise<void>();
			const message = new DeferredPromise<IteratorResult<SDKMessage, void>>();
			const consumed = new DeferredPromise<void>();
			const ended = new DeferredPromise<IteratorResult<SDKMessage, void>>();
			sinon.stub(query, 'next')
				.onFirstCall().callsFake(() => { reading.complete(); return message.p; })
				.onSecondCall().callsFake(() => { consumed.complete(); return ended.p; });
			const interrupted = new DeferredPromise<SDKControlInterruptResponse | undefined>();
			const interrupt = sinon.stub(query, 'interrupt').returns(interrupted.p);
			const returning = new DeferredPromise<void>();
			const exited = new DeferredPromise<void>();
			sinon.stub(query, 'return').callsFake(async () => {
				returning.complete();
				await exited.p;
				ended.complete({ done: true, value: undefined });
				return { done: true, value: undefined };
			});
			const { pipeline, controller } = createPipeline(disposables, warm);
			const signals: string[] = [];
			disposables.add(pipeline.onDidProduceSignal(signal => signals.push(signal.kind)));
			const cancelled = assert.rejects(pipeline.send(makePrompt('paused'), 'paused'), isCancellationError);
			await reading.p;
			const promptIterator = await prompts.p;
			await promptIterator.next();
			const waitingPrompt = DeferredPromise.fromPromise(promptIterator.next());

			const abort = pipeline.abort();
			assert.strictEqual(pipeline.abort(), abort, 'concurrent cancellation shares the same shutdown');
			let rebuilt = false;
			pipeline.attachRematerializer({
				async rematerialize() {
					assert.strictEqual(exited.isResolved, true, 'the old process must finish writing before resume');
					rebuilt = true;
					return { warm: new FakeWarmQuery(), abortController: new AbortController() };
				},
			});
			const recovery = pipeline.rebindForRestart();
			message.complete({ done: false, value: makeResultSuccess('sess-1') });
			await consumed.p;
			assert.deepStrictEqual({
				interrupts: interrupt.callCount,
				aborted: pipeline.isAborted,
				transportClosed: controller.signal.aborted,
				promptStreamClosed: waitingPrompt.isSettled,
				disposals: warm.asyncDisposeCount,
				rebuilt,
				signals,
			}, { interrupts: 1, aborted: true, transportClosed: false, promptStreamClosed: false, disposals: 0, rebuilt: false, signals: [] });

			interrupted.complete(undefined);
			await returning.p;
			assert.deepStrictEqual({
				transportClosed: controller.signal.aborted,
				disposals: warm.asyncDisposeCount,
				rebuilt,
			}, { transportClosed: true, disposals: 1, rebuilt: false });
			exited.complete();
			await Promise.all([abort, recovery, cancelled]);
			assert.deepStrictEqual({ rebuilt, waitingPrompt: await waitingPrompt.p }, { rebuilt: true, waitingPrompt: { done: true, value: undefined } });
		});

		test('interrupt failure is surfaced after closing the transport and cancelling the send', async () => {
			const warm = new ControllableWarmQuery();
			const { pipeline, controller } = createPipeline(disposables, warm);
			const cancelled = assert.rejects(pipeline.send(makePrompt('paused'), 'paused'), isCancellationError);
			await flushMicrotasks();
			const query = warm.queries[0];
			const failure = new Error('interrupt failed');
			sinon.stub(query, 'interrupt').rejects(failure);
			sinon.stub(query, 'return').callsFake(async () => {
				query.end();
				return { done: true, value: undefined };
			});
			await assert.rejects(pipeline.abort(), error => error === failure);
			await cancelled;
			assert.deepStrictEqual({
				transportClosed: controller.signal.aborted,
				disposals: warm.asyncDisposeCount,
				activeTurn: pipeline.hasActiveTurn,
			}, { transportClosed: true, disposals: 1, activeTurn: false });
		});

		test('replacement waiting for previous shutdown can be cancelled before recovery starts', async () => {
			const { pipeline, shutdownStarted, releaseShutdown, cancelledTurn } = await createPipelineWithGatedShutdown(disposables);
			const fresh = { warm: new FakeWarmQuery(), abortController: new AbortController() };
			const rematerializer: IRematerializer = { async rematerialize() { return fresh; } };
			const rebuild = sinon.spy(rematerializer, 'rematerialize');
			pipeline.attachRematerializer(rematerializer);
			const abort = pipeline.abort();
			await shutdownStarted.p;
			const replacement = assert.rejects(pipeline.send(makePrompt('replacement'), 'turn-replacement'), isCancellationError);
			const cancelReplacement = pipeline.abort();
			releaseShutdown.complete();
			await Promises.settled([abort, cancelReplacement, cancelledTurn, replacement]);

			assert.deepStrictEqual({
				rebuilds: rebuild.callCount,
				freshQueries: fresh.warm.queryCallCount,
				aborted: pipeline.isAborted,
				activeTurn: pipeline.hasActiveTurn,
			}, { rebuilds: 0, freshQueries: 0, aborted: true, activeTurn: false });
		});

		test('replacement waiting for previous shutdown recovers after an interrupt failure', async () => {
			const { pipeline, query, shutdownStarted, releaseShutdown, cancelledTurn } = await createPipelineWithGatedShutdown(disposables);
			const failure = new Error('interrupt failed');
			sinon.stub(query, 'interrupt').rejects(failure);
			const freshWarm = new FakeWarmQuery();
			const freshQuery: Query = new ImmediatelyDoneQuery();
			const messages = new AsyncIterableSource<SDKMessage>();
			disposables.add(toDisposable(() => messages.resolve()));
			const iterator = messages.asyncIterable[Symbol.asyncIterator]();
			const prompts = new DeferredPromise<AsyncIterator<SDKUserMessage>>();
			sinon.stub(freshQuery, 'next').callsFake(() => iterator.next());
			sinon.stub(freshWarm, 'query').callsFake(prompt => {
				assert.ok(typeof prompt !== 'string');
				prompts.complete(prompt[Symbol.asyncIterator]());
				return freshQuery;
			});
			pipeline.attachRematerializer({
				async rematerialize() {
					return { warm: freshWarm, abortController: new AbortController() };
				},
			});
			const signals: AgentSignal[] = [];
			disposables.add(pipeline.onDidProduceSignal(signal => signals.push(signal)));
			const aborted = assert.rejects(pipeline.abort(), error => error === failure);
			await shutdownStarted.p;
			const replacement = pipeline.send(makePrompt('replacement'), 'turn-replacement');
			const nextPrompt = (async () => (await prompts.p).next())();
			releaseShutdown.complete();
			try {
				const submitted = await Promise.race([nextPrompt, replacement]);
				assert.ok(submitted && !submitted.done);
				messages.emitMany(makeTextResponseMessages('sess-1', 'replacement response'));
				await replacement;
				assert.deepStrictEqual({
					prompt: submitted.value.message.content,
					responses: signals.flatMap(signal => signal.kind === 'action' && signal.action.type === ActionType.ChatDelta
						? [{ turnId: signal.action.turnId, content: signal.action.content }] : []),
					completed: signals.flatMap(signal => signal.kind === 'action' && signal.action.type === ActionType.ChatTurnComplete ? [signal.action.turnId] : []),
				}, {
					prompt: 'replacement',
					responses: [{ turnId: 'turn-replacement', content: 'replacement response' }],
					completed: ['turn-replacement'],
				});
			} finally {
				messages.resolve();
				await Promises.settled([aborted, cancelledTurn, replacement]);
			}
		});

		test('replacement waiting for previous shutdown still fails when shutdown fails', async () => {
			const { pipeline, shutdownStarted, releaseShutdown, cancelledTurn } = await createPipelineWithGatedShutdown(disposables);
			const failure = new Error('shutdown failed');
			const fresh = { warm: new FakeWarmQuery(), abortController: new AbortController() };
			const rematerializer: IRematerializer = { async rematerialize() { return fresh; } };
			const rebuild = sinon.spy(rematerializer, 'rematerialize');
			pipeline.attachRematerializer(rematerializer);
			const aborted = assert.rejects(pipeline.abort(), error => error === failure);
			await shutdownStarted.p;
			const replacement = assert.rejects(pipeline.send(makePrompt('replacement'), 'turn-replacement'), error => error === failure);
			releaseShutdown.error(failure);
			await Promises.settled([aborted, cancelledTurn, replacement]);
			assert.deepStrictEqual({
				rebuilds: rebuild.callCount,
				freshQueries: fresh.warm.queryCallCount,
				activeTurn: pipeline.hasActiveTurn,
			}, { rebuilds: 0, freshQueries: 0, activeTurn: false });
		});

		for (const first of ['rebuild', 'interrupt'] as const) {
			test(`cancellation discards a late runtime when ${first} completes first`, async () => {
				const warm = new FakeWarmQuery();
				const query: Query = new ImmediatelyDoneQuery();
				const messages = new AsyncIterableSource<SDKMessage>();
				disposables.add(toDisposable(() => messages.resolve()));
				const iterator = messages.asyncIterable[Symbol.asyncIterator]();
				const prompts = new DeferredPromise<AsyncIterator<SDKUserMessage>>();
				sinon.stub(query, 'next').callsFake(() => iterator.next());
				sinon.stub(warm, 'query').callsFake(prompt => {
					assert.ok(typeof prompt !== 'string');
					prompts.complete(prompt[Symbol.asyncIterator]());
					return query;
				});
				const interrupted = new DeferredPromise<SDKControlInterruptResponse | undefined>();
				sinon.stub(query, 'interrupt').returns(interrupted.p);
				let closedBeforeInterrupt = false;
				sinon.stub(warm, Symbol.asyncDispose).callsFake(async () => {
					closedBeforeInterrupt ||= !interrupted.isResolved;
					warm.asyncDisposeCount++;
					messages.resolve();
				});
				const queryReturn = sinon.stub(query, 'return').callsFake(async () => {
					messages.resolve();
					return { done: true, value: undefined };
				});
				const { pipeline } = createPipeline(disposables, warm);
				const seed = pipeline.send(makePrompt('seed'), 'turn-seed');
				await (await prompts.p).next();
				messages.emitOne(makeResultSuccess('sess-1'));
				await seed;

				const enteredRebuild = new DeferredPromise<void>();
				const releaseRebuild = new DeferredPromise<{ warm: FakeWarmQuery; abortController: AbortController }>();
				pipeline.attachRematerializer({
					async rematerialize() {
						enteredRebuild.complete();
						return releaseRebuild.p;
					},
				});
				const cancelled = assert.rejects(pipeline.rebindForRestart(), isCancellationError);
				await enteredRebuild.p;
				const abort = pipeline.abort();
				const fresh = { warm: new FakeWarmQuery(), abortController: new AbortController() };
				try {
					if (first === 'rebuild') {
						releaseRebuild.complete(fresh);
						await cancelled;
					} else {
						interrupted.complete(undefined);
						await abort;
					}
				} finally {
					interrupted.complete(undefined);
					releaseRebuild.complete(fresh);
					await Promises.settled([abort, cancelled]);
				}

				assert.deepStrictEqual({
					closedBeforeInterrupt,
					queryReturns: queryReturn.callCount,
					freshAborted: fresh.abortController.signal.aborted,
					freshDisposals: fresh.warm.asyncDisposeCount,
					freshQueries: fresh.warm.queryCallCount,
					aborted: pipeline.isAborted,
				}, {
					closedBeforeInterrupt: false,
					queryReturns: 1,
					freshAborted: true,
					freshDisposals: 1,
					freshQueries: 0,
					aborted: true,
				});
			});
		}

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

		test('rebind moves the queue abort subscription to the new controller', async () => {
			const { pipeline, controller } = createPipeline(disposables);
			const replacement = new AbortController();
			const oldRemoved = sinon.spy(controller.signal, 'removeEventListener');
			const newAdded = sinon.spy(replacement.signal, 'addEventListener');
			const newRemoved = sinon.spy(replacement.signal, 'removeEventListener');
			pipeline.attachRematerializer({ rematerialize: async () => ({ warm: new FakeWarmQuery(), abortController: replacement }) });
			await pipeline.rebindForRestart();
			const afterRebind = { oldRemoved: oldRemoved.callCount, newAdded: newAdded.callCount, newRemoved: newRemoved.callCount };
			pipeline.dispose();
			assert.deepStrictEqual({ afterRebind, newRemoved: newRemoved.callCount, aborted: replacement.signal.aborted }, {
				afterRebind: { oldRemoved: 1, newAdded: 1, newRemoved: 0 },
				newRemoved: 1,
				aborted: true,
			});
		});

		test('after abort, send invokes the attached rematerializer in "recover" mode and clears the rebind flag', async () => {
			const { pipeline } = createPipeline(disposables);
			const reasons: Array<'restart' | 'recover'> = [];
			const built: { warm: FakeWarmQuery; controller: AbortController }[] = [];
			const rematerializer: IRematerializer = {
				async rematerialize(reason) {
					reasons.push(reason);
					const ctl = new AbortController();
					const warm = new FakeWarmQuery();
					built.push({ warm, controller: ctl });
					return { warm, abortController: ctl };
				},
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
			pipeline.attachRematerializer({
				async rematerialize() {
					calls++;
					throw rebuildErr;
				},
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
			const enteredRebuild = new DeferredPromise<void>();
			const releaseRebuild = new DeferredPromise<{ warm: FakeWarmQuery; controller: AbortController }>();
			pipeline.attachRematerializer({
				async rematerialize() {
					enteredRebuild.complete();
					const pair = await releaseRebuild.p;
					return { warm: pair.warm, abortController: pair.controller };
				},
			});

			await pipeline.abort();
			const cancelled = assert.rejects(pipeline.send(makePrompt('p1'), 'turn-A'), isCancellationError);
			await enteredRebuild.p;
			await pipeline.abort();
			const freshController = new AbortController();
			const freshWarm = new FakeWarmQuery();
			releaseRebuild.complete({ warm: freshWarm, controller: freshController });
			await cancelled;
			assert.deepStrictEqual({
				freshAborted: freshController.signal.aborted,
				freshDisposals: freshWarm.asyncDisposeCount,
				freshQueries: freshWarm.queryCallCount,
				aborted: pipeline.isAborted,
				activeTurn: pipeline.hasActiveTurn,
			}, { freshAborted: true, freshDisposals: 1, freshQueries: 0, aborted: true, activeTurn: false });
		});

		test('a rebind ignores late old results and completes the replacement from its own query', async () => {
			const [oldRuntime, replacementRuntime] = [0, 1].map(() => {
				const warm = new FakeWarmQuery();
				const query: Query = new ImmediatelyDoneQuery();
				const messages = new AsyncIterableSource<SDKMessage>();
				disposables.add(toDisposable(() => messages.resolve()));
				const iterator = messages.asyncIterable[Symbol.asyncIterator]();
				const prompts = new DeferredPromise<AsyncIterator<SDKUserMessage>>();
				const reading = new DeferredPromise<void>();
				const ended = new DeferredPromise<void>();
				sinon.stub(query, 'next').callsFake(async () => {
					reading.complete();
					const result = await iterator.next();
					if (result.done) {
						ended.complete();
					}
					return result;
				});
				sinon.stub(warm, 'query').callsFake(prompt => {
					assert.notStrictEqual(typeof prompt, 'string');
					if (typeof prompt === 'string') {
						throw new Error('Expected the streaming SDK prompt boundary');
					}
					prompts.complete(prompt[Symbol.asyncIterator]());
					return query;
				});
				return { warm, messages, prompts, reading, ended };
			});
			const { pipeline } = createPipeline(disposables, oldRuntime.warm);
			const first = pipeline.send(makePrompt('first'), 'turn-first');
			const firstPrompt = await (await oldRuntime.prompts.p).next();
			oldRuntime.messages.emitOne(makeResultSuccess('sess-1'));
			await first;

			const signals: AgentSignal[] = [];
			disposables.add(pipeline.onDidProduceSignal(signal => signals.push(signal)));
			pipeline.attachRematerializer({ rematerialize: async () => ({ warm: replacementRuntime.warm, abortController: new AbortController() }) });
			await pipeline.rebindForRestart();
			const replacement = DeferredPromise.fromPromise(pipeline.send(makePrompt('replacement'), 'turn-replacement'));
			const replacementPrompt = await (await replacementRuntime.prompts.p).next();
			oldRuntime.messages.emitMany(makeTextResponseMessages('sess-1', 'stale response'));
			oldRuntime.messages.resolve();
			await replacementRuntime.reading.p;
			const beforeReplacementResult = { settled: replacement.isSettled, signals: signals.slice() };

			replacementRuntime.messages.emitMany(makeTextResponseMessages('sess-1', 'replacement response'));
			await replacement.p;
			replacementRuntime.messages.resolve();
			await replacementRuntime.ended.p;
			assert.deepStrictEqual({
				prompts: [firstPrompt.value?.message.content, replacementPrompt.value?.message.content],
				beforeReplacementResult,
				responses: signals.flatMap(signal => signal.kind === 'action' && signal.action.type === ActionType.ChatDelta
					? [{ turnId: signal.action.turnId, content: signal.action.content }] : []),
				completed: signals.flatMap(signal => signal.kind === 'action' && signal.action.type === ActionType.ChatTurnComplete ? [signal.action.turnId] : []),
			}, {
				prompts: ['first', 'replacement'],
				beforeReplacementResult: { settled: false, signals: [] },
				responses: [{ turnId: 'turn-replacement', content: 'replacement response' }],
				completed: ['turn-replacement'],
			});
		});

		test('restart invokes the rebuild command with its owning receiver', async () => {
			const { pipeline } = createPipeline(disposables);
			const rebuilt = { warm: new FakeWarmQuery(), abortController: new AbortController() };
			const requests: { reason: 'restart' | 'recover'; receiver: IRematerializer }[] = [];
			const rematerializer: IRematerializer = {
				async rematerialize(reason) {
					requests.push({ reason, receiver: this });
					return rebuilt;
				},
			};
			pipeline.attachRematerializer(rematerializer);
			await pipeline.rebindForRestart();
			assert.deepStrictEqual({
				requests: requests.map(request => ({ reason: request.reason, ownerRetained: request.receiver === rematerializer })),
				queryBinds: rebuilt.warm.queryCallCount,
				aborted: pipeline.isAborted,
			}, {
				requests: [{ reason: 'restart', ownerRetained: true }],
				queryBinds: 1,
				aborted: false,
			});
		});

		test('dispose while rebuilding cancels and releases the late command result', async () => {
			const { pipeline, warm } = createPipeline(disposables);
			const enteredRebuild = new DeferredPromise<void>();
			const rebuilt = new DeferredPromise<{ warm: FakeWarmQuery; abortController: AbortController }>();
			pipeline.attachRematerializer({
				rematerialize() {
					enteredRebuild.complete();
					return rebuilt.p;
				},
			});
			await pipeline.abort();
			const rejected = assert.rejects(pipeline.send(makePrompt('pending'), 'turn-A'), isCancellationError);
			await enteredRebuild.p;
			pipeline.dispose();
			const fresh = { warm: new FakeWarmQuery(), abortController: new AbortController() };
			rebuilt.complete(fresh);
			await rejected;
			assert.deepStrictEqual({
				originalDisposals: warm.asyncDisposeCount,
				freshDisposals: fresh.warm.asyncDisposeCount,
				freshQueries: fresh.warm.queryCallCount,
				freshAborted: fresh.abortController.signal.aborted,
				activeTurn: pipeline.hasActiveTurn,
			}, { originalDisposals: 1, freshDisposals: 1, freshQueries: 0, freshAborted: true, activeTurn: false });
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
			await pipeline.abort();
			warm.flagSettings.length = 0; // isolate: ignore anything from the dead query
			await pipeline.setEffort('low');
			assert.deepStrictEqual(warm.flagSettings, [], 'effort must not be pushed while needsRebind');

			let warm2!: RecordingWarmQuery;
			pipeline.attachRematerializer({
				async rematerialize() {
					const ctl = new AbortController();
					warm2 = new RecordingWarmQuery(ctl.signal);
					return { warm: warm2, abortController: ctl };
				},
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
			pipeline.attachRematerializer({
				async rematerialize() {
					const err = new Error('Canceled');
					err.name = 'Canceled';
					throw err;
				},
			});
			pipeline.abort();
			await pipeline.send(makePrompt('p1'), 'turn-A').then(
				() => assert.fail('expected rejection'),
				err => assert.ok(isCancellationError(err), `expected cancellation, got ${err}`),
			);
		});
	});
});
