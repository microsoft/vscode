/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Extension, extensions, Uri } from 'vscode';
import { createServiceIdentifier } from '../../../util/common/services';

/**
 * API for interacting with the Remote Repositories extension.
 */
interface RemoteHubApi {
	getProviderUri(uri: Uri): Uri;
	getProviderRootUri(uri: Uri): Uri;

	getVirtualUri(uri: Uri): Uri;
	getVirtualWorkspaceUri(uri: Uri): Uri | undefined;

	loadWorkspaceContents?(workspaceUri: Uri): Promise<boolean>;
}

export const IRemoteRepositoriesService = createServiceIdentifier<IRemoteRepositoriesService>('IRemoteRepositoriesService');
export interface IRemoteRepositoriesService {
	readonly _serviceBrand: undefined;
	loadWorkspaceContents(workspaceUri: Uri): Promise<boolean>;
}

/**
 * Service for interacting with the Remote Repositories API.
 */
export class RemoteRepositoriesService implements IRemoteRepositoriesService {

	declare readonly _serviceBrand: undefined;

	private _remoteHub: Extension<RemoteHubApi> | undefined;

	async loadWorkspaceContents(workspaceUri: Uri) {
		const api = await this.getApi();
		// TODO: Defaulted to false in case the API doesn't exist... is this the correct assumption?
		return await api.loadWorkspaceContents?.(workspaceUri) ?? false;
	}

	private getApi(): Thenable<RemoteHubApi> {
		return this.getRemoteExtension().activate();
	}

	private getRemoteExtension(): Extension<RemoteHubApi> {
		if (this._remoteHub !== undefined) {
			return this._remoteHub;
		}

		this._remoteHub = extensions.getExtension<RemoteHubApi>('ms-vscode.remote-repositories')
			?? extensions.getExtension<RemoteHubApi>('GitHub.remoteHub')
			?? extensions.getExtension<RemoteHubApi>('GitHub.remoteHub-insiders');

		if (this._remoteHub === undefined) {
			throw new Error(`No Remote repository extension found.`);
		}
		return this._remoteHub;
	}
}
