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
	private readonly _tunnels = new Map<number, { refcount: number, readonly value: Promise<RemoteTunnel> }>();

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

		for (const { value } of this._tunnels.values()) {
			value.then(tunnel => tunnel.dispose());
		}
		this._tunnels.clear();
	}

	$getWindowVisibility(): Promise<boolean> {
		return this.windowService.isFocused();
	}

	async $openUri(uriComponents: UriComponents, options: IOpenUriOptions): Promise<boolean> {
		const uri = await this.resolveExternalUri(URI.from(uriComponents), options);
		return this.openerService.open(uri, { openExternal: true });
	}

	async $resolveExternalUri(uriComponents: UriComponents, options: IOpenUriOptions): Promise<UriComponents> {
		const uri = URI.revive(uriComponents);
		const embedderResolver = this.getEmbedderResolver();
		if (embedderResolver) {
			return embedderResolver(uri);
		}
		return this.resolveExternalUri(uri, options);
	}

	async $releaseResolvedExternalUri(uriComponents: UriComponents): Promise<boolean> {
		if (this.getEmbedderResolver()) {
			// Embedder handled forwarding so there's nothing for us to clean up
			return true;
		}

		const portMappingRequest = extractLocalHostUriMetaDataForPortMapping(URI.from(uriComponents));
		if (portMappingRequest) {
			const existing = this._tunnels.get(portMappingRequest.port);
			if (existing) {
				if (--existing.refcount <= 0) {
					existing.value.then(tunnel => tunnel.dispose());
					this._tunnels.delete(portMappingRequest.port);
				}
			}
		}
		return true;
	}

	private getEmbedderResolver(): undefined | ((uri: URI) => Promise<URI>) {
		return this.environmentService.options && this.environmentService.options.resolveExternalUri;
	}

	private async resolveExternalUri(uri: URI, options: IOpenUriOptions): Promise<URI> {
		if (options.allowTunneling && !!this.environmentService.configuration.remoteAuthority) {
			const portMappingRequest = extractLocalHostUriMetaDataForPortMapping(uri);
			if (portMappingRequest) {
				const tunnel = await this.retainOrCreateTunnel(portMappingRequest.port);
				if (tunnel) {
					return uri.with({ authority: `127.0.0.1:${tunnel.tunnelLocalPort}` });
				}
			}
		}
		return uri;
	}

	private retainOrCreateTunnel(remotePort: number): Promise<RemoteTunnel> | undefined {
		const existing = this._tunnels.get(remotePort);
		if (existing) {
			++existing.refcount;
			return existing.value;
		}
		const tunnel = this.tunnelService.openTunnel(remotePort);
		if (tunnel) {
			this._tunnels.set(remotePort, { refcount: 1, value: tunnel });
		}
		return tunnel;
	}
}
