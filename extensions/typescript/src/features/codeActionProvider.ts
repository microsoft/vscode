/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

import * as Proto from '../protocol';
import { ITypeScriptServiceClient } from '../typescriptService';
import { vsRangeToTsFileRange } from '../utils/convert';
import FormattingConfigurationManager from './formattingConfigurationManager';
import { applyCodeAction } from '../utils/codeAction';
import { CommandManager, Command } from '../utils/commandManager';

interface NumberSet {
	[key: number]: boolean;
}

class ApplyCodeActionCommand implements Command {

	public static readonly ID: string = '_typescript.applyCodeAction';
	public readonly id: string = ApplyCodeActionCommand.ID;

	constructor(
		private readonly client: ITypeScriptServiceClient
	) { }

	execute(action: Proto.CodeAction, file: string): void {
		applyCodeAction(this.client, action, file);
	}
}

export default class TypeScriptCodeActionProvider implements vscode.CodeActionProvider {
	private _supportedCodeActions?: Thenable<NumberSet>;

	constructor(
		private readonly client: ITypeScriptServiceClient,
		private readonly formattingConfigurationManager: FormattingConfigurationManager,
		commandManager: CommandManager
	) {
		commandManager.register(new ApplyCodeActionCommand(this.client));
	}

	public async provideCodeActions(
		document: vscode.TextDocument,
		range: vscode.Range,
		context: vscode.CodeActionContext,
		token: vscode.CancellationToken
	): Promise<vscode.Command[]> {
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
		return (response.body || []).map(action => this.getCommandForAction(action, file));
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

	private getCommandForAction(action: Proto.CodeAction, file: string): vscode.Command {
		return {
			title: action.description,
			command: ApplyCodeActionCommand.ID,
			arguments: [action, file]
		};
	}
}