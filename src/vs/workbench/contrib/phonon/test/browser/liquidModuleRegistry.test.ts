/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { LiquidModuleRegistry } from '../../browser/liquidModuleRegistry.js';
import type { ILiquidEntity, ILiquidView, ILiquidMolecule, ILiquidDataProvider, ILiquidSidebarNode, ICompositionIntent } from '../../common/liquidModuleTypes.js';

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

	test('updateDataProviders populates and fires event', () => {
		let fired = false;
		store.add(registry.onDidChangeDataProviders(() => { fired = true; }));

		const providers: ILiquidDataProvider[] = [
			{ id: 'supabase-rist', entities: ['dish', 'supplier'], extensionId: 'test.module', priority: 0 },
		];
		registry.updateDataProviders(providers);

		assert.strictEqual(registry.dataProviders.length, 1);
		assert.strictEqual(registry.dataProviders[0].id, 'supabase-rist');
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

	test('getMoleculesForEntity returns molecules bound to the given entity', () => {
		const molecules: ILiquidMolecule[] = [
			makeMolecule({ id: 'costMolecule', label: 'Costi', entryUri: URI.parse('test://a'), entity: 'dish', tags: ['cost'], extensionId: 'test' }),
			makeMolecule({ id: 'stockMolecule', label: 'Giacenze', entryUri: URI.parse('test://b'), entity: 'ingredient', tags: ['stock'], extensionId: 'test' }),
			makeMolecule({ id: 'dishPhoto', label: 'Foto Piatto', entryUri: URI.parse('test://c'), entity: 'dish', tags: ['media'], extensionId: 'test' }),
			makeMolecule({ id: 'global', label: 'KPI', entryUri: URI.parse('test://d'), extensionId: 'test' }),
		];
		registry.updateMolecules(molecules);

		assert.deepStrictEqual(
			registry.getMoleculesForEntity('dish').map(m => m.id),
			['costMolecule', 'dishPhoto']
		);
		assert.deepStrictEqual(
			registry.getMoleculesForEntity('ingredient').map(m => m.id),
			['stockMolecule']
		);
		assert.deepStrictEqual(registry.getMoleculesForEntity('nonexistent'), []);
	});

	test('getMoleculesByTag returns molecules matching the given tag', () => {
		const molecules: ILiquidMolecule[] = [
			makeMolecule({ id: 'costMolecule', label: 'Costi', entryUri: URI.parse('test://a'), entity: 'dish', tags: ['cost', 'analytics'], extensionId: 'test' }),
			makeMolecule({ id: 'revenueMolecule', label: 'Ricavi', entryUri: URI.parse('test://b'), entity: 'order', tags: ['revenue', 'analytics'], extensionId: 'test' }),
			makeMolecule({ id: 'dishPhoto', label: 'Foto', entryUri: URI.parse('test://c'), entity: 'dish', tags: ['media'], extensionId: 'test' }),
		];
		registry.updateMolecules(molecules);

		assert.deepStrictEqual(
			registry.getMoleculesByTag('analytics').map(m => m.id),
			['costMolecule', 'revenueMolecule']
		);
		assert.deepStrictEqual(
			registry.getMoleculesByTag('media').map(m => m.id),
			['dishPhoto']
		);
		assert.deepStrictEqual(registry.getMoleculesByTag('nonexistent'), []);
	});

	test('findByEntity returns molecules that show a given entity', () => {
		const molecules: ILiquidMolecule[] = [
			makeMolecule({ id: 'dishCost', label: 'Dish Cost', entryUri: URI.parse('test://a'), entity: 'dish', shows: ['dish', 'ingredient'], extensionId: 'test' }),
			makeMolecule({ id: 'orderSummary', label: 'Order Summary', entryUri: URI.parse('test://b'), entity: 'order', shows: ['order'], extensionId: 'test' }),
			makeMolecule({ id: 'supplierDetail', label: 'Supplier', entryUri: URI.parse('test://c'), entity: 'supplier', shows: ['supplier', 'ingredient'], extensionId: 'test' }),
		];
		registry.updateMolecules(molecules);

		assert.deepStrictEqual(
			registry.findByEntity('ingredient').map(m => m.id),
			['dishCost', 'supplierDetail']
		);
		assert.deepStrictEqual(
			registry.findByEntity('order').map(m => m.id),
			['orderSummary']
		);
		assert.deepStrictEqual(registry.findByEntity('nonexistent'), []);
	});

	test('findByDomain returns molecules in the given domain', () => {
		const molecules: ILiquidMolecule[] = [
			makeMolecule({ id: 'costAnalysis', label: 'Cost Analysis', entryUri: URI.parse('test://a'), domain: 'analytics', extensionId: 'test' }),
			makeMolecule({ id: 'orderList', label: 'Order List', entryUri: URI.parse('test://b'), domain: 'operations', extensionId: 'test' }),
			makeMolecule({ id: 'revenueChart', label: 'Revenue Chart', entryUri: URI.parse('test://c'), domain: 'analytics', extensionId: 'test' }),
		];
		registry.updateMolecules(molecules);

		assert.deepStrictEqual(
			registry.findByDomain('analytics').map(m => m.id),
			['costAnalysis', 'revenueChart']
		);
		assert.deepStrictEqual(
			registry.findByDomain('operations').map(m => m.id),
			['orderList']
		);
		assert.deepStrictEqual(registry.findByDomain('nonexistent'), []);
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

	test('validateIntent accepts valid moleculeId slot', () => {
		registry.updateMolecules([
			makeMolecule({ id: 'costMolecule', label: 'Costi', entryUri: URI.parse('test://c'), entity: 'dish', tags: ['cost'], extensionId: 'test' }),
		]);

		const intent: ICompositionIntent = {
			layout: 'single',
			slots: [{ moleculeId: 'costMolecule' }],
		};
		assert.deepStrictEqual(registry.validateIntent(intent), { valid: true, errors: [] });
	});

	test('validateIntent catches unknown moleculeId', () => {
		registry.updateMolecules([
			makeMolecule({ id: 'costMolecule', label: 'Costi', entryUri: URI.parse('test://c'), entity: 'dish', tags: ['cost'], extensionId: 'test' }),
		]);

		const intent: ICompositionIntent = {
			layout: 'single',
			slots: [{ moleculeId: 'nonexistent' }],
		};
		const result = registry.validateIntent(intent);
		assert.ok(!result.valid);
		assert.ok(result.errors[0].includes('nonexistent'));
	});

	test('validateIntent rejects slot with neither viewId nor moleculeId', () => {
		const intent: ICompositionIntent = {
			layout: 'single',
			slots: [{}],
		};
		const result = registry.validateIntent(intent);
		assert.ok(!result.valid);
		assert.ok(result.errors[0].includes('neither'));
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

	test('updateSidebar sorts children recursively', () => {
		const nodes: ILiquidSidebarNode[] = [
			{
				id: 'menu', label: 'Menu', order: 0, children: [
					{ id: 'suppliers', label: 'Fornitori', order: 2, children: [], extensionId: 'test' },
					{ id: 'dishes', label: 'Piatti', view: 'dishList', order: 0, children: [], extensionId: 'test' },
					{ id: 'ingredients', label: 'Ingredienti', order: 1, children: [], extensionId: 'test' },
				], extensionId: 'test'
			},
		];
		registry.updateSidebar(nodes);

		const children = registry.sidebarTree[0].children;
		assert.strictEqual(children[0].id, 'dishes');
		assert.strictEqual(children[1].id, 'ingredients');
		assert.strictEqual(children[2].id, 'suppliers');
	});

	test('getCapabilities returns summary with molecules', () => {
		registry.updateEntities([
			{ id: 'dish', label: 'Piatto', schema: { type: 'object', properties: { name: { type: 'string' }, cost: { type: 'number' } } }, extensionId: 'test' },
		]);
		registry.updateViews([
			{ id: 'dishList', label: 'Piatti', componentUri: URI.parse('test://a'), mode: 'structured', entity: 'dish', extensionId: 'test' },
		]);
		registry.updateMolecules([
			makeMolecule({ id: 'costMolecule', label: 'Costi', entryUri: URI.parse('test://c'), entity: 'dish', tags: ['cost'], domain: 'analytics', category: 'stat', extensionId: 'test' }),
		]);

		const caps = registry.getCapabilities();
		assert.strictEqual(caps.entities.length, 1);
		assert.deepStrictEqual(caps.entities[0].fields, ['name', 'cost']);
		assert.strictEqual(caps.views.length, 1);
		assert.strictEqual(caps.molecules.length, 1);
		assert.strictEqual(caps.molecules[0].id, 'costMolecule');
		assert.deepStrictEqual(caps.molecules[0].tags, ['cost']);
		assert.strictEqual(caps.molecules[0].domain, 'analytics');
		assert.strictEqual(caps.molecules[0].category, 'stat');
	});

	test('onDidChangeMolecules fires on updateMolecules', () => {
		let fired = false;
		store.add(registry.onDidChangeMolecules(() => { fired = true; }));

		registry.updateMolecules([
			makeMolecule({ id: 'test', label: 'Test', entryUri: URI.parse('test://a'), extensionId: 'test' }),
		]);

		assert.ok(fired);
	});
});
