/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../../nls.js';
import { $ } from '../../../../../base/browser/dom.js';
import { renderIcon } from '../../../../../base/browser/ui/iconLabel/iconLabels.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { BrowserEditor, BrowserEditorContribution, IBrowserEditorWidgetContribution } from '../browserEditor.js';
import { IBrowserViewModel, IBrowserViewWorkbenchService } from '../../common/browserView.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { IConfigurationRegistry, Extensions as ConfigurationExtensions, ConfigurationScope } from '../../../../../platform/configuration/common/configurationRegistry.js';
import { workbenchConfigurationNodeBase } from '../../../../common/configuration.js';
import { addressMatchesSet } from '../../../../../platform/tunnel/common/tunnel.js';
import { ISharedProcessTunnelProxyService } from '../../../../../platform/tunnel/common/sharedProcessTunnelProxyService.js';
import { IWorkbenchEnvironmentService } from '../../../../services/environment/common/environmentService.js';

/**
 * Remote proxy routing state for the indicator.
 * - `none`  — no requests were tunneled (grey)
 * - `partial` — some requests tunneled, some direct (yellow)
 * - `full` — all requests were tunneled (blue)
 */
type RemoteRoutingState = 'none' | 'partial' | 'full';

class BrowserRemoteIndicatorContribution extends BrowserEditorContribution {
	private readonly _container: HTMLElement;

	private _routingState: RemoteRoutingState = 'none';

	constructor(
		editor: BrowserEditor,
		@IHoverService hoverService: IHoverService,
		@IBrowserViewWorkbenchService private readonly browserViewWorkbenchService: IBrowserViewWorkbenchService,
		@ISharedProcessTunnelProxyService private readonly tunnelProxyService: ISharedProcessTunnelProxyService,
		@IWorkbenchEnvironmentService private readonly environmentService: IWorkbenchEnvironmentService,
	) {
		super(editor);

		this._container = $('.browser-remote-indicator');

		const icon = renderIcon(Codicon.remote);
		this._container.appendChild(icon);

		this._register(hoverService.setupDelayedHover(
			this._container,
			() => ({
				content: this._routingState === 'full'
					? localize('browser.remoteRoutingFull', "Connected via remote")
					: this._routingState === 'partial'
						? localize('browser.remoteRoutingPartial', "Partially connected via remote")
						: localize('browser.remoteRoutingNone', "Connected locally"),
			})
		));

		this._setRoutingState('none');
	}

	override get preUrlWidgets(): readonly IBrowserEditorWidgetContribution[] {
		return [{ element: this._container, order: 0 }];
	}

	protected override subscribeToModel(model: IBrowserViewModel, store: DisposableStore): void {
		if (!model.isRemoteSession) {
			this._setRoutingState('none');
			return;
		}

		// Compute initial state
		void this._updateRoutingState(model.requestedHosts);

		// Update when requested hosts change (new sub-resource loaded)
		store.add(model.onDidChangeRequestedHosts(({ requestedHosts }) => {
			void this._updateRoutingState(requestedHosts);
		}));

		// Update when the proxy's active connections change (connection
		// opened or closed) — this is the authoritative routing state.
		store.add(this.tunnelProxyService.onDidChangeActiveConnections(() => {
			void this._updateRoutingState(model.requestedHosts);
		}));
	}

	override clear(): void {
		this._setRoutingState('none');
	}

	private async _updateRoutingState(requestedHosts: string[]): Promise<void> {
		if (requestedHosts.length === 0) {
			this._setRoutingState('none');
			return;
		}

		const authority = this.environmentService.remoteAuthority;
		if (!authority) {
			this._setRoutingState('none');
			return;
		}

		// Query the proxy for the authoritative set of hosts it currently
		// has active tunneled connections for.
		const tunneledList = await this.tunnelProxyService.getActiveTunneledHosts(authority);
		const tunneledSet = new Set(tunneledList);

		// Use the same addressMatchesSet helper as the SOCKS proxy
		// so localhost/all-interfaces variants are treated as equivalent.
		let tunneled = 0;
		for (const hostPort of requestedHosts) {
			const [host, portStr] = hostPort.split(':');
			const port = parseInt(portStr, 10);
			if (host && !isNaN(port) && addressMatchesSet(host, port, tunneledSet)) {
				tunneled++;
			}
		}

		if (tunneled === 0) {
			this._setRoutingState('none');
		} else if (tunneled === requestedHosts.length) {
			this._setRoutingState('full');
		} else {
			this._setRoutingState('partial');
		}
	}

	private _setRoutingState(state: RemoteRoutingState): void {
		this._routingState = state;
		this._container.classList.toggle('connected', state === 'full');
		this._container.classList.toggle('partial', state === 'partial');

		// Show the indicator in remote workspaces; hide in local
		this._container.style.display = this.browserViewWorkbenchService.willUseRemoteProxy() ? '' : 'none';
	}
}

BrowserEditor.registerContribution(BrowserRemoteIndicatorContribution);

Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).registerConfiguration({
	...workbenchConfigurationNodeBase,
	properties: {
		'workbench.browser.enableRemoteProxy': {
			type: 'boolean',
			default: false,
			tags: ['advanced', 'experimental'],
			scope: ConfigurationScope.WINDOW,
			markdownDescription: localize('browser.enableRemoteProxy', "When enabled, browser requests in remote workspaces are proxied through the remote connection. This allows web pages to access resources available on the remote host."),
		}
	}
});

