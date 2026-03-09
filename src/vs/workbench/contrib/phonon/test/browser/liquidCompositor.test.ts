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
import type { ILiquidMolecule, ILiquidView } from '../../common/liquidModuleTypes.js';

function makeMolecule(overrides: Partial<ILiquidMolecule> & { id: string; label: string }): ILiquidMolecule {
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
		...overrides,
	};
}

function makeView(overrides: Partial<ILiquidView> & { id: string; label: string }): ILiquidView {
	return {
		componentUri: URI.parse(`test://${overrides.id}`),
		mode: 'canvas',
		extensionId: 'test.ext',
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

		test('returns undefined for empty defaultMoleculeIds', () => {
			assert.strictEqual(engine.composeFromView('viewA', []), undefined);
		});

		test('returns undefined when no molecules are found in registry', () => {
			assert.strictEqual(engine.composeFromView('viewA', ['nonexistent1', 'nonexistent2']), undefined);
		});

		test('single molecule yields single layout', () => {
			registry.updateMolecules([
				makeMolecule({ id: 'mol1', label: 'Molecule One' }),
			]);

			const result = engine.composeFromView('viewA', ['mol1']);
			assert.ok(result);
			assert.deepStrictEqual({
				layout: result.layout,
				slotsCount: result.slots.length,
				moleculeId: result.slots[0].moleculeId,
			}, {
				layout: 'single',
				slotsCount: 1,
				moleculeId: 'mol1',
			});
		});

		test('two molecules yield split-horizontal layout', () => {
			registry.updateMolecules([
				makeMolecule({ id: 'mol1', label: 'One' }),
				makeMolecule({ id: 'mol2', label: 'Two' }),
			]);

			const result = engine.composeFromView('viewA', ['mol1', 'mol2']);
			assert.ok(result);
			assert.strictEqual(result.layout, 'split-horizontal');
			assert.strictEqual(result.slots.length, 2);
		});

		test('three molecules yield grid layout', () => {
			registry.updateMolecules([
				makeMolecule({ id: 'mol1', label: 'One' }),
				makeMolecule({ id: 'mol2', label: 'Two' }),
				makeMolecule({ id: 'mol3', label: 'Three' }),
			]);

			const result = engine.composeFromView('viewA', ['mol1', 'mol2', 'mol3']);
			assert.ok(result);
			assert.strictEqual(result.layout, 'grid');
			assert.strictEqual(result.slots.length, 3);
		});

		test('four molecules yield grid layout', () => {
			registry.updateMolecules([
				makeMolecule({ id: 'mol1', label: 'One' }),
				makeMolecule({ id: 'mol2', label: 'Two' }),
				makeMolecule({ id: 'mol3', label: 'Three' }),
				makeMolecule({ id: 'mol4', label: 'Four' }),
			]);

			const result = engine.composeFromView('viewA', ['mol1', 'mol2', 'mol3', 'mol4']);
			assert.ok(result);
			assert.strictEqual(result.layout, 'grid');
		});

		test('five molecules yield stack layout', () => {
			const molecules = Array.from({ length: 5 }, (_, i) =>
				makeMolecule({ id: `mol${i}`, label: `Molecule ${i}` })
			);
			registry.updateMolecules(molecules);

			const result = engine.composeFromView('viewA', molecules.map(m => m.id));
			assert.ok(result);
			assert.strictEqual(result.layout, 'stack');
			assert.strictEqual(result.slots.length, 5);
		});

		test('skips unknown molecules, composes the rest', () => {
			registry.updateMolecules([
				makeMolecule({ id: 'mol1', label: 'One' }),
				makeMolecule({ id: 'mol3', label: 'Three' }),
			]);

			const result = engine.composeFromView('viewA', ['mol1', 'nonexistent', 'mol3']);
			assert.ok(result);
			assert.strictEqual(result.slots.length, 2);
			assert.strictEqual(result.layout, 'split-horizontal');
		});

		test('uses view label as title when view exists', () => {
			registry.updateViews([
				makeView({ id: 'dashView', label: 'Dashboard' }),
			]);
			registry.updateMolecules([
				makeMolecule({ id: 'mol1', label: 'One' }),
			]);

			const result = engine.composeFromView('dashView', ['mol1']);
			assert.ok(result);
			assert.strictEqual(result.title, 'Dashboard');
		});

		test('falls back to viewId as title when view not found', () => {
			registry.updateMolecules([
				makeMolecule({ id: 'mol1', label: 'One' }),
			]);

			const result = engine.composeFromView('unknownView', ['mol1']);
			assert.ok(result);
			assert.strictEqual(result.title, 'unknownView');
		});
	});

	// ==================== composeFromIntent ====================

	suite('composeFromIntent', () => {

		test('returns undefined for entities with no matching molecules', () => {
			assert.strictEqual(engine.composeFromIntent(['nonexistent'], 'show'), undefined);
		});

		test('returns undefined for empty entity list', () => {
			assert.strictEqual(engine.composeFromIntent([], 'show'), undefined);
		});

		test('show action picks detail category first', () => {
			registry.updateMolecules([
				makeMolecule({ id: 'dishTable', label: 'Dish Table', category: 'table', shows: ['dish'] }),
				makeMolecule({ id: 'dishDetail', label: 'Dish Detail', category: 'detail', shows: ['dish'] }),
				makeMolecule({ id: 'dishChart', label: 'Dish Chart', category: 'chart', shows: ['dish'] }),
			]);

			const result = engine.composeFromIntent(['dish'], 'show');
			assert.ok(result);
			assert.strictEqual(result.slots[0].moleculeId, 'dishDetail');
		});

		test('summarize action picks stat category first', () => {
			registry.updateMolecules([
				makeMolecule({ id: 'dishDetail', label: 'Dish Detail', category: 'detail', shows: ['dish'] }),
				makeMolecule({ id: 'dishStat', label: 'Dish Stats', category: 'stat', shows: ['dish'] }),
				makeMolecule({ id: 'dishTable', label: 'Dish Table', category: 'table', shows: ['dish'] }),
			]);

			const result = engine.composeFromIntent(['dish'], 'summarize');
			assert.ok(result);
			assert.strictEqual(result.slots[0].moleculeId, 'dishStat');
		});

		test('compare action picks table category first', () => {
			registry.updateMolecules([
				makeMolecule({ id: 'dishDetail', label: 'Dish Detail', category: 'detail', shows: ['dish'] }),
				makeMolecule({ id: 'dishTable', label: 'Dish Table', category: 'table', shows: ['dish'] }),
				makeMolecule({ id: 'dishChart', label: 'Dish Chart', category: 'chart', shows: ['dish'] }),
			]);

			const result = engine.composeFromIntent(['dish'], 'compare');
			assert.ok(result);
			assert.strictEqual(result.slots[0].moleculeId, 'dishTable');
		});

		test('navigate action picks list category first', () => {
			registry.updateMolecules([
				makeMolecule({ id: 'dishDetail', label: 'Dish Detail', category: 'detail', shows: ['dish'] }),
				makeMolecule({ id: 'dishList', label: 'Dish List', category: 'list', shows: ['dish'] }),
			]);

			const result = engine.composeFromIntent(['dish'], 'navigate');
			assert.ok(result);
			assert.strictEqual(result.slots[0].moleculeId, 'dishList');
		});

		test('filter action picks form category first', () => {
			registry.updateMolecules([
				makeMolecule({ id: 'dishTable', label: 'Dish Table', category: 'table', shows: ['dish'] }),
				makeMolecule({ id: 'dishForm', label: 'Dish Form', category: 'form', shows: ['dish'] }),
			]);

			const result = engine.composeFromIntent(['dish'], 'filter');
			assert.ok(result);
			assert.strictEqual(result.slots[0].moleculeId, 'dishForm');
		});

		test('unknown action falls back to default preference (detail first)', () => {
			registry.updateMolecules([
				makeMolecule({ id: 'dishTable', label: 'Dish Table', category: 'table', shows: ['dish'] }),
				makeMolecule({ id: 'dishDetail', label: 'Dish Detail', category: 'detail', shows: ['dish'] }),
			]);

			const result = engine.composeFromIntent(['dish'], 'unknownAction');
			assert.ok(result);
			assert.strictEqual(result.slots[0].moleculeId, 'dishDetail');
		});

		test('same-category tiebreaker is alphabetical by label', () => {
			registry.updateMolecules([
				makeMolecule({ id: 'zDetail', label: 'Zebra Detail', category: 'detail', shows: ['dish'] }),
				makeMolecule({ id: 'aDetail', label: 'Alpha Detail', category: 'detail', shows: ['dish'] }),
			]);

			const result = engine.composeFromIntent(['dish'], 'show');
			assert.ok(result);
			assert.strictEqual(result.slots[0].moleculeId, 'aDetail');
		});

		test('multiple entities produce one slot each', () => {
			registry.updateMolecules([
				makeMolecule({ id: 'dishDetail', label: 'Dish Detail', category: 'detail', shows: ['dish'] }),
				makeMolecule({ id: 'supplierDetail', label: 'Supplier Detail', category: 'detail', shows: ['supplier'] }),
			]);

			const result = engine.composeFromIntent(['dish', 'supplier'], 'show');
			assert.ok(result);
			assert.deepStrictEqual(result.slots.map(s => s.moleculeId), ['dishDetail', 'supplierDetail']);
			assert.strictEqual(result.layout, 'split-horizontal');
		});

		test('depth=1 adds related molecules via relatesTo', () => {
			registry.updateMolecules([
				makeMolecule({ id: 'dishDetail', label: 'Dish Detail', category: 'detail', shows: ['dish'], relatesTo: ['ingredient'] }),
				makeMolecule({ id: 'ingredientTable', label: 'Ingredient Table', category: 'table', shows: ['ingredient'] }),
			]);

			const result = engine.composeFromIntent(['dish'], 'show', 1);
			assert.ok(result);
			assert.deepStrictEqual(result.slots.map(s => s.moleculeId), ['dishDetail', 'ingredientTable']);
		});

		test('depth is clamped to max 2', () => {
			// depth=10 should behave like depth=2
			registry.updateMolecules([
				makeMolecule({ id: 'dishDetail', label: 'Dish Detail', category: 'detail', shows: ['dish'], relatesTo: ['ingredient'] }),
				makeMolecule({ id: 'ingredientTable', label: 'Ingredient Table', category: 'table', shows: ['ingredient'] }),
			]);

			const result = engine.composeFromIntent(['dish'], 'show', 10);
			assert.ok(result);
			// Should work the same as depth=1 in this case (only one hop needed)
			assert.deepStrictEqual(result.slots.map(s => s.moleculeId), ['dishDetail', 'ingredientTable']);
		});

		test('negative depth is clamped to 0 (no related molecules)', () => {
			registry.updateMolecules([
				makeMolecule({ id: 'dishDetail', label: 'Dish Detail', category: 'detail', shows: ['dish'], relatesTo: ['ingredient'] }),
				makeMolecule({ id: 'ingredientTable', label: 'Ingredient Table', category: 'table', shows: ['ingredient'] }),
			]);

			const result = engine.composeFromIntent(['dish'], 'show', -5);
			assert.ok(result);
			assert.deepStrictEqual(result.slots.map(s => s.moleculeId), ['dishDetail']);
		});

		test('does not duplicate molecules across entities and relatesTo', () => {
			registry.updateMolecules([
				makeMolecule({ id: 'dishDetail', label: 'Dish Detail', category: 'detail', shows: ['dish', 'ingredient'], relatesTo: ['ingredient'] }),
				makeMolecule({ id: 'ingredientStat', label: 'Ingredient Stats', category: 'stat', shows: ['ingredient'] }),
			]);

			// dishDetail already picked for 'dish', should not appear again from relatesTo
			const result = engine.composeFromIntent(['dish', 'ingredient'], 'show', 1);
			assert.ok(result);
			const moleculeIds = result.slots.map(s => s.moleculeId);
			assert.strictEqual(moleculeIds.length, new Set(moleculeIds).size, 'no duplicates');
		});

		test('total slots capped at 6', () => {
			const molecules = Array.from({ length: 8 }, (_, i) =>
				makeMolecule({ id: `mol${i}`, label: `Molecule ${i}`, category: 'detail', shows: [`entity${i}`] })
			);
			registry.updateMolecules(molecules);

			const entities = Array.from({ length: 8 }, (_, i) => `entity${i}`);
			const result = engine.composeFromIntent(entities, 'show');
			assert.ok(result);
			assert.ok(result.slots.length <= 6);
		});

		test('preferredLayout is respected', () => {
			registry.updateMolecules([
				makeMolecule({ id: 'dishDetail', label: 'Dish Detail', category: 'detail', shows: ['dish'] }),
				makeMolecule({ id: 'supplierDetail', label: 'Supplier Detail', category: 'detail', shows: ['supplier'] }),
			]);

			const result = engine.composeFromIntent(['dish', 'supplier'], 'show', 0, 'split-vertical');
			assert.ok(result);
			assert.strictEqual(result.layout, 'split-vertical');
		});

		test('intent result is marked transient', () => {
			registry.updateMolecules([
				makeMolecule({ id: 'dishDetail', label: 'Dish Detail', category: 'detail', shows: ['dish'] }),
			]);

			const result = engine.composeFromIntent(['dish'], 'show');
			assert.ok(result);
			assert.strictEqual(result.transient, true);
		});

		test('title reflects action and entities', () => {
			registry.updateMolecules([
				makeMolecule({ id: 'dishDetail', label: 'Dish Detail', category: 'detail', shows: ['dish'] }),
			]);

			const result = engine.composeFromIntent(['dish'], 'show');
			assert.ok(result);
			assert.strictEqual(result.title, 'show dish');
		});
	});

	// ==================== calculateLayout (via public API) ====================

	suite('layout calculation', () => {

		test('1 slot yields single', () => {
			registry.updateMolecules([
				makeMolecule({ id: 'mol1', label: 'One', shows: ['e1'] }),
			]);
			const result = engine.composeFromIntent(['e1'], 'show');
			assert.ok(result);
			assert.strictEqual(result.layout, 'single');
		});

		test('2 slots yield split-horizontal', () => {
			registry.updateMolecules([
				makeMolecule({ id: 'mol1', label: 'One', shows: ['e1'] }),
				makeMolecule({ id: 'mol2', label: 'Two', shows: ['e2'] }),
			]);
			const result = engine.composeFromIntent(['e1', 'e2'], 'show');
			assert.ok(result);
			assert.strictEqual(result.layout, 'split-horizontal');
		});

		test('3 slots yield grid', () => {
			registry.updateMolecules([
				makeMolecule({ id: 'mol1', label: 'One', shows: ['e1'] }),
				makeMolecule({ id: 'mol2', label: 'Two', shows: ['e2'] }),
				makeMolecule({ id: 'mol3', label: 'Three', shows: ['e3'] }),
			]);
			const result = engine.composeFromIntent(['e1', 'e2', 'e3'], 'show');
			assert.ok(result);
			assert.strictEqual(result.layout, 'grid');
		});

		test('5+ slots yield stack', () => {
			const molecules = Array.from({ length: 5 }, (_, i) =>
				makeMolecule({ id: `mol${i}`, label: `Mol ${i}`, shows: [`e${i}`] })
			);
			registry.updateMolecules(molecules);
			const result = engine.composeFromIntent(molecules.map((_, i) => `e${i}`), 'show');
			assert.ok(result);
			assert.strictEqual(result.layout, 'stack');
		});
	});
});
