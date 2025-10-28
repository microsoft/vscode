/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { HierarchicalKind } from '../../../../base/common/hierarchicalKind.js';
import { IJSONSchema, TypeFromJsonSchema } from '../../../../base/common/jsonSchema.js';
import { KeyCode, KeyMod } from '../../../../base/common/keyCodes.js';
import { escapeRegExpCharacters } from '../../../../base/common/strings.js';
import { ICodeEditor } from '../../../browser/editorBrowser.js';
import { EditorAction, EditorCommand, ServicesAccessor } from '../../../browser/editorExtensions.js';
import { EditorContextKeys } from '../../../common/editorContextKeys.js';
import { autoFixCommandId, codeActionCommandId, fixAllCommandId, organizeImportsCommandId, quickFixCommandId, refactorCommandId, sourceActionCommandId } from './codeAction.js';
import * as nls from '../../../../nls.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { KeybindingWeight } from '../../../../platform/keybinding/common/keybindingsRegistry.js';
import { CodeActionAutoApply, CodeActionCommandArgs, CodeActionFilter, CodeActionKind, CodeActionTriggerSource } from '../common/types.js';
import { CodeActionController } from './codeActionController.js';
import { SUPPORTED_CODE_ACTIONS } from './codeActionModel.js';

function contextKeyForSupportedActions(kind: HierarchicalKind) {
	return ContextKeyExpr.regex(
		SUPPORTED_CODE_ACTIONS.keys()[0],
		new RegExp('(\\s|^)' + escapeRegExpCharacters(kind.value) + '\\b'));
}

const argsSchema = {
	type: 'object',
	defaultSnippets: [{ body: { kind: '' } }],
	properties: {
		'kind': {
			type: 'string',
			description: nls.localize('args.schema.kind', "Kind of the code action to run."),
		},
		'apply': {
			type: 'string',
			description: nls.localize('args.schema.apply', "Controls when the returned actions are applied."),
			default: CodeActionAutoApply.IfSingle,
			enum: [CodeActionAutoApply.First, CodeActionAutoApply.IfSingle, CodeActionAutoApply.Never],
			enumDescriptions: [
				nls.localize('args.schema.apply.first', "Always apply the first returned code action."),
				nls.localize('args.schema.apply.ifSingle', "Apply the first returned code action if it is the only one."),
				nls.localize('args.schema.apply.never', "Do not apply the returned code actions."),
			]
		},
		'preferred': {
			type: 'boolean',
			default: false,
			description: nls.localize('args.schema.preferred', "Controls if only preferred code actions should be returned."),
		}
	}
} as const satisfies IJSONSchema;

function triggerCodeActionsForEditorSelection(
	editor: ICodeEditor,
	notAvailableMessage: string,
	filter: CodeActionFilter | undefined,
	autoApply: CodeActionAutoApply | undefined,
	triggerAction: CodeActionTriggerSource = CodeActionTriggerSource.Default
): void {
	if (editor.hasModel()) {
		const controller = CodeActionController.get(editor);
		controller?.manualTriggerAtCurrentPosition(notAvailableMessage, triggerAction, filter, autoApply);
	}
}

export class QuickFixAction extends EditorAction {

	constructor() {
		super({
			id: quickFixCommandId,
			label: nls.localize2('quickfix.trigger.label', "Quick Fix..."),
			precondition: ContextKeyExpr.and(EditorContextKeys.writable, EditorContextKeys.hasCodeActionsProvider),
			kbOpts: {
				kbExpr: EditorContextKeys.textInputFocus,
				primary: KeyMod.CtrlCmd | KeyCode.Period,
				weight: KeybindingWeight.EditorContrib
			}
		});
	}

	public run(_accessor: ServicesAccessor, editor: ICodeEditor): void {
		return triggerCodeActionsForEditorSelection(editor, nls.localize('editor.action.quickFix.noneMessage', "No code actions available"), undefined, undefined, CodeActionTriggerSource.QuickFix);
	}
}

export class CodeActionCommand extends EditorCommand {

	constructor() {
		super({
			id: codeActionCommandId,
			precondition: ContextKeyExpr.and(EditorContextKeys.writable, EditorContextKeys.hasCodeActionsProvider),
			metadata: {
				description: 'Trigger a code action',
				args: [{ name: 'args', schema: argsSchema, }]
			}
		});
	}

	public runEditorCommand(_accessor: ServicesAccessor, editor: ICodeEditor, userArgs?: TypeFromJsonSchema<typeof argsSchema>): void {
		const args = CodeActionCommandArgs.fromUser(userArgs, {
			kind: HierarchicalKind.Empty,
			apply: CodeActionAutoApply.IfSingle,
		});
		return triggerCodeActionsForEditorSelection(editor,
			typeof userArgs?.kind === 'string'
				? args.preferred
					? nls.localize('editor.action.codeAction.noneMessage.preferred.kind', "No preferred code actions for '{0}' available", userArgs.kind)
					: nls.localize('editor.action.codeAction.noneMessage.kind', "No code actions for '{0}' available", userArgs.kind)
				: args.preferred
					? nls.localize('editor.action.codeAction.noneMessage.preferred', "No preferred code actions available")
					: nls.localize('editor.action.codeAction.noneMessage', "No code actions available"),
			{
				include: args.kind,
				includeSourceActions: true,
				onlyIncludePreferredActions: args.preferred,
			},
			args.apply);
	}
}


export class RefactorAction extends EditorAction {

	constructor() {
		super({
			id: refactorCommandId,
			label: nls.localize2('refactor.label', "Refactor..."),
			precondition: ContextKeyExpr.and(EditorContextKeys.writable, EditorContextKeys.hasCodeActionsProvider),
			kbOpts: {
				kbExpr: EditorContextKeys.textInputFocus,
				primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyR,
				mac: {
					primary: KeyMod.WinCtrl | KeyMod.Shift | KeyCode.KeyR
				},
				weight: KeybindingWeight.EditorContrib
			},
			contextMenuOpts: {
				group: '1_modification',
				order: 2,
				when: ContextKeyExpr.and(
					EditorContextKeys.writable,
					contextKeyForSupportedActions(CodeActionKind.Refactor)),
			},
			metadata: {
				description: 'Refactor...',
				args: [{ name: 'args', schema: argsSchema }]
			}
		});
	}

	public run(_accessor: ServicesAccessor, editor: ICodeEditor, userArgs?: TypeFromJsonSchema<typeof argsSchema>): void {
		const args = CodeActionCommandArgs.fromUser(userArgs, {
			kind: CodeActionKind.Refactor,
			apply: CodeActionAutoApply.Never
		});
		return triggerCodeActionsForEditorSelection(editor,
			typeof userArgs?.kind === 'string'
				? args.preferred
					? nls.localize('editor.action.refactor.noneMessage.preferred.kind', "No preferred refactorings for '{0}' available", userArgs.kind)
					: nls.localize('editor.action.refactor.noneMessage.kind', "No refactorings for '{0}' available", userArgs.kind)
				: args.preferred
					? nls.localize('editor.action.refactor.noneMessage.preferred', "No preferred refactorings available")
					: nls.localize('editor.action.refactor.noneMessage', "No refactorings available"),
			{
				include: CodeActionKind.Refactor.contains(args.kind) ? args.kind : HierarchicalKind.None,
				onlyIncludePreferredActions: args.preferred
			},
			args.apply, CodeActionTriggerSource.Refactor);
	}
}

export class SourceAction extends EditorAction {

	constructor() {
		super({
			id: sourceActionCommandId,
			label: nls.localize2('source.label', "Source Action..."),
			precondition: ContextKeyExpr.and(EditorContextKeys.writable, EditorContextKeys.hasCodeActionsProvider),
			contextMenuOpts: {
				group: '1_modification',
				order: 2.1,
				when: ContextKeyExpr.and(
					EditorContextKeys.writable,
					contextKeyForSupportedActions(CodeActionKind.Source)),
			},
			metadata: {
				description: 'Source Action...',
				args: [{ name: 'args', schema: argsSchema }]
			}
		});
	}

	public run(_accessor: ServicesAccessor, editor: ICodeEditor, userArgs?: TypeFromJsonSchema<typeof argsSchema>): void {
		const args = CodeActionCommandArgs.fromUser(userArgs, {
			kind: CodeActionKind.Source,
			apply: CodeActionAutoApply.Never
		});
		return triggerCodeActionsForEditorSelection(editor,
			typeof userArgs?.kind === 'string'
				? args.preferred
					? nls.localize('editor.action.source.noneMessage.preferred.kind', "No preferred source actions for '{0}' available", userArgs.kind)
					: nls.localize('editor.action.source.noneMessage.kind', "No source actions for '{0}' available", userArgs.kind)
				: args.preferred
					? nls.localize('editor.action.source.noneMessage.preferred', "No preferred source actions available")
					: nls.localize('editor.action.source.noneMessage', "No source actions available"),
			{
				include: CodeActionKind.Source.contains(args.kind) ? args.kind : HierarchicalKind.None,
				includeSourceActions: true,
				onlyIncludePreferredActions: args.preferred,
			},
			args.apply, CodeActionTriggerSource.SourceAction);
	}
}

export class OrganizeImportsAction extends EditorAction {

	constructor() {
		super({
			id: organizeImportsCommandId,
			label: nls.localize2('organizeImports.label', "Organize Imports"),
			precondition: ContextKeyExpr.and(
				EditorContextKeys.writable,
				contextKeyForSupportedActions(CodeActionKind.SourceOrganizeImports)),
			kbOpts: {
				kbExpr: EditorContextKeys.textInputFocus,
				primary: KeyMod.Shift | KeyMod.Alt | KeyCode.KeyO,
				weight: KeybindingWeight.EditorContrib
			},
			metadata: {
				description: nls.localize2('organizeImports.description', "Organize imports in the current file. Also called 'Optimize Imports' by some tools")
			}
		});
	}

	public run(_accessor: ServicesAccessor, editor: ICodeEditor): void {
		return triggerCodeActionsForEditorSelection(editor,
			nls.localize('editor.action.organize.noneMessage', "No organize imports action available"),
			{ include: CodeActionKind.SourceOrganizeImports, includeSourceActions: true },
			CodeActionAutoApply.IfSingle, CodeActionTriggerSource.OrganizeImports);
	}
}

export class FixAllAction extends EditorAction {

	constructor() {
		super({
			id: fixAllCommandId,
			label: nls.localize2('fixAll.label', "Fix All"),
			precondition: ContextKeyExpr.and(
				EditorContextKeys.writable,
				contextKeyForSupportedActions(CodeActionKind.SourceFixAll))
		});
	}

	public run(_accessor: ServicesAccessor, editor: ICodeEditor): void {
		return triggerCodeActionsForEditorSelection(editor,
			nls.localize('fixAll.noneMessage', "No fix all action available"),
			{ include: CodeActionKind.SourceFixAll, includeSourceActions: true },
			CodeActionAutoApply.IfSingle, CodeActionTriggerSource.FixAll);
	}
}

export class AutoFixAction extends EditorAction {

	constructor() {
		super({
			id: autoFixCommandId,
			label: nls.localize2('autoFix.label', "Auto Fix..."),
			precondition: ContextKeyExpr.and(
				EditorContextKeys.writable,
				contextKeyForSupportedActions(CodeActionKind.QuickFix)),
			kbOpts: {
				kbExpr: EditorContextKeys.textInputFocus,
				primary: KeyMod.Alt | KeyMod.Shift | KeyCode.Period,
				mac: {
					primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.Period
				},
				weight: KeybindingWeight.EditorContrib
			}
		});
	}

	public run(_accessor: ServicesAccessor, editor: ICodeEditor): void {
		return triggerCodeActionsForEditorSelection(editor,
			nls.localize('editor.action.autoFix.noneMessage', "No auto fixes available"),
			{
				include: CodeActionKind.QuickFix,
				onlyIncludePreferredActions: true
			},
			CodeActionAutoApply.IfSingle, CodeActionTriggerSource.AutoFix);
	}
}
