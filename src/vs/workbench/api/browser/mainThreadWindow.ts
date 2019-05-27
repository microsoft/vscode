/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from 'vs/base/common/event';
import { dispose, IDisposable } from 'vs/base/common/lifecycle';
import { URI, UriComponents } from 'vs/base/common/uri';
import { IWindowService, IWindowsService } from 'vs/platform/windows/common/windows';
import { extHostNamedCustomer } from 'vs/workbench/api/common/extHostCustomers';
import { ExtHostContext, ExtHostWindowShape, IExtHostContext, MainContext, MainThreadWindowShape, IOpenUriOptions } from '../common/extHost.protocol';
import { ITunnelService, RemoteTunnel } from 'vs/platform/remote/common/tunnel';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';

@extHostNamedCustomer(MainContext.MainThreadWindow)
export class MainThreadWindow implements MainThreadWindowShape {

	private readonly proxy: ExtHostWindowShape;
	private disposables: IDisposable[] = [];
	private readonly _tunnels = new Map<number, Promise<RemoteTunnel>>();

	constructor(
		extHostContext: IExtHostContext,
		@IWindowService private readonly windowService: IWindowService,
		@IWindowsService private readonly windowsService: IWindowsService,
		@ITunnelService private readonly tunnelService: ITunnelService,
		@IWorkbenchEnvironmentService private readonly environmentService: IWorkbenchEnvironmentService
	) {
		this.proxy = extHostContext.getProxy(ExtHostContext.ExtHostWindow);

		Event.latch(windowService.onDidChangeFocus)
			(this.proxy.$onDidChangeWindowFocus, this.proxy, this.disposables);
	}

	dispose(): void {
		this.disposables = dispose(this.disposables);

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
			if (uri.scheme === 'http' || uri.scheme === 'https') {
				const port = this.getLocalhostPort(uri);
				if (typeof port === 'number') {
					const tunnel = await this.getOrCreateTunnel(port);
					if (tunnel) {
						uri = uri.with({ authority: `localhost:${tunnel.tunnelLocalPort}` });
					}
				}
			}
		}

		return this.windowsService.openExternal(encodeURI(uri.toString(true)));
	}

	private getLocalhostPort(uri: URI): number | undefined {
		const match = /^localhost:(\d+)$/.exec(uri.authority);
		if (match) {
			return +match[1];
		}
		return undefined;
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
