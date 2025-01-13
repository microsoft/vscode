/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { DocumentSelector } from '../configuration/documentSelector';
import * as errorCodes from '../tsServer/protocol/errorCodes';
import * as fixNames from '../tsServer/protocol/fixNames';
import type * as Proto from '../tsServer/protocol/protocol';
import * as typeConverters from '../typeConverters';
import { ClientCapability, ITypeScriptServiceClient } from '../typescriptService';
import { DiagnosticsManager } from './diagnostics';
import FileConfigurationManager from './fileConfigurationManager';
import { conditionalRegistration, requireSomeCapability } from './util/dependentRegistration';


interface AutoFix {
	readonly codes: Set<number>;
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
		for (const { codes, fixName } of fixes) {
			if (token.isCancellationRequested) {
				return;
			}

			if (!codes.has(diagnostic.code as number)) {
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
		for (const { codes, fixName } of fixes) {
			if (token.isCancellationRequested) {
				return;
			}

			if (!codes.has(diagnostic.code as number)) {
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
	abstract build(
		client: ITypeScriptServiceClient,
		file: string,
		diagnostics: readonly vscode.Diagnostic[],
		token: vscode.CancellationToken,
	): Promise<void>;
}

class SourceFixAll extends SourceAction {

	static readonly kind = vscode.CodeActionKind.SourceFixAll.append('ts');

	constructor() {
		super(vscode.l10n.t("Fix all fixable JS/TS issues"), SourceFixAll.kind);
	}

	async build(client: ITypeScriptServiceClient, file: string, diagnostics: readonly vscode.Diagnostic[], token: vscode.CancellationToken): Promise<void> {
		this.edit = new vscode.WorkspaceEdit();

		await buildIndividualFixes([
			{ codes: errorCodes.incorrectlyImplementsInterface, fixName: fixNames.classIncorrectlyImplementsInterface },
			{ codes: errorCodes.asyncOnlyAllowedInAsyncFunctions, fixName: fixNames.awaitInSyncFunction },
		], this.edit, client, file, diagnostics, token);

		await buildCombinedFix([
			{ codes: errorCodes.unreachableCode, fixName: fixNames.unreachableCode }
		], this.edit, client, file, diagnostics, token);
	}
}

class SourceRemoveUnused extends SourceAction {

	static readonly kind = vscode.CodeActionKind.Source.append('removeUnused').append('ts');

	constructor() {
		super(vscode.l10n.t("Remove all unused code"), SourceRemoveUnused.kind);
	}

	async build(client: ITypeScriptServiceClient, file: string, diagnostics: readonly vscode.Diagnostic[], token: vscode.CancellationToken): Promise<void> {
		this.edit = new vscode.WorkspaceEdit();
		await buildCombinedFix([
			{ codes: errorCodes.variableDeclaredButNeverUsed, fixName: fixNames.unusedIdentifier },
		], this.edit, client, file, diagnostics, token);
	}
}

class SourceAddMissingImports extends SourceAction {

	static readonly kind = vscode.CodeActionKind.Source.append('addMissingImports').append('ts');

	constructor() {
		super(vscode.l10n.t("Add all missing imports"), SourceAddMissingImports.kind);
	}

	async build(client: ITypeScriptServiceClient, file: string, diagnostics: readonly vscode.Diagnostic[], token: vscode.CancellationToken): Promise<void> {
		this.edit = new vscode.WorkspaceEdit();
		await buildCombinedFix([
			{ codes: errorCodes.cannotFindName, fixName: fixNames.fixImport }
		],
			this.edit, client, file, diagnostics, token);
	}
}

//#endregion

class TypeScriptAutoFixProvider implements vscode.CodeActionProvider {

	private static readonly kindProviders = [
		SourceFixAll,
		SourceRemoveUnused,
		SourceAddMissingImports,
	];

	constructor(
		private readonly client: ITypeScriptServiceClient,
		private readonly fileConfigurationManager: FileConfigurationManager,
		private readonly diagnosticsManager: DiagnosticsManager,
	) { }

	public get metadata(): vscode.CodeActionProviderMetadata {
		return {
			providedCodeActionKinds: TypeScriptAutoFixProvider.kindProviders.map(x => x.kind),
		};
	}

	public async provideCodeActions(
		document: vscode.TextDocument,
		_range: vscode.Range,
		context: vscode.CodeActionContext,
		token: vscode.CancellationToken
	): Promise<vscode.CodeAction[] | undefined> {
		if (!context.only || !vscode.CodeActionKind.Source.intersects(context.only)) {
			return undefined;
		}

		const file = this.client.toOpenTsFilePath(document);
		if (!file) {
			return undefined;
		}

		const actions = this.getFixAllActions(context.only);
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
		return TypeScriptAutoFixProvider.kindProviders
			.filter(provider => only.intersects(provider.kind))
			.map(provider => new provider());
	}
}

export function register(
	selector: DocumentSelector,
	client: ITypeScriptServiceClient,
	fileConfigurationManager: FileConfigurationManager,
	diagnosticsManager: DiagnosticsManager,
) {
	return conditionalRegistration([
		requireSomeCapability(client, ClientCapability.Semantic),
	], () => {
		const provider = new TypeScriptAutoFixProvider(client, fileConfigurationManager, diagnosticsManager);
		return vscode.languages.registerCodeActionsProvider(selector.semantic, provider, provider.metadata);
	});
}
