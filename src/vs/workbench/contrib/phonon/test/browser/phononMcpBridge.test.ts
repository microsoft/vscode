/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../base/common/uri.js';
import { Event } from '../../../../../base/common/event.js';
import { observableValue } from '../../../../../base/common/observable.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { PhononMcpBridge } from '../../browser/phononMcpBridge.js';
import { LiquidModuleRegistry } from '../../browser/liquidModuleRegistry.js';
import type { ICompositionIntent, ILiquidMolecule } from '../../common/liquidModuleTypes.js';
import type { IMcpService } from '../../../mcp/common/mcpTypes.js';
import type { IPhononAgentPoolService } from '../../common/phononAgentPool.js';
import type { ILiquidModuleRegistry } from '../../common/liquidModule.js';

function createMockMcpService(): IMcpService {
	return {
		_serviceBrand: undefined,
		servers: observableValue('mockServers', []),
		lazyCollectionState: observableValue('mockLazy', { state: 0, collections: [] }),
		resetCaches() { },
		resetTrust() { },
		autostart() { return observableValue('mockAutostart', { working: false, starting: [], serversRequiringInteraction: [] }); },
		cancelAutostart() { },
		activateCollections() { return Promise.resolve(); },
	} as unknown as IMcpService;
}

function createMockAgentPoolService(): IPhononAgentPoolService {
	return {
		_serviceBrand: undefined,
		agents: [],
		spawnAgent: () => Promise.resolve(''),
		sendToAgent: () => Promise.resolve(),
		sendToMaster: () => Promise.resolve(),
		getMasterAgentId: () => undefined,
		terminateAgent: () => Promise.resolve(),
		terminateAll: () => Promise.resolve(),
		submitPrompt: () => Promise.resolve({ mode: 'solo' }),
		onDidAgentSpawn: Event.None,
		onDidAgentTerminate: Event.None,
		onDidAgentOutput: Event.None,
		onDidAgentStatusChange: Event.None,
		onDidDelegation: Event.None,
		onDidAutoSpawn: Event.None,
	} as unknown as IPhononAgentPoolService;
}

function makeMolecule(overrides: Partial<ILiquidMolecule> & { id: string; label: string; entryUri: URI; extensionId: string }): ILiquidMolecule {
	return {
		description: '',
		domain: 'general',
		category: 'stat',
		tags: [],
		layout: { minCols: 4, maxCols: 12, minHeight: 150 },
		shows: [],
		relatesTo: [],
		...overrides,
	};
}

function makeIntent(layout: string, slots: Array<{ viewId?: string; moleculeId?: string; params?: Record<string, unknown> }>): ICompositionIntent {
	return { layout: layout as ICompositionIntent['layout'], slots };
}

suite('PhononMcpBridge', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	let bridge: PhononMcpBridge;
	let registry: LiquidModuleRegistry;

	setup(() => {
		registry = store.add(new LiquidModuleRegistry());
		registry.updateViews([
			{ id: 'testView', label: 'Test', componentUri: URI.parse('file:///test'), mode: 'canvas', entity: 'test', extensionId: 'test' },
		]);
		registry.updateMolecules([
			makeMolecule({ id: 'testMolecule', label: 'Test Molecule', entryUri: URI.parse('file:///molecule.html'), entity: 'test', tags: ['test'], extensionId: 'test' }),
		]);

		bridge = store.add(new PhononMcpBridge(
			new NullLogService(),
			createMockMcpService() as IMcpService,
			createMockAgentPoolService() as IPhononAgentPoolService,
			registry as ILiquidModuleRegistry,
		));
	});

	// ── phonon-intent fenced blocks ─────────────────────────────────────

	test('phonon-intent fence with valid intent fires onDidReceiveIntent', () => {
		const received: ICompositionIntent[] = [];
		store.add(bridge.onDidReceiveIntent(e => received.push(e)));

		const intent = makeIntent('single', [{ viewId: 'testView' }]);
		bridge.processOutput(
			'Here is the composition:\n' +
			'```phonon-intent\n' +
			JSON.stringify(intent) + '\n' +
			'```\n'
		);

		assert.strictEqual(received.length, 1);
		assert.strictEqual(received[0].layout, 'single');
		assert.strictEqual(received[0].slots.length, 1);
		assert.strictEqual(received[0].slots[0].viewId, 'testView');
	});

	test('phonon-intent fence with invalid JSON does not fire', () => {
		const received: ICompositionIntent[] = [];
		store.add(bridge.onDidReceiveIntent(e => received.push(e)));

		bridge.processOutput(
			'```phonon-intent\n' +
			'{ not valid json !!!\n' +
			'```\n'
		);

		assert.strictEqual(received.length, 0);
	});

	test('phonon-intent fence with unknown viewId does not fire', () => {
		const received: ICompositionIntent[] = [];
		store.add(bridge.onDidReceiveIntent(e => received.push(e)));

		const intent = makeIntent('single', [{ viewId: 'nonexistent' }]);
		bridge.processOutput(
			'```phonon-intent\n' +
			JSON.stringify(intent) + '\n' +
			'```\n'
		);

		assert.strictEqual(received.length, 0);
	});

	// ── json fenced blocks ──────────────────────────────────────────────

	test('json fence with layout and slots fires onDidReceiveIntent', () => {
		const received: ICompositionIntent[] = [];
		store.add(bridge.onDidReceiveIntent(e => received.push(e)));

		const intent = makeIntent('split-horizontal', [{ viewId: 'testView' }, { moleculeId: 'testMolecule' }]);
		bridge.processOutput(
			'```json\n' +
			JSON.stringify(intent) + '\n' +
			'```\n'
		);

		assert.strictEqual(received.length, 1);
		assert.strictEqual(received[0].layout, 'split-horizontal');
		assert.strictEqual(received[0].slots.length, 2);
	});

	test('json fence without layout keyword does not fire', () => {
		const received: ICompositionIntent[] = [];
		store.add(bridge.onDidReceiveIntent(e => received.push(e)));

		bridge.processOutput(
			'```json\n' +
			'{"name": "test", "value": 42}\n' +
			'```\n'
		);

		assert.strictEqual(received.length, 0);
	});

	test('phonon-intent takes priority over json fence when both present', () => {
		const received: ICompositionIntent[] = [];
		store.add(bridge.onDidReceiveIntent(e => received.push(e)));

		const phononIntent = makeIntent('single', [{ viewId: 'testView' }]);
		const jsonIntent = makeIntent('grid', [{ moleculeId: 'testMolecule' }]);
		bridge.processOutput(
			'```phonon-intent\n' +
			JSON.stringify(phononIntent) + '\n' +
			'```\n' +
			'```json\n' +
			JSON.stringify(jsonIntent) + '\n' +
			'```\n'
		);

		// Only the phonon-intent should be processed; json fence is skipped
		assert.strictEqual(received.length, 1);
		assert.strictEqual(received[0].layout, 'single');
		assert.strictEqual(received[0].slots[0].viewId, 'testView');
	});

	// ── bare JSON extraction ────────────────────────────────────────────

	test('bare JSON with layout and slots fires onDidReceiveIntent', () => {
		const received: ICompositionIntent[] = [];
		store.add(bridge.onDidReceiveIntent(e => received.push(e)));

		const intent = makeIntent('single', [{ moleculeId: 'testMolecule' }]);
		bridge.processOutput(
			'I suggest the following composition: ' +
			JSON.stringify(intent) +
			' for the dashboard.'
		);

		assert.strictEqual(received.length, 1);
		assert.strictEqual(received[0].slots[0].moleculeId, 'testMolecule');
	});

	test('bare JSON is only tried when no fenced blocks found', () => {
		const received: ICompositionIntent[] = [];
		store.add(bridge.onDidReceiveIntent(e => received.push(e)));

		const fencedIntent = makeIntent('single', [{ viewId: 'testView' }]);
		const bareIntent = makeIntent('grid', [{ moleculeId: 'testMolecule' }]);
		bridge.processOutput(
			'```phonon-intent\n' +
			JSON.stringify(fencedIntent) + '\n' +
			'```\n' +
			'Also try this: ' + JSON.stringify(bareIntent)
		);

		// Only the fenced intent fires
		assert.strictEqual(received.length, 1);
		assert.strictEqual(received[0].layout, 'single');
	});

	// ── validation ──────────────────────────────────────────────────────

	test('intent with existing viewId fires', () => {
		const received: ICompositionIntent[] = [];
		store.add(bridge.onDidReceiveIntent(e => received.push(e)));

		const intent = makeIntent('single', [{ viewId: 'testView' }]);
		bridge.processOutput(
			'```phonon-intent\n' +
			JSON.stringify(intent) + '\n' +
			'```\n'
		);

		assert.strictEqual(received.length, 1);
	});

	test('intent with nonexistent viewId does not fire', () => {
		const received: ICompositionIntent[] = [];
		store.add(bridge.onDidReceiveIntent(e => received.push(e)));

		const intent = makeIntent('single', [{ viewId: 'missing' }]);
		bridge.processOutput(
			'```phonon-intent\n' +
			JSON.stringify(intent) + '\n' +
			'```\n'
		);

		assert.strictEqual(received.length, 0);
	});

	test('intent with existing moleculeId fires', () => {
		const received: ICompositionIntent[] = [];
		store.add(bridge.onDidReceiveIntent(e => received.push(e)));

		const intent = makeIntent('single', [{ moleculeId: 'testMolecule' }]);
		bridge.processOutput(
			'```phonon-intent\n' +
			JSON.stringify(intent) + '\n' +
			'```\n'
		);

		assert.strictEqual(received.length, 1);
		assert.strictEqual(received[0].slots[0].moleculeId, 'testMolecule');
	});

	// ── edge cases ──────────────────────────────────────────────────────

	test('empty output produces no event', () => {
		const received: ICompositionIntent[] = [];
		store.add(bridge.onDidReceiveIntent(e => received.push(e)));

		bridge.processOutput('');

		assert.strictEqual(received.length, 0);
	});

	test('malformed JSON in fence does not crash and produces no event', () => {
		const received: ICompositionIntent[] = [];
		store.add(bridge.onDidReceiveIntent(e => received.push(e)));

		bridge.processOutput(
			'```phonon-intent\n' +
			'{"layout": "single", "slots": [{"viewId": broken}]}\n' +
			'```\n'
		);

		assert.strictEqual(received.length, 0);
	});

	test('multiple intent blocks in output each fire separately', () => {
		const received: ICompositionIntent[] = [];
		store.add(bridge.onDidReceiveIntent(e => received.push(e)));

		const intent1 = makeIntent('single', [{ viewId: 'testView' }]);
		const intent2 = makeIntent('grid', [{ moleculeId: 'testMolecule' }]);
		bridge.processOutput(
			'First:\n' +
			'```phonon-intent\n' +
			JSON.stringify(intent1) + '\n' +
			'```\n' +
			'Second:\n' +
			'```phonon-intent\n' +
			JSON.stringify(intent2) + '\n' +
			'```\n'
		);

		assert.strictEqual(received.length, 2);
		assert.strictEqual(received[0].layout, 'single');
		assert.strictEqual(received[1].layout, 'grid');
	});

	test('intent missing slots array does not fire', () => {
		const received: ICompositionIntent[] = [];
		store.add(bridge.onDidReceiveIntent(e => received.push(e)));

		bridge.processOutput(
			'```phonon-intent\n' +
			'{"layout": "single"}\n' +
			'```\n'
		);

		assert.strictEqual(received.length, 0);
	});

	test('intent with slots as non-array does not fire', () => {
		const received: ICompositionIntent[] = [];
		store.add(bridge.onDidReceiveIntent(e => received.push(e)));

		bridge.processOutput(
			'```phonon-intent\n' +
			'{"layout": "single", "slots": "not-an-array"}\n' +
			'```\n'
		);

		assert.strictEqual(received.length, 0);
	});

	test('intent missing layout does not fire', () => {
		const received: ICompositionIntent[] = [];
		store.add(bridge.onDidReceiveIntent(e => received.push(e)));

		bridge.processOutput(
			'```phonon-intent\n' +
			'{"slots": [{"viewId": "testView"}]}\n' +
			'```\n'
		);

		assert.strictEqual(received.length, 0);
	});

	test('slot with neither viewId nor moleculeId fails validation', () => {
		const received: ICompositionIntent[] = [];
		store.add(bridge.onDidReceiveIntent(e => received.push(e)));

		bridge.processOutput(
			'```phonon-intent\n' +
			'{"layout": "single", "slots": [{"params": {}}]}\n' +
			'```\n'
		);

		assert.strictEqual(received.length, 0);
	});

	test('json fence without slots keyword does not fire', () => {
		const received: ICompositionIntent[] = [];
		store.add(bridge.onDidReceiveIntent(e => received.push(e)));

		bridge.processOutput(
			'```json\n' +
			'{"layout": "single", "items": [{"viewId": "testView"}]}\n' +
			'```\n'
		);

		assert.strictEqual(received.length, 0);
	});

	test('bare JSON with nested braces is extracted correctly', () => {
		const received: ICompositionIntent[] = [];
		store.add(bridge.onDidReceiveIntent(e => received.push(e)));

		const intent = makeIntent('single', [{ moleculeId: 'testMolecule', params: { filter: { type: 'active' } } }]);
		bridge.processOutput(
			'Try this composition: ' + JSON.stringify(intent) + ' for the view.'
		);

		assert.strictEqual(received.length, 1);
		assert.deepStrictEqual((received[0].slots[0].params as Record<string, unknown>)['filter'], { type: 'active' });
	});

	test('plain text with no JSON produces no event', () => {
		const received: ICompositionIntent[] = [];
		store.add(bridge.onDidReceiveIntent(e => received.push(e)));

		bridge.processOutput('This is just regular text with no composition intent at all.');

		assert.strictEqual(received.length, 0);
	});

	test('empty registry causes all intents to fail validation', () => {
		// Create a bridge with an empty registry
		const emptyRegistry = store.add(new LiquidModuleRegistry());
		const emptyBridge = store.add(new PhononMcpBridge(
			new NullLogService(),
			createMockMcpService() as IMcpService,
			createMockAgentPoolService() as IPhononAgentPoolService,
			emptyRegistry as ILiquidModuleRegistry,
		));

		const received: ICompositionIntent[] = [];
		store.add(emptyBridge.onDidReceiveIntent(e => received.push(e)));

		const intent = makeIntent('single', [{ viewId: 'testView' }]);
		emptyBridge.processOutput(
			'```phonon-intent\n' +
			JSON.stringify(intent) + '\n' +
			'```\n'
		);

		assert.strictEqual(received.length, 0);
	});
});
