/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../base/common/codicons.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { localize } from '../../../../nls.js';
import { IActionViewItemService, type IActionViewItemFactory } from '../../../../platform/actions/browser/actionViewItemService.js';
import { Action2, MenuRegistry, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { toAction } from '../../../../base/common/actions.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { OPEN_REMOTES_EDITOR_COMMAND_ID } from '../../../common/sessionCommands.js';
import { ENVIRONMENT_PICKER_MANAGE_REMOTES_SETTING, ENVIRONMENT_PICKER_SETTING } from '../../chat/common/constants.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../workbench/common/contributions.js';
import { IsAuxiliaryWindowContext, IsSessionsWindowContext } from '../../../../workbench/common/contextkeys.js';
import { ChatContextKeys } from '../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { RemoteAgentHostsEnabledSettingId, ToggleRemoteConnectionsCommandId } from '../../../../platform/agentHost/common/remoteAgentHostService.js';
import { IRemoteTunnelService } from '../../../../platform/remoteTunnel/common/remoteTunnel.js';
import { RemoteConnectionsActionViewItem } from '../../../../workbench/contrib/chat/electron-browser/toggleRemoteConnectionsActionViewItem.js';
import { executeToggleRemoteConnections, TUNNEL_HOST_SHARING_KEY } from '../../../../workbench/contrib/chat/electron-browser/tunnelHost.contribution.js';
import { Menus } from '../../../browser/menus.js';

export const TOGGLE_SHARING_FROM_AGENTS_ID = ToggleRemoteConnectionsCommandId;

export class SessionsTunnelHostTitlebarContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.sessionsTunnelHostTitlebar';

	constructor(
		@IRemoteTunnelService remoteTunnelService: IRemoteTunnelService,
		@IActionViewItemService actionViewItemService: IActionViewItemService,
		@ICommandService commandService: ICommandService,
		@IConfigurationService configurationService: IConfigurationService,
	) {
		super();

		this._register(MenuRegistry.appendMenuItem(Menus.TitleBarRightLayout, {
			command: {
				id: TOGGLE_SHARING_FROM_AGENTS_ID,
				title: localize('turnOnRemoteConnections', "Turn On Remote Connections"),
				icon: Codicon.radioTower,
				precondition: ChatContextKeys.enabled,
				toggled: {
					condition: ContextKeyExpr.equals(TUNNEL_HOST_SHARING_KEY, true),
					title: localize('turnOffRemoteConnections', "Turn Off Remote Connections"),
				},
			},
			group: 'navigation',
			order: 90,
			when: ContextKeyExpr.and(ChatContextKeys.enabled, IsSessionsWindowContext, IsAuxiliaryWindowContext.toNegated())
		}));
		this._register(registerAction2(class ToggleRemoteConnectionsFromAgentsAction extends Action2 {
			constructor() {
				super({
					id: TOGGLE_SHARING_FROM_AGENTS_ID,
					title: localize('turnOnRemoteConnections', "Turn On Remote Connections"),
					icon: Codicon.radioTower,
					toggled: {
						condition: ContextKeyExpr.equals(TUNNEL_HOST_SHARING_KEY, true),
						title: localize('turnOffRemoteConnections', "Turn Off Remote Connections"),
					},
				});
			}

			async run(accessor: ServicesAccessor): Promise<void> {
				await executeToggleRemoteConnections(
					accessor,
					{ authenticationProviderId: 'github', showServiceOption: false, showSuccessNotification: false },
				);
			}
		}));

		const viewItemFactory: IActionViewItemFactory = (action, _options, instantiationService) => {
			const enabled = configurationService.getValue<boolean>(ENVIRONMENT_PICKER_MANAGE_REMOTES_SETTING)
				&& configurationService.getValue<boolean>(ENVIRONMENT_PICKER_SETTING)
				&& configurationService.getValue<boolean>(RemoteAgentHostsEnabledSettingId);
			return instantiationService.createInstance(RemoteConnectionsActionViewItem, action, false, {
				managementAction: enabled ? toAction({
					id: OPEN_REMOTES_EDITOR_COMMAND_ID,
					label: localize('manageRemoteEnvironments', "Manage Remote Environments..."),
					run: () => commandService.executeCommand(OPEN_REMOTES_EDITOR_COMMAND_ID),
				}) : undefined,
			});
		};
		this._register(actionViewItemService.register(Menus.TitleBarRightLayout, TOGGLE_SHARING_FROM_AGENTS_ID, viewItemFactory, remoteTunnelService.onDidChangeTunnelStatus));
	}
}

// Remote Tunnel registers its delegated commands during the restored phase.
registerWorkbenchContribution2(SessionsTunnelHostTitlebarContribution.ID, SessionsTunnelHostTitlebarContribution, WorkbenchPhase.Eventually);
