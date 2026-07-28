/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { Command, CommandManager } from '../commands/commandManager';
import { DocumentSelector } from '../configuration/documentSelector';
import { TelemetryReporter } from '../logging/telemetry';
import { API } from '../tsServer/api';
import type * as Proto from '../tsServer/protocol/protocol';
import { OrganizeImportsMode } from '../tsServer/protocol/protocol.const';
import * as typeConverters from '../typeConverters';
import { ClientCapability, ITypeScriptServiceClient } from '../typescriptService';
import { nulToken } from '../utils/cancellation';
import FileConfigurationManager from './fileConfigurationManager';
import { conditionalRegistration, requireMinVersion, requireSomeCapability } from './util/dependentRegistration';


interface OrganizeImportsCommandMetadata {
	readonly commandIds: readonly string[];
	readonly title: string;
	readonly minVersion?: API;
	readonly kind: vscode.CodeActionKind;
	readonly mode: OrganizeImportsMode;
}

const organizeImportsCommand: OrganizeImportsCommandMetadata = {
	commandIds: [], // We use the generic 'Organize imports' command
	title: vscode.l10n.t("Organize Imports"),
	kind: vscode.CodeActionKind.SourceOrganizeImports,
	mode: OrganizeImportsMode.All,
};

const sortImportsCommand: OrganizeImportsCommandMetadata = {
	commandIds: ['typescript.sortImports', 'javascript.sortImports'],
	minVersion: API.v430,
	title: vscode.l10n.t("Sort Imports"),
	kind: vscode.CodeActionKind.Source.append('sortImports'),
	mode: OrganizeImportsMode.SortAndCombine,
};

const removeUnusedImportsCommand: OrganizeImportsCommandMetadata = {
	commandIds: ['typescript.removeUnusedImports', 'javascript.removeUnusedImports'],
	minVersion: API.v490,
	title: vscode.l10n.t("Remove Unused Imports"),
	kind: vscode.CodeActionKind.Source.append('removeUnusedImports'),
	mode: OrganizeImportsMode.RemoveUnused,
};

class DidOrganizeImportsCommand implements Command {

	public static readonly ID = '_typescript.didOrganizeImports';
	public readonly id = DidOrganizeImportsCommand.ID;

	constructor(
		private readonly telemetryReporter: TelemetryReporter,
	) { }

	public async execute(): Promise<void> {
		/* __GDPR__
			"organizeImports.execute" : {
				"owner": "mjbvz",
				"${include}": [
					"${TypeScriptCommonProperties}"
				]
			}
		*/
		this.telemetryReporter.logTelemetry('organizeImports.execute', {});
	}
}

class ImportCodeAction extends vscode.CodeAction {
	constructor(
		title: string,
		kind: vscode.CodeActionKind,
		public readonly document: vscode.TextDocument,
	) {
		super(title, kind);
	}
}

class ImportsCodeActionProvider implements vscode.CodeActionProvider<ImportCodeAction> {

	constructor(
		private readonly client: ITypeScriptServiceClient,
		private readonly commandMetadata: OrganizeImportsCommandMetadata,
		commandManager: CommandManager,
		private readonly fileConfigManager: FileConfigurationManager,
		telemetryReporter: TelemetryReporter,
	) {
		commandManager.register(new DidOrganizeImportsCommand(telemetryReporter));
	}

	public provideCodeActions(
		document: vscode.TextDocument,
		_range: vscode.Range,
		context: vscode.CodeActionContext,
		_token: vscode.CancellationToken
	): ImportCodeAction[] {
		if (!context.only?.contains(this.commandMetadata.kind)) {
			return [];
		}

		const file = this.client.toOpenTsFilePath(document);
		if (!file) {
			return [];
		}

		return [new ImportCodeAction(this.commandMetadata.title, this.commandMetadata.kind, document)];
	}

	async resolveCodeAction(codeAction: ImportCodeAction, token: vscode.CancellationToken): Promise<ImportCodeAction | undefined> {
		const response = await this.client.interruptGetErr(async () => {
			await this.fileConfigManager.ensureConfigurationForDocument(codeAction.document, token);
			if (token.isCancellationRequested) {
				return;
			}

			const file = this.client.toOpenTsFilePath(codeAction.document);
			if (!file) {
				return;
			}

			const args: Proto.OrganizeImportsRequestArgs = {
				scope: {
					type: 'file',
					args: { file }
				},
				// Deprecated in 4.9; `mode` takes priority
				skipDestructiveCodeActions: this.commandMetadata.mode === OrganizeImportsMode.SortAndCombine,
				mode: typeConverters.OrganizeImportsMode.toProtocolOrganizeImportsMode(this.commandMetadata.mode),
			};

			return this.client.execute('organizeImports', args, nulToken);
		});
		if (response?.type !== 'response' || !response.body || token.isCancellationRequested) {
			return;
		}

		if (response.body.length) {
			codeAction.edit = typeConverters.WorkspaceEdit.fromFileCodeEdits(this.client, response.body);
		}

		codeAction.command = { command: DidOrganizeImportsCommand.ID, title: '', arguments: [] };

		return codeAction;
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
		disposables.push(
			conditionalRegistration([
				requireMinVersion(client, command.minVersion ?? API.defaultVersion),
				requireSomeCapability(client, ClientCapability.Semantic),
			], () => {
				const provider = new ImportsCodeActionProvider(client, command, commandManager, fileConfigurationManager, telemetryReporter);
				return vscode.Disposable.from(
					vscode.languages.registerCodeActionsProvider(selector.semantic, provider, {
						providedCodeActionKinds: [command.kind]
					}));
			}),
			// Always register these commands. We will show a warning if the user tries to run them on an unsupported version
			...command.commandIds.map(id =>
				commandManager.register({
					id,
					execute() {
						return vscode.commands.executeCommand('editor.action.sourceAction', {
							kind: command.kind.value,
							apply: 'first',
						});
					}
				}))
		);
	}

	return vscode.Disposable.from(...disposables);
}
