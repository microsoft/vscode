/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as nls from 'vscode-nls';
import { Command, CommandManager } from '../commandManager';
import { MdReferencesProvider } from './references';

const localize = nls.loadMessageBundle();


export class FindFileReferencesCommand implements Command {

	public readonly id = 'markdown.findAllFileReferences';

	constructor(
		private readonly referencesProvider: MdReferencesProvider,
	) { }

	public async execute(resource?: vscode.Uri) {
		if (!resource) {
			resource = vscode.window.activeTextEditor?.document.uri;
		}

		if (!resource) {
			vscode.window.showErrorMessage(localize('error.noResource', "Find file references failed. No resource provided."));
			return;
		}

		await vscode.window.withProgress({
			location: vscode.ProgressLocation.Window,
			title: localize('progress.title', "Finding file references")
		}, async (_progress, token) => {
			const references = await this.referencesProvider.getReferencesToFileInWorkspace(resource!, token);
			const locations = references.map(ref => ref.location);

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

export function registerFindFileReferenceSupport(
	commandManager: CommandManager,
	referencesProvider: MdReferencesProvider
): vscode.Disposable {
	return commandManager.register(new FindFileReferencesCommand(referencesProvider));
}
