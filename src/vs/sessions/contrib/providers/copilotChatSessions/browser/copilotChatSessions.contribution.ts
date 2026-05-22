/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../../workbench/common/contributions.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { Disposable, IDisposable } from '../../../../../base/common/lifecycle.js';
import { CopilotChatSessionsProvider, COPILOT_MULTI_CHAT_SETTING, CLAUDE_CODE_ENABLED_SETTING, LOCAL_SESSION_ENABLED_SETTING, LocalSessionType } from '../../copilotChatSessions/browser/copilotChatSessionsProvider.js';
import '../../copilotChatSessions/browser/copilotChatSessionsActions.js';
import { ISessionsProvidersService } from '../../../../services/sessions/browser/sessionsProvidersService.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { IConfigurationRegistry, Extensions as ConfigurationExtensions } from '../../../../../platform/configuration/common/configurationRegistry.js';
import { localize } from '../../../../../nls.js';
import { ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { ForkConversationAction } from '../../../../../workbench/contrib/chat/browser/actions/chatForkActions.js';
import { registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { URI } from '../../../../../base/common/uri.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { raceTimeout } from '../../../../../base/common/async.js';

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
			default: true,
			experiment: { mode: 'startup' },
			description: localize('sessions.chat.claudeAgent.enabled', "Enable Claude Agent sessions in the Agents window. Start and resume agentic coding sessions powered by Anthropic's Claude Agent SDK directly. Uses your existing Copilot subscription."),
		},
		[LOCAL_SESSION_ENABLED_SETTING]: {
			type: 'boolean',
			default: true,
			tags: ['experimental'],
			experiment: { mode: 'startup' },
			description: localize('sessions.chat.localAgent.enabled', "Enable Local VS Code chat sessions in the Agents Window."),
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

registerAction2(class extends ForkConversationAction {
	protected override _openForkedSession(instantiationService: IInstantiationService, parentSessionResource: URI, forkedSessionResource: URI): Promise<void> {
		return instantiationService.invokeFunction(async accessor => {
			const sessionsManagementService = accessor.get(ISessionsManagementService);
			const logService = accessor.get(ILogService);

			const parentSession = sessionsManagementService.getSession(parentSessionResource);
			if (!parentSession) {
				logService.error(`Parent session ${parentSessionResource.toString()} not found when forking conversation`);
				return super._openForkedSession(instantiationService, parentSessionResource, forkedSessionResource);
			}

			if (parentSession.sessionType !== LocalSessionType.id) {
				return super._openForkedSession(instantiationService, parentSessionResource, forkedSessionResource);
			}

			// Local sessions — wait for the forked session to appear, but
			// bound the wait so a missing session does not hang forever.
			if (!sessionsManagementService.getSession(forkedSessionResource)) {
				let listener: IDisposable | undefined;
				const appeared = await raceTimeout(new Promise<boolean>(resolve => {
					listener = sessionsManagementService.onDidChangeSessions(() => {
						if (sessionsManagementService.getSession(forkedSessionResource)) {
							resolve(true);
						}
					});
				}), 30_000);
				listener?.dispose();

				if (!appeared) {
					logService.error(`Forked session ${forkedSessionResource.toString()} did not appear within timeout`);
					return;
				}
			}
			await sessionsManagementService.openSession(forkedSessionResource);

		});
	}
});
