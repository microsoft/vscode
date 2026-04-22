/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../workbench/common/contributions.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { CopilotChatSessionsProvider, COPILOT_MULTI_CHAT_SETTING, CLAUDE_CODE_ENABLED_SETTING } from '../../copilotChatSessions/browser/copilotChatSessionsProvider.js';
import '../../copilotChatSessions/browser/copilotChatSessionsActions.js';
import { ISessionsProvidersService } from '../../../services/sessions/browser/sessionsProvidersService.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { IConfigurationRegistry, Extensions as ConfigurationExtensions } from '../../../../platform/configuration/common/configurationRegistry.js';
import { localize } from '../../../../nls.js';

Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).registerConfiguration({
	id: 'sessions',
	properties: {
		[COPILOT_MULTI_CHAT_SETTING]: {
			type: 'boolean',
			default: true,
			tags: ['preview'],
			description: localize('sessions.github.copilot.multiChatSessions', "Whether to enable multiple chats within a single session in the Copilot Chat sessions provider."),
		},
		[CLAUDE_CODE_ENABLED_SETTING]: {
			type: 'boolean',
			default: false,
			tags: ['experimental', 'onExp'],
			description: localize('sessions.chatSessions.claude.enabled', "NOTE: This is HIGHLY experimental and under active development! Whether to enable Claude agent sessions in the sessions provider."),
		},
	},
});

/**
 * Registers the {@link CopilotChatSessionsProvider} as a sessions provider.
 *
 * Coexists with the local agent host provider when `chat.agentHost.enabled`
 * is true. The two providers list disjoint sets of sessions:
 * - The local agent host filters via the per-session Agent Host SQLite DB
 *   (database-existence ownership gate in `CopilotAgent.listSessions`).
 * - This provider's underlying extension service filters via the per-session
 *   metadata file's `origin` field, which the local agent host never writes.
 */
class DefaultSessionsProviderContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'sessions.defaultSessionsProvider';

	constructor(
		@IInstantiationService instantiationService: IInstantiationService,
		@ISessionsProvidersService sessionsProvidersService: ISessionsProvidersService,
	) {
		super();

		const provider = this._register(instantiationService.createInstance(CopilotChatSessionsProvider));
		this._register(sessionsProvidersService.registerProvider(provider));
	}
}

registerWorkbenchContribution2(DefaultSessionsProviderContribution.ID, DefaultSessionsProviderContribution, WorkbenchPhase.AfterRestored);
