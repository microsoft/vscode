/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

/**
 * Manages a VS Code tunnel that exposes a local port to the internet.
 * Uses the proposed `tunnels` API (`vscode.workspace.openTunnel`).
 */
export class TunnelManager implements vscode.Disposable {

	private _tunnel: vscode.Tunnel | undefined;

	/**
	 * The local address of the tunnel once opened.
	 */
	get localAddress(): string | undefined {
		if (!this._tunnel) {
			return undefined;
		}
		const addr = this._tunnel.localAddress;
		if (typeof addr === 'string') {
			return addr;
		}
		return `${addr.host}:${addr.port}`;
	}

	/**
	 * Open a private tunnel forwarding the given port.
	 *
	 * @param port The local port to tunnel.
	 * @returns The tunnel description.
	 */
	async open(port: number): Promise<vscode.Tunnel> {
		if (this._tunnel) {
			throw new Error('Tunnel is already open');
		}

		this._tunnel = await vscode.workspace.openTunnel({
			remoteAddress: { host: '127.0.0.1', port },
			privacy: 'private',
			label: 'Codamente Agent Host',
		});

		this._tunnel.onDidDispose(() => {
			this._tunnel = undefined;
		});

		return this._tunnel;
	}

	/**
	 * Close the tunnel if it is open.
	 */
	async close(): Promise<void> {
		if (this._tunnel) {
			await this._tunnel.dispose();
			this._tunnel = undefined;
		}
	}

	dispose(): void {
		if (this._tunnel) {
			this._tunnel.dispose();
			this._tunnel = undefined;
		}
	}
}
