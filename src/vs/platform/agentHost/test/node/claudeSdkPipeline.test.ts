/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Query, SDKUserMessage, WarmQuery } from '@anthropic-ai/claude-agent-sdk';

import assert from 'assert';
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
import { ClaudeSdkPipeline, ISdkAppliedConfig } from '../../node/claude/claudeSdkPipeline.js';
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


// ===== Harness =====

interface IPipelineHarness {
	readonly pipeline: ClaudeSdkPipeline;
	readonly warm: FakeWarmQuery;
	readonly controller: AbortController;
}

function createPipeline(
	disposables: Pick<DisposableStore, 'add'>,
	warmOrFactory: FakeWarmQuery | ((signal: AbortSignal) => FakeWarmQuery) = new FakeWarmQuery(),
	appliedConfig: ISdkAppliedConfig = { model: undefined, effort: undefined, permissionMode: undefined },
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
		appliedConfig,
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
	});

	suite('isDead', () => {

		test('abort sets isDead synchronously', () => {
			const { pipeline } = createPipeline(disposables);
			assert.strictEqual(pipeline.isDead, false);
			pipeline.abort();
			assert.strictEqual(pipeline.isDead, true);
		});
	});

	suite('applied config seed', () => {

		test('the query is bound once at construction (eager bind) with the seeded config', () => {
			const { warm } = createPipeline(disposables, new FakeWarmQuery(), { model: 'claude-sonnet-4-5', effort: 'high', permissionMode: 'default' });
			assert.strictEqual(warm.queryCallCount, 1);
		});
	});

	suite('setEffort', () => {

		// Construct a pipeline seeded as if the session materialized on an
		// effort-capable model. The query is bound eagerly at construction, so
		// runtime setEffort pushes are recorded without needing a send.
		function seededHigh(disposables: Pick<DisposableStore, 'add'>): { pipeline: ClaudeSdkPipeline; warm: RecordingWarmQuery } {
			let warm!: RecordingWarmQuery;
			const { pipeline } = createPipeline(
				disposables,
				signal => (warm = new RecordingWarmQuery(signal)),
				{ model: 'claude-opus-4-7', effort: 'high', permissionMode: 'default' },
			);
			return { pipeline, warm };
		}

		test('switching to a model with no effort clears the stale effort via applyFlagSettings({ effortLevel: null })', async () => {
			// Repro of the Haiku 400: a session materialized on Opus applies
			// effort 'high' at SDK startup; switching to Haiku must CLEAR it, not
			// leave 'high' to be replayed onto a model the API 400s on.
			const { pipeline, warm } = seededHigh(disposables);
			await pipeline.setEffort(undefined);
			assert.deepStrictEqual(warm.flagSettings, [{ effortLevel: null }]);
		});

		test('switching between two effort-capable levels pushes the new value', async () => {
			const { pipeline, warm } = seededHigh(disposables);
			await pipeline.setEffort('low');
			assert.deepStrictEqual(warm.flagSettings, [{ effortLevel: 'low' }]);
		});

		test('re-applying the already-applied effort is a no-op (no redundant SDK call)', async () => {
			const { pipeline, warm } = seededHigh(disposables);
			await pipeline.setEffort('high');
			assert.deepStrictEqual(warm.flagSettings, []);
		});

		test('clearing an already-clear effort is a no-op', async () => {
			let warm!: RecordingWarmQuery;
			const { pipeline } = createPipeline(
				disposables,
				signal => (warm = new RecordingWarmQuery(signal)),
				{ model: 'claude-haiku-4-5', effort: undefined, permissionMode: 'default' },
			);
			await pipeline.setEffort(undefined);
			assert.deepStrictEqual(warm.flagSettings, []);
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

		test('shutdownAndWait then dispose tears down exactly once (idempotent, not reliant on SDK close() memoization)', async () => {
			const store = new DisposableStore();
			const { pipeline, warm } = createPipeline(store);

			await pipeline.shutdownAndWait();
			assert.strictEqual(warm.asyncDisposeCount, 1, 'shutdownAndWait async-disposes once');

			pipeline.dispose();
			await Promise.resolve();
			assert.strictEqual(warm.asyncDisposeCount, 1, 'dispose after shutdownAndWait is a guarded no-op');
			store.dispose();
		});
	});

	suite('CancellationError plumbing', () => {

		test('send after abort rejects with a CancellationError', async () => {
			const { pipeline } = createPipeline(disposables);
			pipeline.abort();
			await pipeline.send(makePrompt('p1'), 'turn-A').then(
				() => assert.fail('expected rejection'),
				err => assert.ok(isCancellationError(err), `expected cancellation, got ${err}`),
			);
		});
	});
});
