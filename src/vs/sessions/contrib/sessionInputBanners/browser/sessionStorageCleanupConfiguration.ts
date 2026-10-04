/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ConfigurationKeyValuePairs, ConfigurationMigration } from '../../../../workbench/common/configuration.js';
import { AGENT_SESSIONS_STORAGE_CLEANUP_SUGGESTION_SETTING, LEGACY_AGENT_SESSIONS_WORKTREE_LIMIT_PROMPT_SETTING } from './sessionWorktreeCleanupService.js';

export const sessionStorageCleanupSuggestionConfigurationMigration: ConfigurationMigration = {
	key: LEGACY_AGENT_SESSIONS_WORKTREE_LIMIT_PROMPT_SETTING,
	includeApplication: true,
	migrateFn: (value, accessor) => {
		const pairs: ConfigurationKeyValuePairs = [[LEGACY_AGENT_SESSIONS_WORKTREE_LIMIT_PROMPT_SETTING, { value: undefined }]];
		if (accessor(AGENT_SESSIONS_STORAGE_CLEANUP_SUGGESTION_SETTING) === undefined) {
			pairs.push([AGENT_SESSIONS_STORAGE_CLEANUP_SUGGESTION_SETTING, { value }]);
		}
		return pairs;
	},
};
