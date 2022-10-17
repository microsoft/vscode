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


abstract class BaseOrganizeImportsCommand implements Command {
	protected abstract readonly mode: OrganizeImportsMode;

	constructor(
		public id: string,
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
			skipDestructiveCodeActions: this.mode === OrganizeImportsMode.SortAndCombine,
			mode: typeConverters.OrganizeImportsMode.toProtocolOrganizeImportsMode(this.mode),
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

class OrganizeImportsCommand extends BaseOrganizeImportsCommand {
	public static readonly id = 'organizeImports';
	public static minVersion = API.v280;
	public static title = localize('organizeImportsAction.title', "Organize Imports");
	public readonly mode = OrganizeImportsMode.All;
}

class SortImportsCommand extends BaseOrganizeImportsCommand {
	public static readonly id = 'sortImports';
	public static minVersion = API.v430;
	public static title = localize('sortImportsAction.title', "Sort Imports");
	public readonly mode = OrganizeImportsMode.SortAndCombine;
	public static context = 'tsSupportsSortImports';
}

class RemoveUnusedImportsCommand extends BaseOrganizeImportsCommand {
	public static readonly id = 'removeUnusedImports';
	public static minVersion = API.v490;
	public static title = localize('removeUnusedImportsAction.title', "Remove Unused Imports");
	public readonly mode = OrganizeImportsMode.RemoveUnused;
	public static context = 'tsSupportsRemoveUnusedImports';
}

interface OrganizeImportsCommandClass {
	readonly id: string;
	readonly title: string;
	readonly context?: string;
	readonly minVersion: API;
	new(id: string, client: ITypeScriptServiceClient, telemetryReporter: TelemetryReporter): BaseOrganizeImportsCommand;
}

class ImportsCodeActionProvider implements vscode.CodeActionProvider {

	static register(
		client: ITypeScriptServiceClient,
		kind: vscode.CodeActionKind,
		Command: OrganizeImportsCommandClass,
		commandManager: CommandManager,
		fileConfigurationManager: FileConfigurationManager,
		telemetryReporter: TelemetryReporter,
		selector: DocumentSelector
	): vscode.Disposable {
		return conditionalRegistration([
			requireMinVersion(client, Command.minVersion),
			requireSomeCapability(client, ClientCapability.Semantic),
		], () => {
			const provider = new ImportsCodeActionProvider(client, kind, Command, commandManager, fileConfigurationManager, telemetryReporter);
			return vscode.languages.registerCodeActionsProvider(selector.semantic, provider, {
				providedCodeActionKinds: [kind]
			});
		});
	}

	public constructor(
		private readonly client: ITypeScriptServiceClient,
		private readonly kind: vscode.CodeActionKind,
		private readonly Command: OrganizeImportsCommandClass,
		commandManager: CommandManager,
		private readonly fileConfigManager: FileConfigurationManager,
		telemetryReporter: TelemetryReporter,
	) {
		commandManager.register(new Command(`typescript.${Command.id}`, client, telemetryReporter));
		if (Command !== OrganizeImportsCommand) {
			// The non-built-in variants have get duplicated with javascript-specific ids
			// can show "JavasScript" as the category
			commandManager.register(new Command(`javascript.${Command.id}`, client, telemetryReporter));
		}

		if (Command.context) {
			updateContext();
			client.onTsServerStarted(() => updateContext());
			function updateContext() {
				vscode.commands.executeCommand('setContext', Command.context, client.apiVersion.gte(Command.minVersion));
			}
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

		if (!context.only || !context.only.contains(this.kind)) {
			return [];
		}

		this.fileConfigManager.ensureConfigurationForDocument(document, token);

		const action = new vscode.CodeAction(this.Command.title, this.kind);
		action.command = { title: '', command: this.Command.id, arguments: [file] };
		return [action];
	}
}

export function register(
	selector: DocumentSelector,
	client: ITypeScriptServiceClient,
	commandManager: CommandManager,
	fileConfigurationManager: FileConfigurationManager,
	telemetryReporter: TelemetryReporter,
) {
	return vscode.Disposable.from(
		ImportsCodeActionProvider.register(
			client,
			vscode.CodeActionKind.SourceOrganizeImports,
			OrganizeImportsCommand,
			commandManager,
			fileConfigurationManager,
			telemetryReporter,
			selector
		),
		ImportsCodeActionProvider.register(
			client,
			vscode.CodeActionKind.Source.append(SortImportsCommand.id),
			SortImportsCommand,
			commandManager,
			fileConfigurationManager,
			telemetryReporter,
			selector
		),
		ImportsCodeActionProvider.register(
			client,
			vscode.CodeActionKind.Source.append(RemoveUnusedImportsCommand.id),
			RemoveUnusedImportsCommand,
			commandManager,
			fileConfigurationManager,
			telemetryReporter,
			selector
		),
	);
}
