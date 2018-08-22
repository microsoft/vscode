/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Uri, SourceControlInputBox, Event } from 'vscode';

declare module GitExtension {

	export interface API {
		readonly gitPath: string;
		readonly repositories: Repository[];
		readonly onDidOpenRepository: Event<Repository>;
		readonly onDidCloseRepository: Event<Repository>;
	}

	export interface InputBox {
		value: string;
	}

	export interface Repository {
		readonly rootUri: Uri;
		readonly inputBox: InputBox;
	}
}

export interface GitExtension {

	/**
	 * Returns the latest available API compatible with the
	 * provided version range.
	 *
	 * @param range Semver version range for API compatibility.
	 * @returns API instance
	 */
	getAPI(range: string): GitExtension.API;

	/**
	 * Returns the collection of active repositories.
	 *
	 * @deprecated Use `API.repositories` instead.
	 */
	getRepositories(): Promise<GitExtension.Repository[]>;

	/**
	 * Returns the path to the current git executable.
	 *
	 * @deprecated Use `API.gitPath` instead.
	 */
	getGitPath(): Promise<string>;
}