/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CodeActionProvider, TextDocument, Range, CancellationToken, CodeActionContext, Command } from 'vscode';

import * as Proto from '../protocol';
import { ITypeScriptServiceClient } from '../typescriptService';
import { vsRangeToTsFileRange } from '../utils/convert';
import FormattingConfigurationManager from './formattingConfigurationManager';
import { applyCodeAction } from '../utils/codeAction';
import { CommandManager } from '../utils/commandManager';

interface NumberSet {
	[key: number]: boolean;
}

export default class TypeScriptCodeActionProvider implements CodeActionProvider {
	private commandId: string;

	private _supportedCodeActions?: Thenable<NumberSet>;

	constructor(
		private readonly client: ITypeScriptServiceClient,
		private readonly formattingConfigurationManager: FormattingConfigurationManager,
		mode: string,
		commandManager: CommandManager
	) {
		this.commandId = `_typescript.applyCodeAction.${mode}`;
		commandManager.registerCommand(this.commandId, this.onCodeAction, this);
	}

	public async provideCodeActions(
		document: TextDocument,
		range: Range,
		context: CodeActionContext,
		token: CancellationToken
	): Promise<Command[]> {
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

	private async getSupportedActionsForContext(context: CodeActionContext): Promise<Set<number>> {
		const supportedActions = await this.supportedCodeActions;
		return new Set(context.diagnostics
			.map(diagnostic => +diagnostic.code)
			.filter(code => supportedActions[code]));
	}

	private getCommandForAction(action: Proto.CodeAction, file: string): Command {
		return {
			title: action.description,
			command: this.commandId,
			arguments: [action, file]
		};
	}

	private onCodeAction(action: Proto.CodeAction, file: string): Promise<boolean> {
		return applyCodeAction(this.client, action, file);
	}
}