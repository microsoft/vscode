/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableMap, DisposableStore, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { autorun } from '../../../../../base/common/observable.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../../workbench/common/contributions.js';
import { AgentHostContribution } from '../../../../../workbench/contrib/chat/browser/agentSessions/agentHost/agentHostChatContribution.js';
import { IAgentHostSessionWorkingDirectoryResolver } from '../../../../../workbench/contrib/chat/browser/agentSessions/agentHost/agentHostSessionWorkingDirectoryResolver.js';
import { AgentHostTerminalContribution } from '../../../../../workbench/contrib/chat/browser/agentSessions/agentHost/agentHostTerminalContribution.js';
import { AgentHostCopilotCliSettingsContribution } from '../../../../../workbench/contrib/chat/browser/agentSessions/agentHost/agentHostCopilotCliSettingsContribution.js';
import { AgentHostAllowSignedOutWhenUsableContribution } from '../../../../../workbench/contrib/chat/browser/agentSessions/agentHost/agentHostAllowSignedOutWhenUsableContribution.js';
import { AgentHostSdkSetupNotificationContribution } from '../../../../../workbench/contrib/chat/browser/agentSessions/agentHost/agentHostSdkSetupNotification.js';
import { AgentHostSignedOutModelsNotificationContribution } from '../../../../../workbench/contrib/chat/browser/agentSessions/agentHost/agentHostSignedOutModelsNotification.js';
import { ISessionsProvidersService } from '../../../../services/sessions/browser/sessionsProvidersService.js';
import { SessionStatus } from '../../../../services/sessions/common/session.js';
import { IAgentHostEnablementService } from '../../../../../platform/agentHost/common/agentHostEnablementService.js';
import { LocalAgentHostSessionsProvider } from './localAgentHostSessionsProvider.js';
import './codexCustomizationSettings.contribution.js';

/**
 * Registers the {@link LocalAgentHostSessionsProvider} when the Agent Host is
 * available in this runtime.
 *
 * {@link AgentHostContribution} handles all the heavy lifting — agent discovery,
 * session handler registration, language model providers, customization harness —
 * via {@link IChatSessionsService}. This contribution only bridges the session
 * listing and lifecycle to the {@link ISessionsProvidersService} layer used by
 * the Sessions app's UI.
 */
class LocalAgentHostContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'sessions.contrib.localAgentHostContribution';

	constructor(
		@IAgentHostEnablementService agentHostEnablementService: IAgentHostEnablementService,
		@IInstantiationService instantiationService: IInstantiationService,
		@ISessionsProvidersService sessionsProvidersService: ISessionsProvidersService,
		@IAgentHostSessionWorkingDirectoryResolver workingDirectoryResolver: IAgentHostSessionWorkingDirectoryResolver,
	) {
		super();

		const registration = this._register(new MutableDisposable<DisposableStore>());
		const initialize = () => {
			if (registration.value) {
				return;
			}
			const store = new DisposableStore();
			const provider = store.add(instantiationService.createInstance(LocalAgentHostSessionsProvider));
			store.add(sessionsProvidersService.registerProvider(provider));

			const resolverRegistrations = store.add(new DisposableMap<string>());
			const registerResolvers = () => {
				const sessionTypeIds = new Set(provider.sessionTypes.map(sessionType => `agent-host-${sessionType.id}`));
				for (const [sessionTypeId] of resolverRegistrations) {
					if (!sessionTypeIds.has(sessionTypeId)) {
						resolverRegistrations.deleteAndDispose(sessionTypeId);
					}
				}

				for (const sessionType of provider.sessionTypes) {
					const resourceScheme = `agent-host-${sessionType.id}`;
					if (resolverRegistrations.has(resourceScheme)) {
						continue;
					}
					resolverRegistrations.set(resourceScheme, workingDirectoryResolver.registerResolver(resourceScheme, sessionResource => {
						return provider.getSessionByResource(sessionResource)?.workspace.get()?.folders[0]?.workingDirectory;
					}, sessionResource => {
						return provider.getSessionByResource(sessionResource)?.status.get() === SessionStatus.Untitled;
					}));
				}
			};
			registerResolvers();
			store.add(provider.onDidChangeSessionTypes(registerResolvers));
			registration.value = store;
		};

		this._register(autorun(reader => {
			if (agentHostEnablementService.enabled.read(reader)) {
				initialize();
			} else {
				registration.clear();
			}
		}));
	}
}

registerWorkbenchContribution2(AgentHostContribution.ID, AgentHostContribution, WorkbenchPhase.AfterRestored);
registerWorkbenchContribution2(AgentHostTerminalContribution.ID, AgentHostTerminalContribution, WorkbenchPhase.AfterRestored);
// Forwards the `chat.agentHost.copilot.*` settings into the host's root config. Without it those
// gates never reach the host here, so features like the Auto routing-profile picker stay off.
registerWorkbenchContribution2(AgentHostCopilotCliSettingsContribution.ID, AgentHostCopilotCliSettingsContribution, WorkbenchPhase.AfterRestored);
registerWorkbenchContribution2(AgentHostAllowSignedOutWhenUsableContribution.ID, AgentHostAllowSignedOutWhenUsableContribution, WorkbenchPhase.AfterRestored);
registerWorkbenchContribution2(AgentHostSignedOutModelsNotificationContribution.ID, AgentHostSignedOutModelsNotificationContribution, WorkbenchPhase.AfterRestored);
registerWorkbenchContribution2(AgentHostSdkSetupNotificationContribution.ID, AgentHostSdkSetupNotificationContribution, WorkbenchPhase.AfterRestored);
registerWorkbenchContribution2(LocalAgentHostContribution.ID, LocalAgentHostContribution, WorkbenchPhase.AfterRestored);
