/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { autorun, constObservable, observableValue } from '../../../../../base/common/observable.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { TestStorageService } from '../../../../test/common/workbenchTestServices.js';
import { createSessionPullRequestPillData, type IChatPullRequestPillSection } from '../../browser/sessionPullRequestPill.js';
import { SessionChatPillVisibility } from '../../common/sessionChatPills.js';

suite('SessionPullRequestPillData', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createVisibility(storageService = store.add(new TestStorageService())) {
		return store.add(new SessionChatPillVisibility(storageService)).pullRequests;
	}

	const sections = constObservable<readonly IChatPullRequestPillSection[]>([{
		title: 'Pull Requests',
		entries: [
			{ id: 'open', label: 'Open', pullRequestState: 'open', open: () => { } },
			{ id: 'draft', label: 'Draft', pullRequestState: 'draft', open: () => { } },
			{ id: 'closed', label: 'Closed', pullRequestState: 'closed', open: () => { } },
			{ id: 'merged', label: 'Merged', pullRequestState: 'merged', open: () => { } },
			{ id: 'unknown', label: 'Unknown', open: () => { } },
		],
	}]);

	test('filters data before rendering and updates existing sources through contributed actions', async () => {
		const visibility = createVisibility();
		const first = createSessionPullRequestPillData(sections, visibility);
		const second = createSessionPullRequestPillData(sections, visibility);
		const updates: string[][] = [];
		store.add(autorun(reader => updates.push(second.sections.read(reader).flatMap(section => section.entries.map(entry => entry.id)))));

		const before = first.getContextMenuActions().map(action => ({ label: action.label, checked: action.checked }));
		await first.getContextMenuActions()[1].run();
		const after = second.getContextMenuActions().map(action => ({ label: action.label, checked: action.checked }));
		await second.getContextMenuActions()[0].run();

		assert.deepStrictEqual({
			before,
			after,
			updates,
			originalEntries: sections.get()[0].entries.map(entry => entry.id),
		}, {
			before: [{ label: 'Show All', checked: true }, { label: 'Show Open/Draft', checked: false }],
			after: [{ label: 'Show All', checked: false }, { label: 'Show Open/Draft', checked: true }],
			updates: [
				['open', 'draft', 'closed', 'merged', 'unknown'],
				['open', 'draft', 'unknown'],
				['open', 'draft', 'closed', 'merged', 'unknown'],
			],
			originalEntries: ['open', 'draft', 'closed', 'merged', 'unknown'],
		});
	});

	test('persists the filter in application storage and restores it', async () => {
		const storageService = store.add(new TestStorageService());
		const data = createSessionPullRequestPillData(sections, createVisibility(storageService));
		await data.getContextMenuActions()[1].run();
		const filtered = {
			restoredAll: createSessionPullRequestPillData(sections, createVisibility(storageService)).getContextMenuActions()[0].checked,
			application: storageService.getBoolean('sessions.chatPills.pullRequests.showAll', StorageScope.APPLICATION),
			profile: storageService.getBoolean('sessions.chatPills.pullRequests.showAll', StorageScope.PROFILE),
			workspace: storageService.getBoolean('sessions.chatPills.pullRequests.showAll', StorageScope.WORKSPACE),
		};
		await data.getContextMenuActions()[0].run();

		assert.deepStrictEqual({
			filtered,
			restoredAll: createSessionPullRequestPillData(sections, createVisibility(storageService)).getContextMenuActions()[0].checked,
		}, {
			filtered: { restoredAll: false, application: false, profile: undefined, workspace: undefined },
			restoredAll: true,
		});
	});

	test('keeps configuration available while filtered data is empty but not after the source is cleared', async () => {
		const visibility = createVisibility();
		const input = observableValue<readonly IChatPullRequestPillSection[]>('pullRequests', [{
			title: 'Pull Requests',
			entries: [{ id: 'closed', label: 'Closed', pullRequestState: 'closed', open: () => { } }],
		}]);
		const data = createSessionPullRequestPillData(input, visibility);
		await data.getContextMenuActions()[1].run();
		const filtered = { sections: data.sections.get(), hasData: data.hasData.get() };
		input.set([], undefined);

		assert.deepStrictEqual({
			filtered,
			cleared: { sections: data.sections.get(), hasData: data.hasData.get() },
		}, {
			filtered: { sections: [], hasData: true },
			cleared: { sections: [], hasData: false },
		});
	});

	test('preserves the show-all default for an invalid stored filter', () => {
		const storageService = store.add(new TestStorageService());
		storageService.store('sessions.chatPills.pullRequests.showAll', 'invalid', StorageScope.APPLICATION, StorageTarget.USER);
		const data = createSessionPullRequestPillData(sections, createVisibility(storageService));

		assert.strictEqual(data.getContextMenuActions()[0].checked, true);
	});
});
