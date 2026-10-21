/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../base/common/lifecycle.js';
import { IBrowserViewWorkbenchService } from '../../contrib/browserView/common/browserView.js';
import { IExtHostContext, extHostNamedCustomer } from '../../services/extensions/common/extHostCustomers.js';
import { ExtensionHostKind } from '../../services/extensions/common/extensionHostKind.js';
import { ExtHostBrowserTunnelProxyShape, ExtHostContext, MainContext, MainThreadBrowserTunnelProxyShape } from '../common/extHost.protocol.js';

/**
 * Renderer-side bridge for the browser proxies the local extension host runs,
 * one per remote network browsers use (see {@link IBrowserViewWorkbenchService.registerNetworkProxyProvider}).
 */
@extHostNamedCustomer(MainContext.MainThreadBrowserTunnelProxy)
export class MainThreadBrowserTunnelProxy extends Disposable implements MainThreadBrowserTunnelProxyShape {

	private readonly _proxy: ExtHostBrowserTunnelProxyShape;

	constructor(
		extHostContext: IExtHostContext,
		@IBrowserViewWorkbenchService private readonly _browserViewWorkbenchService: IBrowserViewWorkbenchService,
	) {
		super();
		this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostBrowserTunnelProxy);

		if (extHostContext.extensionHostKind === ExtensionHostKind.LocalProcess) {
			this._register(this._browserViewWorkbenchService.registerNetworkProxyProvider({
				acquire: authority => this._proxy.$acquireNetworkProxy(authority),
				release: authority => this._proxy.$releaseNetworkProxy(authority),
			}));
		}
	}
}
