/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { InMemoryStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { DEFAULT_SESSIONS_BOARD_OPTIONS, ISessionsBoardView, SessionsBoardService } from '../../browser/sessionsBoardService.js';
import { SessionStatus } from '../../common/session.js';

suite('SessionsBoardService', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('starts in My work without promoted views or an active renderer', () => {
		const service = store.add(new SessionsBoardService(store.add(new InMemoryStorageService()), new NullLogService()));
		assert.deepStrictEqual({ options: service.options.get(), views: service.savedViews.get(), promoted: service.promotedViews.get(), renderer: service.activeView.get() }, {
			options: DEFAULT_SESSIONS_BOARD_OPTIONS, views: [], promoted: [], renderer: undefined,
		});
	});

	test('persists and restores grouping, filtering, and field choices', () => {
		const storage = store.add(new InMemoryStorageService());
		const service = store.add(new SessionsBoardService(storage, new NullLogService()));
		service.updateOptions({ grouping: 'collection', filter: 'review', status: SessionStatus.NeedsInput, showBranch: true, showReply: false });
		service.saveView('Needs my review');
		const restored = store.add(new SessionsBoardService(storage, new NullLogService()));
		assert.deepStrictEqual({
			options: restored.options.get(),
			saved: restored.savedViews.get().map(view => ({ name: view.name, options: view.options })),
		}, {
			options: service.options.get(),
			saved: [{ name: 'Needs my review', options: service.options.get() }],
		});
	});

	test('selecting a saved view restores its options without mutating the saved definition', () => {
		const service = store.add(new SessionsBoardService(store.add(new InMemoryStorageService()), new NullLogService()));
		service.updateOptions({ grouping: 'collection', showReply: false });
		service.saveView('Release');
		const saved = service.savedViews.get()[0];
		service.updateOptions({ grouping: 'project', showReply: true });
		service.selectView(saved.id);
		assert.deepStrictEqual({ current: service.options.get(), saved: saved.options }, { current: saved.options, saved: saved.options });
	});

	test('replacing a view registration does not let old disposal clear the new renderer', () => {
		const service = store.add(new SessionsBoardService(store.add(new InMemoryStorageService()), new NullLogService()));
		const first = new class extends mock<ISessionsBoardView>() { }();
		const second = new class extends mock<ISessionsBoardView>() { }();
		const firstRegistration = store.add(service.registerView(first));
		store.add(service.registerView(second));
		firstRegistration.dispose();
		assert.strictEqual(service.activeView.get(), second);
	});

	test('work views persist criteria rather than matching session identities', () => {
		const storage = store.add(new InMemoryStorageService());
		const service = store.add(new SessionsBoardService(storage, new NullLogService()));
		service.updateOptions({ view: 'archive', collection: 'release', inactivityDays: 60, filter: 'routing' });
		service.saveView('Old release work');
		const restored = store.add(new SessionsBoardService(storage, new NullLogService()));
		assert.deepStrictEqual({
			view: restored.options.get().view,
			collection: restored.options.get().collection,
			days: restored.options.get().inactivityDays,
			saved: restored.savedViews.get()[0].options,
		}, { view: 'archive', collection: 'release', days: 60, saved: service.options.get() });
	});

	for (const view of [undefined, 'cards'] as const) {
		test(`migrates ${view ?? 'missing'} view preferences and saved queries without losing other options`, () => {
			const storage = store.add(new InMemoryStorageService());
			const legacy = {
				...DEFAULT_SESSIONS_BOARD_OPTIONS, view, inactivityDays: undefined, grouping: 'collection', collection: 'release',
				filter: 'routing', status: SessionStatus.Error, sort: 'updated', compact: false, showChanges: false,
				showArtifacts: false, showPullRequest: false, showReply: false, showBranch: true,
			};
			const saved = { id: 'release', name: 'Release', options: legacy };
			storage.store('sessions.board.views', JSON.stringify({ options: legacy, views: [saved] }), StorageScope.PROFILE, StorageTarget.USER);
			const service = store.add(new SessionsBoardService(storage, new NullLogService()));
			const migrated = storage.getObject('sessions.board.views', StorageScope.PROFILE);
			const { inactivityDays: _days, ...expectedOptions } = { ...legacy, view: 'overview' };
			const expectedViews = [{ ...saved, options: expectedOptions }];
			service.updateOptions({ view: 'inProgress', collection: undefined, filter: '' });
			service.selectView(saved.id);
			assert.deepStrictEqual({
				options: service.options.get(), views: service.savedViews.get(), promoted: service.promotedViews.get(),
				migrated, stored: storage.getObject('sessions.board.views', StorageScope.PROFILE),
			}, {
				options: expectedOptions, views: expectedViews, promoted: [],
				migrated: { options: expectedOptions, views: expectedViews, promotedViews: [] },
				stored: { options: expectedOptions, views: expectedViews, promotedViews: [] },
			});
		});
	}

	test('normalizes cards and undefined during option updates while preserving unrelated choices', () => {
		const service = store.add(new SessionsBoardService(store.add(new InMemoryStorageService()), new NullLogService()));
		service.updateOptions({ view: 'review', filter: 'draft', grouping: 'collection', collection: 'release', showReply: false });
		const before = service.options.get();
		const results = ([undefined, 'cards'] as const).map(view => {
			service.updateOptions({ view });
			return service.options.get();
		});
		assert.deepStrictEqual(results, [{ ...before, view: 'overview' }, { ...before, view: 'overview' }]);
	});

	test('promotion persists only builtin identities without capturing or changing the active or saved query', () => {
		const storage = store.add(new InMemoryStorageService());
		const service = store.add(new SessionsBoardService(storage, new NullLogService()));
		service.updateOptions({ view: 'archive', collection: 'release', filter: 'routing', status: SessionStatus.Completed });
		service.saveView('Old release work');
		const options = service.options.get();
		const saved = service.savedViews.get();
		service.setViewPromoted('review', true);
		service.setViewPromoted('needsInput', true);
		service.setViewPromoted('inProgress', true);
		service.setViewPromoted('all', true);
		const restored = store.add(new SessionsBoardService(storage, new NullLogService()));
		assert.deepStrictEqual({
			unchangedOptions: service.options.get() === options, unchangedViews: service.savedViews.get() === saved,
			promoted: restored.promotedViews.get(), options: restored.options.get(), saved: restored.savedViews.get(),
		}, {
			unchangedOptions: true, unchangedViews: true, promoted: ['review', 'needsInput', 'inProgress', 'all'], options, saved,
		});
	});

	test('promotion is idempotent and removal only unpins the shortcut', () => {
		const storage = store.add(new InMemoryStorageService());
		const service = store.add(new SessionsBoardService(storage, new NullLogService()));
		service.setViewPromoted('review', true);
		service.setViewPromoted('all', true);
		service.updateOptions({ view: 'review', filter: 'reconnect' });
		service.saveView('Review reconnect');
		const promoted = service.promotedViews.get();
		const options = service.options.get();
		const saved = service.savedViews.get();
		service.setViewPromoted('review', true);
		service.setViewPromoted('needsInput', false);
		const repeated = service.promotedViews.get() === promoted;
		service.setViewPromoted('review', false);
		const restored = store.add(new SessionsBoardService(storage, new NullLogService()));
		assert.deepStrictEqual({
			repeated, promoted: restored.promotedViews.get(), options: restored.options.get(), saved: restored.savedViews.get(),
		}, { repeated: true, promoted: ['all'], options, saved });
	});

	test('deduplicates stored promotions in their original order', () => {
		const storage = store.add(new InMemoryStorageService());
		storage.store('sessions.board.views', JSON.stringify({
			options: DEFAULT_SESSIONS_BOARD_OPTIONS, views: [], promotedViews: ['all', 'review', 'all', 'needsInput', 'review'],
		}), StorageScope.PROFILE, StorageTarget.USER);
		const service = store.add(new SessionsBoardService(storage, new NullLogService()));
		const { status: _status, ...storedOptions } = DEFAULT_SESSIONS_BOARD_OPTIONS;
		assert.deepStrictEqual({
			promoted: service.promotedViews.get(), stored: storage.getObject('sessions.board.views', StorageScope.PROFILE),
		}, {
			promoted: ['all', 'review', 'needsInput'],
			stored: { options: storedOptions, views: [], promotedViews: ['all', 'review', 'needsInput'] },
		});
	});

	test('rejects invalid promotion requests without mutating persisted state', () => {
		const storage = store.add(new InMemoryStorageService());
		const service = store.add(new SessionsBoardService(storage, new NullLogService()));
		service.setViewPromoted('review', true);
		const before = storage.get('sessions.board.views', StorageScope.PROFILE);
		assert.throws(() => {
			// @ts-expect-error Archive is not a promotable view.
			service.setViewPromoted('archive', true);
		}, /cannot be added to the sidebar/);
		assert.throws(() => {
			// @ts-expect-error Promotion must be an explicit boolean.
			service.setViewPromoted('all', 'true');
		}, /cannot be added to the sidebar/);
		assert.deepStrictEqual({ promoted: service.promotedViews.get(), stored: storage.get('sessions.board.views', StorageScope.PROFILE) }, {
			promoted: ['review'], stored: before,
		});
	});

	test('invalid stored promotions are reported without overwriting the stored data', () => {
		const storage = store.add(new InMemoryStorageService());
		const raw = JSON.stringify({ options: DEFAULT_SESSIONS_BOARD_OPTIONS, views: [], promotedViews: ['review', 'archived'] });
		storage.store('sessions.board.views', raw, StorageScope.PROFILE, StorageTarget.USER);
		const warnings: string[] = [];
		const service = store.add(new SessionsBoardService(storage, new class extends NullLogService {
			override warn(message: string): void { warnings.push(message); }
		}));
		assert.deepStrictEqual({
			warnings, promoted: service.promotedViews.get(), stored: storage.get('sessions.board.views', StorageScope.PROFILE),
		}, { warnings: ['[SessionsBoardService] Failed to restore board views'], promoted: [], stored: raw });
	});

	test('invalid inactivity thresholds leave current filters unchanged', () => {
		const service = store.add(new SessionsBoardService(store.add(new InMemoryStorageService()), new NullLogService()));
		const before = service.options.get();
		for (const inactivityDays of [0, -1, 1.5, Infinity, 4000]) {
			assert.throws(() => service.updateOptions({ inactivityDays }), /filters are invalid/);
		}
		assert.strictEqual(service.options.get(), before);
	});

	test('saved views can be removed without changing the current criteria', () => {
		const service = store.add(new SessionsBoardService(store.add(new InMemoryStorageService()), new NullLogService()));
		service.saveView('Review');
		const options = service.options.get();
		service.deleteView(service.savedViews.get()[0].id);
		assert.deepStrictEqual({ views: service.savedViews.get(), options: service.options.get() }, { views: [], options });
	});

	test('invalid stored preferences report an error and keep safe defaults', () => {
		const storage = store.add(new InMemoryStorageService());
		storage.store('sessions.board.views', '{"options":{"grouping":"invalid"},"views":[]}', StorageScope.PROFILE, StorageTarget.USER);
		const warnings: string[] = [];
		const service = store.add(new SessionsBoardService(storage, new class extends NullLogService {
			override warn(message: string): void { warnings.push(message); }
		}));
		assert.deepStrictEqual({ warnings, options: service.options.get() }, { warnings: ['[SessionsBoardService] Failed to restore board views'], options: DEFAULT_SESSIONS_BOARD_OPTIONS });
	});
});
