/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../base/common/lifecycle.js';
import { IConfigurationService } from '../../../platform/configuration/common/configuration.js';
import { ITunnelProxyInfo } from '../../../platform/tunnel/common/tunnelProxy.js';
import { IBrowserViewWorkbenchService } from '../../contrib/browserView/common/browserView.js';
import { IWorkbenchEnvironmentService } from '../../services/environment/common/environmentService.js';
import { IExtHostContext, extHostNamedCustomer } from '../../services/extensions/common/extHostCustomers.js';
import { ExtHostBrowserTunnelProxyShape, ExtHostContext, MainContext, MainThreadBrowserTunnelProxyShape } from '../common/extHost.protocol.js';

/**
 * Setting that gates whether the window's local extension host hosts the
 * tunnel proxy for remote browser views. Mirrors `BrowserRemoteProxyEnabledSettingId`
 * declared in the integrated browser contribution (which cannot be imported
 * here because it lives in the electron-browser layer).
 */
const browserRemoteProxyEnabledSettingId = 'workbench.browser.enableRemoteProxy';

/**
 * Renderer-side bridge for the local extension host tunnel proxy. Gates the
 * ext host proxy by the remote-proxy setting (and the presence of a remote
 * authority) and forwards the resolved proxy info to the main process so it
 * can be applied to the window's remote browser view Electron sessions.
 */
@extHostNamedCustomer(MainContext.MainThreadBrowserTunnelProxy)
export class MainThreadBrowserTunnelProxy extends Disposable implements MainThreadBrowserTunnelProxyShape {

	private readonly _proxy: ExtHostBrowserTunnelProxyShape;

	constructor(
		extHostContext: IExtHostContext,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IWorkbenchEnvironmentService private readonly _environmentService: IWorkbenchEnvironmentService,
		@IBrowserViewWorkbenchService private readonly _browserViewWorkbenchService: IBrowserViewWorkbenchService,
	) {
		super();
		this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostBrowserTunnelProxy);

		this._updateEnabled();
		this._register(this._configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(browserRemoteProxyEnabledSettingId)) {
				this._updateEnabled();
			}
		}));
	}

	private _isEnabled(): boolean {
		return !!this._environmentService.remoteAuthority
			&& this._configurationService.getValue<boolean>(browserRemoteProxyEnabledSettingId) === true;
	}

	private _updateEnabled(): void {
		this._proxy.$setEnabled(this._isEnabled());
	}

	$updateProxyInfo(info: ITunnelProxyInfo | undefined): void {
		this._browserViewWorkbenchService.setRemoteProxyInfo(info);
	}
}
