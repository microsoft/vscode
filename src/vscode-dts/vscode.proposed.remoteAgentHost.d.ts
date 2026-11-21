/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	/**
	 * An agent host that serves the [Agent Host Protocol](https://microsoft.github.io/agent-host-protocol/)
	 * over a WebSocket.
	 */
	export interface RemoteAgentHost {
		/**
		 * The name of the host, as shown to the user. Users can rename it locally.
		 */
		readonly name: string;

		/**
		 * Where the host listens: `host:port`, or a `ws://` or `wss://` URL, for example `ws://127.0.0.1:8445`.
		 * The Agents window connects to the host from the machine it runs on.
		 *
		 * The address identifies the host. The user's name for it, whether they disconnected it, and its
		 * sessions are kept by address, so keep it the same across registrations, for example after a restart.
		 *
		 * A token in the URL's `tkn` query parameter is used as the {@link RemoteAgentHost.connectionToken connection token}
		 * when none is set.
		 */
		readonly address: string;

		/**
		 * The token the host requires to accept a connection, if any.
		 */
		readonly connectionToken?: string;
	}

	export namespace chat {

		/**
		 * Adds a remote agent host, as if the user had added it with the "Add Remote Agent Host..." command.
		 * The Agents window connects to the host, lists its sessions and shows it among its remotes, where the
		 * user can connect, disconnect and rename it, but not remove it. Editor windows connect to it too, as
		 * to the hosts their workspace lists in `chat.workspaceRemoteAgentHosts`, so its agents are available
		 * in Chat.
		 *
		 * The host stays added until the returned disposable is disposed or the extension is deactivated, for
		 * example because it is disabled or uninstalled. To change the host, dispose its registration and
		 * register it again.
		 *
		 * @param host The host to add.
		 * @returns A {@link Disposable} that removes the host.
		 * @throws When the host has no name or its address is not valid.
		 */
		export function registerRemoteAgentHost(host: RemoteAgentHost): Disposable;
	}
}
