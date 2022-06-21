/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { API as GitAPI } from './typings/git';
import { publishRepository } from './publish';
import { DisposableStore } from './util';
import { getPermalink } from './links';

export function registerCommands(gitAPI: GitAPI): vscode.Disposable {
	const disposables = new DisposableStore();

	disposables.add(vscode.commands.registerCommand('github.publish', async () => {
		try {
			publishRepository(gitAPI);
		} catch (err) {
			vscode.window.showErrorMessage(err.message);
		}
	}));

	disposables.add(vscode.commands.registerCommand('github.copyVscodeDevLink', async () => {
		try {
			const permalink = getPermalink(gitAPI, 'https://vscode.dev/github');
			if (permalink) {
				vscode.env.clipboard.writeText(permalink);
			}
		} catch (err) {
			vscode.window.showErrorMessage(err.message);
		}
	}));

	return disposables;
}
