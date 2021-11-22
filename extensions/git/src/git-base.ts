/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { extensions } from 'vscode';
import { API as GitBaseAPI, GitBaseExtension } from './api/git-base';

export class GitBaseApi {

	private static _gitBaseApi: GitBaseAPI | undefined;

	static initialize(): void {
		const gitBaseExtension = extensions.getExtension<GitBaseExtension>('vscode.git-base')!.exports;
		const onDidChangeGitBaseExtensionEnablement = (enabled: boolean) => {
			this._gitBaseApi = enabled ? gitBaseExtension.getAPI(1) : undefined;
		};

		gitBaseExtension.onDidChangeEnablement(onDidChangeGitBaseExtensionEnablement);
		onDidChangeGitBaseExtensionEnablement(gitBaseExtension.enabled);
	}

	static getAPI(): GitBaseAPI {
		if (!this.isEnabled()) {
			throw new Error('vscode.git-base extension is not enabled.');
		}

		return this._gitBaseApi!;
	}

	static isEnabled(): boolean {
		return !!this._gitBaseApi;
	}
}
