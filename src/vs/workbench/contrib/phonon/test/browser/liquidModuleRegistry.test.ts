/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { LiquidModuleRegistry } from '../../browser/liquidModuleRegistry.js';
import type { ILiquidEntity, ILiquidView, ILiquidSidebarNode, ICompositionIntent } from '../../common/liquidModuleTypes.js';

suite('LiquidModuleRegistry', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	let registry: LiquidModuleRegistry;

	setup(() => {
		registry = store.add(new LiquidModuleRegistry());
	});

	test('starts empty', () => {
		assert.deepStrictEqual(registry.entities, []);
		assert.deepStrictEqual(registry.views, []);
		assert.deepStrictEqual(registry.sidebarTree, []);
	});

	test('updateEntities populates and fires event', () => {
		let fired = false;
		store.add(registry.onDidChangeEntities(() => { fired = true; }));

		const entities: ILiquidEntity[] = [
			{ id: 'dish', label: 'Piatto', schema: { type: 'object', properties: { name: { type: 'string' } } }, extensionId: 'test.module' },
		];
		registry.updateEntities(entities);

		assert.strictEqual(registry.entities.length, 1);
		assert.strictEqual(registry.entities[0].id, 'dish');
		assert.ok(fired);
	});

	test('updateViews populates and fires event', () => {
		let fired = false;
		store.add(registry.onDidChangeViews(() => { fired = true; }));

		const views: ILiquidView[] = [
			{ id: 'dishList', label: 'Piatti', componentUri: URI.parse('vscode-resource://ext/views/DishList.js'), mode: 'structured', entity: 'dish', extensionId: 'test.module' },
			{ id: 'dashboard', label: 'Dashboard', componentUri: URI.parse('vscode-resource://ext/views/Dashboard.js'), mode: 'canvas', extensionId: 'test.module' },
		];
		registry.updateViews(views);

		assert.strictEqual(registry.views.length, 2);
		assert.ok(fired);
	});

	test('getViewsForEntity returns filtered views', () => {
		registry.updateViews([
			{ id: 'dishList', label: 'Piatti', componentUri: URI.parse('test://a'), mode: 'structured', entity: 'dish', extensionId: 'test' },
			{ id: 'dashboard', label: 'Dashboard', componentUri: URI.parse('test://b'), mode: 'canvas', extensionId: 'test' },
			{ id: 'dishDetail', label: 'Dettaglio', componentUri: URI.parse('test://c'), mode: 'canvas', entity: 'dish', extensionId: 'test' },
		]);

		const dishViews = registry.getViewsForEntity('dish');
		assert.strictEqual(dishViews.length, 2);
	});

	test('getEntitySchema returns schema or undefined', () => {
		registry.updateEntities([
			{ id: 'dish', label: 'Piatto', schema: { type: 'object' }, extensionId: 'test' },
		]);

		assert.deepStrictEqual(registry.getEntitySchema('dish'), { type: 'object' });
		assert.strictEqual(registry.getEntitySchema('nonexistent'), undefined);
	});

	test('validateIntent catches unknown viewId', () => {
		registry.updateViews([
			{ id: 'dishList', label: 'Piatti', componentUri: URI.parse('test://a'), mode: 'canvas', extensionId: 'test' },
		]);

		const validIntent: ICompositionIntent = {
			layout: 'single',
			slots: [{ viewId: 'dishList' }],
		};
		assert.ok(registry.validateIntent(validIntent).valid);

		const invalidIntent: ICompositionIntent = {
			layout: 'single',
			slots: [{ viewId: 'nonexistent' }],
		};
		const result = registry.validateIntent(invalidIntent);
		assert.ok(!result.valid);
		assert.ok(result.errors[0].includes('nonexistent'));
	});

	test('validateIntent rejects structured-only views', () => {
		registry.updateViews([
			{ id: 'dishList', label: 'Piatti', componentUri: URI.parse('test://a'), mode: 'structured', extensionId: 'test' },
		]);

		const intent: ICompositionIntent = {
			layout: 'single',
			slots: [{ viewId: 'dishList' }],
		};
		const result = registry.validateIntent(intent);
		assert.ok(!result.valid);
		assert.ok(result.errors[0].includes('structured'));
	});

	test('updateSidebar merges and sorts by order', () => {
		let fired = false;
		store.add(registry.onDidChangeSidebar(() => { fired = true; }));

		const nodes: ILiquidSidebarNode[] = [
			{ id: 'orders', label: 'Ordini', view: 'orderList', order: 2, children: [], extensionId: 'test' },
			{ id: 'dashboard', label: 'Dashboard', view: 'dashboard', order: 0, children: [], extensionId: 'test' },
			{
				id: 'menu', label: 'Menu', order: 1, children: [
					{ id: 'dishes', label: 'Piatti', view: 'dishList', order: 0, children: [], extensionId: 'test' },
				], extensionId: 'test'
			},
		];
		registry.updateSidebar(nodes);

		assert.strictEqual(registry.sidebarTree.length, 3);
		assert.strictEqual(registry.sidebarTree[0].id, 'dashboard');
		assert.strictEqual(registry.sidebarTree[1].id, 'menu');
		assert.strictEqual(registry.sidebarTree[2].id, 'orders');
		assert.ok(fired);
	});

	test('getCapabilities returns summary', () => {
		registry.updateEntities([
			{ id: 'dish', label: 'Piatto', schema: { type: 'object', properties: { name: { type: 'string' }, cost: { type: 'number' } } }, extensionId: 'test' },
		]);
		registry.updateViews([
			{ id: 'dishList', label: 'Piatti', componentUri: URI.parse('test://a'), mode: 'structured', entity: 'dish', extensionId: 'test' },
		]);

		const caps = registry.getCapabilities();
		assert.strictEqual(caps.entities.length, 1);
		assert.deepStrictEqual(caps.entities[0].fields, ['name', 'cost']);
		assert.strictEqual(caps.views.length, 1);
	});
});
