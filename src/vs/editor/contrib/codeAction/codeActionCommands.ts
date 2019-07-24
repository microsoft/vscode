/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { Disposable } from 'vs/base/common/lifecycle';
import { escapeRegExpCharacters } from 'vs/base/common/strings';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { EditorAction, EditorCommand, ServicesAccessor } from 'vs/editor/browser/editorExtensions';
import { IBulkEditService } from 'vs/editor/browser/services/bulkEditService';
import { IEditorContribution } from 'vs/editor/common/editorCommon';
import { EditorContextKeys } from 'vs/editor/common/editorContextKeys';
import { CodeAction } from 'vs/editor/common/modes';
import { CodeActionUi } from 'vs/editor/contrib/codeAction/codeActionUi';
import { MessageController } from 'vs/editor/contrib/message/messageController';
import * as nls from 'vs/nls';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { ContextKeyExpr, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { IMarkerService } from 'vs/platform/markers/common/markers';
import { IEditorProgressService } from 'vs/platform/progress/common/progress';
import { CodeActionModel, CodeActionsState, SUPPORTED_CODE_ACTIONS } from './codeActionModel';
import { CodeActionAutoApply, CodeActionFilter, CodeActionKind, CodeActionTrigger } from './codeActionTrigger';
import { CodeActionSet } from 'vs/editor/contrib/codeAction/codeAction';
import { IAnchor } from 'vs/base/browser/ui/contextview/contextview';
import { IPosition } from 'vs/editor/common/core/position';

function contextKeyForSupportedActions(kind: CodeActionKind) {
	return ContextKeyExpr.regex(
		SUPPORTED_CODE_ACTIONS.keys()[0],
		new RegExp('(\\s|^)' + escapeRegExpCharacters(kind.value) + '\\b'));
}


export class QuickFixController extends Disposable implements IEditorContribution {

	private static readonly ID = 'editor.contrib.quickFixController';

	public static get(editor: ICodeEditor): QuickFixController {
		return editor.getContribution<QuickFixController>(QuickFixController.ID);
	}

	private readonly _editor: ICodeEditor;
	private readonly _model: CodeActionModel;
	private readonly _ui: CodeActionUi;

	constructor(
		editor: ICodeEditor,
		@IMarkerService markerService: IMarkerService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IEditorProgressService progressService: IEditorProgressService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IKeybindingService keybindingService: IKeybindingService,
		@ICommandService private readonly _commandService: ICommandService,
		@IBulkEditService private readonly _bulkEditService: IBulkEditService,
	) {
		super();

		this._editor = editor;
		this._model = this._register(new CodeActionModel(this._editor, markerService, contextKeyService, progressService));
		this._register(this._model.onDidChangeState((newState) => this.update(newState)));

		this._ui = this._register(new CodeActionUi(editor, QuickFixAction.Id, {
			applyCodeAction: async (action, retrigger) => {
				try {
					await this._applyCodeAction(action);
				} finally {
					if (retrigger) {
						this._trigger({ type: 'auto', filter: {} });
					}
				}
			}
		}, contextMenuService, keybindingService));
	}

	private update(newState: CodeActionsState.State): void {
		this._ui.update(newState);
	}

	public showCodeActions(actions: CodeActionSet, at: IAnchor | IPosition) {
		return this._ui.showCodeActionList(actions, at);
	}

	public getId(): string {
		return QuickFixController.ID;
	}

	public manualTriggerAtCurrentPosition(
		notAvailableMessage: string,
		filter?: CodeActionFilter,
		autoApply?: CodeActionAutoApply
	): void {
		if (!this._editor.hasModel()) {
			return;
		}

		MessageController.get(this._editor).closeMessage();
		const triggerPosition = this._editor.getPosition();
		this._trigger({ type: 'manual', filter, autoApply, context: { notAvailableMessage, position: triggerPosition } });
	}

	private _trigger(trigger: CodeActionTrigger) {
		return this._model.trigger(trigger);
	}

	private _applyCodeAction(action: CodeAction): Promise<void> {
		return applyCodeAction(action, this._bulkEditService, this._commandService, this._editor);
	}
}

export async function applyCodeAction(
	action: CodeAction,
	bulkEditService: IBulkEditService,
	commandService: ICommandService,
	editor?: ICodeEditor,
): Promise<void> {
	if (action.edit) {
		await bulkEditService.apply(action.edit, { editor });
	}
	if (action.command) {
		await commandService.executeCommand(action.command.id, ...(action.command.arguments || []));
	}
}

function triggerCodeActionsForEditorSelection(
	editor: ICodeEditor,
	notAvailableMessage: string,
	filter: CodeActionFilter | undefined,
	autoApply: CodeActionAutoApply | undefined
): void {
	if (editor.hasModel()) {
		const controller = QuickFixController.get(editor);
		if (controller) {
			controller.manualTriggerAtCurrentPosition(notAvailableMessage, filter, autoApply);
		}
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
				primary: KeyMod.CtrlCmd | KeyCode.US_DOT,
				weight: KeybindingWeight.EditorContrib
			}
		});
	}

	public run(_accessor: ServicesAccessor, editor: ICodeEditor): void {
		return triggerCodeActionsForEditorSelection(editor, nls.localize('editor.action.quickFix.noneMessage', "No code actions available"), undefined, undefined);
	}
}


class CodeActionCommandArgs {
	public static fromUser(arg: any, defaults: { kind: CodeActionKind, apply: CodeActionAutoApply }): CodeActionCommandArgs {
		if (!arg || typeof arg !== 'object') {
			return new CodeActionCommandArgs(defaults.kind, defaults.apply, false);
		}
		return new CodeActionCommandArgs(
			CodeActionCommandArgs.getKindFromUser(arg, defaults.kind),
			CodeActionCommandArgs.getApplyFromUser(arg, defaults.apply),
			CodeActionCommandArgs.getPreferredUser(arg));
	}

	private static getApplyFromUser(arg: any, defaultAutoApply: CodeActionAutoApply) {
		switch (typeof arg.apply === 'string' ? arg.apply.toLowerCase() : '') {
			case 'first': return CodeActionAutoApply.First;
			case 'never': return CodeActionAutoApply.Never;
			case 'ifsingle': return CodeActionAutoApply.IfSingle;
			default: return defaultAutoApply;
		}
	}

	private static getKindFromUser(arg: any, defaultKind: CodeActionKind) {
		return typeof arg.kind === 'string'
			? new CodeActionKind(arg.kind)
			: defaultKind;
	}

	private static getPreferredUser(arg: any): boolean {
		return typeof arg.preferred === 'boolean'
			? arg.preferred
			: false;
	}

	private constructor(
		public readonly kind: CodeActionKind,
		public readonly apply: CodeActionAutoApply,
		public readonly preferred: boolean,
	) { }
}

export class CodeActionCommand extends EditorCommand {

	static readonly Id = 'editor.action.codeAction';

	constructor() {
		super({
			id: CodeActionCommand.Id,
			precondition: ContextKeyExpr.and(EditorContextKeys.writable, EditorContextKeys.hasCodeActionsProvider),
			description: {
				description: `Trigger a code action`,
				args: [{
					name: 'args',
					schema: {
						'type': 'object',
						'required': ['kind'],
						'properties': {
							'kind': {
								'type': 'string'
							},
							'apply': {
								'type': 'string',
								'default': 'ifSingle',
								'enum': ['first', 'ifSingle', 'never']
							}
						}
					}
				}]
			}
		});
	}

	public runEditorCommand(_accessor: ServicesAccessor, editor: ICodeEditor, userArg: any) {
		const args = CodeActionCommandArgs.fromUser(userArg, {
			kind: CodeActionKind.Empty,
			apply: CodeActionAutoApply.IfSingle,
		});
		return triggerCodeActionsForEditorSelection(editor, nls.localize('editor.action.quickFix.noneMessage', "No code actions available"),
			{
				kind: args.kind,
				includeSourceActions: true,
				onlyIncludePreferredActions: args.preferred,
			},
			args.apply);
	}
}


export class RefactorAction extends EditorAction {

	static readonly Id = 'editor.action.refactor';

	constructor() {
		super({
			id: RefactorAction.Id,
			label: nls.localize('refactor.label', "Refactor..."),
			alias: 'Refactor...',
			precondition: ContextKeyExpr.and(EditorContextKeys.writable, EditorContextKeys.hasCodeActionsProvider),
			kbOpts: {
				kbExpr: EditorContextKeys.editorTextFocus,
				primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KEY_R,
				mac: {
					primary: KeyMod.WinCtrl | KeyMod.Shift | KeyCode.KEY_R
				},
				weight: KeybindingWeight.EditorContrib
			},
			menuOpts: {
				group: '1_modification',
				order: 2,
				when: ContextKeyExpr.and(
					EditorContextKeys.writable,
					contextKeyForSupportedActions(CodeActionKind.Refactor)),
			},
			description: {
				description: 'Refactor...',
				args: [{
					name: 'args',
					schema: {
						'type': 'object',
						'properties': {
							'kind': {
								'type': 'string'
							},
							'apply': {
								'type': 'string',
								'default': 'never',
								'enum': ['first', 'ifSingle', 'never']
							}
						}
					}
				}]
			}
		});
	}

	public run(_accessor: ServicesAccessor, editor: ICodeEditor, userArg: any): void {
		const args = CodeActionCommandArgs.fromUser(userArg, {
			kind: CodeActionKind.Refactor,
			apply: CodeActionAutoApply.Never
		});
		return triggerCodeActionsForEditorSelection(editor,
			nls.localize('editor.action.refactor.noneMessage', "No refactorings available"),
			{
				kind: CodeActionKind.Refactor.contains(args.kind) ? args.kind : CodeActionKind.Empty,
				onlyIncludePreferredActions: args.preferred,
			},
			args.apply);
	}
}


export class SourceAction extends EditorAction {

	static readonly Id = 'editor.action.sourceAction';

	constructor() {
		super({
			id: SourceAction.Id,
			label: nls.localize('source.label', "Source Action..."),
			alias: 'Source Action...',
			precondition: ContextKeyExpr.and(EditorContextKeys.writable, EditorContextKeys.hasCodeActionsProvider),
			menuOpts: {
				group: '1_modification',
				order: 2.1,
				when: ContextKeyExpr.and(
					EditorContextKeys.writable,
					contextKeyForSupportedActions(CodeActionKind.Source)),
			},
			description: {
				description: 'Source Action...',
				args: [{
					name: 'args',
					schema: {
						'type': 'object',
						'properties': {
							'kind': {
								'type': 'string'
							},
							'apply': {
								'type': 'string',
								'default': 'never',
								'enum': ['first', 'ifSingle', 'never']
							}
						}
					}
				}]
			}
		});
	}

	public run(_accessor: ServicesAccessor, editor: ICodeEditor, userArg: any): void {
		const args = CodeActionCommandArgs.fromUser(userArg, {
			kind: CodeActionKind.Source,
			apply: CodeActionAutoApply.Never
		});
		return triggerCodeActionsForEditorSelection(editor,
			nls.localize('editor.action.source.noneMessage', "No source actions available"),
			{
				kind: CodeActionKind.Source.contains(args.kind) ? args.kind : CodeActionKind.Empty,
				includeSourceActions: true,
				onlyIncludePreferredActions: args.preferred,
			},
			args.apply);
	}
}

export class OrganizeImportsAction extends EditorAction {

	static readonly Id = 'editor.action.organizeImports';

	constructor() {
		super({
			id: OrganizeImportsAction.Id,
			label: nls.localize('organizeImports.label', "Organize Imports"),
			alias: 'Organize Imports',
			precondition: ContextKeyExpr.and(
				EditorContextKeys.writable,
				contextKeyForSupportedActions(CodeActionKind.SourceOrganizeImports)),
			kbOpts: {
				kbExpr: EditorContextKeys.editorTextFocus,
				primary: KeyMod.Shift | KeyMod.Alt | KeyCode.KEY_O,
				weight: KeybindingWeight.EditorContrib
			}
		});
	}

	public run(_accessor: ServicesAccessor, editor: ICodeEditor): void {
		return triggerCodeActionsForEditorSelection(editor,
			nls.localize('editor.action.organize.noneMessage', "No organize imports action available"),
			{ kind: CodeActionKind.SourceOrganizeImports, includeSourceActions: true },
			CodeActionAutoApply.IfSingle);
	}
}

export class FixAllAction extends EditorAction {

	static readonly Id = 'editor.action.fixAll';

	constructor() {
		super({
			id: FixAllAction.Id,
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
			{ kind: CodeActionKind.SourceFixAll, includeSourceActions: true },
			CodeActionAutoApply.IfSingle);
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
				primary: KeyMod.Alt | KeyMod.Shift | KeyCode.US_DOT,
				mac: {
					primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.US_DOT
				},
				weight: KeybindingWeight.EditorContrib
			}
		});
	}

	public run(_accessor: ServicesAccessor, editor: ICodeEditor): void {
		return triggerCodeActionsForEditorSelection(editor,
			nls.localize('editor.action.autoFix.noneMessage', "No auto fixes available"),
			{
				kind: CodeActionKind.QuickFix,
				onlyIncludePreferredActions: true
			},
			CodeActionAutoApply.IfSingle);
	}
}
