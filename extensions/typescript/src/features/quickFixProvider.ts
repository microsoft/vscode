/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

import * as Proto from '../protocol';
import { ITypeScriptServiceClient } from '../typescriptService';
import { vsRangeToTsFileRange } from '../utils/convert';
import FormattingConfigurationManager from './formattingConfigurationManager';
import { getEditForCodeAction, applyCodeActionCommands } from '../utils/codeAction';
import { Command, CommandManager } from '../utils/commandManager';

interface NumberSet {
	[key: number]: boolean;
}

class ApplyCodeActionCommand implements Command {
	public static readonly ID = '_typescript.applyCodeActionCommand';
	public readonly id = ApplyCodeActionCommand.ID;

	constructor(
		private readonly client: ITypeScriptServiceClient
	) { }

	public async execute(
		actions: Proto.CodeAction
	): Promise<boolean> {
		return applyCodeActionCommands(this.client, actions);
	}
}

class SupportedCodeActionProvider {
	private _supportedCodeActions?: Thenable<NumberSet>;

	public constructor(
		private readonly client: ITypeScriptServiceClient
	) { }

	public async getSupportedActionsForContext(context: vscode.CodeActionContext): Promise<Set<number>> {
		const supportedActions = await this.supportedCodeActions;
		return new Set(context.diagnostics
			.map(diagnostic => +diagnostic.code)
			.filter(code => supportedActions[code]));
	}

	private get supportedCodeActions(): Thenable<NumberSet> {
		if (!this._supportedCodeActions) {
			this._supportedCodeActions = this.client.execute('getSupportedCodeFixes', null, undefined)
				.then(response => response.body || [])
				.then(codes => codes.map(code => +code).filter(code => !isNaN(code)))
				.then(codes =>
					codes.reduce((obj, code) => {
						obj[code] = true;
						return obj;
					}, Object.create(null)));
		}
		return this._supportedCodeActions;
	}
}

export default class TypeScriptQuickFixProvider implements vscode.CodeActionProvider {

	private readonly supportedCodeActionProvider: SupportedCodeActionProvider;

	constructor(
		private readonly client: ITypeScriptServiceClient,
		private readonly formattingConfigurationManager: FormattingConfigurationManager,
		commandManager: CommandManager
	) {
		commandManager.register(new ApplyCodeActionCommand(client));
		this.supportedCodeActionProvider = new SupportedCodeActionProvider(client);
	}

	public async provideCodeActions(
		document: vscode.TextDocument,
		range: vscode.Range,
		context: vscode.CodeActionContext,
		token: vscode.CancellationToken
	): Promise<vscode.CodeAction[]> {
		if (!this.client.apiVersion.has213Features()) {
			return [];
		}

		const file = this.client.normalizePath(document.uri);
		if (!file) {
			return [];
		}

		const supportedActions = await this.supportedCodeActionProvider.getSupportedActionsForContext(context);
		if (!supportedActions.size) {
			return [];
		}

		await this.formattingConfigurationManager.ensureFormatOptionsForDocument(document, token);

		const args: Proto.CodeFixRequestArgs = {
			...vsRangeToTsFileRange(file, range),
			errorCodes: Array.from(supportedActions)
		};
		const response = await this.client.execute('getCodeFixes', args, token);
		return (response.body || []).map(action => this.getCommandForAction(action));
	}

	private getCommandForAction(tsAction: Proto.CodeAction): vscode.CodeAction {
		const codeAction = new vscode.CodeAction(tsAction.description, getEditForCodeAction(this.client, tsAction));
		if (tsAction.commands) {
			codeAction.command = {
				command: ApplyCodeActionCommand.ID,
				arguments: [tsAction],
				title: tsAction.description
			};
		}
		return codeAction;
	}
}
