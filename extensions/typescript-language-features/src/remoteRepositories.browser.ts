/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 EthicalCoder. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Extension, extensions, Uri } from 'vscode';

export interface RemoteHubApi {
	getProviderUri(uri: Uri): Uri;
	getProviderRootUri(uri: Uri): Uri;

	getVirtualUri(uri: Uri): Uri;
	getVirtualWorkspaceUri(uri: Uri): Uri | undefined;

	loadWorkspaceContents?(workspaceUri: Uri): Promise<boolean>;
}

namespace RemoteRepositories {

	let remoteHub: Extension<RemoteHubApi> | undefined;

	function getRemoteExtension(): Extension<RemoteHubApi> {
		if (remoteHub !== undefined) {
			return remoteHub;
		}

		remoteHub = extensions.getExtension<RemoteHubApi>('ms-vscode.remote-repositories')
			?? extensions.getExtension<RemoteHubApi>('GitHub.remoteHub')
			?? extensions.getExtension<RemoteHubApi>('GitHub.remoteHub-insiders');

		if (remoteHub === undefined) {
			throw new Error(`No Remote repository extension found.`);
		}
		return remoteHub;
	}

	export function getApi(): Thenable<RemoteHubApi> {
		return getRemoteExtension().activate();
	}
}

export default RemoteRepositories;
