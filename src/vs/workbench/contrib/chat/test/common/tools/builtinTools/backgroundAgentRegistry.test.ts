/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import sinon from 'sinon';
import { DeferredPromise } from '../../../../../../../base/common/async.js';
import { VSBuffer } from '../../../../../../../base/common/buffer.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../../../base/common/cancellation.js';
import { URI } from '../../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { InMemoryStorageService } from '../../../../../../../platform/storage/common/storage.js';
import { BackgroundAgentRegistry, IBackgroundAgentContext, IBackgroundAgentHandle, IBackgroundAgentStart } from '../../../../common/tools/builtinTools/backgroundAgentRegistry.js';
import { ReadAgentTool, ReadAgentToolData } from '../../../../common/tools/builtinTools/readAgentTool.js';
import { IToolInvocation, IToolResult } from '../../../../common/tools/languageModelToolsService.js';
import { LanguageModelPartAudience } from '../../../../common/languageModels.js';

suite('BackgroundAgentRegistry', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	const parent: IBackgroundAgentContext = { sessionResource: URI.parse('test://session/parent'), requestId: 'parent-request' };
	const other: IBackgroundAgentContext = { sessionResource: URI.parse('test://session/other'), requestId: 'other-request' };
	const result: IToolResult = { content: [{ kind: 'text', value: 'worker result' }] };
	const progress = { report() { } };
	const countTokens = async () => 0;

	function setup() {
		let now = 1000;
		const storage = disposables.add(new InMemoryStorageService());
		const registry = disposables.add(new BackgroundAgentRegistry(storage, { now: () => now }));
		return { registry, storage, advance: (ms: number) => now += ms, now: () => now };
	}

	function input(context: IBackgroundAgentContext = parent): IBackgroundAgentStart {
		return { ...context, invocationId: 'tool-call', description: 'independent work' };
	}

	async function blocked(registry: BackgroundAgentRegistry, context: IBackgroundAgentContext = parent): Promise<{ handle: IBackgroundAgentHandle; done: DeferredPromise<IToolResult> }> {
		const done = new DeferredPromise<IToolResult>();
		const handle = await registry.start(input(context), () => done.p);
		return { handle, done };
	}

	async function read(registry: BackgroundAgentRegistry, parameters: IToolInvocation['parameters'], context = parent, token = CancellationToken.None): Promise<IToolResult> {
		return new ReadAgentTool(registry).invoke({ callId: 'read', toolId: 'read_agent', parameters, context }, countTokens, progress, token);
	}

	test('immediately exposes a stable ID and a nonconsuming running roster', async () => {
		const { registry } = setup();
		const { handle, done } = await blocked(registry);
		const first = await registry.list(parent);
		const second = await registry.list(parent);
		assert.deepStrictEqual({ id: first.agents[0].id, running: first.running, pending: first.pendingResults, repeated: second.agents[0].id }, {
			id: handle.snapshot.id, running: 1, pending: 0, repeated: handle.snapshot.id,
		});
		done.complete(result);
		await handle.completion;
	});

	test('reserves quota atomically across owners while sessions remain independent', async () => {
		const { registry, storage, now } = setup();
		const secondOwner = disposables.add(new BackgroundAgentRegistry(storage, { now }));
		const done = new DeferredPromise<IToolResult>();
		const launches = await Promise.allSettled(Array.from({ length: 15 }, (_, index) => (index % 2 ? registry : secondOwner).start(input(), () => done.p)));
		const successful = launches.filter((launch): launch is PromiseFulfilledResult<IBackgroundAgentHandle> => launch.status === 'fulfilled');
		const independent = await registry.start(input(other), () => done.p);
		assert.deepStrictEqual({ accepted: successful.length, rejected: launches.length - successful.length, parent: (await registry.list(parent)).running, other: (await registry.list(other)).running }, {
			accepted: 10, rejected: 5, parent: 10, other: 1,
		});
		done.complete(result);
		await Promise.all([...successful.map(launch => launch.value.completion), independent.completion]);
	});

	test('detached descendants share the root quota and carry invocation lineage, not sibling depth', async () => {
		const { registry } = setup();
		const root = await blocked(registry);
		const childContext = { sessionResource: URI.parse('test://detached/session'), requestId: 'detached-request' };
		await registry.bindInvocationContext(root.handle.snapshot.id, childContext);
		const done = new DeferredPromise<IToolResult>();
		const siblings = await Promise.all(Array.from({ length: 9 }, () => registry.start({ ...input(childContext), parentAgentId: root.handle.snapshot.id }, () => done.p)));
		await assert.rejects(registry.start(input(childContext), () => done.p), /limit of 10/);
		assert.deepStrictEqual({ depth: siblings.map(sibling => sibling.snapshot.depth), parent: siblings.map(sibling => sibling.snapshot.parentAgentId), running: (await registry.list(childContext)).running, root: siblings.every(sibling => sibling.snapshot.sessionResource === root.handle.snapshot.sessionResource) }, {
			depth: Array(9).fill(2), parent: Array(9).fill(root.handle.snapshot.id), running: 10, root: true,
		});
		done.complete(result);
		root.done.complete(result);
		await Promise.all([root.handle.completion, ...siblings.map(sibling => sibling.completion)]);
	});

	test('binary, TSX, audiences, URIs, details and metadata survive persistence and one atomic claim', async () => {
		const { registry, storage, now } = setup();
		const bytes = VSBuffer.wrap(new Uint8Array([0, 1, 127, 128, 255]));
		const rich: IToolResult = {
			content: [{ kind: 'text', value: 'caption', title: 'Text', audience: [LanguageModelPartAudience.Assistant] }, { kind: 'data', value: { mimeType: 'image/png', data: bytes }, title: 'Image', audience: [LanguageModelPartAudience.User] }, { kind: 'promptTsx', value: { type: 'text', text: 'structured' } }],
			toolResultDetails: { output: { type: 'data', mimeType: 'application/octet-stream', value: bytes } },
			toolMetadata: { resource: URI.parse('test://resource/image'), model: 'parent-model', configuration: { effort: 'high' } },
			toolResultMessage: 'full result', confirmResults: false,
		};
		const handle = await registry.start(input(), async () => rich);
		await handle.completion;
		const restored = disposables.add(new BackgroundAgentRegistry(storage, { now }));
		const claims = await Promise.all([registry.claim(parent, handle.snapshot.id), restored.claim(parent, handle.snapshot.id)]);
		assert.deepStrictEqual({ winners: claims.filter(Boolean).length, result: claims.find(Boolean), pending: (await restored.list(parent)).pendingResults }, { winners: 1, result: rich, pending: 0 });
		const next = await registry.start(input(), async () => rich);
		await next.completion;
		const toolResult = await read(restored, { agent_id: next.snapshot.id });
		assert.deepStrictEqual({ content: toolResult.content.slice(0, 3), details: toolResult.toolResultDetails, metadata: toolResult.toolMetadata }, { content: rich.content, details: rich.toolResultDetails, metadata: rich.toolMetadata });
	});

	test('retains isolated completion batches after consumption without sending a parent request', async () => {
		const { registry } = setup();
		const next = { ...parent, requestId: 'next-request' };
		const first = await registry.start(input(), async () => result);
		const second = await registry.start(input(next), async () => result);
		await Promise.all([first.completion, second.completion]);
		await registry.claim(parent, first.snapshot.id);
		assert.deepStrictEqual({ first: (await registry.mailbox(parent)).map(snapshot => snapshot.id), second: (await registry.mailbox(next)).map(snapshot => snapshot.id) }, { first: [first.snapshot.id], second: [second.snapshot.id] });
	});

	test('status ignores legacy wait and list never claims terminal data', async () => {
		const { registry } = setup();
		const { handle, done } = await blocked(registry);
		const status = await read(registry, { agent_id: handle.snapshot.id, wait: true, timeout: 3600 });
		assert.ok(status.content.some(part => part.kind === 'text' && part.value.includes('legacy_wait_ignored')));
		done.complete(result);
		await handle.completion;
		await read(registry, { mode: 'list', agent_id: handle.snapshot.id });
		await read(registry, {});
		assert.deepStrictEqual(await registry.claim(parent, handle.snapshot.id), result);
	});

	test('terminal read returns the full result once and every response carries this session roster', async () => {
		const { registry } = setup();
		const handle = await registry.start(input(), async () => result);
		await handle.completion;
		const first = await read(registry, { agent_id: handle.snapshot.id });
		const second = await read(registry, { agent_id: handle.snapshot.id });
		assert.deepStrictEqual({ first: first.content.slice(0, 1), repeated: second.content.some(part => part.kind === 'text' && part.value === 'worker result'), roster: first.content.at(-1)?.kind === 'text' }, { first: result.content, repeated: false, roster: true });
	});

	test('another session cannot read, wait for, consume or cancel an agent', async () => {
		const { registry } = setup();
		const { handle, done } = await blocked(registry);
		assert.deepStrictEqual({ get: await registry.get(other, handle.snapshot.id), wait: await registry.wait(other, handle.snapshot.id, 300, CancellationToken.None), claim: await registry.claim(other, handle.snapshot.id), cancel: await registry.cancel(other, handle.snapshot.id), roster: (await registry.list(other)).running }, { get: undefined, wait: undefined, claim: undefined, cancel: false, roster: 0 });
		done.complete(result);
		await handle.completion;
	});

	test('explicit wait blocks until completion; cancellation of the waiter leaves the worker live', async () => {
		const { registry } = setup();
		const { handle, done } = await blocked(registry);
		const source = disposables.add(new CancellationTokenSource());
		const waiting = read(registry, { agent_id: handle.snapshot.id, mode: 'wait', timeout: 300 }, parent, source.token);
		source.cancel();
		const cancelled = await waiting;
		assert.ok(cancelled.content.some(part => part.kind === 'text' && part.value.includes('"wait_cancelled":true')));
		const completionWait = read(registry, { agent_id: handle.snapshot.id, mode: 'wait' });
		done.complete(result);
		await handle.completion;
		assert.deepStrictEqual((await completionWait).content.slice(0, 1), result.content);
	});

	test('wait clamps timeout to 300 seconds and leaves a live lease untouched at timeout', async () => {
		const clock = sinon.useFakeTimers();
		try {
			let now = 0;
			const storage = disposables.add(new InMemoryStorageService());
			const registry = disposables.add(new BackgroundAgentRegistry(storage, { now: () => now, leaseDuration: 600_000, heartbeatInterval: 600_000 }));
			const { handle, done } = await blocked(registry);
			let returned = false;
			const waiting = read(registry, { agent_id: handle.snapshot.id, mode: 'wait', timeout: 0 }).then(result => { returned = true; return result; });
			await clock.tickAsync(0);
			now = 299_999;
			await clock.tickAsync(250);
			assert.strictEqual(returned, false);
			now = 300_000;
			await clock.tickAsync(1);
			const timedOut = await waiting;
			assert.ok(timedOut.content.some(part => part.kind === 'text' && part.value.includes('"wait_timeout":true')));
			done.complete(result);
			await handle.completion;
			registry.dispose();
		} finally {
			clock.restore();
		}
	});

	test('owned live cancellation reaches a durable terminal state; foreign owner cancellation is rejected', async () => {
		const { registry, storage, now } = setup();
		const second = disposables.add(new BackgroundAgentRegistry(storage, { now }));
		const handle = await registry.start(input(), (_snapshot, token) => new Promise(resolve => {
			const listener = token.onCancellationRequested(() => {
				listener.dispose();
				resolve(result);
			});
		}));
		assert.strictEqual(await second.cancel(parent, handle.snapshot.id), false);
		assert.strictEqual(await registry.cancel(parent, handle.snapshot.id), true);
		assert.deepStrictEqual({ state: (await handle.completion).status, running: (await registry.list(parent)).running, terminalCancel: await registry.cancel(parent, handle.snapshot.id) }, { state: 'cancelled', running: 0, terminalCancel: false });
	});

	test('reload recovers expired running leases as interrupted and fences stale completion', async () => {
		const { registry, storage, advance, now } = setup();
		const { handle, done } = await blocked(registry);
		advance(90_001);
		const restored = disposables.add(new BackgroundAgentRegistry(storage, { now }));
		const recovery = await restored.get(parent, handle.snapshot.id);
		done.complete(result);
		await handle.completion;
		assert.deepStrictEqual({ recovered: recovery?.status, afterStaleWrite: (await restored.get(parent, handle.snapshot.id))?.status, running: (await restored.list(parent)).running, error: (await restored.claim(parent, handle.snapshot.id))?.toolResultError }, { recovered: 'interrupted', afterStaleWrite: 'interrupted', running: 0, error: true });
	});

	test('terminal retention prunes only expired terminal entries, never valid running records', async () => {
		const { storage, advance, now } = setup();
		const registry = disposables.add(new BackgroundAgentRegistry(storage, { now, leaseDuration: 3_600_000 }));
		const running = await blocked(registry);
		for (let index = 0; index < 120; index++) {
			const handle = await registry.start(input(), async () => result);
			await handle.completion;
		}
		assert.deepStrictEqual({ running: (await registry.list(parent)).running, retained: (await registry.get(parent, running.handle.snapshot.id))?.status }, { running: 1, retained: 'running' });
		advance(30 * 60_000 + 1);
		assert.deepStrictEqual({ running: (await registry.list(parent)).running, pending: (await registry.list(parent)).pendingResults }, { running: 1, pending: 0 });
		running.done.complete(result);
		await running.handle.completion;
	});

	test('failed execution and terminal claims survive creating a new registry owner', async () => {
		const { registry, storage, now } = setup();
		const handle = await registry.start(input(), async () => { throw new Error('failed task'); });
		await handle.completion;
		const restored = disposables.add(new BackgroundAgentRegistry(storage, { now }));
		const result = await restored.claim(parent, handle.snapshot.id);
		const again = disposables.add(new BackgroundAgentRegistry(storage, { now }));
		assert.deepStrictEqual({ state: (await restored.get(parent, handle.snapshot.id))?.status, result: result?.content, repeated: await again.claim(parent, handle.snapshot.id) }, { state: 'failed', result: [{ kind: 'text', value: 'failed task' }], repeated: undefined });
	});

	test('failed storage CAS leaves terminal data unconsumed for a successful retry', async () => {
		class FailingStorage extends InMemoryStorageService {
			failNextSwap = false;
			override async compareAndSwapApplicationSharedValue(key: string, expectedValue: string | undefined, newValue: string) {
				if (this.failNextSwap) {
					this.failNextSwap = false;
					throw new Error('storage write failed');
				}
				return super.compareAndSwapApplicationSharedValue(key, expectedValue, newValue);
			}
		}
		const storage = disposables.add(new FailingStorage());
		const registry = disposables.add(new BackgroundAgentRegistry(storage));
		const handle = await registry.start(input(), async () => result);
		await handle.completion;
		storage.failNextSwap = true;
		await assert.rejects(registry.claim(parent, handle.snapshot.id), /storage write failed/);
		assert.deepStrictEqual(await registry.claim(parent, handle.snapshot.id), result);
	});

	test('shutdown interrupts noncooperative workers and persists a fenced terminal state', async () => {
		const { registry, storage, now } = setup();
		const { handle, done } = await blocked(registry);
		registry.dispose();
		await handle.completion;
		const restored = disposables.add(new BackgroundAgentRegistry(storage, { now }));
		done.complete(result);
		assert.deepStrictEqual({ status: (await restored.get(parent, handle.snapshot.id))?.status, running: (await restored.list(parent)).running }, { status: 'interrupted', running: 0 });
	});

	test('read_agent schema and description specify explicit synchronization and nonconsuming listing', () => {
		assert.deepStrictEqual({ required: ReadAgentToolData.inputSchema?.required, mode: ReadAgentToolData.inputSchema?.properties?.mode?.default, timeout: ReadAgentToolData.inputSchema?.properties?.timeout }, {
			required: [], mode: 'status', timeout: { type: 'number', minimum: 300, maximum: 3600, default: 1800, description: 'Seconds for explicit wait; ignored in status/list mode.' },
		});
		assert.ok(['exactly once', 'never steering', 'Legacy wait is ignored', 'Timeout leaves the agent running'].every(clause => ReadAgentToolData.modelDescription.includes(clause)));
	});
});