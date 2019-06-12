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
import { Command, CommandManager } from '../utils/commandManager';
import { VersionDependentRegistration } from '../utils/dependentRegistration';
import TelemetryReporter from '../utils/telemetry';
import * as typeConverters from '../utils/typeConverters';
import FormattingOptionsManager from './fileConfigurationManager';
import { file } from '../utils/fileSchemes';

const localize = nls.loadMessageBundle();


class ApplyRefactoringCommand implements Command {
	public static readonly ID = '_typescript.applyRefactoring';
	public readonly id = ApplyRefactoringCommand.ID;

	constructor(
		private readonly client: ITypeScriptServiceClient,
		private readonly telemetryReporter: TelemetryReporter
	) { }

	public async execute(
		document: vscode.TextDocument,
		file: string,
		refactor: string,
		action: string,
		range: vscode.Range
	): Promise<boolean> {
		/* __GDPR__
			"refactor.execute" : {
				"action" : { "classification": "PublicNonPersonalData", "purpose": "FeatureInsight" },
				"${include}": [
					"${TypeScriptCommonProperties}"
				]
			}
		*/
		this.telemetryReporter.logTelemetry('refactor.execute', {
			action: action,
		});

		const args: Proto.GetEditsForRefactorRequestArgs = {
			...typeConverters.Range.toFileRangeRequestArgs(file, range),
			refactor,
			action,
		};
		const response = await this.client.execute('getEditsForRefactor', args, nulToken);
		if (response.type !== 'response' || !response.body) {
			return false;
		}

		if (!response.body.edits.length) {
			vscode.window.showErrorMessage(localize('refactoringFailed', "Could not apply refactoring"));
			return false;
		}

		const workspaceEdit = await this.toWorkspaceEdit(response.body);
		if (!(await vscode.workspace.applyEdit(workspaceEdit))) {
			return false;
		}

		const renameLocation = response.body.renameLocation;
		if (renameLocation) {
			await vscode.commands.executeCommand('editor.action.rename', [
				document.uri,
				typeConverters.Position.fromLocation(renameLocation)
			]);
		}
		return true;
	}

	private async toWorkspaceEdit(body: Proto.RefactorEditInfo) {
		const workspaceEdit = new vscode.WorkspaceEdit();
		for (const edit of body.edits) {
			const resource = this.client.toResource(edit.fileName);
			if (resource.scheme === file) {
				workspaceEdit.createFile(resource, { ignoreIfExists: true });
			}
		}
		typeConverters.WorkspaceEdit.withFileCodeEdits(workspaceEdit, this.client, body.edits);
		return workspaceEdit;
	}
}

class SelectRefactorCommand implements Command {
	public static readonly ID = '_typescript.selectRefactoring';
	public readonly id = SelectRefactorCommand.ID;

	constructor(
		private readonly doRefactoring: ApplyRefactoringCommand
	) { }

	public async execute(
		document: vscode.TextDocument,
		file: string,
		info: Proto.ApplicableRefactorInfo,
		range: vscode.Range
	): Promise<boolean> {
		const selected = await vscode.window.showQuickPick(info.actions.map((action): vscode.QuickPickItem => ({
			label: action.name,
			description: action.description,
		})));
		if (!selected) {
			return false;
		}
		return this.doRefactoring.execute(document, file, info.name, selected.label, range);
	}
}

class TypeScriptRefactorProvider implements vscode.CodeActionProvider {
	public static readonly minVersion = API.v240;

	private static readonly extractFunctionKind = vscode.CodeActionKind.RefactorExtract.append('function');
	private static readonly extractConstantKind = vscode.CodeActionKind.RefactorExtract.append('constant');
	private static readonly extractTypeKind = vscode.CodeActionKind.RefactorExtract.append('type');
	private static readonly moveKind = vscode.CodeActionKind.Refactor.append('move');

	constructor(
		private readonly client: ITypeScriptServiceClient,
		private readonly formattingOptionsManager: FormattingOptionsManager,
		commandManager: CommandManager,
		telemetryReporter: TelemetryReporter
	) {
		const doRefactoringCommand = commandManager.register(new ApplyRefactoringCommand(this.client, telemetryReporter));
		commandManager.register(new SelectRefactorCommand(doRefactoringCommand));
	}

	public static readonly metadata: vscode.CodeActionProviderMetadata = {
		providedCodeActionKinds: [vscode.CodeActionKind.Refactor],
	};

	public async provideCodeActions(
		document: vscode.TextDocument,
		rangeOrSelection: vscode.Range | vscode.Selection,
		context: vscode.CodeActionContext,
		token: vscode.CancellationToken
	): Promise<vscode.CodeAction[] | undefined> {
		if (!this.shouldTrigger(rangeOrSelection, context)) {
			return undefined;
		}

		const file = this.client.toOpenedFilePath(document);
		if (!file) {
			return undefined;
		}

		const args: Proto.GetApplicableRefactorsRequestArgs = typeConverters.Range.toFileRangeRequestArgs(file, rangeOrSelection);
		const response = await this.client.interruptGetErr(() => {
			this.formattingOptionsManager.ensureConfigurationForDocument(document, token);

			return this.client.execute('getApplicableRefactors', args, token);
		});
		if (response.type !== 'response' || !response.body) {
			return undefined;
		}

		return this.convertApplicableRefactors(response.body, document, file, rangeOrSelection);
	}

	private convertApplicableRefactors(
		body: Proto.ApplicableRefactorInfo[],
		document: vscode.TextDocument,
		file: string,
		rangeOrSelection: vscode.Range | vscode.Selection
	) {
		const actions: vscode.CodeAction[] = [];
		for (const info of body) {
			if (info.inlineable === false) {
				const codeAction = new vscode.CodeAction(info.description, vscode.CodeActionKind.Refactor);
				codeAction.command = {
					title: info.description,
					command: SelectRefactorCommand.ID,
					arguments: [document, file, info, rangeOrSelection]
				};
				actions.push(codeAction);
			} else {
				for (const action of info.actions) {
					actions.push(this.refactorActionToCodeAction(action, document, file, info, rangeOrSelection));
				}
			}
		}
		return actions;
	}

	private refactorActionToCodeAction(
		action: Proto.RefactorActionInfo,
		document: vscode.TextDocument,
		file: string,
		info: Proto.ApplicableRefactorInfo,
		rangeOrSelection: vscode.Range | vscode.Selection
	) {
		const codeAction = new vscode.CodeAction(action.description, TypeScriptRefactorProvider.getKind(action));
		codeAction.command = {
			title: action.description,
			command: ApplyRefactoringCommand.ID,
			arguments: [document, file, info.name, action.name, rangeOrSelection],
		};
		codeAction.isPreferred = TypeScriptRefactorProvider.isPreferred(action);
		return codeAction;
	}

	private shouldTrigger(rangeOrSelection: vscode.Range | vscode.Selection, context: vscode.CodeActionContext) {
		if (context.only && !vscode.CodeActionKind.Refactor.contains(context.only)) {
			return false;
		}

		return rangeOrSelection instanceof vscode.Selection;
	}

	private static getKind(refactor: Proto.RefactorActionInfo) {
		if (refactor.name.startsWith('function_')) {
			return TypeScriptRefactorProvider.extractFunctionKind;
		} else if (refactor.name.startsWith('constant_')) {
			return TypeScriptRefactorProvider.extractConstantKind;
		} else if (refactor.name.startsWith('Move')) {
			return TypeScriptRefactorProvider.moveKind;
		} else if (refactor.name.includes('Extract to type alias')) {
			return TypeScriptRefactorProvider.extractTypeKind;
		}
		return vscode.CodeActionKind.Refactor;
	}

	private static isPreferred(
		action: Proto.RefactorActionInfo
	): boolean {
		if (action.name.startsWith('constant_')) {
			return action.name.endsWith('scope_0');
		}
		if (action.name.includes('Extract to type alias')) {
			return true;
		}
		return false;
	}
}

export function register(
	selector: vscode.DocumentSelector,
	client: ITypeScriptServiceClient,
	formattingOptionsManager: FormattingOptionsManager,
	commandManager: CommandManager,
	telemetryReporter: TelemetryReporter,
) {
	return new VersionDependentRegistration(client, TypeScriptRefactorProvider.minVersion, () => {
		return vscode.languages.registerCodeActionsProvider(selector,
			new TypeScriptRefactorProvider(client, formattingOptionsManager, commandManager, telemetryReporter),
			TypeScriptRefactorProvider.metadata);
	});
}
