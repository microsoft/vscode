/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import * as modes from 'vs/editor/common/modes';
import { REMOTE_HOST_SCHEME } from 'vs/platform/remote/common/remoteHosts';
import { ITunnelService, RemoteTunnel } from 'vs/platform/remote/common/tunnel';

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
		if (uri.scheme !== 'http' && uri.scheme !== 'https') {
			return undefined;
		}

		const localhostMatch = /^localhost:(\d+)$/.exec(uri.authority);
		if (!localhostMatch) {
			return undefined;
		}

		const port = +localhostMatch[1];
		for (const mapping of this.mappings()) {
			if (mapping.webviewPort === port) {
				if (this.extensionLocation && this.extensionLocation.scheme === REMOTE_HOST_SCHEME) {
					const tunnel = await this.getOrCreateTunnel(mapping.extensionHostPort);
					if (tunnel) {
						return url.replace(
							new RegExp(`^${uri.scheme}://localhost:${mapping.webviewPort}(/|$)`),
							`${uri.scheme}://localhost:${tunnel.tunnelLocalPort}$1`);
					}
				}

				if (mapping.webviewPort !== mapping.extensionHostPort) {
					return url.replace(
						new RegExp(`^${uri.scheme}://localhost:${mapping.webviewPort}(/|$)`),
						`${uri.scheme}://localhost:${mapping.extensionHostPort}$1`);
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