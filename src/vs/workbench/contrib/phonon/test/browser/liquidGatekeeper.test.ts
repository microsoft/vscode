/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { LiquidModuleRegistry } from '../../browser/liquidModuleRegistry.js';
import { validateIntent } from '../../browser/liquidGatekeeper.js';
import type { ILiquidGraft } from '../../common/liquidGraftTypes.js';

function makeGraft(overrides: Partial<ILiquidGraft> & { id: string; label: string; entryUri: URI; extensionId: string }): ILiquidGraft {
	return {
		description: '',
		domain: 'general',
		category: 'stat',
		tags: [],
		layout: { minCols: 4, maxCols: 12, minHeight: 150 },
		shows: [],
		relatesTo: [],
		tokenWeight: 0,
		...overrides,
	};
}

/**
 * Populate a registry with standard test data:
 * - entities: dish, ingredient, supplier
 * - grafts: dishCost (shows dish, ingredient), ingredientStock (shows ingredient)
 */
function seedRegistry(registry: LiquidModuleRegistry): void {
	registry.updateEntities([
		{ id: 'dish', label: 'Piatto', schema: { type: 'object' }, extensionId: 'test' },
		{ id: 'ingredient', label: 'Ingrediente', schema: { type: 'object' }, extensionId: 'test' },
		{ id: 'supplier', label: 'Fornitore', schema: { type: 'object' }, extensionId: 'test' },
	]);
	registry.updateGrafts([
		makeGraft({ id: 'dishCost', label: 'Dish Cost', entryUri: URI.parse('test://a'), shows: ['dish', 'ingredient'], extensionId: 'test' }),
		makeGraft({ id: 'ingredientStock', label: 'Stock', entryUri: URI.parse('test://b'), shows: ['ingredient'], extensionId: 'test' }),
	]);
}

suite('LiquidGatekeeper', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	let registry: LiquidModuleRegistry;

	setup(() => {
		registry = store.add(new LiquidModuleRegistry());
		seedRegistry(registry);
	});

	// ── Gate 1 — Structure ──────────────────────────────────────────────

	suite('Gate 1 — Structure', () => {

		test('null fails', () => {
			const result = validateIntent(null, registry);
			assert.deepStrictEqual(
				{ valid: result.valid, gate: result.gate, gateName: result.gateName },
				{ valid: false, gate: 1, gateName: 'Structure' }
			);
		});

		test('string fails', () => {
			const result = validateIntent('show dishes', registry);
			assert.strictEqual(result.valid, false);
			assert.strictEqual(result.gate, 1);
		});

		test('empty object fails (no action or entities)', () => {
			const result = validateIntent({}, registry);
			assert.strictEqual(result.valid, false);
			assert.strictEqual(result.gate, 1);
			assert.ok(result.error!.includes('action or entities'));
		});

		test('undefined fails', () => {
			const result = validateIntent(undefined, registry);
			assert.strictEqual(result.valid, false);
			assert.strictEqual(result.gate, 1);
		});

		test('array fails', () => {
			const result = validateIntent([], registry);
			assert.strictEqual(result.valid, false);
			assert.strictEqual(result.gate, 1);
		});

		test('object with action passes gate 1', () => {
			const result = validateIntent({ action: 'show' }, registry);
			assert.notStrictEqual(result.gate, 1);
		});

		test('object with entities passes gate 1', () => {
			const result = validateIntent({ entities: ['dish'] }, registry);
			assert.notStrictEqual(result.gate, 1);
		});
	});

	// ── Gate 2 — Action ─────────────────────────────────────────────────

	suite('Gate 2 — Action', () => {

		test('unknown action fails', () => {
			const result = validateIntent({ action: 'destroy' }, registry);
			assert.deepStrictEqual(
				{ valid: result.valid, gate: result.gate, gateName: result.gateName },
				{ valid: false, gate: 2, gateName: 'Action' }
			);
			assert.ok(result.error!.includes('destroy'));
			assert.ok(result.error!.includes('Allowed'));
		});

		test('valid action passes', () => {
			const result = validateIntent({ action: 'show' }, registry);
			assert.notStrictEqual(result.gate, 2);
		});

		test('missing action defaults to show', () => {
			// entities only, no action — should default to show and pass gate 2
			const result = validateIntent({ entities: ['dish'] }, registry);
			assert.notStrictEqual(result.gate, 2);
			if (result.valid) {
				assert.strictEqual(result.sanitizedParams!.action, 'show');
			}
		});

		test('all five actions pass', () => {
			for (const action of ['show', 'compare', 'summarize', 'navigate', 'filter']) {
				const result = validateIntent({ action }, registry);
				assert.notStrictEqual(result.gate, 2, `action "${action}" should pass gate 2`);
			}
		});

		test('numeric action fails', () => {
			const result = validateIntent({ action: 42 }, registry);
			assert.strictEqual(result.gate, 2);
		});
	});

	// ── Gate 3 — Entity ─────────────────────────────────────────────────

	suite('Gate 3 — Entity', () => {

		test('nonexistent entity fails', () => {
			const result = validateIntent({ action: 'show', entities: ['nonexistent'] }, registry);
			assert.deepStrictEqual(
				{ valid: result.valid, gate: result.gate, gateName: result.gateName },
				{ valid: false, gate: 3, gateName: 'Entity' }
			);
			assert.ok(result.error!.includes('nonexistent'));
			assert.ok(result.error!.includes('Available'));
		});

		test('existing entity passes', () => {
			const result = validateIntent({ action: 'show', entities: ['dish'] }, registry);
			assert.notStrictEqual(result.gate, 3);
		});

		test('mixed existing and nonexistent fails on first unknown', () => {
			const result = validateIntent({ action: 'show', entities: ['dish', 'ghost'] }, registry);
			assert.strictEqual(result.gate, 3);
			assert.ok(result.error!.includes('ghost'));
		});

		test('non-array entities fails', () => {
			const result = validateIntent({ action: 'show', entities: 'dish' }, registry);
			assert.strictEqual(result.gate, 3);
		});

		test('no entities with valid action passes gate 3', () => {
			const result = validateIntent({ action: 'show' }, registry);
			assert.notStrictEqual(result.gate, 3);
		});
	});

	// ── Gate 4 — Existence ──────────────────────────────────────────────

	suite('Gate 4 — Existence', () => {

		test('entity exists but no graft shows it fails', () => {
			// supplier is a registered entity but no graft has it in `shows`
			const result = validateIntent({ action: 'show', entities: ['supplier'] }, registry);
			assert.deepStrictEqual(
				{ valid: result.valid, gate: result.gate, gateName: result.gateName },
				{ valid: false, gate: 4, gateName: 'Existence' }
			);
			assert.ok(result.error!.includes('supplier'));
		});

		test('entity with graft passes', () => {
			const result = validateIntent({ action: 'show', entities: ['dish'] }, registry);
			assert.notStrictEqual(result.gate, 4);
		});

		test('multiple entities all with grafts pass', () => {
			const result = validateIntent({ action: 'show', entities: ['dish', 'ingredient'] }, registry);
			assert.notStrictEqual(result.gate, 4);
		});
	});

	// ── Gate 5 — Depth ──────────────────────────────────────────────────

	suite('Gate 5 — Depth', () => {

		test('depth > MAX_DEPTH is clamped to 2', () => {
			const result = validateIntent({ action: 'show', entities: ['dish'], depth: 5 }, registry);
			assert.strictEqual(result.valid, true);
			assert.strictEqual(result.sanitizedParams!.depth, 2);
		});

		test('depth = 1 passes as-is', () => {
			const result = validateIntent({ action: 'show', entities: ['dish'], depth: 1 }, registry);
			assert.strictEqual(result.valid, true);
			assert.strictEqual(result.sanitizedParams!.depth, 1);
		});

		test('negative depth is clamped to 0', () => {
			const result = validateIntent({ action: 'show', entities: ['dish'], depth: -3 }, registry);
			assert.strictEqual(result.valid, true);
			assert.strictEqual(result.sanitizedParams!.depth, 0);
		});

		test('missing depth defaults to 0', () => {
			const result = validateIntent({ action: 'show', entities: ['dish'] }, registry);
			assert.strictEqual(result.valid, true);
			assert.strictEqual(result.sanitizedParams!.depth, 0);
		});

		test('non-finite depth defaults to 0', () => {
			const result = validateIntent({ action: 'show', entities: ['dish'], depth: NaN }, registry);
			assert.strictEqual(result.valid, true);
			assert.strictEqual(result.sanitizedParams!.depth, 0);
		});
	});

	// ── Gate 6 — Layout ─────────────────────────────────────────────────

	suite('Gate 6 — Layout', () => {

		test('unknown layout fails', () => {
			const result = validateIntent({ action: 'show', entities: ['dish'], preferredLayout: 'random' }, registry);
			assert.deepStrictEqual(
				{ valid: result.valid, gate: result.gate, gateName: result.gateName },
				{ valid: false, gate: 6, gateName: 'Layout' }
			);
			assert.ok(result.error!.includes('random'));
			assert.ok(result.error!.includes('Allowed'));
		});

		test('valid layout passes', () => {
			const result = validateIntent({ action: 'show', entities: ['dish'], preferredLayout: 'grid' }, registry);
			assert.strictEqual(result.valid, true);
			assert.strictEqual(result.sanitizedParams!.preferredLayout, 'grid');
		});

		test('no layout passes', () => {
			const result = validateIntent({ action: 'show', entities: ['dish'] }, registry);
			assert.strictEqual(result.valid, true);
			assert.strictEqual(result.sanitizedParams!.preferredLayout, undefined);
		});

		test('all five layouts pass', () => {
			for (const layout of ['single', 'split-horizontal', 'split-vertical', 'grid', 'stack']) {
				const result = validateIntent({ action: 'show', entities: ['dish'], preferredLayout: layout }, registry);
				assert.strictEqual(result.valid, true, `layout "${layout}" should pass`);
			}
		});
	});

	// ── Gate 7 — Params ─────────────────────────────────────────────────

	suite('Gate 7 — Params', () => {

		test('long string is truncated to 500 chars', () => {
			const longStr = 'x'.repeat(600);
			const result = validateIntent({ action: 'show', params: { name: longStr } }, registry);
			assert.strictEqual(result.valid, true);
			const p = result.sanitizedParams!.params as Record<string, unknown>;
			assert.strictEqual((p.name as string).length, 500);
		});

		test('number > 1M is clamped', () => {
			const result = validateIntent({ action: 'show', params: { count: 2_000_000 } }, registry);
			assert.strictEqual(result.valid, true);
			const p = result.sanitizedParams!.params as Record<string, unknown>;
			assert.strictEqual(p.count, 1_000_000);
		});

		test('negative number < -1M is clamped', () => {
			const result = validateIntent({ action: 'show', params: { offset: -5_000_000 } }, registry);
			assert.strictEqual(result.valid, true);
			const p = result.sanitizedParams!.params as Record<string, unknown>;
			assert.strictEqual(p.offset, -1_000_000);
		});

		test('array > 50 items is truncated', () => {
			const bigArray = Array.from({ length: 80 }, (_, i) => `item${i}`);
			const result = validateIntent({ action: 'show', params: { ids: bigArray } }, registry);
			assert.strictEqual(result.valid, true);
			const p = result.sanitizedParams!.params as Record<string, unknown>;
			assert.strictEqual((p.ids as string[]).length, 50);
		});

		test('nested objects are sanitized recursively', () => {
			const result = validateIntent({
				action: 'show',
				params: {
					filter: {
						name: 'ok',
						deep: {
							value: 999_999_999,
						},
					},
				},
			}, registry);
			assert.strictEqual(result.valid, true);
			const p = result.sanitizedParams!.params as Record<string, unknown>;
			const filter = p.filter as Record<string, unknown>;
			assert.strictEqual(filter.name, 'ok');
			const deep = filter.deep as Record<string, unknown>;
			assert.strictEqual(deep.value, 1_000_000);
		});

		test('non-primitive leaf values are removed', () => {
			const result = validateIntent({
				action: 'show',
				params: {
					good: 'yes',
					bad: Symbol('x'),
				},
			}, registry);
			assert.strictEqual(result.valid, true);
			const p = result.sanitizedParams!.params as Record<string, unknown>;
			assert.strictEqual(p.good, 'yes');
			assert.strictEqual(p.bad, undefined);
		});

		test('NaN and Infinity in params are removed', () => {
			const result = validateIntent({
				action: 'show',
				params: {
					nan: NaN,
					inf: Infinity,
					negInf: -Infinity,
					ok: 42,
				},
			}, registry);
			assert.strictEqual(result.valid, true);
			const p = result.sanitizedParams!.params as Record<string, unknown>;
			assert.strictEqual(p.nan, undefined);
			assert.strictEqual(p.inf, undefined);
			assert.strictEqual(p.negInf, undefined);
			assert.strictEqual(p.ok, 42);
		});

		test('boolean values pass through', () => {
			const result = validateIntent({ action: 'show', params: { active: true } }, registry);
			assert.strictEqual(result.valid, true);
			const p = result.sanitizedParams!.params as Record<string, unknown>;
			assert.strictEqual(p.active, true);
		});

		test('no params produces no params key', () => {
			const result = validateIntent({ action: 'show' }, registry);
			assert.strictEqual(result.valid, true);
			assert.strictEqual(Object.prototype.hasOwnProperty.call(result.sanitizedParams, 'params'), false);
		});
	});

	// ── Integration / cross-gate tests ──────────────────────────────────

	suite('Integration', () => {

		test('all gates pass — real-world intent', () => {
			const result = validateIntent({
				action: 'show',
				entities: ['dish'],
				depth: 1,
				preferredLayout: 'grid',
				params: { limit: 10 },
			}, registry);
			assert.deepStrictEqual(result, {
				valid: true,
				sanitizedParams: {
					action: 'show',
					entities: ['dish'],
					depth: 1,
					preferredLayout: 'grid',
					params: { limit: 10 },
				},
			});
		});

		test('fail fast: gate 2 failure stops further checks', () => {
			// Even though entities are valid, action fails first
			const result = validateIntent({ action: 'destroy', entities: ['dish'] }, registry);
			assert.strictEqual(result.valid, false);
			assert.strictEqual(result.gate, 2);
			// Verify gates 3-7 never ran by checking only gate 2 info is present
			assert.strictEqual(result.gateName, 'Action');
		});

		test('fail fast: gate 3 failure stops before gate 4', () => {
			const result = validateIntent({ action: 'show', entities: ['ghost'] }, registry);
			assert.strictEqual(result.valid, false);
			assert.strictEqual(result.gate, 3);
		});

		test('valid intent with no entities and no params', () => {
			const result = validateIntent({ action: 'navigate' }, registry);
			assert.strictEqual(result.valid, true);
			assert.strictEqual(result.sanitizedParams!.action, 'navigate');
		});

		test('compare action with multiple entities', () => {
			const result = validateIntent({
				action: 'compare',
				entities: ['dish', 'ingredient'],
				params: { mode: 'side-by-side' },
			}, registry);
			assert.strictEqual(result.valid, true);
			assert.deepStrictEqual(result.sanitizedParams!.entities, ['dish', 'ingredient']);
			const p = result.sanitizedParams!.params as Record<string, unknown>;
			assert.strictEqual(p.mode, 'side-by-side');
		});
	});
});
