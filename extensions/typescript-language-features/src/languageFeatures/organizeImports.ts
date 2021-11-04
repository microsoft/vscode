/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as nls from 'vscode-nls';
import { Command, CommandManager } from '../commands/commandManager';
import type * as Proto from '../protocol';
import { ClientCapability, ITypeScriptServiceClient } from '../typescriptService';
import API from '../utils/api';
import { nulToken } from '../utils/cancellation';
import { conditionalRegistration, requireMinVersion, requireSomeCapability } from '../utils/dependentRegistration';
import { DocumentSelector } from '../utils/documentSelector';
import { TelemetryReporter } from '../utils/telemetry';
import * as typeConverters from '../utils/typeConverters';
import FileConfigurationManager from './fileConfigurationManager';

const localize = nls.loadMessageBundle();


class OrganizeImportsCommand implements Command {
	public static readonly Id = '_typescript.organizeImports';

	public readonly id = OrganizeImportsCommand.Id;

	constructor(
		private readonly client: ITypeScriptServiceClient,
		private readonly telemetryReporter: TelemetryReporter,
	) { }

	public async execute(file: string, sortOnly = false): Promise<any> {
		/* __GDPR__
			"organizeImports.execute" : {
				"${include}": [
					"${TypeScriptCommonProperties}"
				]
			}
		*/
		this.telemetryReporter.logTelemetry('organizeImports.execute', {});

		const args: Proto.OrganizeImportsRequestArgs = {
			scope: {
				type: 'file',
				args: {
					file
				}
			},
			skipDestructiveCodeActions: sortOnly,
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

	static register(
		client: ITypeScriptServiceClient,
		minVersion: API,
		kind: vscode.CodeActionKind,
		title: string,
		sortOnly: boolean,
		commandManager: CommandManager,
		fileConfigurationManager: FileConfigurationManager,
		telemetryReporter: TelemetryReporter,
		selector: DocumentSelector
	): vscode.Disposable {
		return conditionalRegistration([
			requireMinVersion(client, minVersion),
			requireSomeCapability(client, ClientCapability.Semantic),
		], () => {
			const provider = new ImportsCodeActionProvider(client, kind, title, sortOnly, commandManager, fileConfigurationManager, telemetryReporter);
			return vscode.languages.registerCodeActionsProvider(selector.semantic, provider, {
				providedCodeActionKinds: [kind]
			});
		});
	}

	public constructor(
		private readonly client: ITypeScriptServiceClient,
		private readonly kind: vscode.CodeActionKind,
		private readonly title: string,
		private readonly sortOnly: boolean,
		commandManager: CommandManager,
		private readonly fileConfigManager: FileConfigurationManager,
		telemetryReporter: TelemetryReporter,
	) {
		commandManager.register(new OrganizeImportsCommand(client, telemetryReporter));
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

		const action = new vscode.CodeAction(this.title, this.kind);
		action.command = { title: '', command: OrganizeImportsCommand.Id, arguments: [file, this.sortOnly] };
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
			API.v280,
			vscode.CodeActionKind.SourceOrganizeImports,
			localize('organizeImportsAction.title', "Organize Imports"),
			false,
			commandManager,
			fileConfigurationManager,
			telemetryReporter,
			selector
		),
		ImportsCodeActionProvider.register(
			client,
			API.v430,
			vscode.CodeActionKind.Source.append('sortImports'),
			localize('sortImportsAction.title', "Sort Imports"),
			true,
			commandManager,
			fileConfigurationManager,
			telemetryReporter,
			selector
		),
	);
}
