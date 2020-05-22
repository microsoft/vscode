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
import * as errorCodes from '../utils/errorCodes';
import * as fixNames from '../utils/fixNames';
import * as typeConverters from '../utils/typeConverters';
import { DiagnosticsManager } from './diagnostics';
import FileConfigurationManager from './fileConfigurationManager';

const localize = nls.loadMessageBundle();

interface AutoFix {
	readonly code: number;
	readonly fixName: string;
}

async function buildIndividualFixes(
	fixes: readonly AutoFix[],
	edit: vscode.WorkspaceEdit,
	client: ITypeScriptServiceClient,
	file: string,
	diagnostics: readonly vscode.Diagnostic[],
	token: vscode.CancellationToken,
): Promise<void> {
	for (const diagnostic of diagnostics) {
		for (const { code, fixName } of fixes) {
			if (token.isCancellationRequested) {
				return;
			}

			if (diagnostic.code !== code) {
				continue;
			}

			const args: Proto.CodeFixRequestArgs = {
				...typeConverters.Range.toFileRangeRequestArgs(file, diagnostic.range),
				errorCodes: [+(diagnostic.code!)]
			};

			const response = await client.execute('getCodeFixes', args, token);
			if (response.type !== 'response') {
				continue;
			}

			const fix = response.body?.find(fix => fix.fixName === fixName);
			if (fix) {
				typeConverters.WorkspaceEdit.withFileCodeEdits(edit, client, fix.changes);
				break;
			}
		}
	}
}

async function buildCombinedFix(
	fixes: readonly AutoFix[],
	edit: vscode.WorkspaceEdit,
	client: ITypeScriptServiceClient,
	file: string,
	diagnostics: readonly vscode.Diagnostic[],
	token: vscode.CancellationToken,
): Promise<void> {
	for (const diagnostic of diagnostics) {
		for (const { code, fixName } of fixes) {
			if (token.isCancellationRequested) {
				return;
			}

			if (diagnostic.code !== code) {
				continue;
			}

			const args: Proto.CodeFixRequestArgs = {
				...typeConverters.Range.toFileRangeRequestArgs(file, diagnostic.range),
				errorCodes: [+(diagnostic.code!)]
			};

			const response = await client.execute('getCodeFixes', args, token);
			if (response.type !== 'response' || !response.body?.length) {
				continue;
			}

			const fix = response.body?.find(fix => fix.fixName === fixName);
			if (!fix) {
				continue;
			}

			if (!fix.fixId) {
				typeConverters.WorkspaceEdit.withFileCodeEdits(edit, client, fix.changes);
				return;
			}

			const combinedArgs: Proto.GetCombinedCodeFixRequestArgs = {
				scope: {
					type: 'file',
					args: { file }
				},
				fixId: fix.fixId,
			};

			const combinedResponse = await client.execute('getCombinedCodeFix', combinedArgs, token);
			if (combinedResponse.type !== 'response' || !combinedResponse.body) {
				return;
			}

			typeConverters.WorkspaceEdit.withFileCodeEdits(edit, client, combinedResponse.body.changes);
			return;
		}
	}
}

// #region Source Actions

abstract class SourceAction extends vscode.CodeAction {
	abstract async build(
		client: ITypeScriptServiceClient,
		file: string,
		diagnostics: readonly vscode.Diagnostic[],
		token: vscode.CancellationToken,
	): Promise<void>;
}

class SourceFixAll extends SourceAction {

	static readonly kind = vscode.CodeActionKind.SourceFixAll.append('ts');

	constructor() {
		super(localize('autoFix.label', 'Fix All'), SourceFixAll.kind);
	}

	async build(client: ITypeScriptServiceClient, file: string, diagnostics: readonly vscode.Diagnostic[], token: vscode.CancellationToken): Promise<void> {
		this.edit = new vscode.WorkspaceEdit();

		await buildIndividualFixes([
			{ code: errorCodes.incorrectlyImplementsInterface, fixName: fixNames.classIncorrectlyImplementsInterface },
			{ code: errorCodes.asyncOnlyAllowedInAsyncFunctions, fixName: fixNames.awaitInSyncFunction },
		], this.edit, client, file, diagnostics, token);

		await buildCombinedFix([
			{ code: errorCodes.unreachableCode, fixName: fixNames.unreachableCode }
		], this.edit, client, file, diagnostics, token);
	}
}

class SourceRemoveUnused extends SourceAction {

	static readonly kind = vscode.CodeActionKind.Source.append('removeUnused').append('ts');

	constructor() {
		super(localize('autoFix.unused.label', 'Remove all unused code'), SourceRemoveUnused.kind);
	}

	async build(client: ITypeScriptServiceClient, file: string, diagnostics: readonly vscode.Diagnostic[], token: vscode.CancellationToken): Promise<void> {
		this.edit = new vscode.WorkspaceEdit();
		await buildCombinedFix([
			{ code: errorCodes.variableDeclaredButNeverUsed, fixName: fixNames.unusedIdentifier },
		], this.edit, client, file, diagnostics, token);
	}
}

class SourceAddMissingImports extends SourceAction {

	static readonly kind = vscode.CodeActionKind.Source.append('addMissingImports').append('ts');

	constructor() {
		super(localize('autoFix.missingImports.label', 'Add all missing imports'), SourceAddMissingImports.kind);
	}

	async build(client: ITypeScriptServiceClient, file: string, diagnostics: readonly vscode.Diagnostic[], token: vscode.CancellationToken): Promise<void> {
		this.edit = new vscode.WorkspaceEdit();
		await buildCombinedFix(
			errorCodes.cannotFindName.map(code => ({ code, fixName: fixNames.fixImport })),
			this.edit, client, file, diagnostics, token);
	}
}

//#endregion

class TypeScriptAutoFixProvider implements vscode.CodeActionProvider {

	public static readonly metadata: vscode.CodeActionProviderMetadata = {
		providedCodeActionKinds: [
			SourceFixAll.kind,
			SourceRemoveUnused.kind,
			SourceAddMissingImports.kind,
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
		if (!context.only || !vscode.CodeActionKind.Source.intersects(context.only)) {
			return undefined;
		}

		const file = this.client.toOpenedFilePath(document);
		if (!file) {
			return undefined;
		}

		const actions = this.getFixAllActions(context.only);
		if (this.client.bufferSyncSupport.hasPendingDiagnostics(document.uri)) {
			return actions;
		}

		const diagnostics = this.diagnosticsManager.getDiagnostics(document.uri);
		if (!diagnostics.length) {
			// Actions are a no-op in this case but we still want to return them
			return actions;
		}

		await this.fileConfigurationManager.ensureConfigurationForDocument(document, token);

		if (token.isCancellationRequested) {
			return undefined;
		}

		await Promise.all(actions.map(action => action.build(this.client, file, diagnostics, token)));

		return actions;
	}

	private getFixAllActions(only: vscode.CodeActionKind): SourceAction[] {
		const fixes = [];

		if (only.intersects(SourceFixAll.kind)) {
			fixes.push(new SourceFixAll());
		}

		if (only.intersects(SourceRemoveUnused.kind)) {
			fixes.push(new SourceRemoveUnused());
		}

		if (only.intersects(SourceAddMissingImports.kind)) {
			fixes.push(new SourceAddMissingImports());
		}

		return fixes;
	}
}

export function register(
	selector: vscode.DocumentSelector,
	client: ITypeScriptServiceClient,
	fileConfigurationManager: FileConfigurationManager,
	diagnosticsManager: DiagnosticsManager,
) {
	return new VersionDependentRegistration(client, API.v300, () =>
		vscode.languages.registerCodeActionsProvider(selector,
			new TypeScriptAutoFixProvider(client, fileConfigurationManager, diagnosticsManager),
			TypeScriptAutoFixProvider.metadata));
}
