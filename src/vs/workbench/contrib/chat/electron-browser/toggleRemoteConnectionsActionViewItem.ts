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
import { ITunnelHostService } from '../common/tunnelHost.js';
import { RENAME_TUNNEL_ID, SHOW_TUNNEL_HOST_OUTPUT_ID } from './tunnelHostService.js';

const TUNNEL_ACCESS_DOCS_URL = 'https://aka.ms/vscode-agent-tunnel-access';

export class ToggleRemoteConnectionsActionViewItem extends BaseActionViewItem {

	private _iconElement: HTMLElement | undefined;
	private _toastElement: HTMLElement | undefined;
	private _hover: IManagedHover | undefined;
	private _wasSharing = false;

	constructor(
		action: IAction,
		@ITunnelHostService private readonly _tunnelHostService: ITunnelHostService,
		@IHoverService private readonly _hoverService: IHoverService,
		@IProductService private readonly _productService: IProductService,
	) {
		super(undefined, action);

		this._wasSharing = this._tunnelHostService.isSharing;

		this._register(this._tunnelHostService.onDidChangeStatus(() => {
			this._updateState();
		}));
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

		const isSharing = this._tunnelHostService.isSharing;
		const isConnecting = this._tunnelHostService.isConnecting;

		this.element.classList.toggle('sharing', isSharing);
		this.element.classList.toggle('connecting', isConnecting);
		this._hover?.update(this._getHoverContent());
		this.element.setAttribute('aria-label', this._getAriaLabel());
		this.element.setAttribute('aria-pressed', String(isSharing));

		if (isSharing && !this._wasSharing && !isConnecting) {
			this._showToast();
		} else if (!isSharing && this._wasSharing) {
			this._hideToast();
		}

		this._wasSharing = isSharing;
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

		if (this._tunnelHostService.isConnecting) {
			lines.push(localize('tunnelHost.hover.connecting', "Establishing tunnel connection..."));
		} else if (this._tunnelHostService.isSharing) {
			const info = this._tunnelHostService.sharingInfo;
			if (info) {
				lines.push(info.viaRemoteTunnelAccess
					? localize('tunnelHost.hover.remoteTunnelAccess', "Remote session access is provided by Remote Tunnel Access via tunnel '{0}'. Turning off remote session access does not disable Remote Tunnel Access.", info.tunnelName)
					: localize('tunnelHost.hover.sharing', "Remote session access enabled via tunnel '{0}'", info.tunnelName));
			} else {
				lines.push(localize('tunnelHost.hover.enabled', "Remote session access is enabled"));
			}
		} else {
			const agentsUrl = this._productService.webUrl ? `${this._productService.webUrl.replace(/\/$/, '')}/agents` : undefined;
			lines.push(agentsUrl
				? localize('tunnelHost.hover.idle', "Allow connections from other machines and {0}", `[${agentsUrl.replace(/https?:\/\//, '')}](${agentsUrl})`)
				: localize('tunnelHost.hover.idle.noWebUrl', "Allow connections from other machines"));
		}

		lines.push(`[${localize('tunnelHost.hover.showOutput', "Show Output")}](command:${SHOW_TUNNEL_HOST_OUTPUT_ID}) | [${localize('tunnelHost.hover.renameTunnel', "Rename Tunnel")}](command:${RENAME_TUNNEL_ID}) | [${localize('tunnelHost.hover.learnMore', "Learn More")}](${TUNNEL_ACCESS_DOCS_URL})`);

		const md = new MarkdownString(lines.join('\n\n'), { isTrusted: { enabledCommands: [SHOW_TUNNEL_HOST_OUTPUT_ID, RENAME_TUNNEL_ID] } });
		return { markdown: md, markdownNotSupportedFallback: lines[0] };
	}

	private _getAriaLabel(): string {
		if (this._tunnelHostService.isConnecting) {
			return localize('tunnelHost.hover.connecting', "Establishing tunnel connection...");
		}
		if (this._tunnelHostService.isSharing) {
			const info = this._tunnelHostService.sharingInfo;
			if (info) {
				return info.viaRemoteTunnelAccess
					? localize('tunnelHost.ariaLabel.remoteTunnelAccess', "Remote session access provided by Remote Tunnel Access via tunnel '{0}'", info.tunnelName)
					: localize('tunnelHost.hover.sharing', "Remote session access enabled via tunnel '{0}'", info.tunnelName);
			}
			return localize('tunnelHost.hover.enabled', "Remote session access is enabled");
		}
		const agentsUrl = this._productService.webUrl ? `${this._productService.webUrl.replace(/\/$/, '')}/agents` : undefined;
		return agentsUrl
			? localize('tunnelHost.hover.idle.ariaLabel', "Allow connections from other machines and {0}", agentsUrl.replace(/https?:\/\//, ''))
			: localize('tunnelHost.hover.idle.ariaLabel.noWebUrl', "Allow connections from other machines");
	}
}
