/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { LiquidModuleRegistry } from '../../browser/liquidModuleRegistry.js';
import { CompositionEngine } from '../../browser/liquidCompositor.js';
import type { ILiquidGraft, ILiquidView } from '../../common/liquidGraftTypes.js';

function makeGraft(overrides: Partial<ILiquidGraft> & { id: string; label: string }): ILiquidGraft {
	return {
		entryUri: URI.parse(`test://${overrides.id}`),
		description: '',
		domain: 'general',
		category: 'detail',
		tags: [],
		layout: { minCols: 4, maxCols: 12, minHeight: 150 },
		extensionId: 'test.ext',
		shows: [],
		relatesTo: [],
		tokenWeight: 0,
		...overrides,
	};
}

function makeView(overrides: Partial<ILiquidView> & { id: string; label: string }): ILiquidView {
	return {
		componentUri: URI.parse(`test://${overrides.id}`),
		mode: 'canvas',
		extensionId: 'test.ext',
		defaultGrafts: [],
		...overrides,
	};
}

suite('CompositionEngine', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	let registry: LiquidModuleRegistry;
	let engine: CompositionEngine;

	setup(() => {
		registry = store.add(new LiquidModuleRegistry());
		engine = store.add(new CompositionEngine(registry, new NullLogService()));
	});

	// ==================== composeFromView ====================

	suite('composeFromView', () => {

		test('returns undefined for empty defaultGraftIds', () => {
			assert.strictEqual(engine.composeFromView('viewA', []), undefined);
		});

		test('returns undefined when no grafts are found in registry', () => {
			assert.strictEqual(engine.composeFromView('viewA', ['nonexistent1', 'nonexistent2']), undefined);
		});

		test('single graft yields single layout', () => {
			registry.updateGrafts([
				makeGraft({ id: 'graft1', label: 'Graft One' }),
			]);

			const result = engine.composeFromView('viewA', ['graft1']);
			assert.ok(result);
			assert.deepStrictEqual({
				layout: result.layout,
				slotsCount: result.slots.length,
				graftId: result.slots[0].graftId,
			}, {
				layout: 'single',
				slotsCount: 1,
				graftId: 'graft1',
			});
		});

		test('two grafts yield split-horizontal layout', () => {
			registry.updateGrafts([
				makeGraft({ id: 'graft1', label: 'One' }),
				makeGraft({ id: 'graft2', label: 'Two' }),
			]);

			const result = engine.composeFromView('viewA', ['graft1', 'graft2']);
			assert.ok(result);
			assert.strictEqual(result.layout, 'split-horizontal');
			assert.strictEqual(result.slots.length, 2);
		});

		test('three grafts yield grid layout', () => {
			registry.updateGrafts([
				makeGraft({ id: 'graft1', label: 'One' }),
				makeGraft({ id: 'graft2', label: 'Two' }),
				makeGraft({ id: 'graft3', label: 'Three' }),
			]);

			const result = engine.composeFromView('viewA', ['graft1', 'graft2', 'graft3']);
			assert.ok(result);
			assert.strictEqual(result.layout, 'grid');
			assert.strictEqual(result.slots.length, 3);
		});

		test('four grafts yield grid layout', () => {
			registry.updateGrafts([
				makeGraft({ id: 'graft1', label: 'One' }),
				makeGraft({ id: 'graft2', label: 'Two' }),
				makeGraft({ id: 'graft3', label: 'Three' }),
				makeGraft({ id: 'graft4', label: 'Four' }),
			]);

			const result = engine.composeFromView('viewA', ['graft1', 'graft2', 'graft3', 'graft4']);
			assert.ok(result);
			assert.strictEqual(result.layout, 'grid');
		});

		test('five grafts yield stack layout', () => {
			const grafts = Array.from({ length: 5 }, (_, i) =>
				makeGraft({ id: `graft${i}`, label: `Graft ${i}` })
			);
			registry.updateGrafts(grafts);

			const result = engine.composeFromView('viewA', grafts.map(m => m.id));
			assert.ok(result);
			assert.strictEqual(result.layout, 'stack');
			assert.strictEqual(result.slots.length, 5);
		});

		test('skips unknown grafts, composes the rest', () => {
			registry.updateGrafts([
				makeGraft({ id: 'graft1', label: 'One' }),
				makeGraft({ id: 'graft3', label: 'Three' }),
			]);

			const result = engine.composeFromView('viewA', ['graft1', 'nonexistent', 'graft3']);
			assert.ok(result);
			assert.strictEqual(result.slots.length, 2);
			assert.strictEqual(result.layout, 'split-horizontal');
		});

		test('uses view label as title when view exists', () => {
			registry.updateViews([
				makeView({ id: 'dashView', label: 'Dashboard' }),
			]);
			registry.updateGrafts([
				makeGraft({ id: 'graft1', label: 'One' }),
			]);

			const result = engine.composeFromView('dashView', ['graft1']);
			assert.ok(result);
			assert.strictEqual(result.title, 'Dashboard');
		});

		test('falls back to viewId as title when view not found', () => {
			registry.updateGrafts([
				makeGraft({ id: 'graft1', label: 'One' }),
			]);

			const result = engine.composeFromView('unknownView', ['graft1']);
			assert.ok(result);
			assert.strictEqual(result.title, 'unknownView');
		});
	});

	// ==================== composeFromIntent ====================

	suite('composeFromIntent', () => {

		test('returns undefined for entities with no matching grafts', () => {
			assert.strictEqual(engine.composeFromIntent(['nonexistent'], 'show'), undefined);
		});

		test('returns undefined for empty entity list', () => {
			assert.strictEqual(engine.composeFromIntent([], 'show'), undefined);
		});

		test('show action picks detail category first', () => {
			registry.updateGrafts([
				makeGraft({ id: 'dishTable', label: 'Dish Table', category: 'table', shows: ['dish'] }),
				makeGraft({ id: 'dishDetail', label: 'Dish Detail', category: 'detail', shows: ['dish'] }),
				makeGraft({ id: 'dishChart', label: 'Dish Chart', category: 'chart', shows: ['dish'] }),
			]);

			const result = engine.composeFromIntent(['dish'], 'show');
			assert.ok(result);
			assert.strictEqual(result.slots[0].graftId, 'dishDetail');
		});

		test('summarize action picks stat category first', () => {
			registry.updateGrafts([
				makeGraft({ id: 'dishDetail', label: 'Dish Detail', category: 'detail', shows: ['dish'] }),
				makeGraft({ id: 'dishStat', label: 'Dish Stats', category: 'stat', shows: ['dish'] }),
				makeGraft({ id: 'dishTable', label: 'Dish Table', category: 'table', shows: ['dish'] }),
			]);

			const result = engine.composeFromIntent(['dish'], 'summarize');
			assert.ok(result);
			assert.strictEqual(result.slots[0].graftId, 'dishStat');
		});

		test('compare action picks table category first', () => {
			registry.updateGrafts([
				makeGraft({ id: 'dishDetail', label: 'Dish Detail', category: 'detail', shows: ['dish'] }),
				makeGraft({ id: 'dishTable', label: 'Dish Table', category: 'table', shows: ['dish'] }),
				makeGraft({ id: 'dishChart', label: 'Dish Chart', category: 'chart', shows: ['dish'] }),
			]);

			const result = engine.composeFromIntent(['dish'], 'compare');
			assert.ok(result);
			assert.strictEqual(result.slots[0].graftId, 'dishTable');
		});

		test('navigate action picks list category first', () => {
			registry.updateGrafts([
				makeGraft({ id: 'dishDetail', label: 'Dish Detail', category: 'detail', shows: ['dish'] }),
				makeGraft({ id: 'dishList', label: 'Dish List', category: 'list', shows: ['dish'] }),
			]);

			const result = engine.composeFromIntent(['dish'], 'navigate');
			assert.ok(result);
			assert.strictEqual(result.slots[0].graftId, 'dishList');
		});

		test('filter action picks form category first', () => {
			registry.updateGrafts([
				makeGraft({ id: 'dishTable', label: 'Dish Table', category: 'table', shows: ['dish'] }),
				makeGraft({ id: 'dishForm', label: 'Dish Form', category: 'form', shows: ['dish'] }),
			]);

			const result = engine.composeFromIntent(['dish'], 'filter');
			assert.ok(result);
			assert.strictEqual(result.slots[0].graftId, 'dishForm');
		});

		test('unknown action falls back to default preference (detail first)', () => {
			registry.updateGrafts([
				makeGraft({ id: 'dishTable', label: 'Dish Table', category: 'table', shows: ['dish'] }),
				makeGraft({ id: 'dishDetail', label: 'Dish Detail', category: 'detail', shows: ['dish'] }),
			]);

			const result = engine.composeFromIntent(['dish'], 'unknownAction');
			assert.ok(result);
			assert.strictEqual(result.slots[0].graftId, 'dishDetail');
		});

		test('same-category tiebreaker is alphabetical by label', () => {
			registry.updateGrafts([
				makeGraft({ id: 'zDetail', label: 'Zebra Detail', category: 'detail', shows: ['dish'] }),
				makeGraft({ id: 'aDetail', label: 'Alpha Detail', category: 'detail', shows: ['dish'] }),
			]);

			const result = engine.composeFromIntent(['dish'], 'show');
			assert.ok(result);
			assert.strictEqual(result.slots[0].graftId, 'aDetail');
		});

		test('multiple entities produce one slot each', () => {
			registry.updateGrafts([
				makeGraft({ id: 'dishDetail', label: 'Dish Detail', category: 'detail', shows: ['dish'] }),
				makeGraft({ id: 'supplierDetail', label: 'Supplier Detail', category: 'detail', shows: ['supplier'] }),
			]);

			const result = engine.composeFromIntent(['dish', 'supplier'], 'show');
			assert.ok(result);
			assert.deepStrictEqual(result.slots.map(s => s.graftId), ['dishDetail', 'supplierDetail']);
			assert.strictEqual(result.layout, 'split-horizontal');
		});

		test('depth=1 adds related grafts via relatesTo', () => {
			registry.updateGrafts([
				makeGraft({ id: 'dishDetail', label: 'Dish Detail', category: 'detail', shows: ['dish'], relatesTo: ['ingredient'] }),
				makeGraft({ id: 'ingredientTable', label: 'Ingredient Table', category: 'table', shows: ['ingredient'] }),
			]);

			const result = engine.composeFromIntent(['dish'], 'show', 1);
			assert.ok(result);
			assert.deepStrictEqual(result.slots.map(s => s.graftId), ['dishDetail', 'ingredientTable']);
		});

		test('depth is clamped to max 2', () => {
			// depth=10 should behave like depth=2
			registry.updateGrafts([
				makeGraft({ id: 'dishDetail', label: 'Dish Detail', category: 'detail', shows: ['dish'], relatesTo: ['ingredient'] }),
				makeGraft({ id: 'ingredientTable', label: 'Ingredient Table', category: 'table', shows: ['ingredient'] }),
			]);

			const result = engine.composeFromIntent(['dish'], 'show', 10);
			assert.ok(result);
			// Should work the same as depth=1 in this case (only one hop needed)
			assert.deepStrictEqual(result.slots.map(s => s.graftId), ['dishDetail', 'ingredientTable']);
		});

		test('negative depth is clamped to 0 (no related grafts)', () => {
			registry.updateGrafts([
				makeGraft({ id: 'dishDetail', label: 'Dish Detail', category: 'detail', shows: ['dish'], relatesTo: ['ingredient'] }),
				makeGraft({ id: 'ingredientTable', label: 'Ingredient Table', category: 'table', shows: ['ingredient'] }),
			]);

			const result = engine.composeFromIntent(['dish'], 'show', -5);
			assert.ok(result);
			assert.deepStrictEqual(result.slots.map(s => s.graftId), ['dishDetail']);
		});

		test('does not duplicate grafts across entities and relatesTo', () => {
			registry.updateGrafts([
				makeGraft({ id: 'dishDetail', label: 'Dish Detail', category: 'detail', shows: ['dish', 'ingredient'], relatesTo: ['ingredient'] }),
				makeGraft({ id: 'ingredientStat', label: 'Ingredient Stats', category: 'stat', shows: ['ingredient'] }),
			]);

			// dishDetail already picked for 'dish', should not appear again from relatesTo
			const result = engine.composeFromIntent(['dish', 'ingredient'], 'show', 1);
			assert.ok(result);
			const graftIds = result.slots.map(s => s.graftId);
			assert.strictEqual(graftIds.length, new Set(graftIds).size, 'no duplicates');
		});

		test('total slots capped at 6', () => {
			const grafts = Array.from({ length: 8 }, (_, i) =>
				makeGraft({ id: `graft${i}`, label: `Graft ${i}`, category: 'detail', shows: [`entity${i}`] })
			);
			registry.updateGrafts(grafts);

			const entities = Array.from({ length: 8 }, (_, i) => `entity${i}`);
			const result = engine.composeFromIntent(entities, 'show');
			assert.ok(result);
			assert.ok(result.slots.length <= 6);
		});

		test('preferredLayout is respected', () => {
			registry.updateGrafts([
				makeGraft({ id: 'dishDetail', label: 'Dish Detail', category: 'detail', shows: ['dish'] }),
				makeGraft({ id: 'supplierDetail', label: 'Supplier Detail', category: 'detail', shows: ['supplier'] }),
			]);

			const result = engine.composeFromIntent(['dish', 'supplier'], 'show', 0, 'split-vertical');
			assert.ok(result);
			assert.strictEqual(result.layout, 'split-vertical');
		});

		test('intent result is marked transient', () => {
			registry.updateGrafts([
				makeGraft({ id: 'dishDetail', label: 'Dish Detail', category: 'detail', shows: ['dish'] }),
			]);

			const result = engine.composeFromIntent(['dish'], 'show');
			assert.ok(result);
			assert.strictEqual(result.transient, true);
		});

		test('title reflects action and entities', () => {
			registry.updateGrafts([
				makeGraft({ id: 'dishDetail', label: 'Dish Detail', category: 'detail', shows: ['dish'] }),
			]);

			const result = engine.composeFromIntent(['dish'], 'show');
			assert.ok(result);
			assert.strictEqual(result.title, 'show dish');
		});
	});

	// ==================== calculateLayout (via public API) ====================

	suite('layout calculation', () => {

		test('1 slot yields single', () => {
			registry.updateGrafts([
				makeGraft({ id: 'graft1', label: 'One', shows: ['e1'] }),
			]);
			const result = engine.composeFromIntent(['e1'], 'show');
			assert.ok(result);
			assert.strictEqual(result.layout, 'single');
		});

		test('2 slots yield split-horizontal', () => {
			registry.updateGrafts([
				makeGraft({ id: 'graft1', label: 'One', shows: ['e1'] }),
				makeGraft({ id: 'graft2', label: 'Two', shows: ['e2'] }),
			]);
			const result = engine.composeFromIntent(['e1', 'e2'], 'show');
			assert.ok(result);
			assert.strictEqual(result.layout, 'split-horizontal');
		});

		test('3 slots yield grid', () => {
			registry.updateGrafts([
				makeGraft({ id: 'graft1', label: 'One', shows: ['e1'] }),
				makeGraft({ id: 'graft2', label: 'Two', shows: ['e2'] }),
				makeGraft({ id: 'graft3', label: 'Three', shows: ['e3'] }),
			]);
			const result = engine.composeFromIntent(['e1', 'e2', 'e3'], 'show');
			assert.ok(result);
			assert.strictEqual(result.layout, 'grid');
		});

		test('5+ slots yield stack', () => {
			const grafts = Array.from({ length: 5 }, (_, i) =>
				makeGraft({ id: `graft${i}`, label: `Graft ${i}`, shows: [`e${i}`] })
			);
			registry.updateGrafts(grafts);
			const result = engine.composeFromIntent(grafts.map((_, i) => `e${i}`), 'show');
			assert.ok(result);
			assert.strictEqual(result.layout, 'stack');
		});
	});
});
