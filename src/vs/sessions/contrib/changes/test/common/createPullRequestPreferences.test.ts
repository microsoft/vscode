/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ILogService, NullLogService } from '../../../../../platform/log/common/log.js';
import { InMemoryStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { CreatePullRequestPreferences, ICreatePullRequestPreferences } from '../../common/createPullRequestPreferences.js';

suite('CreatePullRequestPreferences', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('persists typed options in profile scope across instances, merging independent changes', () => {
		const storage = store.add(new InMemoryStorageService());
		const logService = store.add(new NullLogService());
		const first = new CreatePullRequestPreferences(storage, logService);
		const second = new CreatePullRequestPreferences(storage, logService);
		const expected: ICreatePullRequestPreferences = {
			draft: true, mergeMode: 'agent', mergeMethod: 'REBASE', primaryAction: 'sendToChat',
			agentMergeOptions: { addressReviews: false, fixCI: true, resolveConflicts: false, mergePullRequest: 'ifUnchanged' },
		};
		first.update(expected);
		second.update({ draft: false });
		assert.deepStrictEqual({
			preferences: new CreatePullRequestPreferences(storage, logService).read(),
			profileKeys: storage.keys(StorageScope.PROFILE, StorageTarget.MACHINE),
			workspaceKeys: storage.keys(StorageScope.WORKSPACE, StorageTarget.MACHINE),
		}, {
			preferences: { ...expected, draft: false },
			profileKeys: ['sessions.createPullRequest.preferences'], workspaceKeys: [],
		});
	});

	test('reads only valid preferences and never restores pull request content', () => {
		const storage = store.add(new InMemoryStorageService());
		storage.store('sessions.createPullRequest.preferences', {
			draft: 'true', mergeMode: 'automatic', mergeMethod: 'REBASE', primaryAction: 'sendToChat',
			agentMergeOptions: { addressReviews: true, fixCI: true, resolveConflicts: false, mergePullRequest: 'invalid' },
			title: 'Do not persist content', description: 'Private description', repository: 'owner/repository', branchName: 'feature',
		}, StorageScope.PROFILE, StorageTarget.MACHINE);
		const preferences = new CreatePullRequestPreferences(storage, store.add(new NullLogService()));
		const before = preferences.read();
		preferences.update({ draft: false });
		assert.deepStrictEqual({
			before,
			stored: storage.getObject('sessions.createPullRequest.preferences', StorageScope.PROFILE),
		}, {
			before: { mergeMethod: 'REBASE', primaryAction: 'sendToChat' },
			stored: { draft: false, mergeMethod: 'REBASE', primaryAction: 'sendToChat' },
		});
	});

	test('persists only preference fields even when given an object with pull request content', () => {
		const storage = store.add(new InMemoryStorageService());
		const preferences = new CreatePullRequestPreferences(storage, store.add(new NullLogService()));
		const optionsWithContent = {
			draft: true, title: 'Private title', description: 'Private description', repository: 'owner/repository', branchName: 'feature',
		};
		preferences.update(optionsWithContent);
		assert.deepStrictEqual(storage.getObject('sessions.createPullRequest.preferences', StorageScope.PROFILE), { draft: true });
	});

	for (const invalid of ['{invalid', 'null', '42', '[]']) {
		test(`ignores invalid stored preferences: ${invalid}`, () => {
			const storage = store.add(new InMemoryStorageService());
			storage.store('sessions.createPullRequest.preferences', invalid, StorageScope.PROFILE, StorageTarget.MACHINE);
			assert.deepStrictEqual(new CreatePullRequestPreferences(storage, store.add(new NullLogService())).read(), {});
		});
	}

	test('warns when preferences cannot be parsed without logging stored content or the parsing error', () => {
		const storage = store.add(new InMemoryStorageService());
		storage.store('sessions.createPullRequest.preferences', '{"title":"private stored content", invalid', StorageScope.PROFILE, StorageTarget.MACHINE);
		const warnings: Parameters<ILogService['warn']>[] = [];
		const logService = store.add(new class extends NullLogService {
			override warn(...args: Parameters<ILogService['warn']>): void {
				warnings.push(args);
			}
		}());
		assert.deepStrictEqual({
			preferences: new CreatePullRequestPreferences(storage, logService).read(),
			warnings,
		}, {
			preferences: {},
			warnings: [['[CreatePullRequestPreferences] Could not read pull request preferences; using defaults.']],
		});
	});
});
