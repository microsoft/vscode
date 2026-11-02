/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { DOWN_MARK_MS, LOAD_TIMEOUT_MS, QUEUE_TIMEOUT_MS } from '../../../node/copilot/localModelBridge/shim/constants.js';
import { LocalModelServingError, type IDirectFamilyLookup, type IServingIdentity, type IServingLease, type IServingSlot, type IServingSnapshot } from '../../../node/copilot/localModelBridge/shim/servingAccess.js';
import { ServingAccess, type IServingAccessHost } from '../../../node/copilot/localModelBridge/shim/servingAccessImpl.js';
import { createServingSnapshot, FakeClock, MAI_IDENTITY, EXAMPLE_IDENTITY } from './fakeServingAccess.js';

class FakeHost implements IServingAccessHost {
	gates = { enabled: true, accountGate: true, useInAuto: true };
	accountGeneration = 3;
	active: IServingSnapshot | undefined = createServingSnapshot();
	swap: { familyId: string; settled: Promise<void> } | undefined;
	families = new Map<string, IDirectFamilyLookup>();
	/** Per session: the generation its turn holds. */
	held = new Map<string, IServingSnapshot>();
	/** Generations that drain but still serve the turns holding them. */
	servingHeldTurns = new Set<number>();
	leases = 0;
	starts: string[] = [];
	onStart: (familyId: string) => Promise<void> = async () => { };

	getGates() { return this.gates; }
	getAccountGeneration() { return this.accountGeneration; }
	getActiveServing() { return this.active; }
	getHeldServing(sessionId: string | undefined) { return sessionId === undefined ? undefined : this.held.get(sessionId); }
	servesHeldTurns(servingGeneration: number) { return this.servingHeldTurns.has(servingGeneration); }
	getIncomingSwap() { return this.swap; }
	findFamilyByAlias(alias: string) { return this.families.get(alias); }
	getFamilyDisplayName(familyId: string) { return familyId === MAI_IDENTITY.familyId ? 'Example Flash 1.0' : 'Qwen'; }
	acquireLease(identity: IServingIdentity): IServingLease | undefined {
		this.leases++;
		return { identity, dispose: () => this.leases-- };
	}
	startActive(familyId: string): Promise<void> {
		this.starts.push(familyId);
		return this.onStart(familyId);
	}
}

suite('localModel serving access (§5.8.1, §5.10)', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function create() {
		const clock = new FakeClock();
		const host = new FakeHost();
		const access = store.add(new ServingAccess(host, clock));
		return { clock, host, access };
	}

	test('leases bind to the current ready generation and refuse during a swap', () => {
		const { host, access } = create();
		const current = access.acquireServingLease(MAI_IDENTITY);
		const stale = access.acquireServingLease({ ...MAI_IDENTITY, servingGeneration: 0 });
		const other = access.acquireServingLease(EXAMPLE_IDENTITY);
		host.active = createServingSnapshot({ swapInProgress: true });
		const duringSwap = access.acquireServingLease(MAI_IDENTITY);
		current?.dispose();
		assert.deepStrictEqual({ current: current?.identity, stale, other, duringSwap, leases: host.leases, gates: access.getGates(), accountGeneration: access.getAccountGeneration() }, {
			current: MAI_IDENTITY, stale: undefined, other: undefined, duringSwap: undefined, leases: 0, gates: host.gates, accountGeneration: 3,
		});
	});

	test('a turn holding a draining generation still gets leases and slots on it; other sessions get none', async () => {
		const { host, access } = create();
		host.active = createServingSnapshot({ server: 'stopping', swapInProgress: true, endpoint: undefined });
		host.held.set('session-1', createServingSnapshot());
		host.servingHeldTurns.add(MAI_IDENTITY.servingGeneration);
		const holder = access.acquireServingLease(MAI_IDENTITY, 'session-1');
		const other = access.acquireServingLease(MAI_IDENTITY, 'session-2');
		const unattributed = access.acquireServingLease(MAI_IDENTITY);
		const slot = holder && await access.acquireSlot(holder, { signal: new AbortController().signal });
		const autoSlotWhileBusy = holder && access.tryAcquireSlot(holder);
		slot?.dispose();
		const autoSlot = holder && access.tryAcquireSlot(holder);
		autoSlot?.dispose();
		holder?.dispose();
		assert.deepStrictEqual({ holder: holder?.identity, other, unattributed, slot: slot?.servingGeneration, autoSlotWhileBusy, autoSlot: autoSlot?.servingGeneration, held: access.getHeldServing('session-1')?.server, leases: host.leases }, {
			holder: MAI_IDENTITY, other: undefined, unattributed: undefined, slot: 1, autoSlotWhileBusy: undefined, autoSlot: 1, held: 'ready', leases: 0,
		});
	});

	test('Auto slots never wait: full slots or a queued direct request mean no slot', async () => {
		const { access } = create();
		const lease = access.acquireServingLease(MAI_IDENTITY)!;
		const first = access.tryAcquireSlot(lease);
		const whileFull = access.tryAcquireSlot(lease);
		const abort = new AbortController();
		const queued = access.acquireSlot(lease, { signal: abort.signal });
		first!.dispose();
		const direct = await queued;
		const whileDirectHolds = access.tryAcquireSlot(lease);
		direct.dispose();
		const afterRelease = access.tryAcquireSlot(lease);
		afterRelease?.dispose();
		lease.dispose();
		assert.deepStrictEqual({ first: first?.servingGeneration, whileFull, direct: direct.servingGeneration, whileDirectHolds, afterRelease: afterRelease?.servingGeneration }, {
			first: 1, whileFull: undefined, direct: 1, whileDirectHolds: undefined, afterRelease: 1,
		});
	});

	test('direct requests queue FIFO with positions, time out after QUEUE_TIMEOUT_MS and leave on abort', async () => {
		const { clock, access } = create();
		const lease = access.acquireServingLease(MAI_IDENTITY)!;
		const holder = access.tryAcquireSlot(lease)!;
		const positions: string[] = [];
		const order: string[] = [];
		const enqueue = (name: string, signal: AbortSignal) => access.acquireSlot(lease, { signal, onQueuePosition: position => positions.push(`${name}:${position}`) }).then(
			slot => { order.push(name); return slot; },
			(error: unknown) => { order.push(`${name}:${error instanceof LocalModelServingError ? error.code : String(error)}`); return undefined; });
		const a = enqueue('a', new AbortController().signal);
		const abortB = new AbortController();
		const b = enqueue('b', abortB.signal);
		const c = enqueue('c', new AbortController().signal);
		abortB.abort('cancelled');
		await b;
		holder.dispose();
		const slotA = await a;
		clock.advance(QUEUE_TIMEOUT_MS);
		await c;
		slotA?.dispose();
		lease.dispose();
		assert.deepStrictEqual({ positions, order, queueLength: access.queueLength }, {
			positions: ['a:1', 'a:1', 'b:2', 'a:1', 'b:2', 'c:3', 'a:1', 'c:2', 'c:1'],
			order: ['b:cancelled', 'a', 'c:busyTimeout'],
			queueLength: 0,
		});
	});

	test('a queued request for a generation that is no longer served fails with modelNotActive', async () => {
		const { host, access } = create();
		const lease = access.acquireServingLease(MAI_IDENTITY)!;
		const holder = access.tryAcquireSlot(lease)!;
		const queued = access.acquireSlot(lease, { signal: new AbortController().signal }).then(() => 'slot', (error: LocalModelServingError) => error.code);
		host.active = createServingSnapshot({ identity: { ...MAI_IDENTITY, servingGeneration: 2 } });
		access.onServingChanged();
		holder.dispose();
		lease.dispose();
		assert.strictEqual(await queued, 'modelNotActive');
	});

	test('down marks expire after DOWN_MARK_MS', () => {
		const { clock, access } = create();
		access.markEndpointDown(1);
		const marked = access.isEndpointDown(1);
		clock.advance(DOWN_MARK_MS - 1);
		const before = access.isEndpointDown(1);
		clock.advance(1);
		assert.deepStrictEqual({ marked, before, after: access.isEndpointDown(1), other: access.isEndpointDown(2) }, { marked: true, before: true, after: false, other: false });
	});

	test('ensureStarted loads a stopped active model, waits for a swap to the requested family and never swaps', async () => {
		const { clock, host, access } = create();
		host.active = createServingSnapshot({ server: 'stopped', endpoint: undefined, props: undefined });
		host.onStart = async () => { host.active = createServingSnapshot(); };
		const started = await access.ensureStarted(MAI_IDENTITY.familyId, new AbortController().signal);

		let finishSwap!: () => void;
		host.swap = { familyId: EXAMPLE_IDENTITY.familyId, settled: new Promise<void>(resolve => finishSwap = resolve) };
		const waiting = access.ensureStarted(EXAMPLE_IDENTITY.familyId, new AbortController().signal);
		const inactive = await access.ensureStarted('other-local', new AbortController().signal).then(() => 'served', (error: LocalModelServingError) => `${error.code}: ${error.message}`);
		// Waiting for the swap, or for a start, arms the load deadline.
		await clock.whenTimerDue(LOAD_TIMEOUT_MS);
		const startsDuringSwap = [...host.starts];
		host.active = createServingSnapshot({ identity: EXAMPLE_IDENTITY, displayName: 'Example Coder' });
		host.swap = undefined;
		finishSwap();
		const swapped = await waiting;

		assert.deepStrictEqual({ started: started.identity, startsDuringSwap, swapped: swapped.identity, inactive, starts: host.starts }, {
			started: MAI_IDENTITY,
			startsDuringSwap: [MAI_IDENTITY.familyId],
			swapped: EXAMPLE_IDENTITY,
			inactive: 'modelNotActive: Qwen isn\'t loaded.',
			starts: [MAI_IDENTITY.familyId],
		});
	});

	test('ensureStarted fails with the supervisor error, or after LOAD_TIMEOUT_MS', async () => {
		const { clock, host, access } = create();
		host.active = createServingSnapshot({ server: 'stopped', endpoint: undefined, props: undefined });
		host.onStart = () => Promise.reject(new LocalModelServingError('memoryBusy', 'Not enough free GPU memory right now.'));
		const busy = await access.ensureStarted(MAI_IDENTITY.familyId, new AbortController().signal).then(() => 'served', (error: LocalModelServingError) => error.code);

		host.onStart = () => new Promise<void>(() => { });
		const slow = access.ensureStarted(MAI_IDENTITY.familyId, new AbortController().signal).then(() => 'served', (error: LocalModelServingError) => error.code);
		await clock.whenTimerDue(LOAD_TIMEOUT_MS);
		clock.advance(LOAD_TIMEOUT_MS);
		const abort = new AbortController();
		const aborted = access.ensureStarted(MAI_IDENTITY.familyId, abort.signal).then(() => 'served', (error: unknown) => String(error));
		abort.abort('user cancelled');
		assert.deepStrictEqual({ busy, slow: await slow, aborted: await aborted }, { busy: 'memoryBusy', slow: 'startFailed', aborted: 'user cancelled' });
	});

	test('dispose rejects queued requests', async () => {
		const clock = new FakeClock();
		const host = new FakeHost();
		const access = new ServingAccess(host, clock);
		const lease = access.acquireServingLease(MAI_IDENTITY)!;
		const holder: IServingSlot = access.tryAcquireSlot(lease)!;
		const queued = access.acquireSlot(lease, { signal: new AbortController().signal }).then(() => 'slot', (error: LocalModelServingError) => error.code);
		access.dispose();
		holder.dispose();
		assert.deepStrictEqual({ queued: await queued, lease: access.acquireServingLease(MAI_IDENTITY) }, { queued: 'modelNotActive', lease: undefined });
	});
});
