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

export default class TypeScriptQuickFixProvider implements vscode.CodeActionProvider {
	private _supportedCodeActions?: Thenable<NumberSet>;

	constructor(
		private readonly client: ITypeScriptServiceClient,
		private readonly formattingConfigurationManager: FormattingConfigurationManager,
		commandManager: CommandManager
	) {
		commandManager.register(new ApplyCodeActionCommand(client));
	}

	public provideCodeActions(
		_document: vscode.TextDocument,
		_range: vscode.Range,
		_context: vscode.CodeActionContext,
		_token: vscode.CancellationToken
	) {
		// Uses provideCodeActions2 instead
		return [];
	}

	public async provideCodeActions2(
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

		const supportedActions = await this.getSupportedActionsForContext(context);
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

	private async getSupportedActionsForContext(context: vscode.CodeActionContext): Promise<Set<number>> {
		const supportedActions = await this.supportedCodeActions;
		return new Set(context.diagnostics
			.map(diagnostic => +diagnostic.code)
			.filter(code => supportedActions[code]));
	}

	private getCommandForAction(action: Proto.CodeAction): vscode.CodeAction {
		return {
			title: action.description,
			edit: getEditForCodeAction(this.client, action),
			command: action.commands ? {
				command: ApplyCodeActionCommand.ID,
				arguments: [action],
				title: action.description
			} : undefined,
			diagnostics: []
		};
	}
}
