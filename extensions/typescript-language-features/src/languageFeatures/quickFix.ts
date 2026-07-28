/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { Command, CommandManager } from '../commands/commandManager';
import { DocumentSelector } from '../configuration/documentSelector';
import { TelemetryReporter } from '../logging/telemetry';
import * as fixNames from '../tsServer/protocol/fixNames';
import type * as Proto from '../tsServer/protocol/protocol';
import * as typeConverters from '../typeConverters';
import { ClientCapability, ITypeScriptServiceClient } from '../typescriptService';
import { nulToken } from '../utils/cancellation';
import { Lazy } from '../utils/lazy';
import { equals } from '../utils/objects';
import { DiagnosticsManager } from './diagnostics';
import FileConfigurationManager from './fileConfigurationManager';
import { applyCodeActionCommands, getEditForCodeAction } from './util/codeAction';
import { CompositeCommand, EditorChatFollowUp, EditorChatFollowUp_Args, Expand } from './util/copilot';
import { conditionalRegistration, requireSomeCapability } from './util/dependentRegistration';

type ApplyCodeActionCommand_args = {
	readonly document: vscode.TextDocument;
	readonly diagnostic: vscode.Diagnostic;
	readonly action: Proto.CodeFixAction;
	readonly followupAction?: Command;
};

class ApplyCodeActionCommand implements Command {
	public static readonly ID = '_typescript.applyCodeActionCommand';
	public readonly id = ApplyCodeActionCommand.ID;

	constructor(
		private readonly client: ITypeScriptServiceClient,
		private readonly diagnosticManager: DiagnosticsManager,
		private readonly telemetryReporter: TelemetryReporter,
	) { }

	public async execute({ document, action, diagnostic, followupAction }: ApplyCodeActionCommand_args): Promise<boolean> {
		/* __GDPR__
			"quickFix.execute" : {
				"owner": "mjbvz",
				"fixName" : { "classification": "PublicNonPersonalData", "purpose": "FeatureInsight" },
				"${include}": [
					"${TypeScriptCommonProperties}"
				]
			}
		*/
		this.telemetryReporter.logTelemetry('quickFix.execute', {
			fixName: action.fixName
		});

		this.diagnosticManager.deleteDiagnostic(document.uri, diagnostic);
		const codeActionResult = await applyCodeActionCommands(this.client, action.commands, nulToken);
		await followupAction?.execute();
		return codeActionResult;
	}
}

type ApplyFixAllCodeAction_args = {
	readonly action: VsCodeFixAllCodeAction;
};

class ApplyFixAllCodeAction implements Command {
	public static readonly ID = '_typescript.applyFixAllCodeAction';
	public readonly id = ApplyFixAllCodeAction.ID;

	constructor(
		private readonly client: ITypeScriptServiceClient,
		private readonly telemetryReporter: TelemetryReporter,
	) { }

	public async execute(args: ApplyFixAllCodeAction_args): Promise<void> {
		/* __GDPR__
			"quickFixAll.execute" : {
				"owner": "mjbvz",
				"fixName" : { "classification": "PublicNonPersonalData", "purpose": "FeatureInsight" },
				"${include}": [
					"${TypeScriptCommonProperties}"
				]
			}
		*/
		this.telemetryReporter.logTelemetry('quickFixAll.execute', {
			fixName: args.action.tsAction.fixName
		});

		if (args.action.combinedResponse) {
			await applyCodeActionCommands(this.client, args.action.combinedResponse.body.commands, nulToken);
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

	public get size() {
		return this._values.size;
	}
}

class VsCodeCodeAction extends vscode.CodeAction {
	constructor(
		public readonly tsAction: Proto.CodeFixAction,
		title: string,
		kind: vscode.CodeActionKind
	) {
		super(title, kind);
	}
}

class VsCodeFixAllCodeAction extends VsCodeCodeAction {
	constructor(
		tsAction: Proto.CodeFixAction,
		public readonly file: string,
		title: string,
		kind: vscode.CodeActionKind
	) {
		super(tsAction, title, kind);
	}

	public combinedResponse?: Proto.GetCombinedCodeFixResponse;
}

class CodeActionSet {
	private readonly _actions = new Set<VsCodeCodeAction>();
	private readonly _fixAllActions = new Map<{}, VsCodeCodeAction>();
	private readonly _aiActions = new Set<VsCodeCodeAction>();

	public *values(): Iterable<VsCodeCodeAction> {
		yield* this._actions;
		yield* this._aiActions;
	}

	public addAction(action: VsCodeCodeAction) {
		if (action.isAI) {
			// there are no separate fixAllActions for AI, and no duplicates, so return immediately
			this._aiActions.add(action);
			return;
		}
		for (const existing of this._actions) {
			if (action.tsAction.fixName === existing.tsAction.fixName && equals(action.edit, existing.edit)) {
				this._actions.delete(existing);
			}
		}

		this._actions.add(action);

		if (action.tsAction.fixId) {
			// If we have an existing fix all action, then make sure it follows this action
			const existingFixAll = this._fixAllActions.get(action.tsAction.fixId);
			if (existingFixAll) {
				this._actions.delete(existingFixAll);
				this._actions.add(existingFixAll);
			}
		}
	}

	public addFixAllAction(fixId: {}, action: VsCodeCodeAction) {
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

	public async getFixableDiagnosticsForContext(diagnostics: readonly vscode.Diagnostic[]): Promise<DiagnosticsSet> {
		const fixableCodes = await this.fixableDiagnosticCodes.value;
		return DiagnosticsSet.from(
			diagnostics.filter(diagnostic => typeof diagnostic.code !== 'undefined' && fixableCodes.has(diagnostic.code + '')));
	}

	private readonly fixableDiagnosticCodes = new Lazy<Thenable<Set<string>>>(() => {
		return this.client.execute('getSupportedCodeFixes', null, nulToken)
			.then(response => response.type === 'response' ? response.body || [] : [])
			.then(codes => new Set(codes));
	});
}

class TypeScriptQuickFixProvider implements vscode.CodeActionProvider<VsCodeCodeAction> {

	private static readonly _maxCodeActionsPerFile: number = 1000;

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
		commandManager.register(new CompositeCommand());
		commandManager.register(new ApplyCodeActionCommand(client, diagnosticsManager, telemetryReporter));
		commandManager.register(new ApplyFixAllCodeAction(client, telemetryReporter));
		commandManager.register(new EditorChatFollowUp(client, telemetryReporter));

		this.supportedCodeActionProvider = new SupportedCodeActionProvider(client);
	}

	public async provideCodeActions(
		document: vscode.TextDocument,
		range: vscode.Range,
		context: vscode.CodeActionContext,
		token: vscode.CancellationToken
	): Promise<VsCodeCodeAction[] | undefined> {
		const file = this.client.toOpenTsFilePath(document);
		if (!file) {
			return;
		}

		let diagnostics = context.diagnostics;
		if (this.client.bufferSyncSupport.hasPendingDiagnostics(document.uri)) {
			// Delay for 500ms when there are pending diagnostics before recomputing up-to-date diagnostics.
			await new Promise((resolve) => {
				setTimeout(resolve, 500);
			});

			if (token.isCancellationRequested) {
				return;
			}
			const allDiagnostics: vscode.Diagnostic[] = [];

			// Match ranges again after getting new diagnostics
			for (const diagnostic of this.diagnosticsManager.getDiagnostics(document.uri)) {
				if (range.intersection(diagnostic.range)) {
					const newLen = allDiagnostics.push(diagnostic);
					if (newLen > TypeScriptQuickFixProvider._maxCodeActionsPerFile) {
						break;
					}
				}
			}
			diagnostics = allDiagnostics;
		}

		const fixableDiagnostics = await this.supportedCodeActionProvider.getFixableDiagnosticsForContext(diagnostics);
		if (!fixableDiagnostics.size || token.isCancellationRequested) {
			return;
		}

		await this.formattingConfigurationManager.ensureConfigurationForDocument(document, token);
		if (token.isCancellationRequested) {
			return;
		}

		const results = new CodeActionSet();
		for (const diagnostic of fixableDiagnostics.values) {
			await this.getFixesForDiagnostic(document, file, diagnostic, results, token);
			if (token.isCancellationRequested) {
				return;
			}
		}

		const allActions = Array.from(results.values());
		for (const action of allActions) {
			action.isPreferred = isPreferredFix(action, allActions);
		}
		return allActions;
	}

	public async resolveCodeAction(codeAction: VsCodeCodeAction, token: vscode.CancellationToken): Promise<VsCodeCodeAction> {
		if (!(codeAction instanceof VsCodeFixAllCodeAction) || !codeAction.tsAction.fixId) {
			return codeAction;
		}

		const arg: Proto.GetCombinedCodeFixRequestArgs = {
			scope: {
				type: 'file',
				args: { file: codeAction.file }
			},
			fixId: codeAction.tsAction.fixId,
		};

		const response = await this.client.execute('getCombinedCodeFix', arg, token);
		if (response.type === 'response') {
			codeAction.combinedResponse = response;
			codeAction.edit = typeConverters.WorkspaceEdit.fromFileCodeEdits(this.client, response.body.changes);
		}

		return codeAction;
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
			for (const action of this.getFixesForTsCodeAction(document, diagnostic, tsCodeFix)) {
				results.addAction(action);
			}
			this.addFixAllForTsCodeAction(results, document.uri, file, diagnostic, tsCodeFix as Proto.CodeFixAction);
		}
		return results;
	}

	private getFixesForTsCodeAction(
		document: vscode.TextDocument,
		diagnostic: vscode.Diagnostic,
		action: Proto.CodeFixAction
	): VsCodeCodeAction[] {
		const actions: VsCodeCodeAction[] = [];
		const codeAction = new VsCodeCodeAction(action, action.description, vscode.CodeActionKind.QuickFix);
		codeAction.edit = getEditForCodeAction(this.client, action);
		codeAction.diagnostics = [diagnostic];
		codeAction.ranges = [diagnostic.range];
		codeAction.command = {
			command: ApplyCodeActionCommand.ID,
			arguments: [{ action, diagnostic, document } satisfies ApplyCodeActionCommand_args],
			title: ''
		};
		actions.push(codeAction);

		const copilot = vscode.extensions.getExtension('github.copilot-chat');
		if (copilot?.isActive) {
			let message: string | undefined;
			let expand: Expand | undefined;
			let title = action.description;
			if (action.fixName === fixNames.classIncorrectlyImplementsInterface) {
				title = vscode.l10n.t('{0} with AI', action.description);
				message = vscode.l10n.t('Implement the stubbed-out class members for {0} with a useful implementation.', document.getText(diagnostic.range));
				expand = { kind: 'code-action', action };
			} else if (action.fixName === fixNames.fixClassDoesntImplementInheritedAbstractMember) {
				title = vscode.l10n.t('{0} with AI', action.description);
				message = vscode.l10n.t(`Implement the stubbed-out class members for {0} with a useful implementation.`, document.getText(diagnostic.range));
				expand = { kind: 'code-action', action };
			} else if (action.fixName === fixNames.fixMissingFunctionDeclaration) {
				title = vscode.l10n.t(`Implement missing function declaration '{0}' using AI`, document.getText(diagnostic.range));
				message = vscode.l10n.t(`Provide a reasonable implementation of the function {0} given its type and the context it's called in.`, document.getText(diagnostic.range));
				expand = { kind: 'code-action', action };
			} else if (action.fixName === fixNames.inferFromUsage) {
				const inferFromBody = new VsCodeCodeAction(action, vscode.l10n.t('Infer types using AI'), vscode.CodeActionKind.QuickFix);
				inferFromBody.edit = new vscode.WorkspaceEdit();
				inferFromBody.diagnostics = [diagnostic];
				inferFromBody.ranges = [diagnostic.range];
				inferFromBody.isAI = true;
				inferFromBody.command = {
					command: EditorChatFollowUp.ID,
					arguments: [{
						message: vscode.l10n.t('Add types to this code. Add separate interfaces when possible. Do not change the code except for adding types.'),
						expand: { kind: 'navtree-function', pos: diagnostic.range.start },
						document,
						action: { type: 'quickfix', quickfix: action }
					} satisfies EditorChatFollowUp_Args],
					title: ''
				};
				actions.push(inferFromBody);
			}
			else if (action.fixName === fixNames.addNameToNamelessParameter) {
				const newText = action.changes.map(change => change.textChanges.map(textChange => textChange.newText).join('')).join('');
				title = vscode.l10n.t('Add meaningful parameter name with AI');
				message = vscode.l10n.t(`Rename the parameter {0} with a more meaningful name.`, newText);
				expand = {
					kind: 'navtree-function',
					pos: diagnostic.range.start
				};
			}
			if (expand && message !== undefined) {
				const aiCodeAction = new VsCodeCodeAction(action, title, vscode.CodeActionKind.QuickFix);
				aiCodeAction.edit = getEditForCodeAction(this.client, action);
				aiCodeAction.edit?.insert(document.uri, diagnostic.range.start, '');
				aiCodeAction.diagnostics = [diagnostic];
				aiCodeAction.ranges = [diagnostic.range];
				aiCodeAction.isAI = true;
				aiCodeAction.command = {
					command: CompositeCommand.ID,
					title: '',
					arguments: [{
						command: ApplyCodeActionCommand.ID,
						arguments: [{ action, diagnostic, document } satisfies ApplyCodeActionCommand_args],
						title: ''
					}, {
						command: EditorChatFollowUp.ID,
						title: '',
						arguments: [{
							message,
							expand,
							document,
							action: { type: 'quickfix', quickfix: action }
						} satisfies EditorChatFollowUp_Args],
					}],
				};
				actions.push(aiCodeAction);
			}
		}
		return actions;
	}

	private addFixAllForTsCodeAction(
		results: CodeActionSet,
		resource: vscode.Uri,
		file: string,
		diagnostic: vscode.Diagnostic,
		tsAction: Proto.CodeFixAction,
	): CodeActionSet {
		if (!tsAction.fixId || results.hasFixAllAction(tsAction.fixId)) {
			return results;
		}

		// Make sure there are multiple different diagnostics of the same type in the file
		if (!this.diagnosticsManager.getDiagnostics(resource).some(x => {
			if (x === diagnostic) {
				return false;
			}
			return x.code === diagnostic.code
				|| (fixAllErrorCodes.has(x.code as number) && fixAllErrorCodes.get(x.code as number) === fixAllErrorCodes.get(diagnostic.code as number));
		})) {
			return results;
		}

		const action = new VsCodeFixAllCodeAction(
			tsAction,
			file,
			tsAction.fixAllDescription || vscode.l10n.t("{0} (Fix all in file)", tsAction.description),
			vscode.CodeActionKind.QuickFix);

		action.diagnostics = [diagnostic];
		action.ranges = [diagnostic.range];
		action.command = {
			command: ApplyFixAllCodeAction.ID,
			arguments: [{ action } satisfies ApplyFixAllCodeAction_args],
			title: ''
		};
		results.addFixAllAction(tsAction.fixId, action);
		return results;
	}
}

// Some fix all actions can actually fix multiple different diagnostics. Make sure we still show the fix all action
// in such cases
const fixAllErrorCodes = new Map<number, number>([
	// Missing async
	[2339, 2339],
	[2345, 2339],
]);

const preferredFixes = new Map<string, { readonly priority: number; readonly thereCanOnlyBeOne?: boolean }>([
	[fixNames.annotateWithTypeFromJSDoc, { priority: 2 }],
	[fixNames.constructorForDerivedNeedSuperCall, { priority: 2 }],
	[fixNames.extendsInterfaceBecomesImplements, { priority: 2 }],
	[fixNames.awaitInSyncFunction, { priority: 2 }],
	[fixNames.removeUnnecessaryAwait, { priority: 2 }],
	[fixNames.classIncorrectlyImplementsInterface, { priority: 3 }],
	[fixNames.classDoesntImplementInheritedAbstractMember, { priority: 3 }],
	[fixNames.unreachableCode, { priority: 2 }],
	[fixNames.unusedIdentifier, { priority: 2 }],
	[fixNames.forgottenThisPropertyAccess, { priority: 2 }],
	[fixNames.spelling, { priority: 0 }],
	[fixNames.addMissingAwait, { priority: 2 }],
	[fixNames.addMissingOverride, { priority: 2 }],
	[fixNames.addMissingNewOperator, { priority: 2 }],
	[fixNames.fixImport, { priority: 1, thereCanOnlyBeOne: true }],
]);

function isPreferredFix(
	action: VsCodeCodeAction,
	allActions: readonly VsCodeCodeAction[]
): boolean {
	if (action instanceof VsCodeFixAllCodeAction) {
		return false;
	}

	const fixPriority = preferredFixes.get(action.tsAction.fixName);
	if (!fixPriority) {
		return false;
	}

	return allActions.every(otherAction => {
		if (otherAction === action) {
			return true;
		}

		if (otherAction instanceof VsCodeFixAllCodeAction) {
			return true;
		}

		const otherFixPriority = preferredFixes.get(otherAction.tsAction.fixName);
		if (!otherFixPriority || otherFixPriority.priority < fixPriority.priority) {
			return true;
		} else if (otherFixPriority.priority > fixPriority.priority) {
			return false;
		}

		if (fixPriority.thereCanOnlyBeOne && action.tsAction.fixName === otherAction.tsAction.fixName) {
			return false;
		}

		return true;
	});
}

export function register(
	selector: DocumentSelector,
	client: ITypeScriptServiceClient,
	fileConfigurationManager: FileConfigurationManager,
	commandManager: CommandManager,
	diagnosticsManager: DiagnosticsManager,
	telemetryReporter: TelemetryReporter
) {
	return conditionalRegistration([
		requireSomeCapability(client, ClientCapability.Semantic),
	], () => {
		return vscode.languages.registerCodeActionsProvider(selector.semantic,
			new TypeScriptQuickFixProvider(client, fileConfigurationManager, commandManager, diagnosticsManager, telemetryReporter),
			TypeScriptQuickFixProvider.metadata);
	});
}
