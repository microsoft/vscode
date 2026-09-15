/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { autorun } from '../../../../../base/common/observable.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { InMemoryStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { DEFAULT_SESSIONS_BOARD_OPTIONS, SessionsBoardService } from '../../browser/sessionsBoardService.js';
import { ISessionCardBoardState } from '../../common/sessionCardLayout.js';

suite('SessionsBoardService - card layouts', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const storageKey = 'sessions.board.layouts';
	const scope = 'overview:attention:created';
	const otherScope = 'collection:release:updated';
	const initialLayout: ISessionCardBoardState = {
		order: ['A', 'B', 'C', 'D'],
		sizes: [
			{ id: 'A', columnSpan: 2, height: 320 },
			{ id: 'B', columnSpan: 3, height: 560 },
			{ id: 'C', columnSpan: 1 },
			{ id: 'D', columnSpan: 2, height: 420 },
		],
	};

	function createService(storage = store.add(new InMemoryStorageService())): SessionsBoardService {
		return store.add(new SessionsBoardService(storage, new NullLogService()));
	}

	function assertInvalidOperation(operation: (service: SessionsBoardService) => void): void {
		const storage = store.add(new InMemoryStorageService());
		const service = createService(storage);
		service.setCardLayout(scope, initialLayout, initialLayout.order);
		service.setSectionCollapsed(scope, true);
		const layouts = service.cardLayouts.get();
		const sections = service.collapsedSections.get();
		const raw = storage.get(storageKey, StorageScope.WORKSPACE);
		assert.throws(() => operation(service), /invalid/);
		assert.deepStrictEqual({
			layoutsUnchanged: service.cardLayouts.get() === layouts,
			sectionsUnchanged: service.collapsedSections.get() === sections,
			stored: storage.get(storageKey, StorageScope.WORKSPACE),
		}, { layoutsUnchanged: true, sectionsUnchanged: true, stored: raw });
	}

	function assertInvalidStoredState(raw: string): void {
		const storage = store.add(new InMemoryStorageService());
		storage.store(storageKey, raw, StorageScope.WORKSPACE, StorageTarget.MACHINE);
		const warnings: string[] = [];
		const service = store.add(new SessionsBoardService(storage, new class extends NullLogService {
			override warn(message: string): void { warnings.push(message); }
		}));
		assert.deepStrictEqual({
			layouts: [...service.cardLayouts.get()],
			sections: [...service.collapsedSections.get()],
			warnings,
			stored: storage.get(storageKey, StorageScope.WORKSPACE),
		}, {
			layouts: [], sections: [], warnings: ['[SessionsBoardService] Failed to restore card layouts'], stored: raw,
		});
	}

	test('old profile preferences need no layout migration or workspace writes', () => {
		const storage = store.add(new InMemoryStorageService());
		const existing = createService(storage);
		existing.updateOptions({ grouping: 'collection', filter: 'release', showBranch: true });
		existing.saveView('Release');
		existing.setViewPromoted('review', true);
		const profile = storage.get('sessions.board.views', StorageScope.PROFILE);
		const service = createService(storage);
		assert.deepStrictEqual({
			layouts: [...service.cardLayouts.get()], sections: [...service.collapsedSections.get()],
			options: service.options.get(), saved: service.savedViews.get(), promoted: service.promotedViews.get(),
			profile: storage.get('sessions.board.views', StorageScope.PROFILE),
			workspace: storage.get(storageKey, StorageScope.WORKSPACE),
		}, {
			layouts: [], sections: [], options: existing.options.get(), saved: existing.savedViews.get(), promoted: ['review'],
			profile, workspace: undefined,
		});
	});

	test('persists versioned layouts and explicit collapse choices only as workspace machine state', () => {
		const storage = store.add(new InMemoryStorageService());
		const service = createService(storage);
		service.setCardLayout(scope, initialLayout, initialLayout.order);
		service.setCardLayout(otherScope, { order: ['D'], sizes: [{ id: 'D', columnSpan: 3 }] }, ['D']);
		service.setSectionCollapsed(scope, true);
		service.setSectionCollapsed(otherScope, false);
		const restored = createService(storage);
		assert.deepStrictEqual({
			layouts: [...restored.cardLayouts.get()], sections: [...restored.collapsedSections.get()],
			stored: storage.getObject(storageKey, StorageScope.WORKSPACE),
			machineKeys: storage.keys(StorageScope.WORKSPACE, StorageTarget.MACHINE),
			userKeys: storage.keys(StorageScope.WORKSPACE, StorageTarget.USER),
			profile: storage.get(storageKey, StorageScope.PROFILE),
		}, {
			layouts: [[scope, initialLayout], [otherScope, { order: ['D'], sizes: [{ id: 'D', columnSpan: 3 }] }]],
			sections: [[scope, true], [otherScope, false]],
			stored: {
				version: 1,
				cardLayouts: [{ scope, ...initialLayout }, { scope: otherScope, order: ['D'], sizes: [{ id: 'D', columnSpan: 3 }] }],
				collapsedSections: [{ scope, collapsed: true }, { scope: otherScope, collapsed: false }],
			},
			machineKeys: [storageKey], userKeys: [], profile: undefined,
		});
	});

	test('restores a valid empty versioned state without rewriting it', () => {
		const storage = store.add(new InMemoryStorageService());
		const raw = JSON.stringify({ version: 1, cardLayouts: [], collapsedSections: [] });
		storage.store(storageKey, raw, StorageScope.WORKSPACE, StorageTarget.MACHINE);
		const service = createService(storage);
		assert.deepStrictEqual({
			layouts: [...service.cardLayouts.get()], sections: [...service.collapsedSections.get()],
			stored: storage.get(storageKey, StorageScope.WORKSPACE),
		}, { layouts: [], sections: [], stored: raw });
	});

	test('workspace layout edits and profile option edits do not overwrite each other', () => {
		const storage = store.add(new InMemoryStorageService());
		const service = createService(storage);
		service.updateOptions({ filter: 'routing', showReply: false });
		service.saveView('Routing');
		service.setViewPromoted('all', true);
		const profile = storage.get('sessions.board.views', StorageScope.PROFILE);
		service.setCardLayout(scope, initialLayout, initialLayout.order);
		service.setSectionCollapsed(scope, true);
		const profileAfterLayout = storage.get('sessions.board.views', StorageScope.PROFILE);
		const layout = storage.get(storageKey, StorageScope.WORKSPACE);
		service.updateOptions({ filter: 'new query' });
		service.setViewPromoted('review', true);
		service.selectView(service.savedViews.get()[0].id);
		const restored = createService(storage);
		assert.deepStrictEqual({
			profileAfterLayout, layoutAfterProfile: storage.get(storageKey, StorageScope.WORKSPACE),
			options: restored.options.get(), saved: restored.savedViews.get(), promoted: restored.promotedViews.get(),
			cardLayout: restored.getCardLayout(scope), collapsed: restored.collapsedSections.get().get(scope),
		}, {
			profileAfterLayout: profile, layoutAfterProfile: layout,
			options: service.options.get(), saved: service.savedViews.get(), promoted: ['all', 'review'],
			cardLayout: initialLayout, collapsed: true,
		});
	});

	test('does not read layout state from profile storage or a different workspace', () => {
		const firstStorage = store.add(new InMemoryStorageService());
		const first = createService(firstStorage);
		first.setCardLayout(scope, initialLayout, initialLayout.order);
		const secondStorage = store.add(new InMemoryStorageService());
		secondStorage.store(storageKey, firstStorage.get(storageKey, StorageScope.WORKSPACE), StorageScope.PROFILE, StorageTarget.MACHINE);
		const second = createService(secondStorage);
		assert.deepStrictEqual({ layouts: [...second.cardLayouts.get()], sections: [...second.collapsedSections.get()] }, { layouts: [], sections: [] });
	});

	test('filtered reordering replaces visible slots and retains hidden sizes', () => {
		const service = createService();
		service.setCardLayout(scope, initialLayout, initialLayout.order);
		service.setCardLayout(scope, {
			order: ['D', 'B'],
			sizes: [{ id: 'D', columnSpan: 3, height: 640 }, { id: 'B', columnSpan: 2 }],
		}, initialLayout.order);
		assert.deepStrictEqual(service.getCardLayout(scope), {
			order: ['A', 'D', 'C', 'B'],
			sizes: [
				{ id: 'A', columnSpan: 2, height: 320 },
				{ id: 'D', columnSpan: 3, height: 640 },
				{ id: 'C', columnSpan: 1 },
				{ id: 'B', columnSpan: 2 },
			],
		});
	});

	test('missing visible sizes reset those cards while hidden size intent survives', () => {
		const service = createService();
		service.setCardLayout(scope, initialLayout, initialLayout.order);
		service.setCardLayout(scope, { order: ['B', 'D'], sizes: [] }, initialLayout.order);
		assert.deepStrictEqual(service.getCardLayout(scope), {
			order: initialLayout.order,
			sizes: [{ id: 'A', columnSpan: 2, height: 320 }, { id: 'C', columnSpan: 1 }],
		});
	});

	test('an omitted or undefined height clears expanded height without resetting column span', () => {
		const storage = store.add(new InMemoryStorageService());
		const service = createService(storage);
		service.setCardLayout(scope, initialLayout, initialLayout.order);
		service.setCardLayout(scope, {
			order: ['B', 'D'], sizes: [{ id: 'B', columnSpan: 3 }, { id: 'D', columnSpan: 2, height: undefined }],
		}, initialLayout.order);
		assert.deepStrictEqual(createService(storage).getCardLayout(scope), {
			order: initialLayout.order,
			sizes: [
				{ id: 'A', columnSpan: 2, height: 320 }, { id: 'B', columnSpan: 3 },
				{ id: 'C', columnSpan: 1 }, { id: 'D', columnSpan: 2 },
			],
		});
	});

	test('a first filtered edit is seeded from the unfiltered canonical order', () => {
		const service = createService();
		service.setCardLayout(scope, { order: ['D', 'B'], sizes: [] }, ['A', 'B', 'C', 'D']);
		assert.deepStrictEqual(service.getCardLayout(scope), { order: ['A', 'D', 'C', 'B'], sizes: [] });
	});

	test('late canonical IDs append deterministically without moving established cards', () => {
		const service = createService();
		service.setCardLayout(scope, { order: ['B', 'A'], sizes: [] }, ['A', 'B']);
		service.setCardLayout(scope, { order: ['B'], sizes: [] }, ['D', 'A', 'C', 'B']);
		service.setCardLayout(scope, { order: ['B'], sizes: [] }, ['C', 'E', 'B', 'A', 'D']);
		assert.deepStrictEqual(service.getCardLayout(scope), { order: ['B', 'A', 'D', 'C', 'E'], sizes: [] });
	});

	test('visible cards missing from the current canonical catalog are still retained', () => {
		const service = createService();
		service.setCardLayout(scope, { order: ['draft', 'A'], sizes: [{ id: 'draft', columnSpan: 2 }] }, ['A', 'B']);
		assert.deepStrictEqual(service.getCardLayout(scope), {
			order: ['draft', 'B', 'A'], sizes: [{ id: 'draft', columnSpan: 2 }],
		});
	});

	test('temporarily absent catalog IDs and sizes survive filtered edits and restoration', () => {
		const storage = store.add(new InMemoryStorageService());
		const service = createService(storage);
		service.setCardLayout(scope, initialLayout, initialLayout.order);
		service.setCardLayout(scope, { order: ['E', 'B'], sizes: [{ id: 'E', columnSpan: 2 }] }, ['B', 'E']);
		const restored = createService(storage);
		restored.setCardLayout(scope, { order: ['E', 'B'], sizes: [{ id: 'E', columnSpan: 2 }] }, ['A', 'B', 'C', 'D', 'E', 'F']);
		assert.deepStrictEqual(restored.getCardLayout(scope), {
			order: ['A', 'E', 'C', 'D', 'B', 'F'],
			sizes: [
				{ id: 'A', columnSpan: 2, height: 320 }, { id: 'E', columnSpan: 2 },
				{ id: 'C', columnSpan: 1 }, { id: 'D', columnSpan: 2, height: 420 },
			],
		});
	});

	test('empty filtered results neither create nor change a stored scope', () => {
		const storage = store.add(new InMemoryStorageService());
		const service = createService(storage);
		service.setCardLayout(scope, { order: [], sizes: [] }, ['A']);
		const first = { layouts: [...service.cardLayouts.get()], stored: storage.get(storageKey, StorageScope.WORKSPACE) };
		service.setCardLayout(scope, initialLayout, initialLayout.order);
		const layouts = service.cardLayouts.get();
		const raw = storage.get(storageKey, StorageScope.WORKSPACE);
		service.setCardLayout(scope, { order: [], sizes: [] }, ['E']);
		service.setCardLayout(otherScope, { order: [], sizes: [] }, []);
		assert.deepStrictEqual({
			first, unchanged: service.cardLayouts.get() === layouts, stored: storage.get(storageKey, StorageScope.WORKSPACE),
		}, { first: { layouts: [], stored: undefined }, unchanged: true, stored: raw });
	});

	test('reset clears only the requested layout and preserves independent collapse choices', () => {
		const storage = store.add(new InMemoryStorageService());
		const service = createService(storage);
		service.setCardLayout(scope, initialLayout, initialLayout.order);
		service.setCardLayout(otherScope, { order: ['D', 'B'], sizes: [] }, ['B', 'D']);
		service.setSectionCollapsed(scope, true);
		service.setSectionCollapsed(otherScope, false);
		service.resetCardLayout(scope);
		const restored = createService(storage);
		const cleared = restored.getCardLayout(scope);
		restored.setCardLayout(scope, { order: ['B'], sizes: [] }, initialLayout.order);
		assert.deepStrictEqual({
			cleared, recreated: restored.getCardLayout(scope), other: restored.getCardLayout(otherScope),
			sections: [...restored.collapsedSections.get()],
		}, {
			cleared: undefined, recreated: { order: initialLayout.order, sizes: [] },
			other: { order: ['D', 'B'], sizes: [] }, sections: [[scope, true], [otherScope, false]],
		});
	});

	test('scopes retain different order and size intent for the same sessions', () => {
		const service = createService();
		service.setCardLayout(scope, initialLayout, initialLayout.order);
		service.setCardLayout(otherScope, { order: ['D', 'B'], sizes: [{ id: 'B', columnSpan: 1, height: 240 }] }, ['B', 'D']);
		service.setCardLayout(scope, { order: ['B'], sizes: [] }, initialLayout.order);
		assert.deepStrictEqual(service.getCardLayout(otherScope), {
			order: ['D', 'B'], sizes: [{ id: 'B', columnSpan: 1, height: 240 }],
		});
	});

	test('rebind keeps the source position and explicit size across collisions in every scope', () => {
		const storage = store.add(new InMemoryStorageService());
		const service = createService(storage);
		service.setCardLayout(scope, {
			order: ['A', 'old', 'B', 'new', 'C'],
			sizes: [{ id: 'old', columnSpan: 2, height: 360 }, { id: 'new', columnSpan: 3, height: 640 }],
		}, []);
		service.setCardLayout(otherScope, {
			order: ['new', 'X', 'old', 'Y'],
			sizes: [{ id: 'new', columnSpan: 3, height: 640 }, { id: 'old', columnSpan: 2 }],
		}, []);
		const before = service.getCardLayout(scope);
		const updates: number[] = [];
		store.add(autorun(reader => updates.push(service.cardLayouts.read(reader).size)));
		service.rebindCardSession('old', 'new');
		const restored = createService(storage);
		assert.deepStrictEqual({
			layouts: [...restored.cardLayouts.get()], before, updates,
		}, {
			layouts: [
				[scope, { order: ['A', 'new', 'B', 'C'], sizes: [{ id: 'new', columnSpan: 2, height: 360 }] }],
				[otherScope, { order: ['X', 'new', 'Y'], sizes: [{ id: 'new', columnSpan: 2 }] }],
			],
			before: {
				order: ['A', 'old', 'B', 'new', 'C'],
				sizes: [{ id: 'old', columnSpan: 2, height: 360 }, { id: 'new', columnSpan: 3, height: 640 }],
			},
			updates: [2, 2],
		});
	});

	test('rebind preserves destination size when the source has no explicit size', () => {
		const service = createService();
		service.setCardLayout(scope, {
			order: ['new', 'A', 'old'], sizes: [{ id: 'new', columnSpan: 3, height: 640 }],
		}, []);
		service.setCardLayout(otherScope, { order: ['new'], sizes: [{ id: 'new', columnSpan: 2 }] }, []);
		const other = service.getCardLayout(otherScope);
		service.rebindCardSession('old', 'new');
		assert.deepStrictEqual({
			layout: service.getCardLayout(scope), otherUnchanged: service.getCardLayout(otherScope) === other,
		}, {
			layout: { order: ['A', 'new'], sizes: [{ id: 'new', columnSpan: 3, height: 640 }] }, otherUnchanged: true,
		});
	});

	test('rebind also transfers a dormant ID without an existing replacement', () => {
		const service = createService();
		service.setCardLayout(scope, { order: ['draft', 'A'], sizes: [{ id: 'draft', columnSpan: 2 }] }, []);
		service.setCardLayout(scope, { order: ['A'], sizes: [] }, ['A']);
		service.rebindCardSession('draft', 'committed');
		assert.deepStrictEqual(service.getCardLayout(scope), { order: ['committed', 'A'], sizes: [{ id: 'committed', columnSpan: 2 }] });
	});

	test('definitive deletion removes IDs and sizes in all scopes without changing collapse state', () => {
		const storage = store.add(new InMemoryStorageService());
		const service = createService(storage);
		service.setCardLayout(scope, initialLayout, initialLayout.order);
		service.setCardLayout(otherScope, { order: ['B'], sizes: [{ id: 'B', columnSpan: 2 }] }, []);
		service.setSectionCollapsed(otherScope, true);
		const updates: number[] = [];
		store.add(autorun(reader => updates.push(service.cardLayouts.read(reader).size)));
		service.removeCardSession('B');
		const restored = createService(storage);
		assert.deepStrictEqual({
			layouts: [...restored.cardLayouts.get()], sections: [...restored.collapsedSections.get()], updates,
		}, {
			layouts: [[scope, { order: ['A', 'C', 'D'], sizes: initialLayout.sizes.filter(size => size.id !== 'B') }]],
			sections: [[otherScope, true]], updates: [2, 1],
		});
	});

	test('idempotent writes, missing resets, and unrelated lifecycle notifications are no-ops', () => {
		const storage = store.add(new InMemoryStorageService());
		const service = createService(storage);
		service.setCardLayout(scope, initialLayout, initialLayout.order);
		service.setSectionCollapsed(scope, true);
		const layouts = service.cardLayouts.get();
		const sections = service.collapsedSections.get();
		const updates: number[] = [];
		store.add(autorun(reader => updates.push(service.cardLayouts.read(reader).size + service.collapsedSections.read(reader).size)));
		service.setCardLayout(scope, initialLayout, initialLayout.order);
		service.setSectionCollapsed(scope, true);
		service.resetCardLayout(otherScope);
		service.rebindCardSession('A', 'A');
		service.rebindCardSession('missing', 'A');
		service.removeCardSession('missing');
		assert.deepStrictEqual({
			layoutsUnchanged: service.cardLayouts.get() === layouts, sectionsUnchanged: service.collapsedSections.get() === sections, updates,
		}, { layoutsUnchanged: true, sectionsUnchanged: true, updates: [2] });
	});

	test('clones API inputs and exposes immutable layouts, arrays, sizes, and maps', () => {
		const storage = store.add(new InMemoryStorageService());
		const service = createService(storage);
		const input = { order: ['B', 'A'], sizes: [{ id: 'B', columnSpan: 2, height: 360 }] };
		const canonicalOrder = ['A', 'B'];
		service.setCardLayout(scope, input, canonicalOrder);
		service.setSectionCollapsed(scope, true);
		const layout = service.getCardLayout(scope)!;
		const layouts = service.cardLayouts.get();
		const sections = service.collapsedSections.get();
		input.order.reverse();
		input.sizes[0].height = 480;
		input.sizes.push({ id: 'A', columnSpan: 3, height: 480 });
		canonicalOrder.push('C');
		const mutations = [
			Reflect.set(layout, 'order', []), Reflect.set(layout.order, '0', 'changed'),
			Reflect.set(layout.sizes, '0', {}), Reflect.set(layout.sizes[0], 'height', 480),
			Reflect.set(layouts, 'get', () => undefined), Reflect.set(sections, 'size', 0),
		];
		const owners: ReadonlyMap<string, ISessionCardBoardState>[] = [];
		layouts.forEach((_value, _key, owner) => owners.push(owner));
		assert.deepStrictEqual({
			mutations, layout: service.getCardLayout(scope), restored: createService(storage).getCardLayout(scope),
			mapMutators: ['set', 'delete', 'clear'].filter(key => Reflect.has(layouts, key) || Reflect.has(sections, key)),
			iterationMatches: [...layouts.entries()].length === layouts.size && [...layouts.keys()][0] === scope && [...layouts.values()][0] === layout,
			ownerMatches: owners[0] === layouts, collapsed: sections.get(scope),
		}, {
			mutations: [false, false, false, false, false, false],
			layout: { order: ['B', 'A'], sizes: [{ id: 'B', columnSpan: 2, height: 360 }] },
			restored: { order: ['B', 'A'], sizes: [{ id: 'B', columnSpan: 2, height: 360 }] },
			mapMutators: [], iterationMatches: true, ownerMatches: true, collapsed: true,
		});
	});

	test('accepts bounded fractional heights, all supported spans, and nonempty opaque identifiers', () => {
		const storage = store.add(new InMemoryStorageService());
		const service = createService(storage);
		const layout = {
			order: ['__proto__', 'constructor', 'copilot:/abc'],
			sizes: [
				{ id: '__proto__', columnSpan: 1, height: 100 },
				{ id: 'constructor', columnSpan: 2, height: 10000 },
				{ id: 'copilot:/abc', columnSpan: 3, height: 360.5 },
			],
		};
		service.setCardLayout('__proto__', layout, layout.order);
		service.setSectionCollapsed('constructor', false);
		const restored = createService(storage);
		assert.deepStrictEqual({
			layout: restored.getCardLayout('__proto__'), collapsed: [...restored.collapsedSections.get()],
		}, { layout, collapsed: [['constructor', false]] });
	});

	const invalidLayouts: readonly { readonly name: string; readonly value: unknown }[] = [
		{ name: 'null layout', value: null },
		{ name: 'array layout', value: [] },
		{ name: 'string layout', value: 'layout' },
		{ name: 'missing order', value: { sizes: [] } },
		{ name: 'missing sizes', value: { order: ['A'] } },
		{ name: 'non-array order', value: { order: 'A', sizes: [] } },
		{ name: 'non-array sizes', value: { order: ['A'], sizes: {} } },
		{ name: 'sparse order', value: { order: new Array(1), sizes: [] } },
		{ name: 'duplicate order IDs', value: { order: ['A', 'A'], sizes: [] } },
		{ name: 'empty order ID', value: { order: [''], sizes: [] } },
		{ name: 'whitespace order ID', value: { order: [' \t '], sizes: [] } },
		{ name: 'non-string order ID', value: { order: [42], sizes: [] } },
		{ name: 'null size', value: { order: ['A'], sizes: [null] } },
		{ name: 'array size', value: { order: ['A'], sizes: [[]] } },
		{ name: 'sparse sizes', value: { order: ['A'], sizes: new Array(1) } },
		{ name: 'missing size ID', value: { order: ['A'], sizes: [{ columnSpan: 1 }] } },
		{ name: 'empty size ID', value: { order: ['A'], sizes: [{ id: '', columnSpan: 1 }] } },
		{ name: 'non-string size ID', value: { order: ['A'], sizes: [{ id: 42, columnSpan: 1 }] } },
		{ name: 'size outside visible order', value: { order: ['A'], sizes: [{ id: 'B', columnSpan: 1 }] } },
		{ name: 'sizes for an empty order', value: { order: [], sizes: [{ id: 'A', columnSpan: 1 }] } },
		{ name: 'duplicate size IDs', value: { order: ['A'], sizes: [{ id: 'A', columnSpan: 1 }, { id: 'A', columnSpan: 2 }] } },
		...[undefined, null, '2', 0, -1, 1.5, 4, Infinity, NaN].map(columnSpan => ({
			name: `invalid column span ${columnSpan}`, value: { order: ['A'], sizes: [{ id: 'A', columnSpan }] },
		})),
		...[null, '360', false, 0, -1, 99, 10001, Infinity, NaN].map(height => ({
			name: `invalid height ${height}`, value: { order: ['A'], sizes: [{ id: 'A', columnSpan: 1, height }] },
		})),
	];

	for (const { name, value } of invalidLayouts) {
		test(`rejects ${name} at the API boundary`, () => assertInvalidOperation(service => {
			// @ts-expect-error Exercise malformed runtime input.
			service.setCardLayout(scope, value, ['A']);
		}));

		test(`rejects stored ${name} without partially restoring other scopes`, () => {
			const entry = typeof value === 'object' && value !== null && !Array.isArray(value) ? { ...value, scope: otherScope } : value;
			assertInvalidStoredState(JSON.stringify({
				version: 1,
				cardLayouts: [{ scope, ...initialLayout }, entry],
				collapsedSections: [{ scope, collapsed: true }],
			}));
		});
	}

	const invalidIdentifiers: readonly unknown[] = [undefined, null, 42, false, {}, [], '', ' \t '];
	for (const value of invalidIdentifiers) {
		for (const [name, operation] of [
			['get layout', (service: SessionsBoardService) => {
				// @ts-expect-error Exercise malformed runtime scope.
				service.getCardLayout(value);
			}],
			['set layout', (service: SessionsBoardService) => {
				// @ts-expect-error Exercise malformed runtime scope.
				service.setCardLayout(value, initialLayout, initialLayout.order);
			}],
			['reset layout', (service: SessionsBoardService) => {
				// @ts-expect-error Exercise malformed runtime scope.
				service.resetCardLayout(value);
			}],
			['collapse section', (service: SessionsBoardService) => {
				// @ts-expect-error Exercise malformed runtime scope.
				service.setSectionCollapsed(value, true);
			}],
			['rebind source', (service: SessionsBoardService) => {
				// @ts-expect-error Exercise malformed runtime session ID.
				service.rebindCardSession(value, 'A');
			}],
			['rebind destination', (service: SessionsBoardService) => {
				// @ts-expect-error Exercise malformed runtime session ID.
				service.rebindCardSession('A', value);
			}],
			['remove session', (service: SessionsBoardService) => {
				// @ts-expect-error Exercise malformed runtime session ID.
				service.removeCardSession(value);
			}],
		] as const) {
			test(`rejects ${JSON.stringify(value)} in ${name}`, () => assertInvalidOperation(operation));
		}
	}

	const invalidCanonicalOrders: readonly unknown[] = [undefined, null, 'A', {}, [''], [' \t '], [42], ['A', 'A'], new Array(1)];
	for (const value of invalidCanonicalOrders) {
		test(`rejects invalid canonical order ${JSON.stringify(value)}`, () => assertInvalidOperation(service => {
			// @ts-expect-error Exercise malformed runtime canonical order.
			service.setCardLayout(scope, initialLayout, value);
		}));
	}

	const invalidCollapseStates: readonly unknown[] = [undefined, null, 'true', 0, 1, {}, []];
	for (const value of invalidCollapseStates) {
		test(`rejects non-boolean collapse state ${JSON.stringify(value)}`, () => assertInvalidOperation(service => {
			// @ts-expect-error Exercise malformed runtime collapse state.
			service.setSectionCollapsed(scope, value);
		}));
	}

	const emptyStoredState = { version: 1, cardLayouts: [], collapsedSections: [] };
	const malformedStoredStates = [
		null, [], 'layouts', {}, { ...emptyStoredState, version: undefined },
		{ ...emptyStoredState, version: 2 }, { ...emptyStoredState, version: '1' },
		{ ...emptyStoredState, cardLayouts: undefined }, { ...emptyStoredState, cardLayouts: {} },
		{ ...emptyStoredState, collapsedSections: undefined }, { ...emptyStoredState, collapsedSections: {} },
		{ ...emptyStoredState, cardLayouts: [{ ...initialLayout }] },
		{ ...emptyStoredState, cardLayouts: [{ scope: '', ...initialLayout }] },
		{ ...emptyStoredState, cardLayouts: [{ scope: ' ', ...initialLayout }] },
		{ ...emptyStoredState, cardLayouts: [{ scope: 42, ...initialLayout }] },
		{ ...emptyStoredState, cardLayouts: [{ scope, ...initialLayout }, { scope, ...initialLayout }] },
		{ ...emptyStoredState, collapsedSections: [null] },
		{ ...emptyStoredState, collapsedSections: [[]] },
		{ ...emptyStoredState, collapsedSections: [{ collapsed: true }] },
		{ ...emptyStoredState, collapsedSections: [{ scope: '', collapsed: true }] },
		{ ...emptyStoredState, collapsedSections: [{ scope: ' ', collapsed: true }] },
		{ ...emptyStoredState, collapsedSections: [{ scope: 42, collapsed: true }] },
		{ ...emptyStoredState, collapsedSections: [{ scope }] },
		{ ...emptyStoredState, collapsedSections: [{ scope, collapsed: 'true' }] },
		{ ...emptyStoredState, collapsedSections: [{ scope, collapsed: true }, { scope, collapsed: false }] },
	];
	for (const [index, value] of malformedStoredStates.entries()) {
		test(`rejects malformed stored envelope ${index}`, () => assertInvalidStoredState(JSON.stringify(value)));
	}

	for (const raw of ['', '{', '{"version":1']) {
		test(`logs invalid stored JSON ${JSON.stringify(raw)} without overwriting it`, () => assertInvalidStoredState(raw));
	}

	test('malformed layout storage does not prevent restoring existing profile views', () => {
		const storage = store.add(new InMemoryStorageService());
		const existing = createService(storage);
		existing.updateOptions({ filter: 'release' });
		existing.saveView('Release');
		existing.setViewPromoted('all', true);
		storage.store(storageKey, 'malformed', StorageScope.WORKSPACE, StorageTarget.MACHINE);
		const service = createService(storage);
		assert.deepStrictEqual({
			options: service.options.get(), views: service.savedViews.get(), promoted: service.promotedViews.get(), layouts: [...service.cardLayouts.get()],
		}, {
			options: { ...DEFAULT_SESSIONS_BOARD_OPTIONS, filter: 'release' }, views: existing.savedViews.get(), promoted: ['all'], layouts: [],
		});
	});

	test('malformed profile storage does not prevent restoring valid layouts', () => {
		const storage = store.add(new InMemoryStorageService());
		const existing = createService(storage);
		existing.setCardLayout(scope, initialLayout, initialLayout.order);
		storage.store('sessions.board.views', 'malformed', StorageScope.PROFILE, StorageTarget.USER);
		const service = createService(storage);
		assert.deepStrictEqual({ options: service.options.get(), layout: service.getCardLayout(scope) }, { options: DEFAULT_SESSIONS_BOARD_OPTIONS, layout: initialLayout });
	});
});
