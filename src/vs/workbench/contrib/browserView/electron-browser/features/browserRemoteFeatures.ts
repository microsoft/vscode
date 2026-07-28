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
import { IBrowserViewModel, IBrowserViewWorkbenchService } from '../../common/browserView.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { IConfigurationRegistry, Extensions as ConfigurationExtensions, ConfigurationScope } from '../../../../../platform/configuration/common/configurationRegistry.js';
import { workbenchConfigurationNodeBase } from '../../../../common/configuration.js';
import { BrowserRemoteProxyEnabledSettingId } from '../browserViewWorkbenchService.js';
import product from '../../../../../platform/product/common/product.js';

class BrowserRemoteIndicatorContribution extends BrowserEditorContribution {
	private readonly _container: HTMLElement;
	private _message = '';

	constructor(
		editor: BrowserEditor,
		@IHoverService hoverService: IHoverService,
		@IBrowserViewWorkbenchService private readonly browserViewWorkbenchService: IBrowserViewWorkbenchService,
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
		this.refresh(model);
		store.add(model.onDidNavigate(() => this.refresh(model)));
		store.add(model.onDidChangeRemoteStatus(() => this.refresh(model)));
	}

	override onModelDetached(): void {
		this.refresh(null);
	}

	private refresh(model: IBrowserViewModel | null): void {
		let statusMessage = '';
		let isConnected = false;
		let isWarning = false;

		if (model) {
			if (model.url.startsWith('file://')) {
				isConnected = false;
				statusMessage = localize('browser.connectedLocally.file', "File URLs are served locally, not over the remote connection.");
				isWarning = true;
			} else if (model.isRemoteSession) {
				isConnected = true;
				statusMessage = localize('browser.connectedRemotely', "Connected via remote");
			} else {
				isConnected = false;
				statusMessage = localize('browser.connectedLocally.generic', "Connected locally");
			}
		}

		this._container.classList.toggle('connected', isConnected);
		this._container.classList.toggle('warning', isWarning);
		this._container.style.display = isConnected || this.browserViewWorkbenchService.willUseRemoteProxy() ? '' : 'none';
		this._container.setAttribute('aria-label', statusMessage);
		this._message = statusMessage;
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
			markdownDescription: localize('browser.enableRemoteProxy', "When enabled, browser requests in remote workspaces are proxied through the remote connection. This allows web pages to access resources available on the remote host."),
		}
	}
});

