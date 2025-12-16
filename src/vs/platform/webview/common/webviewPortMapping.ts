/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable } from '../../../base/common/lifecycle.js';
import { Schemas } from '../../../base/common/network.js';
import { URI } from '../../../base/common/uri.js';
import { IAddress } from '../../remote/common/remoteAgentConnection.js';
import { extractLocalHostUriMetaDataForPortMapping, ITunnelService, RemoteTunnel } from '../../tunnel/common/tunnel.js';

export interface IWebviewPortMapping {
	readonly webviewPort: number;
	readonly extensionHostPort: number;
}

/**
 * Manages port mappings for a single webview.
 */
export class WebviewPortMappingManager implements IDisposable {

	private readonly _tunnels = new Map<number, RemoteTunnel>();

	constructor(
		private readonly _getExtensionLocation: () => URI | undefined,
		private readonly _getMappings: () => readonly IWebviewPortMapping[],
		private readonly tunnelService: ITunnelService
	) { }

	public async getRedirect(resolveAuthority: IAddress | null | undefined, url: string): Promise<string | undefined> {
		const uri = URI.parse(url);
		const requestLocalHostInfo = extractLocalHostUriMetaDataForPortMapping(uri);
		if (!requestLocalHostInfo) {
			return undefined;
		}

		for (const mapping of this._getMappings()) {
			if (mapping.webviewPort === requestLocalHostInfo.port) {
				const extensionLocation = this._getExtensionLocation();
				if (extensionLocation && extensionLocation.scheme === Schemas.vscodeRemote) {
					const tunnel = resolveAuthority && await this.getOrCreateTunnel(resolveAuthority, mapping.extensionHostPort);
					if (tunnel) {
						if (tunnel.tunnelLocalPort === mapping.webviewPort) {
							return undefined;
						}
						return encodeURI(uri.with({
							authority: `127.0.0.1:${tunnel.tunnelLocalPort}`,
						}).toString(true));
					}
				}

				if (mapping.webviewPort !== mapping.extensionHostPort) {
					return encodeURI(uri.with({
						authority: `${requestLocalHostInfo.address}:${mapping.extensionHostPort}`
					}).toString(true));
				}
			}
		}

		return undefined;
	}

	async dispose() {
		for (const tunnel of this._tunnels.values()) {
			await tunnel.dispose();
		}
		this._tunnels.clear();
	}

	private async getOrCreateTunnel(remoteAuthority: IAddress, remotePort: number): Promise<RemoteTunnel | undefined> {
		const existing = this._tunnels.get(remotePort);
		if (existing) {
			return existing;
		}
		const tunnelOrError = await this.tunnelService.openTunnel({ getAddress: async () => remoteAuthority }, undefined, remotePort);
		let tunnel: RemoteTunnel | undefined;
		if (typeof tunnelOrError === 'string') {
			tunnel = undefined;
		}
		if (tunnel) {
			this._tunnels.set(remotePort, tunnel);
		}
		return tunnel;
	}
}
