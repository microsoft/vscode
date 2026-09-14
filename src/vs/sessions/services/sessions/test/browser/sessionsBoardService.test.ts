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

	test('starts with compact metadata cards and no active renderer', () => {
		const service = store.add(new SessionsBoardService(store.add(new InMemoryStorageService()), new NullLogService()));
		assert.deepStrictEqual({ options: service.options.get(), views: service.savedViews.get(), renderer: service.activeView.get() }, {
			options: DEFAULT_SESSIONS_BOARD_OPTIONS, views: [], renderer: undefined,
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
