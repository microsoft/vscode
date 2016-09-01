/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as nls from 'vs/nls';
import {onUnexpectedError} from 'vs/base/common/errors';
import {KeyCode, KeyMod} from 'vs/base/common/keyCodes';
import {IEditorService} from 'vs/platform/editor/common/editor';
import {ICommandService} from 'vs/platform/commands/common/commands';
import {ContextKeyExpr, RawContextKey, IContextKey, IContextKeyService} from 'vs/platform/contextkey/common/contextkey';
import {IMarkerService} from 'vs/platform/markers/common/markers';
import {IMessageService} from 'vs/platform/message/common/message';
import {ITelemetryService} from 'vs/platform/telemetry/common/telemetry';
import {ICommonCodeEditor, EditorContextKeys, ModeContextKeys, IEditorContribution, IRange} from 'vs/editor/common/editorCommon';
import {editorAction, ServicesAccessor, EditorAction, EditorCommand, CommonEditorRegistry} from 'vs/editor/common/editorCommonExtensions';
import {ICodeEditor} from 'vs/editor/browser/editorBrowser';
import {editorContribution} from 'vs/editor/browser/editorBrowserExtensions';
import {IQuickFix2} from '../common/quickFix';
import {QuickFixModel} from './quickFixModel';
import {QuickFixSelectionWidget} from './quickFixSelectionWidget';

@editorContribution
export class QuickFixController implements IEditorContribution {

	private static ID = 'editor.contrib.quickFixController';

	public static get(editor: ICommonCodeEditor): QuickFixController {
		return editor.getContribution<QuickFixController>(QuickFixController.ID);
	}

	private editor: ICodeEditor;
	private model: QuickFixModel;
	private suggestWidget: QuickFixSelectionWidget;
	private quickFixWidgetVisible: IContextKey<boolean>;

	constructor(editor: ICodeEditor,
		@IMarkerService private _markerService: IMarkerService,
		@IContextKeyService private _contextKeyService: IContextKeyService,
		@ICommandService private _commandService: ICommandService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IEditorService editorService: IEditorService,
		@IMessageService messageService: IMessageService
	) {
		this.editor = editor;
		this.model = new QuickFixModel(this.editor, this._markerService, this.onAccept.bind(this));

		this.quickFixWidgetVisible = CONTEXT_QUICK_FIX_WIDGET_VISIBLE.bindTo(this._contextKeyService);
		this.suggestWidget = new QuickFixSelectionWidget(this.editor, telemetryService, () => {
			this.quickFixWidgetVisible.set(true);
		}, () => {
			this.quickFixWidgetVisible.reset();
		});
		this.suggestWidget.setModel(this.model);
	}

	public getId(): string {
		return QuickFixController.ID;
	}

	private onAccept(fix: IQuickFix2, range: IRange): void {
		var model = this.editor.getModel();
		if (model) {
			let {command} = fix;
			return this._commandService.executeCommand(command.id, ...command.arguments).done(void 0, onUnexpectedError);
		}
	}

	public run(): void {
		this.model.triggerDialog(false, this.editor.getPosition());
		this.editor.focus();
	}

	public dispose(): void {
		if (this.suggestWidget) {
			this.suggestWidget.destroy();
			this.suggestWidget = null;
		}
		if (this.model) {
			this.model.dispose();
			this.model = null;
		}
	}

	public acceptSelectedSuggestion(): void {
		if (this.suggestWidget) {
			this.suggestWidget.acceptSelectedSuggestion();
		}
	}
	public closeWidget(): void {
		if (this.model) {
			this.model.cancelDialog();
		}
	}
	public selectNextSuggestion(): void {
		if (this.suggestWidget) {
			this.suggestWidget.selectNext();
		}
	}
	public selectNextPageSuggestion(): void {
		if (this.suggestWidget) {
			this.suggestWidget.selectNextPage();
		}
	}
	public selectPrevSuggestion(): void {
		if (this.suggestWidget) {
			this.suggestWidget.selectPrevious();
		}
	}
	public selectPrevPageSuggestion(): void {
		if (this.suggestWidget) {
			this.suggestWidget.selectPreviousPage();
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
			controller.run();
		}
	}
}

var CONTEXT_QUICK_FIX_WIDGET_VISIBLE = new RawContextKey<boolean>('quickFixWidgetVisible', false);

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
