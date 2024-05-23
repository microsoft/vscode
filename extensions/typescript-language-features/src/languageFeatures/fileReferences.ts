/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { Command, CommandManager } from '../commands/commandManager';
import { isSupportedLanguageMode } from '../configuration/languageIds';
import { API } from '../tsServer/api';
import * as typeConverters from '../typeConverters';
import { ITypeScriptServiceClient } from '../typescriptService';


class FileReferencesCommand implements Command {

	public static readonly context = 'tsSupportsFileReferences';
	public static readonly minVersion = API.v420;

	public readonly id = 'typescript.findAllFileReferences';

	public constructor(
		private readonly client: ITypeScriptServiceClient
	) { }

	public async execute(resource?: vscode.Uri) {
		if (this.client.apiVersion.lt(FileReferencesCommand.minVersion)) {
			vscode.window.showErrorMessage(vscode.l10n.t("Find file references failed. Requires TypeScript 4.2+."));
			return;
		}

		resource ??= vscode.window.activeTextEditor?.document.uri;
		if (!resource) {
			vscode.window.showErrorMessage(vscode.l10n.t("Find file references failed. No resource provided."));
			return;
		}

		const document = await vscode.workspace.openTextDocument(resource);
		if (!isSupportedLanguageMode(document)) {
			vscode.window.showErrorMessage(vscode.l10n.t("Find file references failed. Unsupported file type."));
			return;
		}

		const openedFiledPath = this.client.toOpenTsFilePath(document);
		if (!openedFiledPath) {
			vscode.window.showErrorMessage(vscode.l10n.t("Find file references failed. Unknown file type."));
			return;
		}

		await vscode.window.withProgress({
			location: vscode.ProgressLocation.Window,
			title: vscode.l10n.t("Finding file references")
		}, async (_progress, token) => {

			const response = await this.client.execute('fileReferences', {
				file: openedFiledPath
			}, token);
			if (response.type !== 'response' || !response.body) {
				return;
			}

			const locations: vscode.Location[] = response.body.refs.map(reference =>
				typeConverters.Location.fromTextSpan(this.client.toResource(reference.file), reference));

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


export function register(
	client: ITypeScriptServiceClient,
	commandManager: CommandManager
) {
	function updateContext() {
		vscode.commands.executeCommand('setContext', FileReferencesCommand.context, client.apiVersion.gte(FileReferencesCommand.minVersion));
	}
	updateContext();

	commandManager.register(new FileReferencesCommand(client));
	return client.onTsServerStarted(() => updateContext());
}
