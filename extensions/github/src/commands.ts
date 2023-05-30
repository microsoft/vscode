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
		const permalink = getLink(gitAPI, useSelection, getVscodeDevHost(), 'headlink', context, includeRange);
		if (permalink) {
			return vscode.env.clipboard.writeText(permalink);
		}
	} catch (err) {
		vscode.window.showErrorMessage(err.message);
	}
}

async function openVscodeDevLink(gitAPI: GitAPI): Promise<vscode.Uri | undefined> {
	try {
		const headlink = getLink(gitAPI, true, getVscodeDevHost(), 'headlink');
		return headlink ? vscode.Uri.parse(headlink) : undefined;
	} catch (err) {
		vscode.window.showErrorMessage(err.message);
		return undefined;
	}
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

	return disposables;
}
