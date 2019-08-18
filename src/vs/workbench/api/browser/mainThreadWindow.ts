/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from 'vs/base/common/event';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { URI, UriComponents } from 'vs/base/common/uri';
import { IWindowService } from 'vs/platform/windows/common/windows';
import { extHostNamedCustomer } from 'vs/workbench/api/common/extHostCustomers';
import { ExtHostContext, ExtHostWindowShape, IExtHostContext, MainContext, MainThreadWindowShape, IOpenUriOptions } from '../common/extHost.protocol';
import { ITunnelService, RemoteTunnel } from 'vs/platform/remote/common/tunnel';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';
import { extractLocalHostUriMetaDataForPortMapping } from 'vs/workbench/contrib/webview/common/portMapping';
import { IOpenerService } from 'vs/platform/opener/common/opener';

@extHostNamedCustomer(MainContext.MainThreadWindow)
export class MainThreadWindow implements MainThreadWindowShape {

	private readonly proxy: ExtHostWindowShape;
	private readonly disposables = new DisposableStore();
	private readonly _tunnels = new Map<number, Promise<RemoteTunnel>>();

	constructor(
		extHostContext: IExtHostContext,
		@IWindowService private readonly windowService: IWindowService,
		@IOpenerService private readonly openerService: IOpenerService,
		@ITunnelService private readonly tunnelService: ITunnelService,
		@IWorkbenchEnvironmentService private readonly environmentService: IWorkbenchEnvironmentService
	) {
		this.proxy = extHostContext.getProxy(ExtHostContext.ExtHostWindow);

		Event.latch(windowService.onDidChangeFocus)
			(this.proxy.$onDidChangeWindowFocus, this.proxy, this.disposables);
	}

	dispose(): void {
		this.disposables.dispose();

		for (const tunnel of this._tunnels.values()) {
			tunnel.then(tunnel => tunnel.dispose());
		}
		this._tunnels.clear();
	}

	$getWindowVisibility(): Promise<boolean> {
		return this.windowService.isFocused();
	}

	async $openUri(uriComponent: UriComponents, options: IOpenUriOptions): Promise<boolean> {
		let uri = URI.revive(uriComponent);
		if (options.allowTunneling && !!this.environmentService.configuration.remoteAuthority) {
			const portMappingRequest = extractLocalHostUriMetaDataForPortMapping(uri);
			if (portMappingRequest) {
				const tunnel = await this.getOrCreateTunnel(portMappingRequest.port);
				if (tunnel) {
					uri = uri.with({ authority: `127.0.0.1:${tunnel.tunnelLocalPort}` });
				}
			}
		}

		return this.openerService.openExternal(uri);
	}

	private getOrCreateTunnel(remotePort: number): Promise<RemoteTunnel> | undefined {
		const existing = this._tunnels.get(remotePort);
		if (existing) {
			return existing;
		}
		const tunnel = this.tunnelService.openTunnel(remotePort);
		if (tunnel) {
			this._tunnels.set(remotePort, tunnel);
		}
		return tunnel;
	}
}
