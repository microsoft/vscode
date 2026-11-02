/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../../nls.js';
import { $ } from '../../../../../base/browser/dom.js';
import { renderIcon } from '../../../../../base/browser/ui/iconLabel/iconLabels.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { BrowserEditor, BrowserEditorContribution, BrowserWidgetLocation, IBrowserEditorWidget } from '../browserEditor.js';
import { BrowserRemoteProxyEnabledSettingId, IBrowserViewModel, IBrowserViewWorkbenchService } from '../../common/browserView.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { IConfigurationRegistry, Extensions as ConfigurationExtensions, ConfigurationScope } from '../../../../../platform/configuration/common/configurationRegistry.js';
import { workbenchConfigurationNodeBase } from '../../../../common/configuration.js';
import product from '../../../../../platform/product/common/product.js';
import { BrowserViewStorageScope, IBrowserViewNetwork } from '../../../../../platform/browserView/common/browserView.js';
import { IAccessibilityService } from '../../../../../platform/accessibility/common/accessibility.js';
import { status } from '../../../../../base/browser/ui/aria/aria.js';

class BrowserRemoteIndicatorContribution extends BrowserEditorContribution {
	private readonly _container: HTMLElement;
	private _message = '';
	private _isDisconnected = false;

	constructor(
		editor: BrowserEditor,
		@IHoverService hoverService: IHoverService,
		@IBrowserViewWorkbenchService private readonly browserViewWorkbenchService: IBrowserViewWorkbenchService,
		@IAccessibilityService private readonly accessibilityService: IAccessibilityService,
	) {
		super(editor);

		this._container = $('.browser-remote-indicator');
		this._container.setAttribute('role', 'img');

		const icon = renderIcon(Codicon.remote);
		this._container.appendChild(icon);

		this._register(hoverService.setupDelayedHover(
			this._container,
			() => ({
				content: this._message,
			})
		));

		this.refresh(null);
	}

	override get widgets(): readonly IBrowserEditorWidget[] {
		return [{ location: BrowserWidgetLocation.PreUrl, element: this._container, order: 0 }];
	}

	protected override onModelAttached(model: IBrowserViewModel, store: DisposableStore): void {
		this._isDisconnected = false;
		this.refresh(model);
		store.add(model.onDidNavigate(() => this.refresh(model)));
		store.add(this.browserViewWorkbenchService.onDidChangeNetworkStatus(() => this.refresh(model)));
	}

	override onModelDetached(): void {
		this.refresh(null);
	}

	private refresh(model: IBrowserViewModel | null): void {
		let statusMessage = '';
		let isVisible = false;
		let isConnected = false;
		let isWarning = false;
		let isDisconnected = false;

		// The network the tab was opened for, which it may not be able to use.
		const network = this.editor.input?.network;
		if (model) {
			if (model.url.startsWith('file://') && (network || model.network)) {
				isVisible = true;
				isWarning = true;
				statusMessage = localize('browser.connectedLocally.file', "File URLs are served locally, not over the remote connection.");
			} else if (model.network) {
				isVisible = true;
				const { label: host, connected } = this.browserViewWorkbenchService.getNetworkStatus(model.network);
				if (connected) {
					isConnected = true;
					statusMessage = localize('browser.connectedViaHost', "Connected via {0}", host);
				} else {
					isDisconnected = true;
					statusMessage = localize('browser.hostDisconnected', "{0} is disconnected. Reload the page after it reconnects.", host);
				}
			} else if (network) {
				isVisible = true;
				const fallback = this.getLocalFallback(model, network);
				isWarning = fallback.isWarning;
				statusMessage = fallback.message;
			}
		}

		if (isDisconnected && !this._isDisconnected && this.accessibilityService.isScreenReaderOptimized()) {
			status(statusMessage);
		}
		this._isDisconnected = isDisconnected;

		this._container.classList.toggle('connected', isConnected);
		this._container.classList.toggle('warning', isWarning);
		this._container.style.display = isVisible ? '' : 'none';
		this._container.setAttribute('aria-label', statusMessage);
		this._message = statusMessage;
	}

	/** Why a tab opened for a remote network uses the local one. Deliberate choices are not warnings. */
	private getLocalFallback(model: IBrowserViewModel, network: IBrowserViewNetwork): { message: string; isWarning: boolean } {
		const networkStatus = this.browserViewWorkbenchService.getNetworkStatus(network);
		if (model.storageScope === BrowserViewStorageScope.Global) {
			return { message: localize('browser.localFallback.global', "Connected locally. Browsers using global storage load pages from your local network, not from {0}.", networkStatus.label), isWarning: false };
		}
		if (networkStatus.proxySupported === false) {
			return { message: localize('browser.localFallback.unsupported', "{0} does not support browser proxying. Pages load from your local network. Update the agent host to reach its network.", networkStatus.label), isWarning: true };
		}
		return { message: localize('browser.connectedLocally.generic', "Connected locally"), isWarning: false };
	}
}

BrowserEditor.registerContribution(BrowserRemoteIndicatorContribution);

Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).registerConfiguration({
	...workbenchConfigurationNodeBase,
	properties: {
		[BrowserRemoteProxyEnabledSettingId]: {
			type: 'boolean',
			default: product.quality !== 'stable',
			tags: ['experimental'],
			scope: ConfigurationScope.WINDOW,
			experiment: { mode: 'startup' },
			markdownDescription: localize('browser.enableRemoteProxy', "When enabled, browser requests in remote workspaces, and for agent sessions on remote agent hosts, are proxied through the remote connection. This allows web pages to access resources available on the remote host. Browsers using global storage always use the local network."),
		}
	}
});

