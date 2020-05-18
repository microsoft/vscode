/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { GithubRemoteSourceProvider } from './remoteSourceProvider';
import { GitExtension } from './typings/git';

export async function activate(context: vscode.ExtensionContext) {
	const gitExtension = vscode.extensions.getExtension<GitExtension>('vscode.git')!.exports;
	const gitAPI = gitExtension.getAPI(1);

	context.subscriptions.push(gitAPI.registerRemoteSourceProvider(new GithubRemoteSourceProvider()));
}
