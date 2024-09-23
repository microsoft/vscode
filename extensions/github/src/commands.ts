/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { API as GitAPI } from './typings/git';
import { publishRepository } from './publish';
import { DisposableStore } from './util';
import { LinkContext, getLink, getVscodeDevHost } from './links';

async function copyVscodeDevLink(gitAPI: GitAPI, useSelection: boolean, context: LinkContext, includeRange = true) {
	try {
		const permalink = await getLink(gitAPI, useSelection, true, getVscodeDevHost(), 'headlink', context, includeRange);
		if (permalink) {
			return vscode.env.clipboard.writeText(permalink);
		}
	} catch (err) {
		if (!(err instanceof vscode.CancellationError)) {
			vscode.window.showErrorMessage(err.message);
		}
	}
}

async function openVscodeDevLink(gitAPI: GitAPI): Promise<vscode.Uri | undefined> {
	try {
		const headlink = await getLink(gitAPI, true, false, getVscodeDevHost(), 'headlink');
		return headlink ? vscode.Uri.parse(headlink) : undefined;
	} catch (err) {
		if (!(err instanceof vscode.CancellationError)) {
			vscode.window.showErrorMessage(err.message);
		}
		return undefined;
	}
}

async function openCommit(gitAPI: GitAPI, sourceControl: vscode.SourceControl, historyItem: vscode.SourceControlHistoryItem): Promise<void> {
	const repo = gitAPI.repositories.find((repo) => repo.rootUri.toString() === sourceControl.rootUri?.toString());
	if (!repo) {
		return;
	}

	// TODO - should we be smarter about which remote to go to, or won't it matter?
	// TODO - can we discover if the item is on any remote yet?
	const remote = repo.state.remotes[0];
	if (!remote?.fetchUrl) {
		return;
	}

	// TODO - will this always work?
	const rootUrl = remote.fetchUrl.endsWith('.git') ? remote.fetchUrl.slice(0, -4) : remote.fetchUrl;

	vscode.env.openExternal(vscode.Uri.parse(`${rootUrl}/commit/${historyItem.id}`));
}

export function registerCommands(gitAPI: GitAPI): vscode.Disposable {
	const disposables = new DisposableStore();

	disposables.add(vscode.commands.registerCommand('github.publish', async () => {
		try {
			publishRepository(gitAPI);
		} catch (err) {
			vscode.window.showErrorMessage(err.message);
		}
	}));

	disposables.add(vscode.commands.registerCommand('github.copyVscodeDevLink', async (context: LinkContext) => {
		return copyVscodeDevLink(gitAPI, true, context);
	}));

	disposables.add(vscode.commands.registerCommand('github.copyVscodeDevLinkFile', async (context: LinkContext) => {
		return copyVscodeDevLink(gitAPI, false, context);
	}));

	disposables.add(vscode.commands.registerCommand('github.copyVscodeDevLinkWithoutRange', async (context: LinkContext) => {
		return copyVscodeDevLink(gitAPI, true, context, false);
	}));

	disposables.add(vscode.commands.registerCommand('github.openOnVscodeDev', async () => {
		return openVscodeDevLink(gitAPI);
	}));

	disposables.add(vscode.commands.registerCommand('github.openCommitOfHistoryItem', async (sourceControl: vscode.SourceControl, historyItem: vscode.SourceControlHistoryItem) => {
		if (sourceControl && historyItem) {
			return openCommit(gitAPI, sourceControl, historyItem);
		}
	}));

	return disposables;
}
