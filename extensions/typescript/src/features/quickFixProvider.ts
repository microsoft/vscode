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
	private _supportedCodeActions?: Thenable<Set<number>>;

	public constructor(
		private readonly client: ITypeScriptServiceClient
	) { }

	public async getFixableDiagnosticsForContext(context: vscode.CodeActionContext): Promise<vscode.Diagnostic[]> {
		const supportedActions = await this.supportedCodeActions;
		return context.diagnostics.filter(diagnostic => supportedActions.has(+diagnostic.code));
	}

	private get supportedCodeActions(): Thenable<Set<number>> {
		if (!this._supportedCodeActions) {
			this._supportedCodeActions = this.client.execute('getSupportedCodeFixes', null, undefined)
				.then(response => response.body || [])
				.then(codes => codes.map(code => +code).filter(code => !isNaN(code)))
				.then(codes => new Set(codes));
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

		const fixableDiagnostics = await this.supportedCodeActionProvider.getFixableDiagnosticsForContext(context);
		if (!fixableDiagnostics.length) {
			return [];
		}

		await this.formattingConfigurationManager.ensureFormatOptionsForDocument(document, token);

		const results: vscode.CodeAction[] = [];
		for (const diagnostic of fixableDiagnostics) {
			const args: Proto.CodeFixRequestArgs = {
				...vsRangeToTsFileRange(file, diagnostic.range),
				errorCodes: [+diagnostic.code]
			};
			const response = await this.client.execute('getCodeFixes', args, token);
			if (response.body) {
				results.push(...response.body.map(action => this.getCommandForAction(diagnostic, action)));
			}
		}
		return results;
	}

	private getCommandForAction(
		diagnostic: vscode.Diagnostic,
		tsAction: Proto.CodeAction
	): vscode.CodeAction {
		const codeAction = new vscode.CodeAction(tsAction.description, getEditForCodeAction(this.client, tsAction));
		codeAction.diagnostics = [diagnostic];
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
