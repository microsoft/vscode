/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Uri, SourceControlInputBox } from 'vscode';

declare module GitExtension {
	export interface API {

	}

	//#region Deprecated API
	export interface InputBox {
		value: string;
	}

	export interface Repository {
		readonly rootUri: Uri;
		readonly inputBox: InputBox;
	}
	//#endregion
}

export interface GitExtension {
	getRepositories(): Promise<GitExtension.Repository[]>;
	getGitPath(): Promise<string>;
	// export const availableVersions: string[];
	getAPI(range: string): GitExtension.API;
}