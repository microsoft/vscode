/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CodeActionProvider, TextDocument, Range, CancellationToken, CodeActionContext, Command, commands, workspace, WorkspaceEdit } from 'vscode';

import * as Proto from '../protocol';
import { ITypescriptServiceClient } from '../typescriptService';
import { tsTextSpanToVsRange, vsRangeToTsFileRange } from '../utils/convert';
import FormattingConfigurationManager from './formattingConfigurationManager';

interface NumberSet {
	[key: number]: boolean;
}

export default class TypeScriptCodeActionProvider implements CodeActionProvider {
	private commandId: string;

	private _supportedCodeActions?: Thenable<NumberSet>;

	constructor(
		private readonly client: ITypescriptServiceClient,
		private readonly formattingConfigurationManager: FormattingConfigurationManager,
		mode: string
	) {
		this.commandId = `_typescript.applyCodeAction.${mode}`;
		commands.registerCommand(this.commandId, this.onCodeAction, this);
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

	private getSupportedActionsForContext(context: CodeActionContext): Thenable<Set<number>> {
		return this.supportedCodeActions.then(supportedActions =>
			new Set(context.diagnostics
				.map(diagnostic => +diagnostic.code)
				.filter(code => supportedActions[code])));
	}

	private getCommandForAction(action: Proto.CodeAction): Command {
		return {
			title: action.description,
			command: this.commandId,
			arguments: [action]
		};
	}

	private async onCodeAction(action: Proto.CodeAction): Promise<boolean> {
		const workspaceEdit = new WorkspaceEdit();
		for (const change of action.changes) {
			for (const textChange of change.textChanges) {
				workspaceEdit.replace(this.client.asUrl(change.fileName),
					tsTextSpanToVsRange(textChange),
					textChange.newText);
			}
		}

		return workspace.applyEdit(workspaceEdit);
	}
}