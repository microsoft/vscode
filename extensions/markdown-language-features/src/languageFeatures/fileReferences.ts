/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import type * as lsp from 'vscode-languageserver-types';
import { MdLanguageClient } from '../client/client';
import { Command, CommandManager } from '../commandManager';


export class FindFileReferencesCommand implements Command {

	public readonly id = 'markdown.findAllFileReferences';

	constructor(
		private readonly _client: MdLanguageClient,
	) { }

	public async execute(resource?: vscode.Uri) {
		resource ??= vscode.window.activeTextEditor?.document.uri;
		if (!resource) {
			vscode.window.showErrorMessage(vscode.l10n.t("Find file references failed. No resource provided."));
			return;
		}

		await vscode.window.withProgress({
			location: vscode.ProgressLocation.Window,
			title: vscode.l10n.t("Finding file references")
		}, async (_progress, token) => {
			const locations = (await this._client.getReferencesToFileInWorkspace(resource, token)).map(loc => {
				return new vscode.Location(vscode.Uri.parse(loc.uri), convertRange(loc.range));
			});

			const config = vscode.workspace.getConfiguration('references');
			const existingSetting = config.inspect<string>('preferredLocation');

			await config.update('preferredLocation', 'view');
			try {
				await vscode.commands.executeCommand('editor.action.showReferences', resource, new vscode.Position(0, 0), locations);
			} finally {
				await config.update('preferredLocation', existingSetting?.workspaceFolderValue ?? existingSetting?.workspaceValue);
			}
		});
	}
}

export function convertRange(range: lsp.Range): vscode.Range {
	return new vscode.Range(range.start.line, range.start.character, range.end.line, range.end.character);
}

export function registerFindFileReferenceSupport(
	commandManager: CommandManager,
	client: MdLanguageClient,
): vscode.Disposable {
	return commandManager.register(new FindFileReferencesCommand(client));
}
