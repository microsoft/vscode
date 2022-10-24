/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as nls from 'vscode-nls';
import { Command, CommandManager } from '../commands/commandManager';
import type * as Proto from '../protocol';
import { OrganizeImportsMode } from '../protocol.const';
import { ClientCapability, ITypeScriptServiceClient } from '../typescriptService';
import API from '../utils/api';
import { nulToken } from '../utils/cancellation';
import { conditionalRegistration, requireMinVersion, requireSomeCapability } from '../utils/dependentRegistration';
import { DocumentSelector } from '../utils/documentSelector';
import { TelemetryReporter } from '../utils/telemetry';
import * as typeConverters from '../utils/typeConverters';
import FileConfigurationManager from './fileConfigurationManager';

const localize = nls.loadMessageBundle();

interface OrganizeImportsCommandMetadata {
	readonly ids: readonly string[];
	readonly title: string;
	readonly minVersion: API;
	readonly kind: vscode.CodeActionKind;
	readonly mode: OrganizeImportsMode;
}

const organizeImportsCommand: OrganizeImportsCommandMetadata = {
	ids: ['typescript.organizeImports'],
	minVersion: API.v280,
	title: localize('organizeImportsAction.title', "Organize Imports"),
	kind: vscode.CodeActionKind.SourceOrganizeImports,
	mode: OrganizeImportsMode.All,
};

const sortImportsCommand: OrganizeImportsCommandMetadata = {
	ids: ['typescript.sortImports', 'javascript.sortImports'],
	minVersion: API.v430,
	title: localize('sortImportsAction.title', "Sort Imports"),
	kind: vscode.CodeActionKind.Source.append('sortImports'),
	mode: OrganizeImportsMode.SortAndCombine,
};

const removeUnusedImportsCommand: OrganizeImportsCommandMetadata = {
	ids: ['typescript.removeUnusedImports', 'javascript.removeUnusedImports'],
	minVersion: API.v490,
	title: localize('removeUnusedImportsAction.title', "Remove Unused Imports"),
	kind: vscode.CodeActionKind.Source.append('removeUnusedImports'),
	mode: OrganizeImportsMode.RemoveUnused,
};

class OrganizeImportsCommand implements Command {

	constructor(
		public readonly id: string,
		private readonly commandMetadata: OrganizeImportsCommandMetadata,
		private readonly client: ITypeScriptServiceClient,
		private readonly telemetryReporter: TelemetryReporter,
	) { }

	public async execute(file?: string): Promise<any> {
		/* __GDPR__
			"organizeImports.execute" : {
				"owner": "mjbvz",
				"${include}": [
					"${TypeScriptCommonProperties}"
				]
			}
		*/
		this.telemetryReporter.logTelemetry('organizeImports.execute', {});
		if (!file) {
			const activeEditor = vscode.window.activeTextEditor;
			if (!activeEditor) {
				vscode.window.showErrorMessage(localize('error.organizeImports.noResource', "Organize Imports failed. No resource provided."));
				return;
			}

			const resource = activeEditor.document.uri;
			const document = await vscode.workspace.openTextDocument(resource);
			const openedFiledPath = this.client.toOpenedFilePath(document);
			if (!openedFiledPath) {
				vscode.window.showErrorMessage(localize('error.organizeImports.unknownFile', "Organize Imports failed. Unknown file type."));
				return;
			}

			file = openedFiledPath;
		}

		const args: Proto.OrganizeImportsRequestArgs = {
			scope: {
				type: 'file',
				args: {
					file
				}
			},
			// Deprecated in 4.9; `mode` takes priority
			skipDestructiveCodeActions: this.commandMetadata.mode === OrganizeImportsMode.SortAndCombine,
			mode: typeConverters.OrganizeImportsMode.toProtocolOrganizeImportsMode(this.commandMetadata.mode),
		};
		const response = await this.client.interruptGetErr(() => this.client.execute('organizeImports', args, nulToken));
		if (response.type !== 'response' || !response.body) {
			return;
		}

		if (response.body.length) {
			const edits = typeConverters.WorkspaceEdit.fromFileCodeEdits(this.client, response.body);
			return vscode.workspace.applyEdit(edits);
		}
	}
}

class ImportsCodeActionProvider implements vscode.CodeActionProvider {

	constructor(
		private readonly client: ITypeScriptServiceClient,
		private readonly commandMetadata: OrganizeImportsCommandMetadata,
		commandManager: CommandManager,
		private readonly fileConfigManager: FileConfigurationManager,
		telemetryReporter: TelemetryReporter,
	) {
		for (const id of commandMetadata.ids) {
			commandManager.register(new OrganizeImportsCommand(id, commandMetadata, client, telemetryReporter));
		}
	}

	public provideCodeActions(
		document: vscode.TextDocument,
		_range: vscode.Range,
		context: vscode.CodeActionContext,
		token: vscode.CancellationToken
	): vscode.CodeAction[] {
		const file = this.client.toOpenedFilePath(document);
		if (!file) {
			return [];
		}

		if (!context.only || !context.only.contains(this.commandMetadata.kind)) {
			return [];
		}

		this.fileConfigManager.ensureConfigurationForDocument(document, token);

		const action = new vscode.CodeAction(this.commandMetadata.title, this.commandMetadata.kind);
		action.command = { title: '', command: this.commandMetadata.ids[0], arguments: [file] };
		return [action];
	}
}

export function register(
	selector: DocumentSelector,
	client: ITypeScriptServiceClient,
	commandManager: CommandManager,
	fileConfigurationManager: FileConfigurationManager,
	telemetryReporter: TelemetryReporter,
): vscode.Disposable {
	const disposables: vscode.Disposable[] = [];

	for (const command of [organizeImportsCommand, sortImportsCommand, removeUnusedImportsCommand]) {
		disposables.push(conditionalRegistration([
			requireMinVersion(client, command.minVersion),
			requireSomeCapability(client, ClientCapability.Semantic),
		], () => {
			const provider = new ImportsCodeActionProvider(client, command, commandManager, fileConfigurationManager, telemetryReporter);
			return vscode.languages.registerCodeActionsProvider(selector.semantic, provider, {
				providedCodeActionKinds: [command.kind]
			});
		}));
	}

	return vscode.Disposable.from(...disposables);
}
