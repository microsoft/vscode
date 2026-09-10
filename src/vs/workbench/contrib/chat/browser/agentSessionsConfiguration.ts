/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from '../../../../nls.js';
import { AgentHostAutoArchiveMergedSessionsAfterDaysConfigKey, AgentHostAutoDeleteArchivedMergedSessionsAfterDaysConfigKey } from '../../../../platform/agentHost/common/agentHostSchema.js';
import { ConfigurationScope, Extensions as ConfigurationExtensions, IConfigurationRegistry } from '../../../../platform/configuration/common/configurationRegistry.js';
import product from '../../../../platform/product/common/product.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { AGENT_SESSION_CLEANUP_SETTINGS_TAG, ChatConfiguration } from '../common/constants.js';

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
		[ChatConfiguration.AutoArchiveMergedSessionsAfterDays]: {
			type: 'integer',
			minimum: 0,
			default: 0,
			scope: ConfigurationScope.APPLICATION,
			tags: ['preview', AGENT_SESSION_CLEANUP_SETTINGS_TAG],
			markdownDescription: nls.localize('autoArchiveMergedSessions.description', "Controls the number of inactive days before agent sessions with a merged pull request are automatically archived. Archiving safely removes eligible worktrees. Permanent deletion is controlled separately by {0}. Set to 0 to disable automatic archival. The recommended value is 15.", '`#chat.agentSessions.autoDeleteArchivedMergedSessionsAfterDays#`'),
			agentHost: { key: AgentHostAutoArchiveMergedSessionsAfterDaysConfigKey },
		},
		[ChatConfiguration.AutoDeleteArchivedMergedSessionsAfterDays]: {
			type: 'integer',
			minimum: 0,
			default: 0,
			scope: ConfigurationScope.APPLICATION,
			tags: ['preview', AGENT_SESSION_CLEANUP_SETTINGS_TAG],
			markdownDescription: nls.localize('autoDeleteArchivedMergedSessions.description', "Controls the number of days after automatic archival before agent sessions with a merged pull request are permanently deleted. Retained eligible worktrees are safely removed before deletion. Automatic archival is controlled separately by {0}. Set to 0 to disable permanent deletion. The recommended value is 15.", '`#chat.agentSessions.autoArchiveMergedSessionsAfterDays#`'),
			agentHost: { key: AgentHostAutoDeleteArchivedMergedSessionsAfterDaysConfigKey },
		},
	},
});
