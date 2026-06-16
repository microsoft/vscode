/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../base/common/event.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { Schemas } from '../../../base/common/network.js';
import { URI, UriComponents } from '../../../base/common/uri.js';
import { IChannel, IServerChannel } from '../../../base/parts/ipc/common/ipc.js';
import { REMOTE_FILE_SYSTEM_PROXY_CHANNEL_NAME } from '../common/remoteFileSystemProxy.js';

export interface IRemoteFileSystemProxyWindowsService {
	getWindows(): readonly { readonly id: number; readonly remoteAuthority?: string }[];
}

export interface IRemoteFileSystemProxyIPCServer {
	getChannel(channelName: string, clientFilter: (client: { ctx: string }) => boolean): IChannel;
}

/**
 * Main process channel that routes remote file system operations from one
 * renderer to another. When a local window needs to read a `vscode-remote://`
 * file, this handler finds the renderer window connected to the matching remote
 * authority and forwards the request through its
 * {@link REMOTE_FILE_SYSTEM_PROXY_CHANNEL_NAME} server channel.
 */
export class RemoteFileSystemProxyMainHandler extends Disposable implements IServerChannel {

	constructor(
		private readonly windowsMainService: IRemoteFileSystemProxyWindowsService,
		private readonly electronIpcServer: IRemoteFileSystemProxyIPCServer,
	) {
		super();
	}

	listen<T>(_: unknown, event: string): Event<T> {
		throw new Error(`Event not found: ${event}`);
	}

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	async call(_: unknown, command: string, arg?: any): Promise<any> {
		const args = arg as unknown[];
		const uri = URI.revive(args[0] as UriComponents);

		// Only handle vscode-remote:// URIs to avoid routing unrelated URIs
		// that happen to have an authority (e.g. UNC paths on Windows).
		if (uri.scheme !== Schemas.vscodeRemote) {
			throw new Error(`Unsupported scheme: ${uri.scheme}. Only ${Schemas.vscodeRemote} URIs are supported.`);
		}

		// Find a window that has a remote connection matching this URI's authority
		const targetWindow = this.findWindowForAuthority(uri.authority);
		if (!targetWindow) {
			throw new Error(`No window found with remote authority: ${uri.authority}`);
		}

		// Get the remote file system proxy channel registered by the target renderer
		const targetChannel = this.getRendererChannel(targetWindow.id);

		// Forward the call to the target renderer
		return targetChannel.call(command, arg);
	}

	private findWindowForAuthority(authority: string): { id: number } | undefined {
		const windows = this.windowsMainService.getWindows();
		for (const window of windows) {
			if (window.remoteAuthority === authority) {
				return { id: window.id };
			}
		}
		return undefined;
	}

	private getRendererChannel(windowId: number): IChannel {
		// Get the channel registered by the target renderer window.
		// The connection context format is `window:{id}`.
		return this.electronIpcServer.getChannel(
			REMOTE_FILE_SYSTEM_PROXY_CHANNEL_NAME,
			(client) => client.ctx === `window:${windowId}`,
		);
	}
}
