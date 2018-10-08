/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancelablePromise } from 'vs/base/common/async';
import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { dispose, IDisposable } from 'vs/base/common/lifecycle';
import { escapeRegExpCharacters } from 'vs/base/common/strings';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { EditorAction, EditorCommand, ServicesAccessor } from 'vs/editor/browser/editorExtensions';
import { IBulkEditService } from 'vs/editor/browser/services/bulkEditService';
import { IEditorContribution } from 'vs/editor/common/editorCommon';
import { EditorContextKeys } from 'vs/editor/common/editorContextKeys';
import { CodeAction } from 'vs/editor/common/modes';
import { MessageController } from 'vs/editor/contrib/message/messageController';
import * as nls from 'vs/nls';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { ContextKeyExpr, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { IMarkerService } from 'vs/platform/markers/common/markers';
import { IProgressService } from 'vs/platform/progress/common/progress';
import { CodeActionModel, CodeActionsComputeEvent, SUPPORTED_CODE_ACTIONS } from './codeActionModel';
import { CodeActionAutoApply, CodeActionFilter, CodeActionKind } from './codeActionTrigger';
import { CodeActionContextMenu } from './codeActionWidget';
import { LightBulbWidget } from './lightBulbWidget';
import { KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { onUnexpectedError } from 'vs/base/common/errors';

function contextKeyForSupportedActions(kind: CodeActionKind) {
	return ContextKeyExpr.regex(
		SUPPORTED_CODE_ACTIONS.keys()[0],
		new RegExp('(\\s|^)' + escapeRegExpCharacters(kind.value) + '\\b'));
}

export class QuickFixController implements IEditorContribution {

	private static readonly ID = 'editor.contrib.quickFixController';

	public static get(editor: ICodeEditor): QuickFixController {
		return editor.getContribution<QuickFixController>(QuickFixController.ID);
	}

	private _editor: ICodeEditor;
	private _model: CodeActionModel;
	private _codeActionContextMenu: CodeActionContextMenu;
	private _lightBulbWidget: LightBulbWidget;
	private _disposables: IDisposable[] = [];

	private _activeRequest: CancelablePromise<CodeAction[]> | undefined;

	constructor(editor: ICodeEditor,
		@IMarkerService markerService: IMarkerService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IProgressService progressService: IProgressService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@ICommandService private readonly _commandService: ICommandService,
		@IKeybindingService private readonly _keybindingService: IKeybindingService,
		@IBulkEditService private readonly _bulkEditService: IBulkEditService,
	) {
		this._editor = editor;
		this._model = new CodeActionModel(this._editor, markerService, contextKeyService, progressService);
		this._codeActionContextMenu = new CodeActionContextMenu(editor, contextMenuService, action => this._onApplyCodeAction(action));
		this._lightBulbWidget = new LightBulbWidget(editor);

		this._updateLightBulbTitle();

		this._disposables.push(
			this._codeActionContextMenu.onDidExecuteCodeAction(_ => this._model.trigger({ type: 'auto', filter: {} })),
			this._lightBulbWidget.onClick(this._handleLightBulbSelect, this),
			this._model.onDidChangeFixes(e => this._onCodeActionsEvent(e)),
			this._keybindingService.onDidUpdateKeybindings(this._updateLightBulbTitle, this)
		);
	}

	public dispose(): void {
		this._model.dispose();
		dispose(this._disposables);
	}

	private _onCodeActionsEvent(e: CodeActionsComputeEvent): void {
		if (this._activeRequest) {
			this._activeRequest.cancel();
			this._activeRequest = undefined;
		}

		if (e && e.actions) {
			this._activeRequest = e.actions;
		}

		if (e && e.actions && e.trigger.filter && e.trigger.filter.kind) {
			// Triggered for specific scope
			// Apply if we only have one action or requested autoApply, otherwise show menu
			e.actions.then(fixes => {
				if (e.trigger.autoApply === CodeActionAutoApply.First || (e.trigger.autoApply === CodeActionAutoApply.IfSingle && fixes.length === 1)) {
					this._onApplyCodeAction(fixes[0]);
				} else {
					this._codeActionContextMenu.show(e.actions, e.position);
				}
			}).catch(onUnexpectedError);
			return;
		}

		if (e && e.trigger.type === 'manual') {
			this._codeActionContextMenu.show(e.actions, e.position);
		} else if (e && e.actions) {
			// auto magically triggered
			// * update an existing list of code actions
			// * manage light bulb
			if (this._codeActionContextMenu.isVisible) {
				this._codeActionContextMenu.show(e.actions, e.position);
			} else {
				this._lightBulbWidget.model = e;
			}
		} else {
			this._lightBulbWidget.hide();
		}
	}

	public getId(): string {
		return QuickFixController.ID;
	}

	private _handleLightBulbSelect(coords: { x: number, y: number }): void {
		if (this._lightBulbWidget.model && this._lightBulbWidget.model.actions) {
			this._codeActionContextMenu.show(this._lightBulbWidget.model.actions, coords);
		}
	}

	public triggerFromEditorSelection(filter?: CodeActionFilter, autoApply?: CodeActionAutoApply): Thenable<CodeAction[] | undefined> {
		return this._model.trigger({ type: 'manual', filter, autoApply });
	}

	private _updateLightBulbTitle(): void {
		const kb = this._keybindingService.lookupKeybinding(QuickFixAction.Id);
		let title: string;
		if (kb) {
			title = nls.localize('quickFixWithKb', "Show Fixes ({0})", kb.getLabel());
		} else {
			title = nls.localize('quickFix', "Show Fixes");
		}
		this._lightBulbWidget.title = title;
	}

	private _onApplyCodeAction(action: CodeAction): Promise<void> {
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
		await commandService.executeCommand(action.command.id, ...action.command.arguments);
	}
}

function showCodeActionsForEditorSelection(
	editor: ICodeEditor,
	notAvailableMessage: string,
	filter?: CodeActionFilter,
	autoApply?: CodeActionAutoApply
) {
	const controller = QuickFixController.get(editor);
	if (!controller) {
		return;
	}

	const pos = editor.getPosition();
	controller.triggerFromEditorSelection(filter, autoApply).then(codeActions => {
		if (!codeActions || !codeActions.length) {
			MessageController.get(editor).showMessage(notAvailableMessage, pos);
		}
	});
}

export class QuickFixAction extends EditorAction {

	static readonly Id = 'editor.action.quickFix';

	constructor() {
		super({
			id: QuickFixAction.Id,
			label: nls.localize('quickfix.trigger.label', "Quick Fix..."),
			alias: 'Quick Fix',
			precondition: ContextKeyExpr.and(EditorContextKeys.writable, EditorContextKeys.hasCodeActionsProvider),
			kbOpts: {
				kbExpr: EditorContextKeys.editorTextFocus,
				primary: KeyMod.CtrlCmd | KeyCode.US_DOT,
				weight: KeybindingWeight.EditorContrib
			}
		});
	}

	public run(_accessor: ServicesAccessor, editor: ICodeEditor): void {
		return showCodeActionsForEditorSelection(editor, nls.localize('editor.action.quickFix.noneMessage', "No code actions available"));
	}
}


class CodeActionCommandArgs {
	public static fromUser(arg: any): CodeActionCommandArgs {
		if (!arg || typeof arg !== 'object') {
			return new CodeActionCommandArgs(CodeActionKind.Empty, CodeActionAutoApply.IfSingle);
		}
		return new CodeActionCommandArgs(
			CodeActionCommandArgs.getKindFromUser(arg),
			CodeActionCommandArgs.getApplyFromUser(arg));
	}

	private static getApplyFromUser(arg: any) {
		switch (typeof arg.apply === 'string' ? arg.apply.toLowerCase() : '') {
			case 'first':
				return CodeActionAutoApply.First;

			case 'never':
				return CodeActionAutoApply.Never;

			case 'ifsingle':
			default:
				return CodeActionAutoApply.IfSingle;
		}
	}

	private static getKindFromUser(arg: any) {
		return typeof arg.kind === 'string'
			? new CodeActionKind(arg.kind)
			: CodeActionKind.Empty;
	}

	private constructor(
		public readonly kind: CodeActionKind,
		public readonly apply: CodeActionAutoApply
	) { }
}

export class CodeActionCommand extends EditorCommand {

	static readonly Id = 'editor.action.codeAction';

	constructor() {
		super({
			id: CodeActionCommand.Id,
			precondition: ContextKeyExpr.and(EditorContextKeys.writable, EditorContextKeys.hasCodeActionsProvider)
		});
	}

	public runEditorCommand(_accessor: ServicesAccessor, editor: ICodeEditor, userArg: any) {
		const args = CodeActionCommandArgs.fromUser(userArg);
		return showCodeActionsForEditorSelection(editor, nls.localize('editor.action.quickFix.noneMessage', "No code actions available"), { kind: args.kind, includeSourceActions: true }, args.apply);
	}
}


export class RefactorAction extends EditorAction {

	static readonly Id = 'editor.action.refactor';

	constructor() {
		super({
			id: RefactorAction.Id,
			label: nls.localize('refactor.label', "Refactor..."),
			alias: 'Refactor',
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
			}
		});
	}

	public run(_accessor: ServicesAccessor, editor: ICodeEditor): void {
		return showCodeActionsForEditorSelection(editor,
			nls.localize('editor.action.refactor.noneMessage', "No refactorings available"),
			{ kind: CodeActionKind.Refactor },
			CodeActionAutoApply.Never);
	}
}


export class SourceAction extends EditorAction {

	static readonly Id = 'editor.action.sourceAction';

	constructor() {
		super({
			id: SourceAction.Id,
			label: nls.localize('source.label', "Source Action..."),
			alias: 'Source Action',
			precondition: ContextKeyExpr.and(EditorContextKeys.writable, EditorContextKeys.hasCodeActionsProvider),
			menuOpts: {
				group: '1_modification',
				order: 2.1,
				when: ContextKeyExpr.and(
					EditorContextKeys.writable,
					contextKeyForSupportedActions(CodeActionKind.Source)),
			}
		});
	}

	public run(_accessor: ServicesAccessor, editor: ICodeEditor): void {
		return showCodeActionsForEditorSelection(editor,
			nls.localize('editor.action.source.noneMessage', "No source actions available"),
			{ kind: CodeActionKind.Source, includeSourceActions: true },
			CodeActionAutoApply.Never);
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
		return showCodeActionsForEditorSelection(editor,
			nls.localize('editor.action.organize.noneMessage', "No organize imports action available"),
			{ kind: CodeActionKind.SourceOrganizeImports, includeSourceActions: true },
			CodeActionAutoApply.IfSingle);
	}
}
