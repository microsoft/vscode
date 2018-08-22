/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Uri, SourceControlInputBox, Event, CancellationToken } from 'vscode';
import * as cp from 'child_process';

export interface Git {
	readonly path: string;
}

export interface InputBox {
	value: string;
}

export interface Repository {
	readonly rootUri: Uri;
	readonly inputBox: InputBox;

	readonly onDidRunGitStatus: Event<void>;

	status(): Promise<void>;
}

export interface API {
	readonly git: Git;
	readonly repositories: Repository[];
	readonly onDidOpenRepository: Event<Repository>;
	readonly onDidCloseRepository: Event<Repository>;
}

export interface GitExtension {

	/**
	 * Returns a specific API version.
	 *
	 * @param version Version number.
	 * @returns API instance
	 */
	getAPI(version: 1): API;
}