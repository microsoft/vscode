/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

import * as Proto from '../protocol';
import { ITypeScriptServiceClient } from '../typescriptService';
import * as typeConverters from '../utils/typeConverters';
import FormattingConfigurationManager from './formattingConfigurationManager';
import { getEditForCodeAction, applyCodeActionCommands } from '../utils/codeAction';
import { Command, CommandManager } from '../utils/commandManager';
import { createWorkspaceEditFromFileCodeEdits } from '../utils/workspaceEdit';
import DiagnosticsManager from './diagnostics';

import * as nls from 'vscode-nls';
const localize = nls.loadMessageBundle();

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


class ApplyFixAllCodeAction implements Command {
	public static readonly ID = '_typescript.applyFixAllCodeAction';
	public readonly id = ApplyFixAllCodeAction.ID;

	constructor(
		private readonly client: ITypeScriptServiceClient
	) { }

	public async execute(
		file: string,
		tsAction: Proto.CodeFixAction,
	): Promise<void> {
		if (!tsAction.fixId) {
			return;
		}

		const args: Proto.GetCombinedCodeFixRequestArgs = {
			scope: {
				type: 'file',
				args: { file }
			},
			fixId: tsAction.fixId
		};

		try {
			const combinedCodeFixesResponse = await this.client.execute('getCombinedCodeFix', args);
			if (!combinedCodeFixesResponse.body) {
				return;
			}

			const edit = createWorkspaceEditFromFileCodeEdits(this.client, combinedCodeFixesResponse.body.changes);
			await vscode.workspace.applyEdit(edit);

			if (combinedCodeFixesResponse.command) {
				await vscode.commands.executeCommand(ApplyCodeActionCommand.ID, combinedCodeFixesResponse.command);
			}
		} catch {
			// noop
		}
	}
}

/**
 * Unique set of diagnostics keyed on diagnostic range and error code.
 */
class DiagnosticsSet {
	public static from(diagnostics: vscode.Diagnostic[]) {
		const values = new Map<string, vscode.Diagnostic>();
		for (const diagnostic of diagnostics) {
			values.set(DiagnosticsSet.key(diagnostic), diagnostic);
		}
		return new DiagnosticsSet(values);
	}

	private static key(diagnostic: vscode.Diagnostic) {
		const { start, end } = diagnostic.range;
		return `${diagnostic.code}-${start.line},${start.character}-${end.line},${end.character}`;
	}

	private constructor(
		private readonly _values: Map<string, vscode.Diagnostic>
	) { }

	public get values(): Iterable<vscode.Diagnostic> {
		return this._values.values();
	}
}

class SupportedCodeActionProvider {
	private _supportedCodeActions?: Thenable<Set<number>>;

	public constructor(
		private readonly client: ITypeScriptServiceClient
	) { }

	public async getFixableDiagnosticsForContext(context: vscode.CodeActionContext): Promise<vscode.Diagnostic[]> {
		const supportedActions = await this.supportedCodeActions;
		const fixableDiagnostics = DiagnosticsSet.from(context.diagnostics.filter(diagnostic => supportedActions.has(+diagnostic.code)));
		return Array.from(fixableDiagnostics.values);
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
		commandManager: CommandManager,
		private readonly diagnosticsManager: DiagnosticsManager
	) {
		commandManager.register(new ApplyCodeActionCommand(client));
		commandManager.register(new ApplyFixAllCodeAction(client));

		this.supportedCodeActionProvider = new SupportedCodeActionProvider(client);
	}

	public async provideCodeActions(
		document: vscode.TextDocument,
		_range: vscode.Range,
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
			results.push(...await this.getFixesForDiagnostic(document, file, diagnostic, token));
		}
		return results;
	}

	private async getFixesForDiagnostic(
		document: vscode.TextDocument,
		file: string,
		diagnostic: vscode.Diagnostic,
		token: vscode.CancellationToken
	): Promise<Iterable<vscode.CodeAction>> {
		const args: Proto.CodeFixRequestArgs = {
			...typeConverters.Range.toFileRangeRequestArgs(file, diagnostic.range),
			errorCodes: [+diagnostic.code]
		};
		const codeFixesResponse = await this.client.execute('getCodeFixes', args, token);
		if (codeFixesResponse.body) {
			const results: vscode.CodeAction[] = [];
			for (const tsCodeFix of codeFixesResponse.body) {
				results.push(...await this.getAllFixesForTsCodeAction(document, file, diagnostic, tsCodeFix));
			}
			return results;
		}
		return [];
	}

	private async getAllFixesForTsCodeAction(
		document: vscode.TextDocument,
		file: string,
		diagnostic: vscode.Diagnostic,
		tsAction: Proto.CodeFixAction
	): Promise<Iterable<vscode.CodeAction>> {
		const singleFix = this.getSingleFixForTsCodeAction(diagnostic, tsAction);
		const fixAll = await this.getFixAllForTsCodeAction(document, file, diagnostic, tsAction);
		return fixAll ? [singleFix, fixAll] : [singleFix];
	}

	private getSingleFixForTsCodeAction(
		diagnostic: vscode.Diagnostic,
		tsAction: Proto.CodeFixAction
	): vscode.CodeAction {
		const codeAction = new vscode.CodeAction(tsAction.description, vscode.CodeActionKind.QuickFix);
		codeAction.edit = getEditForCodeAction(this.client, tsAction);
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

	private async getFixAllForTsCodeAction(
		document: vscode.TextDocument,
		file: string,
		diagnostic: vscode.Diagnostic,
		tsAction: Proto.CodeFixAction,
	): Promise<vscode.CodeAction | undefined> {
		if (!tsAction.fixId || !this.client.apiVersion.has270Features()) {
			return undefined;
		}

		// Make sure there are multiple diagnostics of the same type in the file
		if (!this.diagnosticsManager.getDiagnostics(document.uri).some(x => x.code === diagnostic.code && x !== diagnostic)) {
			return;
		}

		const action = new vscode.CodeAction(
			localize('fixAllInFileLabel', '{0} (Fix all in file)', tsAction.description),
			vscode.CodeActionKind.QuickFix);
		action.diagnostics = [diagnostic];

		action.command = {
			command: ApplyFixAllCodeAction.ID,
			arguments: [file, tsAction],
			title: ''
		};
		return action;
	}
}
