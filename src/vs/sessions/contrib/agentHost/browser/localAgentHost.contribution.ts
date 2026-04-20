/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableMap } from '../../../../base/common/lifecycle.js';
import { AgentHostEnabledSettingId } from '../../../../platform/agentHost/common/agentService.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../workbench/common/contributions.js';
import { IAgentHostSessionWorkingDirectoryResolver } from '../../../../workbench/contrib/chat/browser/agentSessions/agentHost/agentHostSessionWorkingDirectoryResolver.js';
import { ISessionsProvidersService } from '../../../services/sessions/browser/sessionsProvidersService.js';
import { LocalAgentHostSessionsProvider } from './localAgentHostSessionsProvider.js';

/**
 * Registers the {@link LocalAgentHostSessionsProvider} as a sessions provider
 * when `chat.agentHost.enabled` is true.
 *
 * The existing {@link AgentHostContribution} (from `chat/electron-browser/chat.contribution.js`)
 * handles all the heavy lifting — agent discovery, session handler registration,
 * language model providers, customization harness — via {@link IChatSessionsService}.
 * This contribution only bridges the session listing and lifecycle to the
 * {@link ISessionsProvidersService} layer used by the Sessions app's UI.
 */
class LocalAgentHostContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'sessions.contrib.localAgentHostContribution';

	constructor(
		@IConfigurationService configurationService: IConfigurationService,
		@IInstantiationService instantiationService: IInstantiationService,
		@ISessionsProvidersService sessionsProvidersService: ISessionsProvidersService,
		@IAgentHostSessionWorkingDirectoryResolver workingDirectoryResolver: IAgentHostSessionWorkingDirectoryResolver,
	) {
		super();

		if (!configurationService.getValue<boolean>(AgentHostEnabledSettingId)) {
			return;
		}

		const provider = this._register(instantiationService.createInstance(LocalAgentHostSessionsProvider));
		this._register(sessionsProvidersService.registerProvider(provider));

		const resolverRegistrations = this._register(new DisposableMap<string>());
		const registerResolvers = () => {
			const sessionTypeIds = new Set(provider.sessionTypes.map(sessionType => sessionType.id));
			for (const [sessionTypeId] of resolverRegistrations) {
				if (!sessionTypeIds.has(sessionTypeId)) {
					resolverRegistrations.deleteAndDispose(sessionTypeId);
				}
			}

			for (const sessionType of provider.sessionTypes) {
				if (resolverRegistrations.has(sessionType.id)) {
					continue;
				}
				resolverRegistrations.set(sessionType.id, workingDirectoryResolver.registerResolver(sessionType.id, sessionResource => {
					const repository = provider.getSessionByResource(sessionResource)?.workspace.get()?.repositories[0];
					return repository?.workingDirectory ?? repository?.uri;
				}));
			}
		};
		registerResolvers();
		this._register(provider.onDidChangeSessionTypes(registerResolvers));
	}
}

registerWorkbenchContribution2(LocalAgentHostContribution.ID, LocalAgentHostContribution, WorkbenchPhase.AfterRestored);
