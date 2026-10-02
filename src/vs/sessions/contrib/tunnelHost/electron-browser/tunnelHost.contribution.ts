/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../base/common/codicons.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { localize } from '../../../../nls.js';
import { IActionViewItemService, type IActionViewItemFactory } from '../../../../platform/actions/browser/actionViewItemService.js';
import { Action2, MenuRegistry, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../workbench/common/contributions.js';
import { IsAuxiliaryWindowContext, IsSessionsWindowContext } from '../../../../workbench/common/contextkeys.js';
import { ChatContextKeys } from '../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { IRemoteTunnelService } from '../../../../platform/remoteTunnel/common/remoteTunnel.js';
import { ToggleRemoteConnectionsActionViewItem } from '../../../../workbench/contrib/chat/electron-browser/toggleRemoteConnectionsActionViewItem.js';
import { executeToggleRemoteConnections, TUNNEL_HOST_SHARING_KEY } from '../../../../workbench/contrib/chat/electron-browser/tunnelHost.contribution.js';
import { Menus } from '../../../browser/menus.js';

export const TOGGLE_SHARING_FROM_AGENTS_ID = 'sessions.tunnelHost.toggleSharingFromAgents';

export class SessionsTunnelHostTitlebarContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.sessionsTunnelHostTitlebar';

	constructor(
		@IRemoteTunnelService remoteTunnelService: IRemoteTunnelService,
		@IActionViewItemService actionViewItemService: IActionViewItemService,
	) {
		super();

		this._register(MenuRegistry.appendMenuItem(Menus.TitleBarRightLayout, {
			command: {
				id: TOGGLE_SHARING_FROM_AGENTS_ID,
				title: localize('toggleSharing', "Allow Remote Connections"),
				icon: Codicon.radioTower,
				toggled: ContextKeyExpr.equals(TUNNEL_HOST_SHARING_KEY, true),
			},
			group: 'navigation',
			order: 90,
			when: ContextKeyExpr.and(ChatContextKeys.enabled, IsSessionsWindowContext, IsAuxiliaryWindowContext.toNegated())
		}));

		this._register(registerAction2(class ToggleRemoteConnectionsFromAgentsAction extends Action2 {
			constructor() {
				super({
					id: TOGGLE_SHARING_FROM_AGENTS_ID,
					title: localize('toggleSharing', "Allow Remote Connections"),
					icon: Codicon.radioTower,
					toggled: ContextKeyExpr.equals(TUNNEL_HOST_SHARING_KEY, true),
				});
			}

			async run(accessor: ServicesAccessor): Promise<void> {
				await executeToggleRemoteConnections(
					accessor.get(IRemoteTunnelService),
					accessor.get(ICommandService),
					{ authenticationProviderId: 'github', showServiceOption: false, showSuccessNotification: false },
				);
			}
		}));

		const viewItemFactory: IActionViewItemFactory = (action, _options, instantiationService) => {
			return instantiationService.createInstance(ToggleRemoteConnectionsActionViewItem, action);
		};
		this._register(actionViewItemService.register(Menus.TitleBarRightLayout, TOGGLE_SHARING_FROM_AGENTS_ID, viewItemFactory, remoteTunnelService.onDidChangeTunnelStatus));
	}
}

// Remote Tunnel registers its delegated commands during the restored phase.
registerWorkbenchContribution2(SessionsTunnelHostTitlebarContribution.ID, SessionsTunnelHostTitlebarContribution, WorkbenchPhase.Eventually);
