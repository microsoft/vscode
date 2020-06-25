/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ExtensionContext, Uri, workspace } from 'vscode';
import { ChangeStore, ContextStore } from './stores';
import { VirtualFS } from './fs';
import { GitHubApiContext, GitHubApi } from './github/api';
import { GitHubFS } from './github/fs';
import { VirtualSCM } from './scm';

// const repositoryRegex = /^(?:(?:https:\/\/)?github.com\/)?([^\/]+)\/([^\/]+?)(?:\/|.git|$)/i;

export function activate(context: ExtensionContext) {
	const contextStore = new ContextStore<GitHubApiContext>(context.workspaceState, GitHubFS.scheme);
	const changeStore = new ChangeStore(context.workspaceState);

	const githubApi = new GitHubApi(contextStore);
	const gitHubFS = new GitHubFS(githubApi);
	const virtualFS = new VirtualFS('codespace', GitHubFS.scheme, contextStore, changeStore, gitHubFS);

	context.subscriptions.push(
		githubApi,
		gitHubFS,
		virtualFS,
		new VirtualSCM(GitHubFS.scheme, githubApi, changeStore)
	);

	// commands.registerCommand('githubBrowser.openRepository', async () => {
	// 	const value = await window.showInputBox({
	// 		placeHolder: 'e.g. https://github.com/microsoft/vscode',
	// 		prompt: 'Enter a GitHub repository url',
	// 		validateInput: value => repositoryRegex.test(value) ? undefined : 'Invalid repository url'
	// 	});

	// 	if (value) {
	// 		const match = repositoryRegex.exec(value);
	// 		if (match) {
	// 			const [, owner, repo] = match;

	// 			const uri = Uri.parse(`codespace://HEAD/${owner}/${repo}`);
	// 			openWorkspace(uri, repo, 'currentWindow');
	// 		}
	// 	}
	// });
}

export function getRootUri(uri: Uri) {
	return workspace.getWorkspaceFolder(uri)?.uri;
}

// function openWorkspace(uri: Uri, name: string, location: 'currentWindow' | 'newWindow' | 'addToCurrentWorkspace') {
// 	if (location === 'addToCurrentWorkspace') {
// 		const count = (workspace.workspaceFolders && workspace.workspaceFolders.length) || 0;
// 		return workspace.updateWorkspaceFolders(count, 0, { uri: uri, name: name });
// 	}

// 	return commands.executeCommand('vscode.openFolder', uri, location === 'newWindow');
// }
