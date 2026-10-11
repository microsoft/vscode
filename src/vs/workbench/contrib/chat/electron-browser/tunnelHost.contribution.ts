/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../base/common/codicons.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { autorun } from '../../../../base/common/observable.js';
import { localize2 } from '../../../../nls.js';
import { IActionViewItemService, type IActionViewItemFactory } from '../../../../platform/actions/browser/actionViewItemService.js';
import { Action2, MenuId, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ContextKeyExpr, IContextKey, IContextKeyService, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { AgentHostRemoteConnectionsBackend, AgentHostRemoteConnectionsSettingId, IMissionControlSharingService, isGitHubEnvironmentBackend } from '../../../../platform/agentHost/common/missionControlEnvironment.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { INACTIVE_TUNNEL_MODE, IRemoteTunnelService, TunnelMode, TunnelStatus } from '../../../../platform/remoteTunnel/common/remoteTunnel.js';
import { IsSessionsWindowContext, RemoteNameContext } from '../../../common/contextkeys.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../common/contributions.js';
import { ChatContextKeyExprs, ChatContextKeys } from '../common/actions/chatContextKeys.js';
import { IRemoteTunnelStartOptions, RemoteTunnelCommandIds } from '../../remoteTunnel/electron-browser/remoteTunnel.contribution.js';
import { getRemoteTunnelAccessState, ToggleRemoteConnectionsActionViewItem } from './toggleRemoteConnectionsActionViewItem.js';

export const TUNNEL_HOST_SHARING_KEY = 'tunnelHostSharing';
export const TUNNEL_HOST_SHARING_CONTEXT = new RawContextKey<boolean>(TUNNEL_HOST_SHARING_KEY, false);
export const TOGGLE_SHARING_ID = 'sessions.tunnelHost.toggleSharing';

const CATEGORY = localize2('tunnelHost.category', 'Remote Connections');

export async function executeToggleRemoteConnections(accessor: ServicesAccessor, startOptions?: IRemoteTunnelStartOptions): Promise<void> {
	const remoteTunnelService = accessor.get(IRemoteTunnelService);
	const configurationService = accessor.get(IConfigurationService);
	if (isGitHubEnvironmentBackend(configurationService.getValue<AgentHostRemoteConnectionsBackend>(AgentHostRemoteConnectionsSettingId))) {
		const sharingService = accessor.get(IMissionControlSharingService);
		const enabled = sharingService.state.get() !== 'disabled';
		if (!enabled) {
			await remoteTunnelService.stopTunnel();
		}
		await sharingService.setEnabled(!enabled);
		return;
	}
	const commandService = accessor.get(ICommandService);
	const [mode, status] = await Promise.all([
		remoteTunnelService.getMode(),
		remoteTunnelService.getTunnelStatus(),
	]);
	const state = getRemoteTunnelAccessState(mode, status);
	const command = state.isSharing || state.isConnecting ? RemoteTunnelCommandIds.turnOff : RemoteTunnelCommandIds.turnOn;
	if (command === RemoteTunnelCommandIds.turnOn && startOptions) {
		await commandService.executeCommand(command, startOptions);
	} else {
		await commandService.executeCommand(command);
	}
}

export class TunnelHostContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.tunnelHost';

	private readonly _sharingContext: IContextKey<boolean>;
	private _mode: TunnelMode = INACTIVE_TUNNEL_MODE;
	private _status: TunnelStatus = { type: 'uninitialized' };
	private _hasReceivedMode = false;
	private _hasReceivedStatus = false;

	constructor(
		@IContextKeyService contextKeyService: IContextKeyService,
		@IRemoteTunnelService private readonly remoteTunnelService: IRemoteTunnelService,
		@IActionViewItemService actionViewItemService: IActionViewItemService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IMissionControlSharingService private readonly missionControlSharingService: IMissionControlSharingService,
		@ILogService private readonly logService: ILogService,
		@INotificationService private readonly notificationService: INotificationService,
	) {
		super();

		this._sharingContext = TUNNEL_HOST_SHARING_CONTEXT.bindTo(contextKeyService);
		this._register(autorun(reader => {
			this.missionControlSharingService.state.read(reader);
			this._updateSharingContext();
		}));
		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(AgentHostRemoteConnectionsSettingId)) {
				this._stopDevTunnelSharing();
				this._updateSharingContext();
			}
		}));
		this._register(this.remoteTunnelService.onDidChangeTunnelStatus(status => {
			this._hasReceivedStatus = true;
			this._status = status;
			this._updateSharingContext();
		}));
		this._register(this.remoteTunnelService.onDidChangeMode(mode => {
			this._hasReceivedMode = true;
			this._mode = mode;
			this._enforceSharingBackend();
			this._updateSharingContext();
		}));

		const viewItemFactory: IActionViewItemFactory = (action, _options, instantiationService) => {
			return instantiationService.createInstance(ToggleRemoteConnectionsActionViewItem, action);
		};
		this._register(actionViewItemService.register(MenuId.ChatInputSecondary, TOGGLE_SHARING_ID, viewItemFactory, this.remoteTunnelService.onDidChangeTunnelStatus));
		void this._loadState();
	}

	private async _loadState(): Promise<void> {
		const [mode, status] = await Promise.all([
			this.remoteTunnelService.getMode(),
			this.remoteTunnelService.getTunnelStatus(),
		]);
		if (this._store.isDisposed) {
			return;
		}
		if (!this._hasReceivedMode) {
			this._mode = mode;
		}
		if (!this._hasReceivedStatus) {
			this._status = status;
		}
		this._enforceSharingBackend();
		this._updateSharingContext();
	}

	private _enforceSharingBackend(): void {
		if (this._mode.active && isGitHubEnvironmentBackend(this.configurationService.getValue<AgentHostRemoteConnectionsBackend>(AgentHostRemoteConnectionsSettingId))) {
			this._stopDevTunnelSharing();
		}
	}

	private _stopDevTunnelSharing(): void {
		void this.remoteTunnelService.stopTunnel().catch(error => {
			this.logService.error('Failed to stop Dev Tunnel sharing', error);
			this.notificationService.error(error);
		});
	}

	private _updateSharingContext(): void {
		this._sharingContext.set(isGitHubEnvironmentBackend(this.configurationService.getValue<AgentHostRemoteConnectionsBackend>(AgentHostRemoteConnectionsSettingId))
			? this.missionControlSharingService.state.get() === 'enabled'
			: getRemoteTunnelAccessState(this._mode, this._status).isSharing);
	}
}

registerAction2(class ToggleRemoteConnectionsAction extends Action2 {
	constructor() {
		super({
			id: TOGGLE_SHARING_ID,
			title: localize2('toggleSharing', "Allow Remote Connections"),
			category: CATEGORY,
			icon: Codicon.radioTower,
			precondition: ChatContextKeys.enabled,
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
		await executeToggleRemoteConnections(accessor);
	}
});

registerWorkbenchContribution2(TunnelHostContribution.ID, TunnelHostContribution, WorkbenchPhase.AfterRestored);
