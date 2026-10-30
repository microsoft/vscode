/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, timeout } from '../../../../../base/common/async.js';
import { autorun, observableSignal, observableValue, transaction } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { type CanvasDefinitionSnapshot, ICanvasDefinition } from '../../common/canvas.js';
import { CanvasDefinitionStore } from '../../common/canvasDefinitionStore.js';

suite('CanvasDefinitionStore', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function definition(canvasId: string, overrides: Partial<ICanvasDefinition> = {}): ICanvasDefinition {
		return { canvasId, extensionId: `user:${canvasId}`, extensionSource: 'user', displayName: canvasId, description: canvasId, requiresInput: false, ...overrides };
	}

	function createHarness() {
		const chat = observableValue<string | undefined>('chat', 'main');
		const connection = observableValue('connection', 'first');
		const invalidated = observableSignal('invalidated');
		const listings: { chat: string; connection: string; result: DeferredPromise<CanvasDefinitionSnapshot> }[] = [];
		const errors: string[] = [];
		const logService = new class extends NullLogService {
			override error(message: string | Error): void {
				errors.push(String(message));
			}
		};
		const definitionStore = store.add(new CanvasDefinitionStore(reader => {
			const name = chat.read(reader);
			const connectionName = connection.read(reader);
			invalidated.read(reader);
			return name === undefined ? undefined : {
				owner: { providerId: 'local', session: URI.parse('agent-host-session:/session'), chat: URI.parse(`agent-host-chat:/session/${name}`) },
				listCanvases: () => {
					const result = new DeferredPromise<CanvasDefinitionSnapshot>();
					listings.push({ chat: name, connection: connectionName, result });
					return result.p;
				},
			};
		}, '[Test]', logService));
		return {
			chat,
			connection,
			invalidated,
			listings,
			errors,
			definitionStore,
			canvasIds: () => definitionStore.definitions.get().map(canvas => canvas.canvasId),
			pendingChats: () => listings.filter(listing => !listing.result.isSettled).map(listing => listing.chat),
		};
	}

	test('lists openable definitions in menu order and keeps them through pending and failed refreshes', async () => {
		const harness = createHarness();
		await timeout(0);
		harness.listings[0].result.complete([
			definition('zeta'),
			definition('form', { requiresInput: true }),
			definition('browser', { extensionId: 'github-app', extensionSource: 'unknown' }),
			definition('alpha', { extensionId: 'project:alpha', extensionSource: 'project' }),
		]);
		await timeout(0);
		const listed = harness.canvasIds();
		harness.invalidated.trigger(undefined);
		await timeout(0);
		const whileRefreshing = harness.canvasIds();
		harness.listings[1].result.error(new Error('Host unavailable'));
		await timeout(0);

		assert.deepStrictEqual({ listed, whileRefreshing, afterFailure: harness.canvasIds(), errors: harness.errors }, {
			listed: ['alpha', 'zeta'],
			whileRefreshing: ['alpha', 'zeta'],
			afterFailure: ['alpha', 'zeta'],
			errors: ['[Test] Failed to list registered canvases'],
		});
	});

	test('retains definitions for a non-authoritative result and clears them for an authoritative empty result', async () => {
		const harness = createHarness();
		await timeout(0);
		harness.listings[0].result.complete([definition('plan')]);
		await timeout(0);

		harness.invalidated.trigger(undefined);
		await timeout(0);
		harness.listings[1].result.complete(undefined);
		await timeout(0);
		const whileUnsettled = harness.canvasIds();

		harness.invalidated.trigger(undefined);
		await timeout(0);
		harness.listings[2].result.complete([]);
		await timeout(0);

		assert.deepStrictEqual({ whileUnsettled, afterStableEmpty: harness.canvasIds() }, {
			whileUnsettled: ['plan'],
			afterStableEmpty: [],
		});
	});

	test('can retain non-openable definitions for management views', async () => {
		const result = new DeferredPromise<CanvasDefinitionSnapshot>();
		const definitionStore = store.add(new CanvasDefinitionStore(() => ({
			owner: { providerId: 'local', session: URI.parse('agent-host-session:/session'), chat: URI.parse('agent-host-chat:/session/main') },
			includeDefinition: () => true,
			listCanvases: () => result.p,
		}), '[Test]', new NullLogService()));
		await timeout(0);
		result.complete([
			definition('zeta'),
			definition('form', { requiresInput: true }),
			definition('browser', { extensionId: 'github-app', extensionSource: 'unknown' }),
		]);
		await timeout(0);

		assert.deepStrictEqual(definitionStore.definitions.get().map(canvas => canvas.canvasId), ['browser', 'form', 'zeta']);
	});

	test('coalesces invalidations per owner and applies each result in order', async () => {
		const harness = createHarness();
		await timeout(0);
		harness.invalidated.trigger(undefined);
		harness.invalidated.trigger(undefined);
		await timeout(0);
		harness.invalidated.trigger(undefined);
		await timeout(0);
		const pendingWhileInvalidating = harness.pendingChats();
		harness.listings[0].result.complete([definition('plan')]);
		await timeout(0);
		const afterFirstResult = { canvasIds: harness.canvasIds(), pendingChats: harness.pendingChats() };
		harness.listings[1].result.complete([definition('plan'), definition('board')]);
		await timeout(0);
		const afterFollowUp = harness.canvasIds();
		harness.invalidated.trigger(undefined);
		harness.invalidated.trigger(undefined);
		harness.invalidated.trigger(undefined);
		await timeout(0);
		harness.listings[2].result.complete([definition('plan'), definition('board')]);
		await timeout(0);

		assert.deepStrictEqual({ pendingWhileInvalidating, afterFirstResult, afterFollowUp, listings: harness.listings.length }, {
			pendingWhileInvalidating: ['main'],
			afterFirstResult: { canvasIds: ['plan'], pendingChats: ['main'] },
			afterFollowUp: ['board', 'plan'],
			listings: 3,
		});
	});

	test('keeps the list when the same owner gets a new source and refreshes with the newest source', async () => {
		const harness = createHarness();
		await timeout(0);
		harness.listings[0].result.complete([definition('plan')]);
		await timeout(0);
		harness.connection.set('second', undefined);
		await timeout(0);
		harness.connection.set('third', undefined);
		await timeout(0);
		harness.connection.set('fourth', undefined);
		await timeout(0);
		const whileReplacing = harness.canvasIds();
		harness.listings[1].result.complete([definition('plan'), definition('board')]);
		await timeout(0);
		const afterReplacedListing = harness.canvasIds();
		harness.listings[2].result.complete([definition('board')]);
		await timeout(0);

		assert.deepStrictEqual({
			whileReplacing,
			afterReplacedListing,
			canvasIds: harness.canvasIds(),
			listings: harness.listings.map(listing => `${listing.chat}/${listing.connection}`),
		}, {
			whileReplacing: ['plan'],
			afterReplacedListing: ['board', 'plan'],
			canvasIds: ['board'],
			listings: ['main/first', 'main/second', 'main/fourth'],
		});
	});

	test('lists a new owner immediately and never lists or applies the previous owner', async () => {
		const harness = createHarness();
		await timeout(0);
		harness.invalidated.trigger(undefined);
		await timeout(0);
		harness.chat.set('peer', undefined);
		await timeout(0);
		const pendingAfterSwitch = harness.pendingChats();
		harness.listings[0].result.complete([definition('plan')]);
		await timeout(0);

		assert.deepStrictEqual({ pendingAfterSwitch, listedChats: harness.listings.map(listing => listing.chat), canvasIds: harness.canvasIds() }, {
			pendingAfterSwitch: ['main', 'peer'],
			listedChats: ['main', 'peer'],
			canvasIds: [],
		});
	});

	test('clears on owner changes without pairing an owner with another owner\'s definitions', async () => {
		const harness = createHarness();
		const observed: string[] = [];
		store.add(autorun(reader => {
			observed.push(`${harness.chat.read(reader)}: ${harness.definitionStore.definitions.read(reader).map(canvas => canvas.canvasId).join(', ')}`);
		}));
		await timeout(0);
		harness.listings[0].result.complete([definition('plan')]);
		await timeout(0);
		let readInSwitchTransaction: string[] | undefined;
		transaction(tx => {
			harness.chat.set('peer', tx);
			readInSwitchTransaction = harness.canvasIds();
		});
		await timeout(0);
		harness.listings[1].result.complete([definition('board')]);
		await timeout(0);
		harness.chat.set('main', undefined);
		await timeout(0);

		assert.deepStrictEqual({ observed, readInSwitchTransaction }, {
			observed: ['main: ', 'main: plan', 'peer: ', 'peer: board', 'main: '],
			readInSwitchTransaction: [],
		});
	});

	test('does not notify observers when a refresh returns structurally identical definitions', async () => {
		const harness = createHarness();
		let notifications = 0;
		store.add(autorun(reader => {
			harness.definitionStore.definitions.read(reader);
			notifications++;
		}));
		await timeout(0);
		harness.listings[0].result.complete([definition('plan')]);
		await timeout(0);
		harness.invalidated.trigger(undefined);
		await timeout(0);
		harness.listings[1].result.complete([definition('plan')]);
		await timeout(0);

		assert.deepStrictEqual({ notifications, canvasIds: harness.canvasIds() }, { notifications: 2, canvasIds: ['plan'] });
	});

	test('clears while unavailable and ignores results that arrive late or after disposal', async () => {
		const harness = createHarness();
		await timeout(0);
		harness.listings[0].result.complete([definition('plan')]);
		await timeout(0);
		harness.invalidated.trigger(undefined);
		await timeout(0);
		harness.chat.set(undefined, undefined);
		const whileUnavailable = harness.canvasIds();
		harness.listings[1].result.complete([definition('late')]);
		await timeout(0);
		const afterLateResult = harness.canvasIds();
		harness.chat.set('main', undefined);
		await timeout(0);
		harness.invalidated.trigger(undefined);
		harness.definitionStore.dispose();
		harness.listings[2].result.complete([definition('afterDispose')]);
		await timeout(0);

		assert.deepStrictEqual({ whileUnavailable, afterLateResult, afterDispose: harness.canvasIds(), listings: harness.listings.length, errors: harness.errors }, {
			whileUnavailable: [],
			afterLateResult: [],
			afterDispose: [],
			listings: 3,
			errors: [],
		});
	});
});
