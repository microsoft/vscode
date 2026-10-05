/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../base/common/codicons.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { localize2 } from '../../../../nls.js';
import { IActionViewItemService, type IActionViewItemFactory } from '../../../../platform/actions/browser/actionViewItemService.js';
import { Action2, MenuId, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ContextKeyExpr, IContextKey, IContextKeyService, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
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

export async function executeToggleRemoteConnections(remoteTunnelService: IRemoteTunnelService, commandService: ICommandService, startOptions?: IRemoteTunnelStartOptions): Promise<void> {
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

class TunnelHostContribution extends Disposable implements IWorkbenchContribution {

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
	) {
		super();

		this._sharingContext = TUNNEL_HOST_SHARING_CONTEXT.bindTo(contextKeyService);
		this._register(this.remoteTunnelService.onDidChangeTunnelStatus(status => {
			this._hasReceivedStatus = true;
			this._status = status;
			this._updateSharingContext();
		}));
		this._register(this.remoteTunnelService.onDidChangeMode(mode => {
			this._hasReceivedMode = true;
			this._mode = mode;
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
		if (!this._hasReceivedMode) {
			this._mode = mode;
		}
		if (!this._hasReceivedStatus) {
			this._status = status;
		}
		this._updateSharingContext();
	}

	private _updateSharingContext(): void {
		this._sharingContext.set(getRemoteTunnelAccessState(this._mode, this._status).isSharing);
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
		await executeToggleRemoteConnections(accessor.get(IRemoteTunnelService), accessor.get(ICommandService));
	}
});

registerWorkbenchContribution2(TunnelHostContribution.ID, TunnelHostContribution, WorkbenchPhase.AfterRestored);
