/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from '../../../../nls.js';
import { AgentHostAutoArchiveMergedSessionsAfterDaysConfigKey, AgentHostAutoDeleteArchivedMergedSessionsAfterDaysConfigKey } from '../../../../platform/agentHost/common/agentHostSchema.js';
import { ConfigurationScope, Extensions as ConfigurationExtensions, IConfigurationRegistry } from '../../../../platform/configuration/common/configurationRegistry.js';
import product from '../../../../platform/product/common/product.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { ConfigurationKeyValuePairs, Extensions as WorkbenchConfigurationExtensions, IConfigurationMigrationRegistry } from '../../../common/configuration.js';
import { AGENT_SESSION_CLEANUP_SETTINGS_TAG, ChatConfiguration } from '../common/constants.js';

const legacyAutoArchiveMergedSessionsAfterDaysSetting = 'chat.agentSessions.autoArchiveMergedSessionsAfterDays';

Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).registerConfiguration({
	id: 'chat',
	properties: {
		[ChatConfiguration.UnifiedWorkspacePicker]: {
			type: 'boolean',
			default: product.quality !== 'stable',
			scope: ConfigurationScope.APPLICATION,
			description: nls.localize('sessions.chat.unifiedWorkspacePicker.enabled', "Controls whether the Agents Window uses the unified workspace picker, which combines GitHub and remote workspaces, provides search, and, when supported, allows creating sessions with no workspace."),
			tags: ['experimental'],
			experiment: { mode: 'auto' },
		},
		[ChatConfiguration.AutoMarkAsDoneMergedSessionsAfterDays]: {
			type: 'integer',
			minimum: 0,
			default: 0,
			scope: ConfigurationScope.APPLICATION,
			tags: ['preview', AGENT_SESSION_CLEANUP_SETTINGS_TAG],
			markdownDescription: nls.localize('autoMarkAsDoneMergedSessions.description', "Controls the number of inactive days before agent sessions with a merged pull request are automatically marked as done. Marking a session as done safely removes its eligible worktree. Permanent deletion is controlled separately by {0}. Set to 0 to disable automatically marking sessions as done. The recommended value is 15.", '`#chat.agentSessions.autoDeleteArchivedMergedSessionsAfterDays#`'),
			agentHost: { key: AgentHostAutoArchiveMergedSessionsAfterDaysConfigKey },
		},
		[ChatConfiguration.AutoDeleteArchivedMergedSessionsAfterDays]: {
			type: 'integer',
			minimum: 0,
			default: 0,
			scope: ConfigurationScope.APPLICATION,
			tags: ['preview', AGENT_SESSION_CLEANUP_SETTINGS_TAG],
			markdownDescription: nls.localize('autoDeleteArchivedMergedSessions.description', "Controls the number of days after being automatically marked as done before agent sessions with a merged pull request are permanently deleted. Retained eligible worktrees are safely removed before deletion. Automatically marking sessions as done is controlled separately by {0}. Set to 0 to disable permanent deletion. The recommended value is 15.", '`#chat.agentSessions.autoMarkAsDoneMergedSessionsAfterDays#`'),
			agentHost: { key: AgentHostAutoDeleteArchivedMergedSessionsAfterDaysConfigKey },
		},
	},
});

Registry.as<IConfigurationMigrationRegistry>(WorkbenchConfigurationExtensions.ConfigurationMigration).registerConfigurationMigrations([{
	key: legacyAutoArchiveMergedSessionsAfterDaysSetting,
	includeApplication: true,
	migrateFn: (value, accessor) => {
		const pairs: ConfigurationKeyValuePairs = [[legacyAutoArchiveMergedSessionsAfterDaysSetting, { value: undefined }]];
		if (accessor(ChatConfiguration.AutoMarkAsDoneMergedSessionsAfterDays) === undefined) {
			pairs.push([ChatConfiguration.AutoMarkAsDoneMergedSessionsAfterDays, { value }]);
		}
		return pairs;
	},
}]);
