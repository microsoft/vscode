/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as nls from 'vscode-nls';
import { Command, CommandManager } from '../commands/commandManager';
import * as Proto from '../protocol';
import { ExecConfig, ITypeScriptServiceClient, ServerResponse } from '../typescriptService';
import API from '../utils/api';
import { isSupportedLanguageMode } from '../utils/languageIds';
import * as typeConverters from '../utils/typeConverters';

const localize = nls.loadMessageBundle();

namespace ExperimentalProto {
	export const enum CommandTypes {
		FindSourceDefinition = 'findSourceDefinition'
	}

	export interface SourceDefinitionRequestArgs extends Proto.FileLocationRequestArgs { }

	export interface SourceDefinitionRequest extends Proto.Request {
		command: CommandTypes.FindSourceDefinition;
		arguments: SourceDefinitionRequestArgs;
	}

	export interface InlayHintsResponse extends Proto.DefinitionResponse { }

	export interface IExtendedTypeScriptServiceClient {
		execute<K extends keyof ExtendedTsServerRequests>(
			command: K,
			args: ExtendedTsServerRequests[K][0],
			token: vscode.CancellationToken,
			config?: ExecConfig
		): Promise<ServerResponse.Response<ExtendedTsServerRequests[K][1]>>;
	}

	export interface ExtendedTsServerRequests {
		'findSourceDefinition': [SourceDefinitionRequestArgs, InlayHintsResponse];
	}
}

class SourceDefinitionCommand implements Command {

	public static readonly context = 'tsSupportsSourceDefinition';
	public static readonly minVersion = API.v470;

	public readonly id = 'typescript.goToSourceDefinition';

	public constructor(
		private readonly client: ITypeScriptServiceClient
	) { }

	public async execute() {
		if (this.client.apiVersion.lt(SourceDefinitionCommand.minVersion)) {
			vscode.window.showErrorMessage(localize('error.unsupportedVersion', "Go to Source Definition failed. Requires TypeScript 4.7+."));
			return;
		}

		const activeEditor = vscode.window.activeTextEditor;
		if (!activeEditor) {
			vscode.window.showErrorMessage(localize('error.noResource', "Go to Source Definition failed. No resource provided."));
			return;
		}

		const resource = activeEditor.document.uri;
		const document = await vscode.workspace.openTextDocument(resource);
		if (!isSupportedLanguageMode(document)) {
			vscode.window.showErrorMessage(localize('error.unsupportedLanguage', "Go to Source Definition failed. Unsupported file type."));
			return;
		}

		const openedFiledPath = this.client.toOpenedFilePath(document);
		if (!openedFiledPath) {
			vscode.window.showErrorMessage(localize('error.unknownFile', "Go to Source Definition failed. Unknown file type."));
			return;
		}

		await vscode.window.withProgress({
			location: vscode.ProgressLocation.Window,
			title: localize('progress.title', "Finding source definitions")
		}, async (_progress, token) => {

			const position = activeEditor.selection.anchor;
			const args = typeConverters.Position.toFileLocationRequestArgs(openedFiledPath, position);
			const response = await (this.client as ExperimentalProto.IExtendedTypeScriptServiceClient).execute('findSourceDefinition', args, token);
			if (response.type === 'response' && response.body) {
				const locations: vscode.Location[] = response.body.map(reference =>
					typeConverters.Location.fromTextSpan(this.client.toResource(reference.file), reference));

				if (locations.length) {
					if (locations.length === 1) {
						vscode.commands.executeCommand('vscode.open', locations[0].uri.with({
							fragment: `L${locations[0].range.start.line + 1},${locations[0].range.start.character + 1}`
						}));
					} else {
						vscode.commands.executeCommand('editor.action.showReferences', resource, position, locations);
					}
					return;
				}
			}

			vscode.window.showErrorMessage(localize('error.noReferences', "No source definitions found."));
		});
	}
}


export function register(
	client: ITypeScriptServiceClient,
	commandManager: CommandManager
) {
	function updateContext() {
		vscode.commands.executeCommand('setContext', SourceDefinitionCommand.context, client.apiVersion.gte(SourceDefinitionCommand.minVersion));
	}
	updateContext();

	commandManager.register(new SourceDefinitionCommand(client));
	return client.onTsServerStarted(() => updateContext());
}
