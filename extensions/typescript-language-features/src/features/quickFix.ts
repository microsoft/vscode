/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as nls from 'vscode-nls';
import * as Proto from '../protocol';
import { ITypeScriptServiceClient } from '../typescriptService';
import API from '../utils/api';
import { nulToken } from '../utils/cancellation';
import { applyCodeActionCommands, getEditForCodeAction } from '../utils/codeAction';
import { Command, CommandManager } from '../utils/commandManager';
import { VersionDependentRegistration } from '../utils/dependentRegistration';
import { memoize } from '../utils/memoize';
import TelemetryReporter from '../utils/telemetry';
import * as typeConverters from '../utils/typeConverters';
import { DiagnosticsManager } from './diagnostics';
import FileConfigurationManager from './fileConfigurationManager';

const localize = nls.loadMessageBundle();

class ApplyCodeActionCommand implements Command {
	public static readonly ID = '_typescript.applyCodeActionCommand';
	public readonly id = ApplyCodeActionCommand.ID;

	constructor(
		private readonly client: ITypeScriptServiceClient,
		private readonly telemetryReporter: TelemetryReporter,
	) { }

	public async execute(
		action: Proto.CodeFixAction
	): Promise<boolean> {
		/* __GDPR__
			"quickFix.execute" : {
				"fixName" : { "classification": "PublicNonPersonalData", "purpose": "FeatureInsight" },
				"${include}": [
					"${TypeScriptCommonProperties}"
				]
			}
		*/
		this.telemetryReporter.logTelemetry('quickFix.execute', {
			fixName: action.fixName
		});

		return applyCodeActionCommands(this.client, action.commands, nulToken);
	}
}


class ApplyFixAllCodeAction implements Command {
	public static readonly ID = '_typescript.applyFixAllCodeAction';
	public readonly id = ApplyFixAllCodeAction.ID;

	constructor(
		private readonly client: ITypeScriptServiceClient,
		private readonly telemetryReporter: TelemetryReporter,
	) { }

	public async execute(
		file: string,
		tsAction: Proto.CodeFixAction,
	): Promise<void> {
		if (!tsAction.fixId) {
			return;
		}

		/* __GDPR__
			"quickFixAll.execute" : {
				"fixName" : { "classification": "PublicNonPersonalData", "purpose": "FeatureInsight" },
				"${include}": [
					"${TypeScriptCommonProperties}"
				]
			}
		*/
		this.telemetryReporter.logTelemetry('quickFixAll.execute', {
			fixName: tsAction.fixName
		});

		const args: Proto.GetCombinedCodeFixRequestArgs = {
			scope: {
				type: 'file',
				args: { file }
			},
			fixId: tsAction.fixId,
		};

		const response = await this.client.execute('getCombinedCodeFix', args, nulToken);
		if (response.type !== 'response' || !response.body) {
			return undefined;
		}

		const edit = typeConverters.WorkspaceEdit.fromFileCodeEdits(this.client, response.body.changes);
		await vscode.workspace.applyEdit(edit);
		await applyCodeActionCommands(this.client, response.body.commands, nulToken);
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

	public get size() {
		return this._values.size;
	}
}

class CodeActionSet {
	private readonly _actions = new Set<vscode.CodeAction>();
	private readonly _fixAllActions = new Map<{}, vscode.CodeAction>();

	public get values(): Iterable<vscode.CodeAction> {
		return this._actions;
	}

	public addAction(action: vscode.CodeAction) {
		this._actions.add(action);
	}

	public addFixAllAction(fixId: {}, action: vscode.CodeAction) {
		const existing = this._fixAllActions.get(fixId);
		if (existing) {
			// reinsert action at back of actions list
			this._actions.delete(existing);
		}
		this.addAction(action);
		this._fixAllActions.set(fixId, action);
	}

	public hasFixAllAction(fixId: {}) {
		return this._fixAllActions.has(fixId);
	}
}

class SupportedCodeActionProvider {
	public constructor(
		private readonly client: ITypeScriptServiceClient
	) { }

	public async getFixableDiagnosticsForContext(context: vscode.CodeActionContext): Promise<DiagnosticsSet> {
		const fixableCodes = await this.fixableDiagnosticCodes;
		return DiagnosticsSet.from(
			context.diagnostics.filter(diagnostic => typeof diagnostic.code !== 'undefined' && fixableCodes.has(diagnostic.code + '')));
	}

	@memoize
	private get fixableDiagnosticCodes(): Thenable<Set<string>> {
		return this.client.execute('getSupportedCodeFixes', null, nulToken)
			.then(response => response.type === 'response' ? response.body || [] : [])
			.then(codes => new Set(codes));
	}
}

class TypeScriptQuickFixProvider implements vscode.CodeActionProvider {
	public static readonly minVersion = API.v213;

	public static readonly metadata: vscode.CodeActionProviderMetadata = {
		providedCodeActionKinds: [vscode.CodeActionKind.QuickFix]
	};

	private readonly supportedCodeActionProvider: SupportedCodeActionProvider;

	constructor(
		private readonly client: ITypeScriptServiceClient,
		private readonly formattingConfigurationManager: FileConfigurationManager,
		commandManager: CommandManager,
		private readonly diagnosticsManager: DiagnosticsManager,
		telemetryReporter: TelemetryReporter
	) {
		commandManager.register(new ApplyCodeActionCommand(client, telemetryReporter));
		commandManager.register(new ApplyFixAllCodeAction(client, telemetryReporter));

		this.supportedCodeActionProvider = new SupportedCodeActionProvider(client);
	}

	public async provideCodeActions(
		document: vscode.TextDocument,
		_range: vscode.Range,
		context: vscode.CodeActionContext,
		token: vscode.CancellationToken
	): Promise<vscode.CodeAction[]> {
		const file = this.client.toOpenedFilePath(document);
		if (!file) {
			return [];
		}

		const fixableDiagnostics = await this.supportedCodeActionProvider.getFixableDiagnosticsForContext(context);
		if (!fixableDiagnostics.size) {
			return [];
		}

		if (this.client.bufferSyncSupport.hasPendingDiagnostics(document.uri)) {
			return [];
		}

		await this.formattingConfigurationManager.ensureConfigurationForDocument(document, token);

		const results = new CodeActionSet();
		for (const diagnostic of fixableDiagnostics.values) {
			await this.getFixesForDiagnostic(document, file, diagnostic, results, token);
		}
		return Array.from(results.values);
	}

	private async getFixesForDiagnostic(
		document: vscode.TextDocument,
		file: string,
		diagnostic: vscode.Diagnostic,
		results: CodeActionSet,
		token: vscode.CancellationToken,
	): Promise<CodeActionSet> {
		const args: Proto.CodeFixRequestArgs = {
			...typeConverters.Range.toFileRangeRequestArgs(file, diagnostic.range),
			errorCodes: [+(diagnostic.code!)]
		};
		const response = await this.client.execute('getCodeFixes', args, token);
		if (response.type !== 'response' || !response.body) {
			return results;
		}

		for (const tsCodeFix of response.body) {
			this.addAllFixesForTsCodeAction(results, document, file, diagnostic, tsCodeFix as Proto.CodeFixAction);
		}
		return results;
	}

	private addAllFixesForTsCodeAction(
		results: CodeActionSet,
		document: vscode.TextDocument,
		file: string,
		diagnostic: vscode.Diagnostic,
		tsAction: Proto.CodeFixAction
	): CodeActionSet {
		results.addAction(this.getSingleFixForTsCodeAction(diagnostic, tsAction));
		this.addFixAllForTsCodeAction(results, document, file, diagnostic, tsAction as Proto.CodeFixAction);
		return results;
	}

	private getSingleFixForTsCodeAction(
		diagnostic: vscode.Diagnostic,
		tsAction: Proto.CodeFixAction
	): vscode.CodeAction {
		const codeAction = new vscode.CodeAction(tsAction.description, vscode.CodeActionKind.QuickFix);
		codeAction.edit = getEditForCodeAction(this.client, tsAction);
		codeAction.diagnostics = [diagnostic];
		codeAction.command = {
			command: ApplyCodeActionCommand.ID,
			arguments: [tsAction],
			title: ''
		};
		codeAction.isPreferred = isPreferredFix(tsAction);
		return codeAction;
	}

	private addFixAllForTsCodeAction(
		results: CodeActionSet,
		document: vscode.TextDocument,
		file: string,
		diagnostic: vscode.Diagnostic,
		tsAction: Proto.CodeFixAction,
	): CodeActionSet {
		if (!tsAction.fixId || this.client.apiVersion.lt(API.v270) || results.hasFixAllAction(tsAction.fixId)) {
			return results;
		}

		// Make sure there are multiple diagnostics of the same type in the file
		if (!this.diagnosticsManager.getDiagnostics(document.uri).some(x => {
			if (x === diagnostic) {
				return false;
			}
			return x.code === diagnostic.code
				|| (fixAllErrorCodes.has(x.code as number) && fixAllErrorCodes.get(x.code as number) === fixAllErrorCodes.get(diagnostic.code as number));
		})) {
			return results;
		}

		const action = new vscode.CodeAction(
			tsAction.fixAllDescription || localize('fixAllInFileLabel', '{0} (Fix all in file)', tsAction.description),
			vscode.CodeActionKind.QuickFix);
		action.diagnostics = [diagnostic];
		action.command = {
			command: ApplyFixAllCodeAction.ID,
			arguments: [file, tsAction],
			title: ''
		};
		results.addFixAllAction(tsAction.fixId, action);
		return results;
	}
}

// Some fix all actions can actually fix multiple differnt diagnostics. Make sure we still show the fix all action
// in such cases
const fixAllErrorCodes = new Map<number, number>([
	// Missing async
	[2339, 2339],
	[2345, 2339],
]);


const preferredFixes = new Set([
	'annotateWithTypeFromJSDoc',
	'constructorForDerivedNeedSuperCall',
	'extendsInterfaceBecomesImplements',
	'fixAwaitInSyncFunction',
	'fixClassIncorrectlyImplementsInterface',
	'fixUnreachableCode',
	'forgottenThisPropertyAccess',
	'spelling',
	'unusedIdentifier',
	'addMissingAwait',
]);
function isPreferredFix(tsAction: Proto.CodeFixAction): boolean {
	return preferredFixes.has(tsAction.fixName);
}

export function register(
	selector: vscode.DocumentSelector,
	client: ITypeScriptServiceClient,
	fileConfigurationManager: FileConfigurationManager,
	commandManager: CommandManager,
	diagnosticsManager: DiagnosticsManager,
	telemetryReporter: TelemetryReporter
) {
	return new VersionDependentRegistration(client, TypeScriptQuickFixProvider.minVersion, () =>
		vscode.languages.registerCodeActionsProvider(selector,
			new TypeScriptQuickFixProvider(client, fileConfigurationManager, commandManager, diagnosticsManager, telemetryReporter),
			TypeScriptQuickFixProvider.metadata));
}
