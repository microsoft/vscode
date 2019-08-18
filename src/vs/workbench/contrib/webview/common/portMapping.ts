/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import * as modes from 'vs/editor/common/modes';
import { REMOTE_HOST_SCHEME } from 'vs/platform/remote/common/remoteHosts';
import { ITunnelService, RemoteTunnel } from 'vs/platform/remote/common/tunnel';

export function extractLocalHostUriMetaDataForPortMapping(uri: URI): { address: string, port: number } | undefined {
	if (uri.scheme !== 'http' && uri.scheme !== 'https') {
		return undefined;
	}
	const localhostMatch = /^(localhost|127\.0\.0\.1):(\d+)$/.exec(uri.authority);
	if (!localhostMatch) {
		return undefined;
	}
	return {
		address: localhostMatch[1],
		port: +localhostMatch[2],
	};
}

export class WebviewPortMappingManager extends Disposable {

	private readonly _tunnels = new Map<number, Promise<RemoteTunnel>>();

	constructor(
		private readonly extensionLocation: URI | undefined,
		private readonly mappings: () => ReadonlyArray<modes.IWebviewPortMapping>,
		private readonly tunnelService: ITunnelService
	) {
		super();
	}

	public async getRedirect(url: string): Promise<string | undefined> {
		const uri = URI.parse(url);
		const requestLocalHostInfo = extractLocalHostUriMetaDataForPortMapping(uri);
		if (!requestLocalHostInfo) {
			return undefined;
		}

		for (const mapping of this.mappings()) {
			if (mapping.webviewPort === requestLocalHostInfo.port) {
				if (this.extensionLocation && this.extensionLocation.scheme === REMOTE_HOST_SCHEME) {
					const tunnel = await this.getOrCreateTunnel(mapping.extensionHostPort);
					if (tunnel) {
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

	dispose() {
		super.dispose();

		for (const tunnel of this._tunnels.values()) {
			tunnel.then(tunnel => tunnel.dispose());
		}
		this._tunnels.clear();
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
