/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { sessionStorageCleanupSuggestionConfigurationMigration } from '../../browser/sessionStorageCleanupConfiguration.js';
import { AGENT_SESSIONS_STORAGE_CLEANUP_SUGGESTION_SETTING, LEGACY_AGENT_SESSIONS_WORKTREE_LIMIT_PROMPT_SETTING } from '../../browser/sessionWorktreeCleanupService.js';

suite('SessionStorageCleanupConfiguration', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('migrates the legacy prompt setting without overwriting the cleanup suggestion setting', async () => {
		const copiedValue = await sessionStorageCleanupSuggestionConfigurationMigration.migrateFn(true, () => undefined);
		const preservedValue = await sessionStorageCleanupSuggestionConfigurationMigration.migrateFn(false, key => key === AGENT_SESSIONS_STORAGE_CLEANUP_SUGGESTION_SETTING ? true : undefined);

		assert.deepStrictEqual({
			key: sessionStorageCleanupSuggestionConfigurationMigration.key,
			includeApplication: sessionStorageCleanupSuggestionConfigurationMigration.includeApplication,
			copiedValue,
			preservedValue,
		}, {
			key: LEGACY_AGENT_SESSIONS_WORKTREE_LIMIT_PROMPT_SETTING,
			includeApplication: true,
			copiedValue: [
				[LEGACY_AGENT_SESSIONS_WORKTREE_LIMIT_PROMPT_SETTING, { value: undefined }],
				[AGENT_SESSIONS_STORAGE_CLEANUP_SUGGESTION_SETTING, { value: true }],
			],
			preservedValue: [
				[LEGACY_AGENT_SESSIONS_WORKTREE_LIMIT_PROMPT_SETTING, { value: undefined }],
			],
		});
	});
});
