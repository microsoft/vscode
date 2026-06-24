/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../base/common/codicons.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { localize, localize2 } from '../../../../nls.js';
import { IActionViewItemService, type IActionViewItemFactory } from '../../../../platform/actions/browser/actionViewItemService.js';
import { Action2, MenuId, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ConfigurationScope, Extensions as ConfigurationExtensions, IConfigurationRegistry } from '../../../../platform/configuration/common/configurationRegistry.js';
import { ContextKeyExpr, IContextKey, IContextKeyService, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { INotificationService, Severity } from '../../../../platform/notification/common/notification.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { IsSessionsWindowContext, RemoteNameContext } from '../../../common/contextkeys.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../common/contributions.js';
import { IOutputService } from '../../../services/output/common/output.js';
import { ChatContextKeyExprs, ChatContextKeys } from '../common/actions/chatContextKeys.js';
import { ITunnelHostService } from '../common/tunnelHost.js';
import { CONFIGURATION_KEY_MICROSOFT_AUTH, SHOW_TUNNEL_HOST_OUTPUT_ID, TunnelHostService } from './tunnelHostService.js';
import { TUNNEL_HOST_LOG_ID } from '../../../../platform/agentHost/common/tunnelAgentHost.js';
import { ToggleRemoteConnectionsActionViewItem } from './toggleRemoteConnectionsActionViewItem.js';

export const TUNNEL_HOST_SHARING_KEY = 'tunnelHostSharing';
export const TUNNEL_HOST_SHARING_CONTEXT = new RawContextKey<boolean>(TUNNEL_HOST_SHARING_KEY, false);
export const TOGGLE_SHARING_ID = 'sessions.tunnelHost.toggleSharing';

const CATEGORY = localize2('tunnelHost.category', 'Remote Connections');

registerSingleton(ITunnelHostService, TunnelHostService, InstantiationType.Delayed);

class TunnelHostContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.tunnelHost';

	private readonly _sharingContext: IContextKey<boolean>;

	constructor(
		@IContextKeyService contextKeyService: IContextKeyService,
		@ITunnelHostService tunnelHostService: ITunnelHostService,
		@IActionViewItemService actionViewItemService: IActionViewItemService,
	) {
		super();

		this._sharingContext = TUNNEL_HOST_SHARING_CONTEXT.bindTo(contextKeyService);
		this._sharingContext.set(tunnelHostService.isSharing);

		this._register(tunnelHostService.onDidChangeStatus(() => {
			this._sharingContext.set(tunnelHostService.isSharing);
		}));

		const viewItemFactory: IActionViewItemFactory = (action, _options, instantiationService) => {
			return instantiationService.createInstance(ToggleRemoteConnectionsActionViewItem, action);
		};
		this._register(actionViewItemService.register(MenuId.ChatInputSecondary, TOGGLE_SHARING_ID, viewItemFactory, tunnelHostService.onDidChangeStatus));
	}
}

registerAction2(class ToggleRemoteConnectionsAction extends Action2 {
	constructor() {
		super({
			id: TOGGLE_SHARING_ID,
			title: localize2('toggleSharing', "Allow Remote Connections"),
			category: CATEGORY,
			icon: Codicon.radioTower,
			toggled: ContextKeyExpr.equals(TUNNEL_HOST_SHARING_KEY, true),
			menu: {
				id: MenuId.ChatInputSecondary,
				order: 10,
				group: 'navigation',
				when: ContextKeyExpr.and(
					ChatContextKeys.enabled,
					IsSessionsWindowContext.toNegated(),
					RemoteNameContext.isEqualTo(''),
					ChatContextKeyExprs.isAgentHostSession,
				)
			}
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const tunnelHostService = accessor.get(ITunnelHostService);
		const notificationService = accessor.get(INotificationService);

		try {
			if (tunnelHostService.isSharing) {
				await tunnelHostService.stopSharing();
			} else {
				await tunnelHostService.startSharing();
			}
		} catch (err) {
			notificationService.notify({
				severity: Severity.Error,
				message: localize('tunnelHost.error', "Failed to toggle remote connections: {0}", String(err)),
			});
		}
	}
});

registerAction2(class ShowTunnelHostOutputAction extends Action2 {
	constructor() {
		super({
			id: SHOW_TUNNEL_HOST_OUTPUT_ID,
			title: localize2('showTunnelHostOutput', "Show Remote Connections Output"),
			category: CATEGORY,
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const outputService = accessor.get(IOutputService);
		await outputService.showChannel(TUNNEL_HOST_LOG_ID);
	}
});

registerWorkbenchContribution2(TunnelHostContribution.ID, TunnelHostContribution, WorkbenchPhase.AfterRestored);

Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).registerConfiguration({
	type: 'object',
	properties: {
		[CONFIGURATION_KEY_MICROSOFT_AUTH]: {
			description: localize('tunnelHost.enableMicrosoftAuth', "Enable Microsoft account authentication for agent host tunnels. When disabled, only GitHub authentication is used."),
			type: 'boolean',
			scope: ConfigurationScope.APPLICATION,
			default: false,
			tags: ['usesOnlineServices'],
		},
	}
});
