/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from '../../../../nls.js';
import { AgentHostAutoArchiveMergedSessionsAfterDaysConfigKey, AgentHostAutoDeleteArchivedMergedSessionsAfterDaysConfigKey } from '../../../../platform/agentHost/common/agentHostSchema.js';
import { ConfigurationScope, Extensions as ConfigurationExtensions, IConfigurationPropertySchema, IConfigurationRegistry } from '../../../../platform/configuration/common/configurationRegistry.js';
import product from '../../../../platform/product/common/product.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { ConfigurationKeyValuePairs, Extensions as WorkbenchConfigurationExtensions, IConfigurationMigrationRegistry } from '../../../common/configuration.js';
import { AGENT_SESSION_CLEANUP_SETTINGS_TAG, ChatConfiguration, CopilotHarnessIntroductionMode, DEFAULT_AGENTS_HANDOFF_TIP_DELAY_SECONDS } from '../common/constants.js';

const legacyAutoArchiveMergedSessionsAfterDaysSetting = 'chat.agentSessions.autoArchiveMergedSessionsAfterDays';
const legacyAutoDeleteArchivedMergedSessionsAfterDaysSetting = 'chat.agentSessions.autoDeleteArchivedMergedSessionsAfterDays';

export const agentsWindowHandoffConfigurationProperties = {
	[ChatConfiguration.AgentsWindowBannerEnabled]: {
		type: 'boolean',
		default: false,
		scope: ConfigurationScope.APPLICATION,
		description: nls.localize('chat.agentsWindowBanner.enabled', "Show occasional invitations to continue or manage running Agent Host chats in the Agents Window. Invitations are hidden for users who have created at least three sessions in the Agents Window and created their latest session within the past 30 days."),
		tags: ['experimental'],
		experiment: { mode: 'auto' },
	},
	[ChatConfiguration.AgentsWindowBannerDeveloperMode]: {
		type: 'boolean',
		default: false,
		scope: ConfigurationScope.APPLICATION,
		description: nls.localize('chat.agentsWindowBanner.developerMode', "Preview one Agents Window invitation per window reload, ignoring experiment enablement, previous dismissals, frequency limits, and Agents Window usage. Activity requirements and delays still apply. Previews do not update invitation history or experiment telemetry."),
		tags: ['experimental', 'advanced'],
	},
	[ChatConfiguration.AgentsWindowBannerRevealCurrentSession]: {
		type: 'boolean',
		default: true,
		scope: ConfigurationScope.APPLICATION,
		markdownDescription: nls.localize('chat.agentsWindowBanner.revealCurrentSession', "Open the invited chat when using an Agents Window invitation. When disabled, show the New Session view instead. When `#onboarding.enabled#` is enabled, highlight the invited session in the sessions list, followed by the New Session button if this setting is enabled."),
		tags: ['experimental', 'advanced'],
		experiment: { mode: 'auto' },
	},
	[ChatConfiguration.OpenInAgentsWindowTransferDraft]: {
		type: 'boolean',
		description: nls.localize('chat.openInAgentsWindow.transferDraft', "Copy the prompt and attachments from a new chat when opening the Agents Window. Existing drafts in the Agents Window are preserved."),
		default: product.quality === 'insider',
		tags: ['experimental'],
		experiment: { mode: 'auto' },
	},
	[ChatConfiguration.AgentsParallelWorkBannerEnabled]: {
		type: 'boolean',
		description: nls.localize('chat.agentsParallelWorkBanner.enabled', "Show an invitation to work in parallel in the Agents Window when starting a new Agent Host chat while another Agent Host session is running."),
		default: false,
		tags: ['experimental'],
		experiment: { mode: 'auto' },
		deprecationMessage: nls.localize('chat.agentsParallelWorkBanner.deprecated', "Use chat.agentsWindowBanner.enabled instead."),
	},
	[ChatConfiguration.CopilotHarnessIntroductionMode]: {
		type: 'string',
		enum: [CopilotHarnessIntroductionMode.Off, CopilotHarnessIntroductionMode.NewSession, CopilotHarnessIntroductionMode.AfterRequest],
		enumDescriptions: [
			nls.localize('chat.copilotHarnessIntroduction.off', "Do not show the Copilot harness introduction."),
			nls.localize('chat.copilotHarnessIntroduction.newSession', "Show the introduction when a new Copilot harness session starts."),
			nls.localize('chat.copilotHarnessIntroduction.afterRequest', "Show the introduction after the first request is submitted in a new Copilot harness session."),
		],
		description: nls.localize('chat.copilotHarnessIntroduction.mode', "Controls when the introduction to the new Copilot experience is shown."),
		default: product.quality === 'insider' ? CopilotHarnessIntroductionMode.NewSession : CopilotHarnessIntroductionMode.Off,
		tags: ['experimental'],
		experiment: { mode: 'auto' },
	},
	[ChatConfiguration.HarnessSwitchFeedbackSurveyEnabled]: {
		type: 'boolean',
		description: nls.localize('chat.harnessSwitchFeedbackSurvey.enabled', "Show a one-time feedback survey after switching from Copilot to Local."),
		default: false,
		tags: ['experimental'],
		experiment: { mode: 'auto' },
	},
	[ChatConfiguration.AgentsHandoffTipDelaySeconds]: {
		type: 'number',
		minimum: 0,
		default: DEFAULT_AGENTS_HANDOFF_TIP_DELAY_SECONDS,
		markdownDescription: nls.localize('chat.agentsHandoffTip.delaySeconds', "Controls the delay, in seconds, after the latest user message before offering to continue an in-progress session in the Agents Window. Requires `#chat.agentsHandoffTip.mode#` to be `default` or `custom`."),
		tags: ['experimental', 'advanced'],
		experiment: { mode: 'auto' },
		deprecationMessage: nls.localize('chat.agentsHandoffTip.delayDeprecated', "Agents Window invitation delays are now controlled independently for each scenario."),
	},
} satisfies Record<string, IConfigurationPropertySchema>;

for (const key of [ChatConfiguration.AgentsParallelWorkBannerEnabled, ChatConfiguration.AgentsHandoffTipMode]) {
	Registry.as<IConfigurationMigrationRegistry>(WorkbenchConfigurationExtensions.ConfigurationMigration).registerConfigurationMigrations([{
		key,
		includeApplication: true,
		migrateFn: (value, accessor) => {
			if (value === undefined) {
				return [];
			}
			const pairs: ConfigurationKeyValuePairs = [[key, { value: undefined }]];
			if (accessor(ChatConfiguration.AgentsWindowBannerEnabled) === undefined) {
				const parallel = key === ChatConfiguration.AgentsParallelWorkBannerEnabled ? value : accessor(ChatConfiguration.AgentsParallelWorkBannerEnabled);
				const handoff = key === ChatConfiguration.AgentsHandoffTipMode ? value : accessor(ChatConfiguration.AgentsHandoffTipMode);
				pairs.push([ChatConfiguration.AgentsWindowBannerEnabled, { value: parallel !== false && handoff !== 'hidden' }]);
			}
			return pairs;
		},
	}]);
}

Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).registerConfiguration({
	id: 'chat',
	properties: {
		[ChatConfiguration.UnifiedWorkspacePicker]: {
			type: 'boolean',
			default: true,
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
			markdownDescription: nls.localize('autoMarkAsDoneMergedSessions.description', "Controls the number of inactive days before agent sessions with a merged pull request are automatically marked as done. Marking a session as done safely removes its eligible worktree. Permanent deletion is controlled separately by {0}. Set to 0 to disable automatically marking sessions as done. The recommended value is 15.", '`#chat.agentSessions.autoDeleteMarkedAsDoneMergedSessionsAfterDays#`'),
			agentHost: { key: AgentHostAutoArchiveMergedSessionsAfterDaysConfigKey },
		},
		[ChatConfiguration.AutoDeleteMarkedAsDoneMergedSessionsAfterDays]: {
			type: 'integer',
			minimum: 0,
			default: 0,
			scope: ConfigurationScope.APPLICATION,
			tags: ['preview', AGENT_SESSION_CLEANUP_SETTINGS_TAG],
			markdownDescription: nls.localize('autoDeleteMarkedAsDoneMergedSessions.description', "Controls the number of days after being automatically marked as done before agent sessions with a merged pull request are permanently deleted. Retained eligible worktrees are safely removed before deletion. Automatically marking sessions as done is controlled separately by {0}. Set to 0 to disable permanent deletion. The recommended value is 15.", '`#chat.agentSessions.autoMarkAsDoneMergedSessionsAfterDays#`'),
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
}, {
	key: legacyAutoDeleteArchivedMergedSessionsAfterDaysSetting,
	includeApplication: true,
	migrateFn: (value, accessor) => {
		const pairs: ConfigurationKeyValuePairs = [[legacyAutoDeleteArchivedMergedSessionsAfterDaysSetting, { value: undefined }]];
		if (accessor(ChatConfiguration.AutoDeleteMarkedAsDoneMergedSessionsAfterDays) === undefined) {
			pairs.push([ChatConfiguration.AutoDeleteMarkedAsDoneMergedSessionsAfterDays, { value }]);
		}
		return pairs;
	},
}]);
