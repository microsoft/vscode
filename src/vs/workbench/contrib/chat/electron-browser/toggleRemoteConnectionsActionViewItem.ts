/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/tunnelHost.css';
import * as dom from '../../../../base/browser/dom.js';
import { IManagedHover, IManagedHoverContent } from '../../../../base/browser/ui/hover/hover.js';
import { getDefaultHoverDelegate } from '../../../../base/browser/ui/hover/hoverDelegateFactory.js';
import { renderLabelWithIcons } from '../../../../base/browser/ui/iconLabel/iconLabels.js';
import { BaseActionViewItem } from '../../../../base/browser/ui/actionbar/actionViewItems.js';
import { disposableTimeout } from '../../../../base/common/async.js';
import { IAction } from '../../../../base/common/actions.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { MarkdownString } from '../../../../base/common/htmlContent.js';
import { localize } from '../../../../nls.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { IRemoteTunnelService, INACTIVE_TUNNEL_MODE, TunnelMode, TunnelStatus } from '../../../../platform/remoteTunnel/common/remoteTunnel.js';
import { RemoteTunnelCommandIds } from '../../remoteTunnel/electron-browser/remoteTunnel.contribution.js';

const TUNNEL_ACCESS_DOCS_URL = 'https://aka.ms/vscode-agent-tunnel-access';

export interface IRemoteTunnelAccessState {
	readonly isSharing: boolean;
	readonly isConnecting: boolean;
	readonly tunnelName: string | undefined;
}

export function getRemoteTunnelAccessState(mode: TunnelMode, status: TunnelStatus): IRemoteTunnelAccessState {
	return {
		isSharing: status.type === 'connected',
		isConnecting: status.type === 'connecting' || (mode.active && status.type === 'uninitialized'),
		tunnelName: status.type === 'connected' ? status.info.tunnelName : undefined,
	};
}

export class ToggleRemoteConnectionsActionViewItem extends BaseActionViewItem {

	private _iconElement: HTMLElement | undefined;
	private _toastElement: HTMLElement | undefined;
	private _hover: IManagedHover | undefined;
	private _wasSharing = false;
	private _mode: TunnelMode = INACTIVE_TUNNEL_MODE;
	private _status: TunnelStatus = { type: 'uninitialized' };
	private _hasReceivedMode = false;
	private _hasReceivedStatus = false;
	private _hasInitializedState = false;

	constructor(
		action: IAction,
		@IRemoteTunnelService private readonly _remoteTunnelService: IRemoteTunnelService,
		@IHoverService private readonly _hoverService: IHoverService,
		@IProductService private readonly _productService: IProductService,
	) {
		super(undefined, action);

		this._register(this._remoteTunnelService.onDidChangeTunnelStatus(status => {
			this._hasReceivedStatus = true;
			this._status = status;
			this._updateState();
		}));
		this._register(this._remoteTunnelService.onDidChangeMode(mode => {
			this._hasReceivedMode = true;
			this._mode = mode;
			this._updateState();
		}));
		void this._loadState();
	}

	override render(container: HTMLElement): void {
		super.render(container);

		if (!this.element) {
			return;
		}

		this.element.classList.add('tunnel-host-toggle');
		this.element.tabIndex = 0;
		this.element.role = 'button';

		this._iconElement = dom.append(this.element, dom.$('span.tunnel-host-icon'));
		this._iconElement.append(...renderLabelWithIcons(`$(${Codicon.radioTower.id})`));

		this._toastElement = dom.append(this.element, dom.$('span.tunnel-host-toast'));

		const hoverDelegate = getDefaultHoverDelegate('element');
		this._hover = this._register(this._hoverService.setupManagedHover(
			hoverDelegate, this.element, this._getHoverContent()
		));

		this._updateState();
	}

	private _updateState(): void {
		if (!this.element) {
			return;
		}

		const state = getRemoteTunnelAccessState(this._mode, this._status);

		this.element.classList.toggle('sharing', state.isSharing);
		this.element.classList.toggle('connecting', state.isConnecting);
		this._hover?.update(this._getHoverContent());
		this.element.setAttribute('aria-label', this._getAriaLabel());
		this.element.setAttribute('aria-pressed', String(state.isSharing));

		if (this._hasInitializedState) {
			if (state.isSharing && !this._wasSharing && !state.isConnecting) {
				this._showToast();
			} else if (!state.isSharing && this._wasSharing) {
				this._hideToast();
			}
		}

		this._wasSharing = state.isSharing;
	}

	private async _loadState(): Promise<void> {
		const [mode, status] = await Promise.all([
			this._remoteTunnelService.getMode(),
			this._remoteTunnelService.getTunnelStatus(),
		]);
		if (!this._hasReceivedMode) {
			this._mode = mode;
		}
		if (!this._hasReceivedStatus) {
			this._status = status;
		}
		this._updateState();
		this._hasInitializedState = true;
	}

	private _showToast(): void {
		if (!this._toastElement) {
			return;
		}

		this._toastElement.textContent = localize('tunnelHost.toast', "Remote session access is now enabled");
		this._toastElement.classList.add('visible');

		disposableTimeout(() => {
			this._hideToast();
		}, 3000, this._store);
	}

	private _hideToast(): void {
		this._toastElement?.classList.remove('visible');
	}

	private _getHoverContent(): IManagedHoverContent {
		const lines: string[] = [];
		const state = getRemoteTunnelAccessState(this._mode, this._status);

		if (state.isConnecting) {
			lines.push(localize('tunnelHost.hover.connecting', "Establishing tunnel connection..."));
		} else if (state.isSharing) {
			lines.push(state.tunnelName
				? localize('tunnelHost.hover.sharing', "Remote Tunnel Access is enabled via tunnel '{0}'", state.tunnelName)
				: localize('tunnelHost.hover.enabled', "Remote Tunnel Access is enabled"));
		} else {
			const agentsUrl = this._productService.webUrl ? `${this._productService.webUrl.replace(/\/$/, '')}/agents` : undefined;
			lines.push(agentsUrl
				? localize('tunnelHost.hover.idle', "Allow connections from other machines and {0}", `[${agentsUrl.replace(/https?:\/\//, '')}](${agentsUrl})`)
				: localize('tunnelHost.hover.idle.noWebUrl', "Allow connections from other machines"));
		}

		lines.push(`[${localize('tunnelHost.hover.showOutput', "Show Output")}](command:${RemoteTunnelCommandIds.showLog}) | [${localize('tunnelHost.hover.renameTunnel', "Rename Tunnel")}](command:${RemoteTunnelCommandIds.rename}) | [${localize('tunnelHost.hover.learnMore', "Learn More")}](${TUNNEL_ACCESS_DOCS_URL})`);

		const md = new MarkdownString(lines.join('\n\n'), { isTrusted: { enabledCommands: [RemoteTunnelCommandIds.showLog, RemoteTunnelCommandIds.rename] } });
		return { markdown: md, markdownNotSupportedFallback: lines[0] };
	}

	private _getAriaLabel(): string {
		const state = getRemoteTunnelAccessState(this._mode, this._status);
		if (state.isConnecting) {
			return localize('tunnelHost.hover.connecting', "Establishing tunnel connection...");
		}
		if (state.isSharing) {
			return state.tunnelName
				? localize('tunnelHost.ariaLabel.remoteTunnelAccess', "Remote Tunnel Access is enabled via tunnel '{0}'", state.tunnelName)
				: localize('tunnelHost.hover.enabled', "Remote Tunnel Access is enabled");
		}
		const agentsUrl = this._productService.webUrl ? `${this._productService.webUrl.replace(/\/$/, '')}/agents` : undefined;
		return agentsUrl
			? localize('tunnelHost.hover.idle.ariaLabel', "Allow connections from other machines and {0}", agentsUrl.replace(/https?:\/\//, ''))
			: localize('tunnelHost.hover.idle.ariaLabel.noWebUrl', "Allow connections from other machines");
	}
}
