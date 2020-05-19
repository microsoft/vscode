/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { GithubRemoteSourceProvider } from './remoteSourceProvider';
import { GitExtension } from './typings/git';
import { registerCommands } from './commands';
import { GithubCredentialProviderManager } from './credentialProvider';

export async function activate(context: vscode.ExtensionContext) {
	const gitExtension = vscode.extensions.getExtension<GitExtension>('vscode.git')!.exports;
	const gitAPI = gitExtension.getAPI(1);

	context.subscriptions.push(...registerCommands(gitAPI));
	context.subscriptions.push(gitAPI.registerRemoteSourceProvider(new GithubRemoteSourceProvider(gitAPI)));
	context.subscriptions.push(new GithubCredentialProviderManager(gitAPI));
}
