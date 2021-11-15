/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, Event, ProviderResult, Uri } from 'vscode';
export { ProviderResult } from 'vscode';

export interface API {
	registerRemoteSourceProvider(provider: RemoteSourceProvider): Disposable;
}

export interface GitBaseExtension {

	readonly enabled: boolean;
	readonly onDidChangeEnablement: Event<boolean>;

	/**
	 * Returns a specific API version.
	 *
	 * Throws error if git-base extension is disabled. You can listed to the
	 * [GitBaseExtension.onDidChangeEnablement](#GitBaseExtension.onDidChangeEnablement)
	 * event to know when the extension becomes enabled/disabled.
	 *
	 * @param version Version number.
	 * @returns API instance
	 */
	getAPI(version: 1): API;
}

export interface RemoteSource {
	readonly name: string;
	readonly description?: string;
	readonly url: string | string[];
}

export interface RemoteSourceProvider {
	readonly name: string;
	/**
	 * Codicon name
	 */
	readonly icon?: string;
	readonly supportsQuery?: boolean;

	getBranches?(url: string): ProviderResult<string[]>;
	getRemoteSources(query?: string): ProviderResult<RemoteSource[]>;
	publishRepository?(folderUri: Uri): Promise<void>;
}
