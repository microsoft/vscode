/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../base/common/cancellation.js';
import { URI } from '../../base/common/uri.js';
import { createDecorator } from '../../platform/instantiation/common/instantiation.js';

/** A folder on the machine of a VS Code remote, as opened by an editor window. */
export interface IRemoteWorkspaceFolder {
	/** VS Code remote authority naming the machine, e.g. `ssh-remote+host`, `wsl+Ubuntu` or `tunnel+name`. */
	readonly remoteAuthority: string;
	/** The folder's path on that machine, in URI path form. */
	readonly path: string;
}

/** The Agents Window folder for a remote folder, or a user-facing reason why the remote cannot provide it. */
export type RemoteWorkspaceHandoffResult =
	| { readonly folderUri: URI; readonly unavailableReason?: undefined }
	| { readonly folderUri?: undefined; readonly unavailableReason: string };

/** The remote agent host on the machine of a VS Code remote, or a user-facing reason why the Agents Window cannot use it. */
export type RemoteAgentHostHandoffResult =
	| {
		/** The authority of the Agents Window's connection to the host, which names the host's sessions and folders. */
		readonly connectionAuthority: string;
		/** Resolves to whether the host is connected once its connection settles. The service reports connection failures. */
		readonly connected: Promise<boolean>;
		/**
		 * Whether the remote's editor windows use the connected host as their own agent host. Only a tunnel's editor
		 * windows do, unless its gateway selected the agent host of an editor on the tunnel's machine instead.
		 */
		readonly sharesEditorWindowAgentHost: () => boolean;
		readonly unavailableReason?: undefined;
	}
	| { readonly connectionAuthority?: undefined; readonly connected?: undefined; readonly sharesEditorWindowAgentHost?: undefined; readonly unavailableReason: string };

export const IRemoteWorkspaceHandoffService = createDecorator<IRemoteWorkspaceHandoffService>('remoteWorkspaceHandoffService');

/** Hands folders and sessions of SSH, WSL and Tunnel editor windows to the remote agent host on the same machine. */
export interface IRemoteWorkspaceHandoffService {
	readonly _serviceBrand: undefined;

	/**
	 * Resolves a VS Code remote to the remote agent host on the same machine.
	 * Adds that host when the Agents Window does not know it yet, offering to
	 * sign in first when only an account that is not signed in can find or
	 * connect to it, and starts a user-initiated connection.
	 */
	resolveHost(remoteAuthority: string, token: CancellationToken): Promise<RemoteAgentHostHandoffResult>;

	/** Resolves a remote folder to the folder of the remote agent host on the same machine, as {@link resolveHost} resolves the host. */
	resolveFolder(folder: IRemoteWorkspaceFolder, token: CancellationToken): Promise<RemoteWorkspaceHandoffResult>;
}
