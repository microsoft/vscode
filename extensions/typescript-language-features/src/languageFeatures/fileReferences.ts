/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as nls from 'vscode-nls';
import { Command, CommandManager } from '../commands/commandManager';
import { ITypeScriptServiceClient } from '../typescriptService';
import API from '../utils/api';
import { isSupportedLanguageMode } from '../utils/languageModeIds';
import * as typeConverters from '../utils/typeConverters';

const localize = nls.loadMessageBundle();

class FileReferencesCommand implements Command {

	public static readonly context = 'tsSupportsFileReferences';
	public static readonly minVersion = API.v420;

	public readonly id = 'typescript.findAllFileReferences';

	public constructor(
		private readonly client: ITypeScriptServiceClient
	) { }

	public async execute(resource?: vscode.Uri) {
		if (this.client.apiVersion.lt(FileReferencesCommand.minVersion)) {
			vscode.window.showErrorMessage(localize('error.unsupportedVersion', "Find file references failed. Requires TypeScript 4.2+."));
			return;
		}

		if (!resource) {
			resource = vscode.window.activeTextEditor?.document.uri;
		}

		if (!resource) {
			vscode.window.showErrorMessage(localize('error.noResource', "Find file references failed. No resource provided."));
			return;
		}

		const document = await vscode.workspace.openTextDocument(resource);
		if (!isSupportedLanguageMode(document)) {
			vscode.window.showErrorMessage(localize('error.unsupportedLanguage', "Find file references failed. Unsupported file type."));
			return;
		}

		const openedFiledPath = this.client.toOpenedFilePath(document);
		if (!openedFiledPath) {
			vscode.window.showErrorMessage(localize('error.unknownFile', "Find file references failed. Unknown file type."));
			return;
		}

		await vscode.window.withProgress({
			location: vscode.ProgressLocation.Window,
			title: localize('progress.title', "Finding file references")
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
