/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../../workbench/common/contributions.js';
import { IInstantiationService, ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { Disposable, IDisposable } from '../../../../../base/common/lifecycle.js';
import { LocalChatSessionsProvider, LOCAL_PROVIDER_ID, LOCAL_SESSION_ENABLED_SETTING } from './localChatSessionsProvider.js';
import { ISessionsProvidersService } from '../../../../services/sessions/browser/sessionsProvidersService.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { IConfigurationRegistry, Extensions as ConfigurationExtensions } from '../../../../../platform/configuration/common/configurationRegistry.js';
import { localize, localize2 } from '../../../../../nls.js';
import { ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { ForkConversationAction } from '../../../../../workbench/contrib/chat/browser/actions/chatForkActions.js';
import { Action2, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { URI } from '../../../../../base/common/uri.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { raceTimeout } from '../../../../../base/common/async.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { ChatSessionProviderIdContext } from '../../../../common/contextkeys.js';
import { ISession } from '../../../../services/sessions/common/session.js';
import { confirmAndDeleteSessions } from '../../../sessions/browser/deleteSessionHelper.js';
import { SessionItemContextMenuId } from '../../../sessions/browser/views/sessionsList.js';

Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).registerConfiguration({
	id: 'sessions',
	properties: {
		[LOCAL_SESSION_ENABLED_SETTING]: {
			type: 'boolean',
			default: true,
			tags: ['experimental'],
			experiment: { mode: 'startup' },
			description: localize('sessions.chat.localAgent.enabled', "Enable Local VS Code chat sessions in the Agents Window. Reload the window for changes to take effect."),
		},
	},
});

class LocalSessionsProviderContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'sessions.localSessionsProvider';

	constructor(
		@IInstantiationService instantiationService: IInstantiationService,
		@ISessionsProvidersService sessionsProvidersService: ISessionsProvidersService,
		@IConfigurationService configurationService: IConfigurationService,
	) {
		super();

		// Only register the provider when enabled. The setting is read once
		// at startup; toggling it requires a window reload.
		if (!configurationService.getValue<boolean>(LOCAL_SESSION_ENABLED_SETTING)) {
			return;
		}

		const provider = this._register(instantiationService.createInstance(LocalChatSessionsProvider));
		this._register(sessionsProvidersService.registerProvider(provider));
	}
}

registerWorkbenchContribution2(LocalSessionsProviderContribution.ID, LocalSessionsProviderContribution, WorkbenchPhase.AfterRestored);

registerAction2(class extends ForkConversationAction {
	protected override _openForkedSession(instantiationService: IInstantiationService, parentSessionResource: URI, forkedSessionResource: URI): Promise<void> {
		return instantiationService.invokeFunction(async accessor => {
			const sessionsManagementService = accessor.get(ISessionsManagementService);
			const sessionsService = accessor.get(ISessionsService);
			const logService = accessor.get(ILogService);

			const parentSession = sessionsManagementService.getSession(parentSessionResource);
			if (!parentSession) {
				logService.error(`Parent session ${parentSessionResource.toString()} not found when forking conversation`);
				return super._openForkedSession(instantiationService, parentSessionResource, forkedSessionResource);
			}

			// Wait for the forked session to appear, but bound the wait so a
			// missing session does not hang forever. Applies to local and
			// contributed (agent-host) sessions alike — both surface via
			// `sessionsManagementService` in the Agents window.
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
			await sessionsService.openSession(forkedSessionResource);

		});
	}
});

registerAction2(class DeleteLocalSessionAction extends Action2 {
	constructor() {
		super({
			id: 'sessionsViewPane.local.deleteSession',
			title: localize2('deleteLocalSession', "Delete..."),
			menu: [{
				id: SessionItemContextMenuId,
				group: '1_edit',
				order: 4,
				when: ContextKeyExpr.equals(ChatSessionProviderIdContext.key, LOCAL_PROVIDER_ID),
			}]
		});
	}

	run(accessor: ServicesAccessor, context?: ISession | ISession[]): Promise<void> {
		return confirmAndDeleteSessions(accessor, context);
	}
});

