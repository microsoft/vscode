/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';
import * as vscode from 'vscode';
import { Utils } from 'vscode-uri';
import { Command, CommandManager } from '../commands/commandManager';
import { LearnMoreAboutRefactoringsCommand } from '../commands/learnMoreAboutRefactorings';
import { DocumentSelector } from '../configuration/documentSelector';
import * as fileSchemes from '../configuration/fileSchemes';
import { Schemes } from '../configuration/schemes';
import { TelemetryReporter } from '../logging/telemetry';
import { API } from '../tsServer/api';
import type * as Proto from '../tsServer/protocol/protocol';
import * as typeConverters from '../typeConverters';
import { ClientCapability, ITypeScriptServiceClient } from '../typescriptService';
import { coalesce } from '../utils/arrays';
import { nulToken } from '../utils/cancellation';
import FormattingOptionsManager from './fileConfigurationManager';
import { conditionalRegistration, requireSomeCapability } from './util/dependentRegistration';
import { EditorChatFollowUp, EditorChatFollowUp_Args, CompositeCommand } from './util/copilot';

function toWorkspaceEdit(client: ITypeScriptServiceClient, edits: readonly Proto.FileCodeEdits[]): vscode.WorkspaceEdit {
	const workspaceEdit = new vscode.WorkspaceEdit();
	for (const edit of edits) {
		const resource = client.toResource(edit.fileName);
		if (resource.scheme === fileSchemes.file) {
			workspaceEdit.createFile(resource, { ignoreIfExists: true });
		}
	}
	typeConverters.WorkspaceEdit.withFileCodeEdits(workspaceEdit, client, edits);
	return workspaceEdit;
}


namespace DidApplyRefactoringCommand {
	export interface Args {
		readonly action: string;
	}
}

class DidApplyRefactoringCommand implements Command {
	public static readonly ID = '_typescript.didApplyRefactoring';
	public readonly id = DidApplyRefactoringCommand.ID;

	constructor(
		private readonly telemetryReporter: TelemetryReporter
	) { }

	public async execute(args: DidApplyRefactoringCommand.Args): Promise<void> {
		/* __GDPR__
			"refactor.execute" : {
				"owner": "mjbvz",
				"action" : { "classification": "PublicNonPersonalData", "purpose": "FeatureInsight" },
				"${include}": [
					"${TypeScriptCommonProperties}"
				]
			}
		*/
		this.telemetryReporter.logTelemetry('refactor.execute', {
			action: args.action,
		});
	}
}
namespace SelectRefactorCommand {
	export interface Args {
		readonly document: vscode.TextDocument;
		readonly refactor: Proto.ApplicableRefactorInfo;
		readonly rangeOrSelection: vscode.Range | vscode.Selection;
	}
}

class SelectRefactorCommand implements Command {
	public static readonly ID = '_typescript.selectRefactoring';
	public readonly id = SelectRefactorCommand.ID;

	constructor(
		private readonly client: ITypeScriptServiceClient,
	) { }

	public async execute(args: SelectRefactorCommand.Args): Promise<void> {
		const file = this.client.toOpenTsFilePath(args.document);
		if (!file) {
			return;
		}

		const selected = await vscode.window.showQuickPick(args.refactor.actions.map((action): vscode.QuickPickItem & { action: Proto.RefactorActionInfo } => ({
			action,
			label: action.name,
			description: action.description,
		})));
		if (!selected) {
			return;
		}

		const tsAction = new InlinedCodeAction(this.client, args.document, args.refactor, selected.action, args.rangeOrSelection);
		await tsAction.resolve(nulToken);

		if (tsAction.edit) {
			if (!(await vscode.workspace.applyEdit(tsAction.edit, { isRefactoring: true }))) {
				vscode.window.showErrorMessage(vscode.l10n.t("Could not apply refactoring"));
				return;
			}
		}

		if (tsAction.command) {
			await vscode.commands.executeCommand(tsAction.command.command, ...(tsAction.command.arguments ?? []));
		}
	}
}

namespace MoveToFileRefactorCommand {
	export interface Args {
		readonly document: vscode.TextDocument;
		readonly action: Proto.RefactorActionInfo;
		readonly range: vscode.Range;
	}
}

class MoveToFileRefactorCommand implements Command {
	public static readonly ID = '_typescript.moveToFileRefactoring';
	public readonly id = MoveToFileRefactorCommand.ID;

	constructor(
		private readonly client: ITypeScriptServiceClient,
		private readonly didApplyCommand: DidApplyRefactoringCommand
	) { }

	public async execute(args: MoveToFileRefactorCommand.Args): Promise<void> {
		const file = this.client.toOpenTsFilePath(args.document);
		if (!file) {
			return;
		}

		const targetFile = await this.getTargetFile(args.document, file, args.range);
		if (!targetFile || targetFile.toString() === file.toString()) {
			return;
		}

		const fileSuggestionArgs: Proto.GetEditsForRefactorRequestArgs = {
			...typeConverters.Range.toFileRangeRequestArgs(file, args.range),
			action: 'Move to file',
			refactor: 'Move to file',
			interactiveRefactorArguments: { targetFile },
		};

		const response = await this.client.execute('getEditsForRefactor', fileSuggestionArgs, nulToken);
		if (response.type !== 'response' || !response.body) {
			return;
		}
		const edit = toWorkspaceEdit(this.client, response.body.edits);
		if (!(await vscode.workspace.applyEdit(edit, { isRefactoring: true }))) {
			vscode.window.showErrorMessage(vscode.l10n.t("Could not apply refactoring"));
			return;
		}

		await this.didApplyCommand.execute({ action: args.action.name });
	}

	private async getTargetFile(document: vscode.TextDocument, file: string, range: vscode.Range): Promise<string | undefined> {
		const args = typeConverters.Range.toFileRangeRequestArgs(file, range);
		const response = await this.client.execute('getMoveToRefactoringFileSuggestions', args, nulToken);
		if (response.type !== 'response' || !response.body) {
			return;
		}
		const body = response.body;

		type DestinationItem = vscode.QuickPickItem & { readonly file?: string };
		const selectExistingFileItem: vscode.QuickPickItem = { label: vscode.l10n.t("Select existing file...") };
		const selectNewFileItem: vscode.QuickPickItem = { label: vscode.l10n.t("Enter new file path...") };

		const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
		const quickPick = vscode.window.createQuickPick<DestinationItem>();
		quickPick.ignoreFocusOut = true;

		// true so we don't skip computing in the first call
		let quickPickInRelativeMode = true;
		const updateItems = () => {
			const relativeQuery = ['./', '../'].find(str => quickPick.value.startsWith(str));
			if (quickPickInRelativeMode === false && !!relativeQuery === false) {
				return;
			}
			quickPickInRelativeMode = !!relativeQuery;
			const destinationItems = body.files.map((file): DestinationItem | undefined => {
				const uri = this.client.toResource(file);
				const parentDir = Utils.dirname(uri);
				const filename = Utils.basename(uri);

				let description: string | undefined;
				if (workspaceFolder) {
					if (uri.scheme === Schemes.file) {
						description = path.relative(workspaceFolder.uri.fsPath, parentDir.fsPath);
					} else {
						description = path.posix.relative(workspaceFolder.uri.path, parentDir.path);
					}
					if (relativeQuery) {
						const convertRelativePath = (str: string) => {
							return !str.startsWith('../') ? `./${str}` : str;
						};

						const relativePath = convertRelativePath(path.relative(path.dirname(document.uri.fsPath), uri.fsPath));
						if (!relativePath.startsWith(relativeQuery)) {
							return;
						}
						description = relativePath;
					}
				} else {
					description = parentDir.fsPath;
				}

				return {
					file,
					label: Utils.basename(uri),
					description: relativeQuery ? description : path.join(description, filename),
				};
			});
			quickPick.items = [
				selectExistingFileItem,
				selectNewFileItem,
				{ label: vscode.l10n.t("Destination Files"), kind: vscode.QuickPickItemKind.Separator },
				...coalesce(destinationItems)
			];
		};
		quickPick.title = vscode.l10n.t("Move to File");
		quickPick.placeholder = vscode.l10n.t("Enter file path");
		quickPick.matchOnDescription = true;
		quickPick.onDidChangeValue(updateItems);
		updateItems();

		const picked = await new Promise<DestinationItem | undefined>(resolve => {
			quickPick.onDidAccept(() => {
				resolve(quickPick.selectedItems[0]);
				quickPick.dispose();
			});
			quickPick.onDidHide(() => {
				resolve(undefined);
				quickPick.dispose();
			});
			quickPick.show();
		});
		if (!picked) {
			return;
		}

		if (picked === selectExistingFileItem) {
			const picked = await vscode.window.showOpenDialog({
				title: vscode.l10n.t("Select move destination"),
				openLabel: vscode.l10n.t("Move to File"),
				defaultUri: Utils.dirname(document.uri),
			});
			return picked?.length ? this.client.toTsFilePath(picked[0]) : undefined;
		} else if (picked === selectNewFileItem) {
			const picked = await vscode.window.showSaveDialog({
				title: vscode.l10n.t("Select move destination"),
				saveLabel: vscode.l10n.t("Move to File"),
				defaultUri: this.client.toResource(response.body.newFileName),
			});
			return picked ? this.client.toTsFilePath(picked) : undefined;
		} else {
			return picked.file;
		}
	}
}

interface CodeActionKind {
	readonly kind: vscode.CodeActionKind;
	matches(refactor: Proto.RefactorActionInfo): boolean;
}

const Extract_Function = Object.freeze<CodeActionKind>({
	kind: vscode.CodeActionKind.RefactorExtract.append('function'),
	matches: refactor => refactor.name.startsWith('function_')
});

const Extract_Constant = Object.freeze<CodeActionKind>({
	kind: vscode.CodeActionKind.RefactorExtract.append('constant'),
	matches: refactor => refactor.name.startsWith('constant_')
});

const Extract_Type = Object.freeze<CodeActionKind>({
	kind: vscode.CodeActionKind.RefactorExtract.append('type'),
	matches: refactor => refactor.name.startsWith('Extract to type alias')
});

const Extract_Interface = Object.freeze<CodeActionKind>({
	kind: vscode.CodeActionKind.RefactorExtract.append('interface'),
	matches: refactor => refactor.name.startsWith('Extract to interface')
});

const Move_File = Object.freeze<CodeActionKind>({
	kind: vscode.CodeActionKind.RefactorMove.append('file'),
	matches: refactor => refactor.name.startsWith('Move to file')
});

const Move_NewFile = Object.freeze<CodeActionKind>({
	kind: vscode.CodeActionKind.RefactorMove.append('newFile'),
	matches: refactor => refactor.name.startsWith('Move to a new file')
});

const Rewrite_Import = Object.freeze<CodeActionKind>({
	kind: vscode.CodeActionKind.RefactorRewrite.append('import'),
	matches: refactor => refactor.name.startsWith('Convert namespace import') || refactor.name.startsWith('Convert named imports')
});

const Rewrite_Export = Object.freeze<CodeActionKind>({
	kind: vscode.CodeActionKind.RefactorRewrite.append('export'),
	matches: refactor => refactor.name.startsWith('Convert default export') || refactor.name.startsWith('Convert named export')
});

const Rewrite_Arrow_Braces = Object.freeze<CodeActionKind>({
	kind: vscode.CodeActionKind.RefactorRewrite.append('arrow').append('braces'),
	matches: refactor => refactor.name.startsWith('Convert default export') || refactor.name.startsWith('Convert named export')
});

const Rewrite_Parameters_ToDestructured = Object.freeze<CodeActionKind>({
	kind: vscode.CodeActionKind.RefactorRewrite.append('parameters').append('toDestructured'),
	matches: refactor => refactor.name.startsWith('Convert parameters to destructured object')
});

const Rewrite_Property_GenerateAccessors = Object.freeze<CodeActionKind>({
	kind: vscode.CodeActionKind.RefactorRewrite.append('property').append('generateAccessors'),
	matches: refactor => refactor.name.startsWith('Generate \'get\' and \'set\' accessors')
});

const allKnownCodeActionKinds = [
	Extract_Function,
	Extract_Constant,
	Extract_Type,
	Extract_Interface,
	Move_File,
	Move_NewFile,
	Rewrite_Import,
	Rewrite_Export,
	Rewrite_Arrow_Braces,
	Rewrite_Parameters_ToDestructured,
	Rewrite_Property_GenerateAccessors
];

class InlinedCodeAction extends vscode.CodeAction {
	constructor(
		public readonly client: ITypeScriptServiceClient,
		public readonly document: vscode.TextDocument,
		public readonly refactor: Proto.ApplicableRefactorInfo,
		public readonly action: Proto.RefactorActionInfo,
		public readonly range: vscode.Range,
		public readonly copilotRename?: (info: Proto.RefactorEditInfo) => vscode.Command,
	) {
		const title = copilotRename ? action.description + ' and suggest a name with Copilot.' : action.description;
		super(title, InlinedCodeAction.getKind(action));

		if (action.notApplicableReason) {
			this.disabled = { reason: action.notApplicableReason };
		}

		this.command = {
			title,
			command: DidApplyRefactoringCommand.ID,
			arguments: [<DidApplyRefactoringCommand.Args>{ action: action.name }],
		};
	}

	public async resolve(token: vscode.CancellationToken): Promise<undefined> {
		const file = this.client.toOpenTsFilePath(this.document);
		if (!file) {
			return;
		}

		const args: Proto.GetEditsForRefactorRequestArgs = {
			...typeConverters.Range.toFileRangeRequestArgs(file, this.range),
			refactor: this.refactor.name,
			action: this.action.name,
		};

		const response = await this.client.execute('getEditsForRefactor', args, token);
		if (response.type !== 'response' || !response.body) {
			return;
		}

		this.edit = toWorkspaceEdit(this.client, response.body.edits);
		if (!this.edit.size) {
			vscode.window.showErrorMessage(vscode.l10n.t("Could not apply refactoring"));
			return;
		}

		if (response.body.renameLocation) {
			// Disable renames in interactive playground https://github.com/microsoft/vscode/issues/75137
			if (this.document.uri.scheme !== fileSchemes.walkThroughSnippet) {
				if (this.copilotRename && this.command) {
					this.command.title = 'Copilot: ' + this.command.title;
				}
				this.command = {
					command: CompositeCommand.ID,
					title: '',
					arguments: coalesce([
						this.command,
						this.copilotRename ? this.copilotRename(response.body) : {
							command: 'editor.action.rename',
							arguments: [[
								this.document.uri,
								typeConverters.Position.fromLocation(response.body.renameLocation)
							]]
						},
					])
				};
			}
		}
	}

	private static getKind(refactor: Proto.RefactorActionInfo) {
		if ((refactor as Proto.RefactorActionInfo & { kind?: string }).kind) {
			return vscode.CodeActionKind.Empty.append((refactor as Proto.RefactorActionInfo & { kind?: string }).kind!);
		}
		const match = allKnownCodeActionKinds.find(kind => kind.matches(refactor));
		return match ? match.kind : vscode.CodeActionKind.Refactor;
	}
}

class MoveToFileCodeAction extends vscode.CodeAction {
	constructor(
		document: vscode.TextDocument,
		action: Proto.RefactorActionInfo,
		range: vscode.Range,
	) {
		super(action.description, Move_File.kind);

		if (action.notApplicableReason) {
			this.disabled = { reason: action.notApplicableReason };
		}

		this.command = {
			title: action.description,
			command: MoveToFileRefactorCommand.ID,
			arguments: [<MoveToFileRefactorCommand.Args>{ action, document, range }]
		};
	}
}

class SelectCodeAction extends vscode.CodeAction {
	constructor(
		info: Proto.ApplicableRefactorInfo,
		document: vscode.TextDocument,
		rangeOrSelection: vscode.Range | vscode.Selection
	) {
		super(info.description, vscode.CodeActionKind.Refactor);
		this.command = {
			title: info.description,
			command: SelectRefactorCommand.ID,
			arguments: [<SelectRefactorCommand.Args>{ action: this, document, refactor: info, rangeOrSelection }]
		};
	}
}
type TsCodeAction = InlinedCodeAction | MoveToFileCodeAction | SelectCodeAction;

class TypeScriptRefactorProvider implements vscode.CodeActionProvider<TsCodeAction> {

	constructor(
		private readonly client: ITypeScriptServiceClient,
		private readonly formattingOptionsManager: FormattingOptionsManager,
		commandManager: CommandManager,
		telemetryReporter: TelemetryReporter
	) {
		const didApplyRefactoringCommand = commandManager.register(new DidApplyRefactoringCommand(telemetryReporter));
		commandManager.register(new CompositeCommand());
		commandManager.register(new SelectRefactorCommand(this.client));
		commandManager.register(new MoveToFileRefactorCommand(this.client, didApplyRefactoringCommand));
		commandManager.register(new EditorChatFollowUp(this.client));
	}

	public static readonly metadata: vscode.CodeActionProviderMetadata = {
		providedCodeActionKinds: [
			vscode.CodeActionKind.Refactor,
			...allKnownCodeActionKinds.map(x => x.kind),
		],
		documentation: [
			{
				kind: vscode.CodeActionKind.Refactor,
				command: {
					command: LearnMoreAboutRefactoringsCommand.id,
					title: vscode.l10n.t("Learn more about JS/TS refactorings")
				}
			}
		]
	};

	public async provideCodeActions(
		document: vscode.TextDocument,
		rangeOrSelection: vscode.Range | vscode.Selection,
		context: vscode.CodeActionContext,
		token: vscode.CancellationToken
	): Promise<TsCodeAction[] | undefined> {
		if (!this.shouldTrigger(context, rangeOrSelection)) {
			return undefined;
		}
		if (!this.client.toOpenTsFilePath(document)) {
			return undefined;
		}

		const response = await this.client.interruptGetErr(() => {
			const file = this.client.toOpenTsFilePath(document);
			if (!file) {
				return undefined;
			}
			this.formattingOptionsManager.ensureConfigurationForDocument(document, token);

			const args: Proto.GetApplicableRefactorsRequestArgs = {
				...typeConverters.Range.toFileRangeRequestArgs(file, rangeOrSelection),
				triggerReason: this.toTsTriggerReason(context),
				kind: context.only?.value,
				includeInteractiveActions: this.client.apiVersion.gte(API.v520),
			};
			return this.client.execute('getApplicableRefactors', args, token);
		});
		if (response?.type !== 'response' || !response.body) {
			return undefined;
		}

		const actions = Array.from(this.convertApplicableRefactors(document, response.body, rangeOrSelection)).filter(action => {
			if (this.client.apiVersion.lt(API.v430)) {
				// Don't show 'infer return type' refactoring unless it has been explicitly requested
				// https://github.com/microsoft/TypeScript/issues/42993
				if (!context.only && action.kind?.value === 'refactor.rewrite.function.returnType') {
					return false;
				}
			}
			return true;
		});

		if (!context.only) {
			return actions;
		}
		return this.pruneInvalidActions(this.appendInvalidActions(actions), context.only, /* numberOfInvalid = */ 5);
	}

	public async resolveCodeAction(
		codeAction: TsCodeAction,
		token: vscode.CancellationToken,
	): Promise<TsCodeAction> {
		if (codeAction instanceof InlinedCodeAction) {
			await codeAction.resolve(token);
		}
		return codeAction;
	}

	private toTsTriggerReason(context: vscode.CodeActionContext): Proto.RefactorTriggerReason | undefined {
		if (context.triggerKind === vscode.CodeActionTriggerKind.Invoke) {
			return 'invoked';
		}
		return undefined;
	}

	private *convertApplicableRefactors(
		document: vscode.TextDocument,
		refactors: readonly Proto.ApplicableRefactorInfo[],
		rangeOrSelection: vscode.Range | vscode.Selection
	): Iterable<TsCodeAction> {
		for (const refactor of refactors) {
			if (refactor.inlineable === false) {
				yield new SelectCodeAction(refactor, document, rangeOrSelection);
			} else {
				for (const action of refactor.actions) {
					yield this.refactorActionToCodeAction(document, refactor, action, rangeOrSelection, refactor.actions);
				}
			}
		}
	}

	private refactorActionToCodeAction(
		document: vscode.TextDocument,
		refactor: Proto.ApplicableRefactorInfo,
		action: Proto.RefactorActionInfo,
		rangeOrSelection: vscode.Range | vscode.Selection,
		allActions: readonly Proto.RefactorActionInfo[],
	): TsCodeAction {
		let codeAction: TsCodeAction;
		if (action.name === 'Move to file') {
			codeAction = new MoveToFileCodeAction(document, action, rangeOrSelection);
		} else {
			let copilotRename: ((info: Proto.RefactorEditInfo) => vscode.Command) | undefined;
			if (vscode.workspace.getConfiguration('typescript', null).get('experimental.aiCodeActions')) {
				if (Extract_Constant.matches(action) && vscode.workspace.getConfiguration('typescript').get('experimental.aiCodeActions.extractConstant')
					|| Extract_Function.matches(action) && vscode.workspace.getConfiguration('typescript').get('experimental.aiCodeActions.extractFunction')
					|| Extract_Type.matches(action) && vscode.workspace.getConfiguration('typescript').get('experimental.aiCodeActions.extractType')
					|| Extract_Interface.matches(action) && vscode.workspace.getConfiguration('typescript').get('experimental.aiCodeActions.extractInterface')) {
					const newName = Extract_Constant.matches(action) ? 'newLocal'
						: Extract_Function.matches(action) ? 'newFunction'
							: Extract_Type.matches(action) ? 'NewType'
								: Extract_Interface.matches(action) ? 'NewInterface'
									: '';
					copilotRename = info => ({
						title: '',
						command: EditorChatFollowUp.ID,
						arguments: [<EditorChatFollowUp_Args>{
							message: `Rename ${newName} to a better name based on usage.`,
							expand: Extract_Constant.matches(action) ? {
								kind: 'navtree-function',
								pos: typeConverters.Position.fromLocation(info.renameLocation!),
							} : {
								kind: 'refactor-info',
								refactor: info,
							},
							document,
						}]
					});
				}

			}
			codeAction = new InlinedCodeAction(this.client, document, refactor, action, rangeOrSelection, copilotRename);
		}

		codeAction.isPreferred = TypeScriptRefactorProvider.isPreferred(action, allActions);
		return codeAction;
	}

	private shouldTrigger(context: vscode.CodeActionContext, rangeOrSelection: vscode.Range | vscode.Selection) {
		if (context.only && !vscode.CodeActionKind.Refactor.contains(context.only)) {
			return false;
		}
		if (context.triggerKind === vscode.CodeActionTriggerKind.Invoke) {
			return true;
		}
		return rangeOrSelection instanceof vscode.Selection;
	}

	private static isPreferred(
		action: Proto.RefactorActionInfo,
		allActions: readonly Proto.RefactorActionInfo[],
	): boolean {
		if (Extract_Constant.matches(action)) {
			// Only mark the action with the lowest scope as preferred
			const getScope = (name: string) => {
				const scope = name.match(/scope_(\d)/)?.[1];
				return scope ? +scope : undefined;
			};
			const scope = getScope(action.name);
			if (typeof scope !== 'number') {
				return false;
			}

			return allActions
				.filter(otherAtion => otherAtion !== action && Extract_Constant.matches(otherAtion))
				.every(otherAction => {
					const otherScope = getScope(otherAction.name);
					return typeof otherScope === 'number' ? scope < otherScope : true;
				});
		}
		if (Extract_Type.matches(action) || Extract_Interface.matches(action)) {
			return true;
		}
		return false;
	}

	private appendInvalidActions(actions: vscode.CodeAction[]): vscode.CodeAction[] {
		if (this.client.apiVersion.gte(API.v400)) {
			// Invalid actions come from TS server instead
			return actions;
		}

		if (!actions.some(action => action.kind && Extract_Constant.kind.contains(action.kind))) {
			const disabledAction = new vscode.CodeAction(
				vscode.l10n.t("Extract to constant"),
				Extract_Constant.kind);

			disabledAction.disabled = {
				reason: vscode.l10n.t("The current selection cannot be extracted"),
			};
			disabledAction.isPreferred = true;

			actions.push(disabledAction);
		}

		if (!actions.some(action => action.kind && Extract_Function.kind.contains(action.kind))) {
			const disabledAction = new vscode.CodeAction(
				vscode.l10n.t("Extract to function"),
				Extract_Function.kind);

			disabledAction.disabled = {
				reason: vscode.l10n.t("The current selection cannot be extracted"),
			};
			actions.push(disabledAction);
		}
		return actions;
	}

	private pruneInvalidActions(actions: vscode.CodeAction[], only?: vscode.CodeActionKind, numberOfInvalid?: number): vscode.CodeAction[] {
		if (this.client.apiVersion.lt(API.v400)) {
			// Older TS version don't return extra actions
			return actions;
		}

		const availableActions: vscode.CodeAction[] = [];
		const invalidCommonActions: vscode.CodeAction[] = [];
		const invalidUncommonActions: vscode.CodeAction[] = [];
		for (const action of actions) {
			if (!action.disabled) {
				availableActions.push(action);
				continue;
			}

			// These are the common refactors that we should always show if applicable.
			if (action.kind && (Extract_Constant.kind.contains(action.kind) || Extract_Function.kind.contains(action.kind))) {
				invalidCommonActions.push(action);
				continue;
			}

			// These are the remaining refactors that we can show if we haven't reached the max limit with just common refactors.
			invalidUncommonActions.push(action);
		}

		const prioritizedActions: vscode.CodeAction[] = [];
		prioritizedActions.push(...invalidCommonActions);
		prioritizedActions.push(...invalidUncommonActions);
		const topNInvalid = prioritizedActions.filter(action => !only || (action.kind && only.contains(action.kind))).slice(0, numberOfInvalid);
		availableActions.push(...topNInvalid);
		return availableActions;
	}
}

export function register(
	selector: DocumentSelector,
	client: ITypeScriptServiceClient,
	formattingOptionsManager: FormattingOptionsManager,
	commandManager: CommandManager,
	telemetryReporter: TelemetryReporter,
) {
	return conditionalRegistration([
		requireSomeCapability(client, ClientCapability.Semantic),
	], () => {
		return vscode.languages.registerCodeActionsProvider(selector.semantic,
			new TypeScriptRefactorProvider(client, formattingOptionsManager, commandManager, telemetryReporter),
			TypeScriptRefactorProvider.metadata);
	});
}
