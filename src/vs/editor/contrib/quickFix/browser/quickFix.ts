/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as nls from 'vs/nls';
import { onUnexpectedError } from 'vs/base/common/errors';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { ContextKeyExpr, RawContextKey, IContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IMarkerService } from 'vs/platform/markers/common/markers';
import { Selection } from 'vs/editor/common/core/selection';
import { IPosition, ICommonCodeEditor, EditorContextKeys, ModeContextKeys, IEditorContribution } from 'vs/editor/common/editorCommon';
import { editorAction, ServicesAccessor, EditorAction, EditorCommand, CommonEditorRegistry } from 'vs/editor/common/editorCommonExtensions';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { editorContribution } from 'vs/editor/browser/editorBrowserExtensions';
import { IQuickFix2 } from '../common/quickFix';
import { QuickFixContentWidget } from './quickFixWidget';
import { LightBulbWidget } from './lightBulbWidget';
import { QuickFixModel, QuickFixComputeEvent } from './quickFixModel';

@editorContribution
export class QuickFixController implements IEditorContribution {

	private static ID = 'editor.contrib.quickFixController';

	public static get(editor: ICommonCodeEditor): QuickFixController {
		return editor.getContribution<QuickFixController>(QuickFixController.ID);
	}

	private _editor: ICodeEditor;
	private _model: QuickFixModel;
	private _quickFixWidgetVisible: IContextKey<boolean>;
	private _quickFixWidget: QuickFixContentWidget;
	private _lightBulbWidget: LightBulbWidget;

	private _disposables: IDisposable[] = [];

	constructor(editor: ICodeEditor,
		@IMarkerService markerService: IMarkerService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@ICommandService private _commandService: ICommandService
	) {
		this._editor = editor;
		this._model = new QuickFixModel(this._editor, markerService);

		this._quickFixWidgetVisible = CONTEXT_QUICK_FIX_WIDGET_VISIBLE.bindTo(contextKeyService);
		this._quickFixWidget = new QuickFixContentWidget(editor);
		this._lightBulbWidget = new LightBulbWidget(editor);

		this._disposables.push(
			this._quickFixWidget.list.onDidSelectQuickFix(this._handleQuickFixSelect, this),
			this._lightBulbWidget.onClick(this._handleLightBulbSelect, this),
			this._model.onDidChangeFixes(e => this._onQuickFixEvent(e)),
			this._editor.onDidChangeCursorSelection(() => this.closeWidget()),
			// this._editor.onDidBlurEditorText(() => this.closeWidget())
		);
	}

	public dispose(): void {
		this._quickFixWidget.dispose();
		dispose(this._disposables);
	}

	private _onQuickFixEvent(e: QuickFixComputeEvent): void {
		if (e.type === 'manual') {
			this._lightBulbWidget.hide();
			this._quickFixWidgetVisible.set(true);
			this._quickFixWidget.show(e.fixes, e.position);

		} else if (e.fixes) {
			// auto magically triggered
			// * update an existing list of code actions
			// * manage light bulb
			if (this._quickFixWidget.isVisible()) {
				this._quickFixWidget.show(e.fixes, e.position);
			} else {
				e.fixes.then(fixes => {
					if (fixes && fixes.length > 0) {
						this._lightBulbWidget.show(e.position);
					} else {
						this._lightBulbWidget.hide();
					}
				}, err => {
					this._lightBulbWidget.hide();
				});
			}
		} else {
			this._lightBulbWidget.hide();
		}
	}

	public getId(): string {
		return QuickFixController.ID;
	}

	private _handleQuickFixSelect({command}: IQuickFix2): void {
		this.closeWidget();
		this._editor.focus();
		return this._commandService.executeCommand(command.id, ...command.arguments).done(void 0, onUnexpectedError);
	}

	private _handleLightBulbSelect(pos: IPosition): void {
		const selection = new Selection(pos.lineNumber, pos.column, pos.lineNumber, pos.column);
		this._model.triggerManual(selection);
	}

	public triggerFromEditorSelection(): void {
		this._model.triggerManual(this._editor.getSelection());
	}

	public acceptSelectedSuggestion(): void {
		if (this._quickFixWidget.isListVisible()) {
			this._quickFixWidget.list.select();
		}
	}

	public closeWidget(): void {
		this._lightBulbWidget.hide();
		this._quickFixWidget.hide();
		this._quickFixWidgetVisible.reset();
	}

	public selectNextSuggestion(): void {
		if (this._quickFixWidget.isListVisible()) {
			this._quickFixWidget.list.focusNext();
		}
	}

	public selectNextPageSuggestion(): void {
		if (this._quickFixWidget.isListVisible()) {
			this._quickFixWidget.list.focusNextPage();
		}
	}

	public selectPrevSuggestion(): void {
		if (this._quickFixWidget.isListVisible()) {
			this._quickFixWidget.list.focusPrevious();
		}
	}

	public selectPrevPageSuggestion(): void {
		if (this._quickFixWidget.isListVisible()) {
			this._quickFixWidget.list.focusPreviousPage();
		}
	}
}

@editorAction
export class QuickFixAction extends EditorAction {

	constructor() {
		super({
			id: 'editor.action.quickFix',
			label: nls.localize('quickfix.trigger.label', "Quick Fix"),
			alias: 'Quick Fix',
			precondition: ContextKeyExpr.and(EditorContextKeys.Writable, ModeContextKeys.hasCodeActionsProvider),
			kbOpts: {
				kbExpr: EditorContextKeys.TextFocus,
				primary: KeyMod.CtrlCmd | KeyCode.US_DOT
			}
		});
	}

	public run(accessor: ServicesAccessor, editor: ICommonCodeEditor): void {
		let controller = QuickFixController.get(editor);
		if (controller) {
			controller.triggerFromEditorSelection();
		}
	}
}

const CONTEXT_QUICK_FIX_WIDGET_VISIBLE = new RawContextKey<boolean>('quickFixWidgetVisible', false);

const QuickFixCommand = EditorCommand.bindToContribution<QuickFixController>(QuickFixController.get);

// register action
CommonEditorRegistry.registerEditorCommand(new QuickFixCommand({
	id: 'acceptQuickFixSuggestion',
	precondition: CONTEXT_QUICK_FIX_WIDGET_VISIBLE,
	handler: x => x.acceptSelectedSuggestion(),
	kbOpts: {
		weight: CommonEditorRegistry.commandWeight(80),
		kbExpr: EditorContextKeys.Focus,
		primary: KeyCode.Enter,
		secondary: [KeyCode.Tab]
	}
}));
CommonEditorRegistry.registerEditorCommand(new QuickFixCommand({
	id: 'closeQuickFixWidget',
	precondition: CONTEXT_QUICK_FIX_WIDGET_VISIBLE,
	handler: x => x.closeWidget(),
	kbOpts: {
		weight: CommonEditorRegistry.commandWeight(80),
		kbExpr: EditorContextKeys.Focus,
		primary: KeyCode.Escape,
		secondary: [KeyMod.Shift | KeyCode.Escape]
	}
}));
CommonEditorRegistry.registerEditorCommand(new QuickFixCommand({
	id: 'selectNextQuickFix',
	precondition: CONTEXT_QUICK_FIX_WIDGET_VISIBLE,
	handler: x => x.selectNextSuggestion(),
	kbOpts: {
		weight: CommonEditorRegistry.commandWeight(80),
		kbExpr: EditorContextKeys.Focus,
		primary: KeyCode.DownArrow,
		mac: { primary: KeyCode.DownArrow, secondary: [KeyMod.WinCtrl | KeyCode.KEY_N] }
	}
}));
CommonEditorRegistry.registerEditorCommand(new QuickFixCommand({
	id: 'selectNextPageQuickFix',
	precondition: CONTEXT_QUICK_FIX_WIDGET_VISIBLE,
	handler: x => x.selectNextPageSuggestion(),
	kbOpts: {
		weight: CommonEditorRegistry.commandWeight(80),
		kbExpr: EditorContextKeys.Focus,
		primary: KeyCode.PageDown
	}
}));
CommonEditorRegistry.registerEditorCommand(new QuickFixCommand({
	id: 'selectPrevQuickFix',
	precondition: CONTEXT_QUICK_FIX_WIDGET_VISIBLE,
	handler: x => x.selectPrevSuggestion(),
	kbOpts: {
		weight: CommonEditorRegistry.commandWeight(80),
		kbExpr: EditorContextKeys.Focus,
		primary: KeyCode.UpArrow,
		mac: { primary: KeyCode.UpArrow, secondary: [KeyMod.WinCtrl | KeyCode.KEY_P] }
	}
}));
CommonEditorRegistry.registerEditorCommand(new QuickFixCommand({
	id: 'selectPrevPageQuickFix',
	precondition: CONTEXT_QUICK_FIX_WIDGET_VISIBLE,
	handler: x => x.selectPrevPageSuggestion(),
	kbOpts: {
		weight: CommonEditorRegistry.commandWeight(80),
		kbExpr: EditorContextKeys.Focus,
		primary: KeyCode.PageUp
	}
}));
