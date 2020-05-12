/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as nls from 'vscode-nls';
import type * as Proto from '../protocol';
import { ITypeScriptServiceClient } from '../typescriptService';
import API from '../utils/api';
import { VersionDependentRegistration } from '../utils/dependentRegistration';
import * as typeConverters from '../utils/typeConverters';
import { DiagnosticsManager } from './diagnostics';
import FileConfigurationManager from './fileConfigurationManager';
import * as errorCodes from '../utils/errorCodes';
import * as fixNames from '../utils/fixNames';

const localize = nls.loadMessageBundle();

interface AutoFixableError {
	readonly code: number;
	readonly fixName: string;
}

const fixImplementInterface = Object.freeze<AutoFixableError>({ code: errorCodes.incorrectlyImplementsInterface, fixName: fixNames.classIncorrectlyImplementsInterface });
const fixUnreachable = Object.freeze<AutoFixableError>({ code: errorCodes.unreachableCode, fixName: fixNames.unreachableCode });
const fixAsync = Object.freeze<AutoFixableError>({ code: errorCodes.asyncOnlyAllowedInAsyncFunctions, fixName: fixNames.awaitInSyncFunction });

class TypeScriptAutoFixProvider implements vscode.CodeActionProvider {

	private static readonly fixAllKind = vscode.CodeActionKind.SourceFixAll.append('ts');

	public static readonly metadata: vscode.CodeActionProviderMetadata = {
		providedCodeActionKinds: [
			TypeScriptAutoFixProvider.fixAllKind,
		]
	};

	constructor(
		private readonly client: ITypeScriptServiceClient,
		private readonly fileConfigurationManager: FileConfigurationManager,
		private readonly diagnosticsManager: DiagnosticsManager,
	) { }

	public async provideCodeActions(
		document: vscode.TextDocument,
		_range: vscode.Range,
		context: vscode.CodeActionContext,
		token: vscode.CancellationToken
	): Promise<vscode.CodeAction[] | undefined> {
		if (!context.only || !vscode.CodeActionKind.SourceFixAll.intersects(context.only)) {
			return undefined;
		}

		const file = this.client.toOpenedFilePath(document);
		if (!file) {
			return undefined;
		}

		const autoFixes = this.getAutoFixes();

		const autoFixableDiagnostics = this.getAutoFixableDiagnostics(document, autoFixes);
		if (!autoFixableDiagnostics.length) {
			return undefined;
		}

		const fixAllAction = await this.getFixAllCodeAction(document, file, autoFixableDiagnostics, autoFixes, token);
		return fixAllAction ? [fixAllAction] : undefined;
	}

	private getAutoFixableDiagnostics(
		document: vscode.TextDocument,
		autoFixes: readonly AutoFixableError[],
	): vscode.Diagnostic[] {
		if (this.client.bufferSyncSupport.hasPendingDiagnostics(document.uri)) {
			return [];
		}

		const fixableCodes = new Set(autoFixes.map(x => x.code));
		return this.diagnosticsManager.getDiagnostics(document.uri)
			.filter(x => fixableCodes.has(+(x.code as number)));
	}

	private async getFixAllCodeAction(
		document: vscode.TextDocument,
		file: string,
		diagnostics: ReadonlyArray<vscode.Diagnostic>,
		autoFixes: readonly AutoFixableError[],
		token: vscode.CancellationToken,
	): Promise<vscode.CodeAction | undefined> {
		await this.fileConfigurationManager.ensureConfigurationForDocument(document, token);

		const autoFixResponse = await this.getAutoFixEdit(file, diagnostics, autoFixes, token);
		if (!autoFixResponse) {
			return undefined;
		}
		const { edit, fixedDiagnostics } = autoFixResponse;
		if (!edit.size) {
			return undefined;
		}

		const codeAction = new vscode.CodeAction(
			localize('autoFix.label', 'Auto fix'),
			TypeScriptAutoFixProvider.fixAllKind);
		codeAction.edit = edit;
		codeAction.diagnostics = fixedDiagnostics;

		return codeAction;
	}

	private async getAutoFixEdit(
		file: string,
		diagnostics: ReadonlyArray<vscode.Diagnostic>,
		autoFixes: readonly AutoFixableError[],
		token: vscode.CancellationToken,
	): Promise<{ edit: vscode.WorkspaceEdit, fixedDiagnostics: vscode.Diagnostic[] } | undefined> {
		const edit = new vscode.WorkspaceEdit();
		const fixedDiagnostics: vscode.Diagnostic[] = [];
		for (const diagnostic of diagnostics) {
			const args: Proto.CodeFixRequestArgs = {
				...typeConverters.Range.toFileRangeRequestArgs(file, diagnostic.range),
				errorCodes: [+(diagnostic.code!)]
			};
			const response = await this.client.execute('getCodeFixes', args, token);
			if (response.type !== 'response' || !response.body || response.body.length > 1) {
				continue;
			}

			const fix = response.body[0];
			if (autoFixes.some(autoFix => autoFix.fixName.includes(fix.fixName))) {
				typeConverters.WorkspaceEdit.withFileCodeEdits(edit, this.client, fix.changes);
				fixedDiagnostics.push(diagnostic);
			}
		}

		if (!fixedDiagnostics.length) {
			return undefined;
		}

		return { edit, fixedDiagnostics };
	}

	private getAutoFixes(): readonly AutoFixableError[] {
		return [
			fixImplementInterface,
			fixUnreachable,
			fixAsync,
		];
	}
}

export function register(
	selector: vscode.DocumentSelector,
	client: ITypeScriptServiceClient,
	fileConfigurationManager: FileConfigurationManager,
	diagnosticsManager: DiagnosticsManager) {
	return new VersionDependentRegistration(client, API.v300, () =>
		vscode.languages.registerCodeActionsProvider(selector,
			new TypeScriptAutoFixProvider(client, fileConfigurationManager, diagnosticsManager),
			TypeScriptAutoFixProvider.metadata));
}
