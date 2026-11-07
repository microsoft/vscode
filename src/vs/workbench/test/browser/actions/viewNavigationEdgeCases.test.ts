/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import {
	getNavigableViewEntries,
	getViewNavigationLocationOrder,
	resolveViewNavigationTarget
} from '../../../browser/actions/viewNavigationModel.js';
import {
	focused,
	makeContainer,
	makeSnapshot,
	makeView,
	standardSnapshot,
	targetId,
	withContainers,
	withPreference
} from './viewNavigationFixtures.js';

suite('Workbench view navigation: visibility and focus transitions', () => {
	test('locations are traversed in a fixed, discoverable order', () => {
		assert.deepStrictEqual(getViewNavigationLocationOrder(), [
			'sidebar', 'auxiliarybar', 'panel'
		]);
	});

	test('input container enumeration does not alter location order', () => {
		const base = standardSnapshot('a');
		const containers = [...base.containers].reverse();
		const result = getNavigableViewEntries(withContainers(base, containers));
		assert.deepStrictEqual(result.map(entry => entry.viewId), [
			'a', 'b', 'c', 'd', 'e', 'f', 'g'
		]);
	});

	test('hidden panes do not appear in the navigation list', () => {
		const state = makeSnapshot([
			makeContainer('explorer', 'sidebar', [
				makeView('a'),
				makeView('b', { visible: false }),
				makeView('c')
			])
		], 'a');
		assert.deepStrictEqual(
			getNavigableViewEntries(state).map(entry => entry.viewId),
			['a', 'c']
		);
		assert.strictEqual(targetId(state, { direction: 'next', scope: 'container' }), 'c');
	});

	test('disabled panes are not navigable', () => {
		const state = makeSnapshot([
			makeContainer('explorer', 'sidebar', [
				makeView('a'),
				makeView('b', { enabled: false }),
				makeView('c')
			])
		], 'a');
		assert.strictEqual(targetId(state, { direction: 'next', scope: 'container' }), 'c');
		assert.strictEqual(targetId(focused(state, 'c'), { direction: 'previous', scope: 'container' }), 'a');
	});

	test('collapsed panes remain keyboard-accessible by their headers', () => {
		const state = makeSnapshot([
			makeContainer('explorer', 'sidebar', [
				makeView('a'),
				makeView('b', { collapsed: true }),
				makeView('c')
			])
		], 'a');
		assert.strictEqual(targetId(state, { direction: 'next', scope: 'container' }), 'b');
	});

	test('opt-in expanded-only navigation skips collapsed panes', () => {
		const state = makeSnapshot([
			makeContainer('explorer', 'sidebar', [
				makeView('a'),
				makeView('b', { collapsed: true }),
				makeView('c')
			])
		], 'a');
		assert.strictEqual(targetId(state, {
			direction: 'next', scope: 'container', includeCollapsed: false
		}), 'c');
	});

	test('expanded-only navigation works in reverse', () => {
		const state = makeSnapshot([
			makeContainer('explorer', 'sidebar', [
				makeView('a'),
				makeView('b', { collapsed: true }),
				makeView('c')
			])
		], 'c');
		assert.strictEqual(targetId(state, {
			direction: 'previous', scope: 'container', includeCollapsed: false
		}), 'a');
	});

	test('all collapsed panes still work with ordinary navigation', () => {
		const state = makeSnapshot([
			makeContainer('explorer', 'sidebar', [
				makeView('a', { collapsed: true }),
				makeView('b', { collapsed: true })
			])
		], 'a');
		assert.strictEqual(targetId(state, { direction: 'next', scope: 'container' }), 'b');
		assert.strictEqual(targetId(state, {
			direction: 'next', scope: 'container', includeCollapsed: false
		}), undefined);
	});

	test('an inactive container is never a navigation destination', () => {
		const state = makeSnapshot([
			makeContainer('explorer', 'sidebar', ['a']),
			makeContainer('previous-explorer', 'sidebar', ['old'], false),
			makeContainer('problems', 'panel', ['z'])
		], 'a');
		assert.deepStrictEqual(getNavigableViewEntries(state).map(entry => entry.viewId), ['a', 'z']);
	});

	test('only the first active container for a location participates', () => {
		const state = makeSnapshot([
			makeContainer('explorer', 'sidebar', ['a']),
			makeContainer('search', 'sidebar', ['other']),
			makeContainer('problems', 'panel', ['z'])
		], 'a');
		assert.deepStrictEqual(getNavigableViewEntries(state).map(entry => entry.viewId), ['a', 'z']);
	});

	test('a hidden view does not create a duplicate destination', () => {
		const state = makeSnapshot([
			makeContainer('explorer', 'sidebar', [
				makeView('a', { visible: false }),
				makeView('a'),
				makeView('b')
			])
		], 'a');
		assert.deepStrictEqual(getNavigableViewEntries(state).map(entry => entry.viewId), ['a', 'b']);
	});

	test('duplicate view IDs are ignored within one container', () => {
		const state = makeSnapshot([
			makeContainer('explorer', 'sidebar', ['a', 'b', 'a', 'c', 'b'])
		], 'a');
		assert.deepStrictEqual(getNavigableViewEntries(state).map(entry => entry.viewId), ['a', 'b', 'c']);
	});

	test('duplicate view IDs are ignored across containers', () => {
		const state = makeSnapshot([
			makeContainer('explorer', 'sidebar', ['a', 'b']),
			makeContainer('problems', 'panel', ['b', 'c'])
		], 'b');
		assert.deepStrictEqual(getNavigableViewEntries(state).map(entry => entry.viewId), ['a', 'b', 'c']);
	});




	test('preferred location disambiguates a moving container with no focused view', () => {
		const containers = [
			makeContainer('moving', 'sidebar', ['a', 'b']),
			makeContainer('moving', 'panel', ['c', 'd'])
		];
		const preferredPanel = makeSnapshot(containers, undefined, 'moving', 'panel');
		const preferredSidebar = makeSnapshot(containers, undefined, 'moving', 'sidebar');

		assert.strictEqual(targetId(preferredPanel, {
			direction: 'next', scope: 'container'
		}), 'c');
		assert.strictEqual(targetId(preferredPanel, {
			direction: 'previous', scope: 'container'
		}), 'd');
		assert.strictEqual(targetId(preferredSidebar, {
			direction: 'next', scope: 'container'
		}), 'a');
		assert.strictEqual(targetId(preferredSidebar, {
			direction: 'previous', scope: 'container'
		}), 'b');
	});

	test('unknown preferred location retains preferred container precedence', () => {
		const state = makeSnapshot([
			makeContainer('moving', 'sidebar', ['a', 'b']),
			makeContainer('moving', 'panel', ['c', 'd']),
			makeContainer('different', 'auxiliarybar', ['e'])
		], undefined, 'moving', 'auxiliarybar');

		assert.strictEqual(targetId(state, {
			direction: 'next', scope: 'container'
		}), 'a');
		assert.strictEqual(targetId(state, {
			direction: 'previous', scope: 'container'
		}), 'd');
	});

	test('workbench-scoped preferred location selects the matching duplicate as its starting point', () => {
		const state = makeSnapshot([
			makeContainer('moving', 'sidebar', ['a', 'b']),
			makeContainer('moving', 'panel', ['c', 'd'])
		], undefined, 'moving', 'panel');

		assert.strictEqual(targetId(state, {
			direction: 'next', scope: 'workbench'
		}), 'c');
		assert.strictEqual(targetId(state, {
			direction: 'previous', scope: 'workbench'
		}), 'd');
	});

	test('container-scoped traversal does not cross locations that share a container ID', () => {
		const state = makeSnapshot([
			makeContainer('moving', 'sidebar', ['a', 'b']),
			makeContainer('moving', 'panel', ['c', 'd'])
		], 'b');
		assert.deepStrictEqual(getNavigableViewEntries(state).map(entry => entry.viewId), ['a', 'b', 'c', 'd']);
		const wrapped = resolveViewNavigationTarget(state, { direction: 'next', scope: 'container' });
		assert.strictEqual(wrapped?.viewId, 'a');
		assert.strictEqual(wrapped?.location, 'sidebar');
		assert.strictEqual(wrapped?.total, 2);
		assert.strictEqual(targetId(state, {
			direction: 'next', scope: 'container', wrap: false
		}), undefined);
		assert.strictEqual(targetId(state, {
			direction: 'last', scope: 'container'
		}), 'b');
		assert.strictEqual(targetId(state, {
			direction: 'next', scope: 'workbench', wrap: false
		}), 'c');
	});

	test('expanded-only container traversal respects location when IDs collide', () => {
		const state = makeSnapshot([
			makeContainer('moving', 'sidebar', ['a', makeView('b', { collapsed: true })]),
			makeContainer('moving', 'panel', ['c', 'd'])
		], 'b');
		const expanded = resolveViewNavigationTarget(state, {
			direction: 'next', scope: 'container', includeCollapsed: false
		});
		assert.strictEqual(expanded?.viewId, 'a');
		assert.strictEqual(expanded?.location, 'sidebar');
		assert.strictEqual(expanded?.index, 0);
		assert.strictEqual(expanded?.total, 1);
		assert.strictEqual(targetId(state, {
			direction: 'next', scope: 'container', includeCollapsed: false, wrap: false
		}), undefined);
		assert.strictEqual(targetId(state, {
			direction: 'last', scope: 'container', includeCollapsed: false
		}), 'a');
		assert.strictEqual(targetId(state, {
			direction: 'next', scope: 'workbench', includeCollapsed: false, wrap: false
		}), 'c');
	});

	test('focus in the second copy of a moved container stays in that location', () => {
		const state = makeSnapshot([
			makeContainer('moving', 'sidebar', ['a', 'b']),
			makeContainer('moving', 'panel', ['c', 'd'])
		], 'c');
		assert.strictEqual(targetId(state, {
			direction: 'previous', scope: 'container'
		}), 'd');
		assert.strictEqual(targetId(state, {
			direction: 'next', scope: 'container', wrap: false
		}), 'd');
		assert.strictEqual(targetId(state, {
			direction: 'first', scope: 'container'
		}), 'c');
	});

	test('expanded-only navigation does not resurrect a collapsed duplicate in another container', () => {
		const state = makeSnapshot([
			makeContainer('explorer', 'sidebar', ['a', makeView('b', { collapsed: true })]),
			makeContainer('problems', 'panel', ['b', 'c'])
		], 'a');
		assert.deepStrictEqual(getNavigableViewEntries(state).map(entry => entry.viewId), ['a', 'b', 'c']);
		assert.deepStrictEqual(getNavigableViewEntries(state, false).map(entry => entry.viewId), ['a', 'c']);
		const result = resolveViewNavigationTarget(state, {
			direction: 'next', scope: 'workbench', includeCollapsed: false, wrap: false
		});
		assert.strictEqual(result?.viewId, 'c');
		assert.strictEqual(result?.containerId, 'problems');
		assert.strictEqual(result?.index, 1);
		assert.strictEqual(result?.total, 2);
	});

	test('a later expanded duplicate in the same container cannot replace its collapsed owner', () => {
		const state = makeSnapshot([
			makeContainer('explorer', 'sidebar', [
				'a', makeView('b', { collapsed: true }), 'b', 'c'
			])
		], 'a');
		assert.deepStrictEqual(getNavigableViewEntries(state, false).map(entry => entry.viewId), ['a', 'c']);
		assert.strictEqual(targetId(state, {
			direction: 'next', scope: 'container', includeCollapsed: false, wrap: false
		}), 'c');
	});

	test('only collapsed copies of a view cannot create a cross-container expanded target', () => {
		const state = makeSnapshot([
			makeContainer('explorer', 'sidebar', [makeView('b', { collapsed: true })]),
			makeContainer('problems', 'panel', ['b'])
		], 'b');
		assert.deepStrictEqual(getNavigableViewEntries(state, false), []);
		for (const direction of ['next', 'previous', 'first', 'last'] as const) {
			assert.strictEqual(targetId(state, {
				direction, scope: 'workbench', includeCollapsed: false
			}), undefined);
		}
	});

	test('expanded-only reverse traversal retains first-container ownership across duplicates', () => {
		const state = makeSnapshot([
			makeContainer('explorer', 'sidebar', ['a', makeView('b', { collapsed: true })]),
			makeContainer('problems', 'panel', ['b', 'c'])
		], 'c');
		const result = resolveViewNavigationTarget(state, {
			direction: 'previous', scope: 'workbench', includeCollapsed: false, wrap: false
		});
		assert.strictEqual(result?.viewId, 'a');
		assert.strictEqual(result?.containerId, 'explorer');
		assert.strictEqual(result?.total, 2);
	});


	test('expanded-only results are a stable subsequence under all duplicate visibility states', () => {
		// Model view moves between locations with both copies temporarily present.
		// None of these combinations may change which container owns the view ID.
		for (let first = 0; first < 4; first++) {
			for (let second = 0; second < 4; second++) {
				const state = makeSnapshot([
					makeContainer('explorer', 'sidebar', [
						'a',
						makeView('shared', { visible: (first & 1) === 0, collapsed: (first & 2) !== 0 })
					]),
					makeContainer('problems', 'panel', [
						makeView('shared', { visible: (second & 1) === 0, collapsed: (second & 2) !== 0 }),
						'z'
					])
				], 'a');
				const allEntries = getNavigableViewEntries(state);
				const expandedEntries = getNavigableViewEntries(state, false);
				const expandedIds = new Set(expandedEntries.map(entry => entry.viewId));
				assert.deepStrictEqual(
					expandedEntries,
					allEntries.filter(entry => expandedIds.has(entry.viewId)),
					`duplicate visibility combination: ${first}, ${second}`
				);
			}
		}
	});

	test('empty view IDs are ignored', () => {
		const state = makeSnapshot([
			makeContainer('explorer', 'sidebar', ['', 'a', ''])
		], 'a');
		assert.deepStrictEqual(getNavigableViewEntries(state).map(entry => entry.viewId), ['a']);
	});

	test('empty container IDs cannot be addressed', () => {
		const state = makeSnapshot([
			makeContainer('', 'sidebar', ['a']),
			makeContainer('problems', 'panel', ['b'])
		], 'b');
		assert.deepStrictEqual(getNavigableViewEntries(state).map(entry => entry.viewId), ['b']);
	});

	test('empty snapshots have no focus destination', () => {
		const state = makeSnapshot([]);
		for (const scope of ['container', 'workbench'] as const) {
			for (const direction of ['next', 'previous', 'first', 'last'] as const) {
				assert.strictEqual(targetId(state, { scope, direction }), undefined);
			}
		}
	});

	test('fully hidden container contents give no focus destination', () => {
		const state = makeSnapshot([
			makeContainer('explorer', 'sidebar', [
				makeView('a', { visible: false }),
				makeView('b', { visible: false })
			])
		]);
		assert.strictEqual(targetId(state, { scope: 'container', direction: 'next' }), undefined);
	});

	test('no focus defaults to first sidebar view when moving forward', () => {
		assert.strictEqual(targetId(standardSnapshot(), {
			scope: 'container', direction: 'next'
		}), 'a');
	});

	test('no focus defaults to final sidebar view when moving backward', () => {
		assert.strictEqual(targetId(standardSnapshot(), {
			scope: 'container', direction: 'previous'
		}), 'c');
	});

	test('explicit preferred container wins over preferred location', () => {
		const state = withPreference(standardSnapshot(), 'problems', 'sidebar');
		assert.strictEqual(targetId(state, { scope: 'container', direction: 'next' }), 'f');
		assert.strictEqual(targetId(state, { scope: 'container', direction: 'previous' }), 'g');
	});

	test('an unknown preferred container falls back to preferred location', () => {
		const state = withPreference(standardSnapshot(), 'missing', 'auxiliarybar');
		assert.strictEqual(targetId(state, { scope: 'container', direction: 'next' }), 'd');
		assert.strictEqual(targetId(state, { scope: 'container', direction: 'previous' }), 'e');
	});

	test('an unknown preferred location falls back to stable location ordering', () => {
		const state = withPreference(standardSnapshot(), 'missing', undefined);
		assert.strictEqual(targetId(state, { scope: 'workbench', direction: 'next' }), 'a');
		assert.strictEqual(targetId(state, { scope: 'workbench', direction: 'previous' }), 'g');
	});

	test('unavailable focused views are not treated as active anchors', () => {
		const state = focused(standardSnapshot(), 'removed');
		assert.strictEqual(targetId(state, { scope: 'container', direction: 'next' }), 'a');
		assert.strictEqual(targetId(state, { scope: 'container', direction: 'previous' }), 'c');
	});

	test('reordering views takes effect immediately', () => {
		const initial = makeSnapshot([makeContainer('explorer', 'sidebar', ['a', 'b', 'c'])], 'a');
		const reordered = withContainers(initial, [makeContainer('explorer', 'sidebar', ['c', 'a', 'b'])]);
		assert.strictEqual(targetId(initial, { scope: 'container', direction: 'next' }), 'b');
		assert.strictEqual(targetId(reordered, { scope: 'container', direction: 'next' }), 'b');
		assert.strictEqual(targetId(reordered, { scope: 'container', direction: 'previous' }), 'c');
	});

	test('moving the focused view between locations follows the new container', () => {
		const initial = makeSnapshot([
			makeContainer('explorer', 'sidebar', ['a', 'b']),
			makeContainer('panel', 'panel', ['c'])
		], 'b');
		const moved = makeSnapshot([
			makeContainer('explorer', 'sidebar', ['a']),
			makeContainer('panel', 'panel', ['c', 'b'])
		], 'b');
		assert.strictEqual(targetId(initial, { scope: 'container', direction: 'previous' }), 'a');
		assert.strictEqual(targetId(moved, { scope: 'container', direction: 'previous' }), 'c');
	});

	test('single-view containers stay focusable on wrapped traversal', () => {
		const state = makeSnapshot([makeContainer('only', 'sidebar', ['one'])], 'one');
		assert.strictEqual(targetId(state, { scope: 'container', direction: 'next' }), 'one');
		assert.strictEqual(targetId(state, { scope: 'container', direction: 'previous' }), 'one');
	});

	test('single-view containers honor no-wrap traversal', () => {
		const state = makeSnapshot([makeContainer('only', 'sidebar', ['one'])], 'one');
		assert.strictEqual(targetId(state, { scope: 'container', direction: 'next', wrap: false }), undefined);
		assert.strictEqual(targetId(state, { scope: 'container', direction: 'previous', wrap: false }), undefined);
	});

	test('multiple sequential navigation steps wrap correctly', () => {
		let state = standardSnapshot('b');
		const sequence: string[] = [];
		for (let i = 0; i < 9; i++) {
			const next = targetId(state, { scope: 'workbench', direction: 'next' });
			assert.ok(next);
			sequence.push(next);
			state = focused(state, next);
		}
		assert.deepStrictEqual(sequence, ['c', 'd', 'e', 'f', 'g', 'a', 'b', 'c', 'd']);
	});

	test('navigation is pure and does not modify source arrays', () => {
		const state = standardSnapshot('c');
		const before = JSON.stringify(state);
		for (let i = 0; i < 10; i++) {
			resolveViewNavigationTarget(state, {
				scope: 'workbench', direction: i % 2 ? 'next' : 'previous'
			});
		}
		assert.strictEqual(JSON.stringify(state), before);
	});

	test('expanded-only next traverses forward from a collapsed header', () => {
		const state = makeSnapshot([
			makeContainer('explorer', 'sidebar', [
				makeView('a'), makeView('b', { collapsed: true }), makeView('c')
			])
		], 'b');
		assert.strictEqual(targetId(state, {
			direction: 'next', scope: 'container', includeCollapsed: false, wrap: false
		}), 'c');
	});

	test('expanded-only previous traverses backward from a collapsed header', () => {
		const state = makeSnapshot([
			makeContainer('explorer', 'sidebar', [
				makeView('a'), makeView('b', { collapsed: true }), makeView('c')
			])
		], 'b');
		assert.strictEqual(targetId(state, {
			direction: 'previous', scope: 'container', includeCollapsed: false, wrap: false
		}), 'a');
	});

	test('expanded-only traversal respects non-wrapping boundaries from collapsed anchors', () => {
		const state = makeSnapshot([
			makeContainer('explorer', 'sidebar', [
				makeView('a', { collapsed: true }), makeView('b'), makeView('c', { collapsed: true })
			])
		]);
		assert.strictEqual(targetId(focused(state, 'a'), {
			direction: 'previous', scope: 'container', includeCollapsed: false, wrap: false
		}), undefined);
		assert.strictEqual(targetId(focused(state, 'c'), {
			direction: 'next', scope: 'container', includeCollapsed: false, wrap: false
		}), undefined);
		assert.strictEqual(targetId(focused(state, 'a'), {
			direction: 'next', scope: 'container', includeCollapsed: false, wrap: false
		}), 'b');
		assert.strictEqual(targetId(focused(state, 'c'), {
			direction: 'previous', scope: 'container', includeCollapsed: false, wrap: false
		}), 'b');
	});

	test('expanded-only traversal wraps past collapsed panes', () => {
		const state = makeSnapshot([
			makeContainer('explorer', 'sidebar', [
				makeView('a'), makeView('b', { collapsed: true }), makeView('c')
			])
		], 'c');
		assert.strictEqual(targetId(state, {
			direction: 'next', scope: 'container', includeCollapsed: false
		}), 'a');
		assert.strictEqual(targetId(focused(state, 'a'), {
			direction: 'previous', scope: 'container', includeCollapsed: false
		}), 'c');
	});

	test('all-collapsed focus anchors never escape their container', () => {
		const state = makeSnapshot([
			makeContainer('explorer', 'sidebar', [
				makeView('a', { collapsed: true }),
				makeView('b', { collapsed: true })
			]),
			makeContainer('problems', 'panel', [makeView('c')])
		], 'b');
		for (const direction of ['next', 'previous', 'first', 'last'] as const) {
			assert.strictEqual(targetId(state, {
				direction, scope: 'container', includeCollapsed: false
			}), undefined);
		}
	});

	test('workbench-scoped expanded-only navigation can reach another container', () => {
		const state = makeSnapshot([
			makeContainer('explorer', 'sidebar', [
				makeView('a', { collapsed: true }),
				makeView('b', { collapsed: true })
			]),
			makeContainer('problems', 'panel', ['c'])
		], 'b');
		assert.strictEqual(targetId(state, {
			direction: 'next', scope: 'workbench', includeCollapsed: false
		}), 'c');
	});

	test('expanded-only navigation never changes its input snapshot', () => {
		const state = makeSnapshot([
			makeContainer('explorer', 'sidebar', [
				makeView('a'), makeView('b', { collapsed: true }), makeView('c')
			])
		], 'b');
		const before = JSON.stringify(state);
		targetId(state, { direction: 'next', scope: 'container', includeCollapsed: false });
		targetId(state, { direction: 'previous', scope: 'container', includeCollapsed: false });
		assert.strictEqual(JSON.stringify(state), before);
	});

});
