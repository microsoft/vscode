/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IAnchor } from 'vs/base/browser/ui/contextview/contextview';
import { IJSONSchema } from 'vs/base/common/jsonSchema';
import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { Lazy } from 'vs/base/common/lazy';
import { Disposable } from 'vs/base/common/lifecycle';
import { escapeRegExpCharacters } from 'vs/base/common/strings';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { EditorAction, EditorCommand, ServicesAccessor } from 'vs/editor/browser/editorExtensions';
import { IPosition } from 'vs/editor/common/core/position';
import { IEditorContribution } from 'vs/editor/common/editorCommon';
import { EditorContextKeys } from 'vs/editor/common/editorContextKeys';
import { CodeActionTriggerType } from 'vs/editor/common/languages';
import { ILanguageFeaturesService } from 'vs/editor/common/services/languageFeatures';
import { acceptSelectedCodeActionCommand, applyCodeAction, ApplyCodeActionReason, codeActionCommandId, fixAllCommandId, organizeImportsCommandId, previewSelectedCodeActionCommand, refactorCommandId, refactorPreviewCommandId, sourceActionCommandId } from 'vs/editor/contrib/codeAction/browser/codeAction';
import { CodeActionUi } from 'vs/editor/contrib/codeAction/browser/codeActionUi';
import { CodeActionWidget, Context } from 'vs/editor/contrib/codeAction/browser/codeActionWidget';
import { MessageController } from 'vs/editor/contrib/message/browser/messageController';
import * as nls from 'vs/nls';
import { Action2, registerAction2 } from 'vs/platform/actions/common/actions';
import { ContextKeyExpr, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { IMarkerService } from 'vs/platform/markers/common/markers';
import { IEditorProgressService } from 'vs/platform/progress/common/progress';
import { CodeActionModel, CodeActionsState, SUPPORTED_CODE_ACTIONS } from './codeActionModel';
import { CodeActionAutoApply, CodeActionCommandArgs, CodeActionFilter, CodeActionItem, CodeActionKind, CodeActionSet, CodeActionTrigger, CodeActionTriggerSource } from '../common/types';

function contextKeyForSupportedActions(kind: CodeActionKind) {
	return ContextKeyExpr.regex(
		SUPPORTED_CODE_ACTIONS.keys()[0],
		new RegExp('(\\s|^)' + escapeRegExpCharacters(kind.value) + '\\b'));
}

function refactorTrigger(editor: ICodeEditor, userArgs: any, preview: boolean, codeActionFrom: CodeActionTriggerSource) {
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
			include: CodeActionKind.Refactor.contains(args.kind) ? args.kind : CodeActionKind.None,
			onlyIncludePreferredActions: args.preferred
		},
		args.apply, preview, codeActionFrom);
}

const argsSchema: IJSONSchema = {
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
};

export class CodeActionController extends Disposable implements IEditorContribution {

	public static readonly ID = 'editor.contrib.codeActionController';

	public static get(editor: ICodeEditor): CodeActionController | null {
		return editor.getContribution<CodeActionController>(CodeActionController.ID);
	}

	private readonly _editor: ICodeEditor;
	private readonly _model: CodeActionModel;
	private readonly _ui: Lazy<CodeActionUi>;

	constructor(
		editor: ICodeEditor,
		@IMarkerService markerService: IMarkerService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IEditorProgressService progressService: IEditorProgressService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@ILanguageFeaturesService languageFeaturesService: ILanguageFeaturesService,
	) {
		super();

		this._editor = editor;
		this._model = this._register(new CodeActionModel(this._editor, languageFeaturesService.codeActionProvider, markerService, contextKeyService, progressService));
		this._register(this._model.onDidChangeState(newState => this.update(newState)));

		this._ui = new Lazy(() =>
			this._register(_instantiationService.createInstance(CodeActionUi, editor, QuickFixAction.Id, AutoFixAction.Id, {
				applyCodeAction: async (action, retrigger, preview) => {
					try {
						await this._applyCodeAction(action, preview);
					} finally {
						if (retrigger) {
							this._trigger({ type: CodeActionTriggerType.Auto, triggerAction: CodeActionTriggerSource.QuickFix, filter: {} });
						}
					}
				}
			}))
		);
	}

	private update(newState: CodeActionsState.State): void {
		this._ui.getValue().update(newState);
	}

	public showCodeActions(trigger: CodeActionTrigger, actions: CodeActionSet, at: IAnchor | IPosition) {
		return this._ui.getValue().showCodeActionList(trigger, actions, at, { includeDisabledActions: false, fromLightbulb: false });
	}

	public manualTriggerAtCurrentPosition(
		notAvailableMessage: string,
		triggerAction: CodeActionTriggerSource,
		filter?: CodeActionFilter,
		autoApply?: CodeActionAutoApply,
		preview?: boolean,
	): void {
		if (!this._editor.hasModel()) {
			return;
		}

		MessageController.get(this._editor)?.closeMessage();
		const triggerPosition = this._editor.getPosition();
		this._trigger({ type: CodeActionTriggerType.Invoke, triggerAction, filter, autoApply, context: { notAvailableMessage, position: triggerPosition }, preview });
	}

	private _trigger(trigger: CodeActionTrigger) {
		return this._model.trigger(trigger);
	}

	private _applyCodeAction(action: CodeActionItem, preview: boolean): Promise<void> {
		return this._instantiationService.invokeFunction(applyCodeAction, action, ApplyCodeActionReason.FromCodeActions, { preview, editor: this._editor });
	}
}

function triggerCodeActionsForEditorSelection(
	editor: ICodeEditor,
	notAvailableMessage: string,
	filter: CodeActionFilter | undefined,
	autoApply: CodeActionAutoApply | undefined,
	preview: boolean = false,
	triggerAction: CodeActionTriggerSource = CodeActionTriggerSource.Default
): void {
	if (editor.hasModel()) {
		const controller = CodeActionController.get(editor);
		controller?.manualTriggerAtCurrentPosition(notAvailableMessage, triggerAction, filter, autoApply, preview);
	}
}

export class QuickFixAction extends EditorAction {

	static readonly Id = 'editor.action.quickFix';

	constructor() {
		super({
			id: QuickFixAction.Id,
			label: nls.localize('quickfix.trigger.label', "Quick Fix..."),
			alias: 'Quick Fix...',
			precondition: ContextKeyExpr.and(EditorContextKeys.writable, EditorContextKeys.hasCodeActionsProvider),
			kbOpts: {
				kbExpr: EditorContextKeys.editorTextFocus,
				primary: KeyMod.CtrlCmd | KeyCode.Period,
				weight: KeybindingWeight.EditorContrib
			}
		});
	}

	public run(_accessor: ServicesAccessor, editor: ICodeEditor): void {
		return triggerCodeActionsForEditorSelection(editor, nls.localize('editor.action.quickFix.noneMessage', "No code actions available"), undefined, undefined, false, CodeActionTriggerSource.QuickFix);
	}
}

export class CodeActionCommand extends EditorCommand {

	constructor() {
		super({
			id: codeActionCommandId,
			precondition: ContextKeyExpr.and(EditorContextKeys.writable, EditorContextKeys.hasCodeActionsProvider),
			description: {
				description: 'Trigger a code action',
				args: [{ name: 'args', schema: argsSchema, }]
			}
		});
	}

	public runEditorCommand(_accessor: ServicesAccessor, editor: ICodeEditor, userArgs: any) {
		const args = CodeActionCommandArgs.fromUser(userArgs, {
			kind: CodeActionKind.Empty,
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
			label: nls.localize('refactor.label', "Refactor..."),
			alias: 'Refactor...',
			precondition: ContextKeyExpr.and(EditorContextKeys.writable, EditorContextKeys.hasCodeActionsProvider),
			kbOpts: {
				kbExpr: EditorContextKeys.editorTextFocus,
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
			description: {
				description: 'Refactor...',
				args: [{ name: 'args', schema: argsSchema }]
			}
		});
	}

	public run(_accessor: ServicesAccessor, editor: ICodeEditor, userArgs: any): void {
		return refactorTrigger(editor, userArgs, false, CodeActionTriggerSource.Refactor);
	}
}

export class RefactorPreview extends EditorAction {

	constructor() {
		super({
			id: refactorPreviewCommandId,
			label: nls.localize('refactor.preview.label', "Refactor with Preview..."),
			alias: 'Refactor Preview...',
			precondition: ContextKeyExpr.and(EditorContextKeys.writable, EditorContextKeys.hasCodeActionsProvider),
			description: {
				description: 'Refactor Preview...',
				args: [{ name: 'args', schema: argsSchema }]
			}
		});
	}

	public run(_accessor: ServicesAccessor, editor: ICodeEditor, userArgs: any): void {
		return refactorTrigger(editor, userArgs, true, CodeActionTriggerSource.RefactorPreview);
	}
}

export class SourceAction extends EditorAction {

	constructor() {
		super({
			id: sourceActionCommandId,
			label: nls.localize('source.label', "Source Action..."),
			alias: 'Source Action...',
			precondition: ContextKeyExpr.and(EditorContextKeys.writable, EditorContextKeys.hasCodeActionsProvider),
			contextMenuOpts: {
				group: '1_modification',
				order: 2.1,
				when: ContextKeyExpr.and(
					EditorContextKeys.writable,
					contextKeyForSupportedActions(CodeActionKind.Source)),
			},
			description: {
				description: 'Source Action...',
				args: [{ name: 'args', schema: argsSchema }]
			}
		});
	}

	public run(_accessor: ServicesAccessor, editor: ICodeEditor, userArgs: any): void {
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
				include: CodeActionKind.Source.contains(args.kind) ? args.kind : CodeActionKind.None,
				includeSourceActions: true,
				onlyIncludePreferredActions: args.preferred,
			},
			args.apply, undefined, CodeActionTriggerSource.SourceAction);
	}
}

export class OrganizeImportsAction extends EditorAction {

	constructor() {
		super({
			id: organizeImportsCommandId,
			label: nls.localize('organizeImports.label', "Organize Imports"),
			alias: 'Organize Imports',
			precondition: ContextKeyExpr.and(
				EditorContextKeys.writable,
				contextKeyForSupportedActions(CodeActionKind.SourceOrganizeImports)),
			kbOpts: {
				kbExpr: EditorContextKeys.editorTextFocus,
				primary: KeyMod.Shift | KeyMod.Alt | KeyCode.KeyO,
				weight: KeybindingWeight.EditorContrib
			},
		});
	}

	public run(_accessor: ServicesAccessor, editor: ICodeEditor): void {
		return triggerCodeActionsForEditorSelection(editor,
			nls.localize('editor.action.organize.noneMessage', "No organize imports action available"),
			{ include: CodeActionKind.SourceOrganizeImports, includeSourceActions: true },
			CodeActionAutoApply.IfSingle, undefined, CodeActionTriggerSource.OrganizeImports);
	}
}

export class FixAllAction extends EditorAction {

	constructor() {
		super({
			id: fixAllCommandId,
			label: nls.localize('fixAll.label', "Fix All"),
			alias: 'Fix All',
			precondition: ContextKeyExpr.and(
				EditorContextKeys.writable,
				contextKeyForSupportedActions(CodeActionKind.SourceFixAll))
		});
	}

	public run(_accessor: ServicesAccessor, editor: ICodeEditor): void {
		return triggerCodeActionsForEditorSelection(editor,
			nls.localize('fixAll.noneMessage', "No fix all action available"),
			{ include: CodeActionKind.SourceFixAll, includeSourceActions: true },
			CodeActionAutoApply.IfSingle, undefined, CodeActionTriggerSource.FixAll);
	}
}

export class AutoFixAction extends EditorAction {

	static readonly Id = 'editor.action.autoFix';

	constructor() {
		super({
			id: AutoFixAction.Id,
			label: nls.localize('autoFix.label', "Auto Fix..."),
			alias: 'Auto Fix...',
			precondition: ContextKeyExpr.and(
				EditorContextKeys.writable,
				contextKeyForSupportedActions(CodeActionKind.QuickFix)),
			kbOpts: {
				kbExpr: EditorContextKeys.editorTextFocus,
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
			CodeActionAutoApply.IfSingle, undefined, CodeActionTriggerSource.AutoFix);
	}
}

const weight = KeybindingWeight.EditorContrib + 1000;

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'hideCodeActionWidget',
			title: {
				value: nls.localize('hideCodeActionWidget.title', "Hide code action widget"),
				original: 'Hide code action widget'
			},
			precondition: Context.Visible,
			keybinding: {
				weight,
				primary: KeyCode.Escape,
				secondary: [KeyMod.Shift | KeyCode.Escape]
			},
		});
	}

	run(): void {
		CodeActionWidget.INSTANCE?.hide();
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'selectPrevCodeAction',
			title: {
				value: nls.localize('selectPrevCodeAction.title', "Select previous code action"),
				original: 'Select previous code action'
			},
			precondition: Context.Visible,
			keybinding: {
				weight,
				primary: KeyCode.UpArrow,
				secondary: [KeyMod.CtrlCmd | KeyCode.UpArrow],
				mac: { primary: KeyCode.UpArrow, secondary: [KeyMod.CtrlCmd | KeyCode.UpArrow, KeyMod.WinCtrl | KeyCode.KeyP] },
			}
		});
	}

	run(): void {
		CodeActionWidget.INSTANCE?.focusPrevious();
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'selectNextCodeAction',
			title: {
				value: nls.localize('selectNextCodeAction.title', "Select next code action"),
				original: 'Select next code action'
			},
			precondition: Context.Visible,
			keybinding: {
				weight,
				primary: KeyCode.DownArrow,
				secondary: [KeyMod.CtrlCmd | KeyCode.DownArrow],
				mac: { primary: KeyCode.DownArrow, secondary: [KeyMod.CtrlCmd | KeyCode.DownArrow, KeyMod.WinCtrl | KeyCode.KeyN] }
			}
		});
	}

	run(): void {
		CodeActionWidget.INSTANCE?.focusNext();
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: acceptSelectedCodeActionCommand,
			title: {
				value: nls.localize('acceptSelected.title', "Accept selected code action"),
				original: 'Accept selected code action'
			},
			precondition: Context.Visible,
			keybinding: {
				weight,
				primary: KeyCode.Enter,
				secondary: [KeyMod.CtrlCmd | KeyCode.Period],
			}
		});
	}

	run(): void {
		CodeActionWidget.INSTANCE?.acceptSelected();
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: previewSelectedCodeActionCommand,
			title: {
				value: nls.localize('previewSelected.title', "Preview selected code action"),
				original: 'Preview selected code action'
			},
			precondition: Context.Visible,
			keybinding: {
				weight,
				primary: KeyMod.CtrlCmd | KeyCode.Enter,
			}
		});
	}

	run(): void {
		CodeActionWidget.INSTANCE?.acceptSelected({ preview: true });
	}
});

