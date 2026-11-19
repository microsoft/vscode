/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { autorun, observableValue, transaction } from '../../../../../base/common/observable.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { AGENTS_WINDOW_TOTAL_SESSIONS_STORAGE_KEY } from '../../../../../platform/chat/common/agentsWindowInvitation.js';
import { InMemoryStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { INewSessionBanner, NEW_SESSION_BANNERS_MIN_CREATED_SESSIONS, NewSessionBannerPriority, NewSessionBanners } from '../../common/newSessionBanners.js';

suite('NewSessionBanners', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createBanners(createdSessions = NEW_SESSION_BANNERS_MIN_CREATED_SESSIONS) {
		const storage = store.add(new InMemoryStorageService());
		const setCreatedSessions = (count: number) => storage.store(AGENTS_WINDOW_TOTAL_SESSIONS_STORAGE_KEY, count, StorageScope.APPLICATION, StorageTarget.MACHINE);
		setCreatedSessions(createdSessions);
		const banners = store.add(new NewSessionBanners(storage));
		const wants = {
			tip: observableValue('tip', false),
			migration: observableValue('migration', false),
			worktree: observableValue('worktree', false),
		};
		const worktreePreview = observableValue('worktreePreview', false);
		const registered: Record<string, INewSessionBanner> = {
			tip: store.add(banners.register(NewSessionBannerPriority.Tip, wants.tip)),
			migration: store.add(banners.register(NewSessionBannerPriority.Migration, wants.migration)),
			worktree: store.add(banners.register(NewSessionBannerPriority.WorktreeSuggestion, wants.worktree, { isDeveloperPreview: worktreePreview })),
		};
		const showing = () => Object.keys(registered).filter(name => registered[name].isShowing.get());
		return { banners, wants, worktreePreview, registered, showing, setCreatedSessions };
	}

	test('shows only the banner with the highest priority of those that want to show', () => {
		const { wants, showing } = createBanners();
		const steps: Record<string, string[]> = { none: showing() };
		wants.tip.set(true, undefined);
		steps.tip = showing();
		wants.migration.set(true, undefined);
		steps.tipAndMigration = showing();
		wants.worktree.set(true, undefined);
		steps.all = showing();
		wants.worktree.set(false, undefined);
		steps.worktreeGone = showing();
		wants.migration.set(false, undefined);
		steps.migrationGone = showing();

		assert.deepStrictEqual(steps, {
			none: [],
			tip: ['tip'],
			tipAndMigration: ['migration'],
			all: ['worktree'],
			worktreeGone: ['migration'],
			migrationGone: ['tip'],
		});
	});

	test('never shows two banners at once, also while several conditions change together', () => {
		const { wants, registered } = createBanners();
		const observed: string[][] = [];
		store.add(autorun(reader => {
			observed.push(Object.keys(registered).filter(name => registered[name].isShowing.read(reader)));
		}));
		transaction(tx => {
			wants.tip.set(true, tx);
			wants.migration.set(true, tx);
		});
		transaction(tx => {
			wants.migration.set(false, tx);
			wants.worktree.set(true, tx);
		});
		transaction(tx => {
			wants.worktree.set(false, tx);
			wants.tip.set(false, tx);
		});

		assert.deepStrictEqual(observed, [[], ['migration'], ['worktree'], []]);
	});

	test('shows no banner before the user started 3 sessions, except a developer preview', () => {
		const { wants, worktreePreview, showing, setCreatedSessions } = createBanners(2);
		wants.tip.set(true, undefined);
		wants.migration.set(true, undefined);
		const twoSessions = showing();
		transaction(tx => {
			wants.worktree.set(true, tx);
			worktreePreview.set(true, tx);
		});
		const preview = showing();
		transaction(tx => {
			wants.worktree.set(false, tx);
			worktreePreview.set(false, tx);
		});
		const previewEnded = showing();
		setCreatedSessions(3);

		assert.deepStrictEqual({ minimum: NEW_SESSION_BANNERS_MIN_CREATED_SESSIONS, twoSessions, preview, previewEnded, thirdSession: showing() }, {
			minimum: 3,
			twoSessions: [],
			preview: ['worktree'],
			previewEnded: [],
			thirdSession: ['migration'],
		});
	});

	test('orders by number, so a new banner can go between others, and the first registered of equal priorities shows', () => {
		const { banners, wants, showing } = createBanners();
		wants.tip.set(true, undefined);
		wants.migration.set(true, undefined);
		const between = store.add(banners.register(NewSessionBannerPriority.Migration - 50, observableValue('between', true)));
		const sameAsMigration = store.add(banners.register(NewSessionBannerPriority.Migration, observableValue('sameAsMigration', true)));
		const ranked = () => ({ showing: showing(), between: between.isShowing.get(), sameAsMigration: sameAsMigration.isShowing.get() });
		const both = ranked();
		wants.migration.set(false, undefined);
		const migrationGone = ranked();
		sameAsMigration.dispose();
		const afterDisposal = ranked();

		assert.deepStrictEqual({ both, migrationGone, afterDisposal }, {
			both: { showing: ['migration'], between: false, sameAsMigration: false },
			migrationGone: { showing: [], between: false, sameAsMigration: true },
			// A disposed banner no longer competes, so the next one shows.
			afterDisposal: { showing: [], between: true, sameAsMigration: false },
		});
	});
});
