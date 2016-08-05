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
import {KbExpr, KbCtxKey, IKeybindingContextKey, IKeybindingService} from 'vs/platform/keybinding/common/keybinding';
import {IMarkerService} from 'vs/platform/markers/common/markers';
import {IMessageService} from 'vs/platform/message/common/message';
import {ITelemetryService} from 'vs/platform/telemetry/common/telemetry';
import {ICommonCodeEditor, EditorContextKeys, ModeContextKeys, IEditorContribution, IRange} from 'vs/editor/common/editorCommon';
import {ServicesAccessor, EditorAction, EditorCommand, CommonEditorRegistry} from 'vs/editor/common/editorCommonExtensions';
import {ICodeEditor} from 'vs/editor/browser/editorBrowser';
import {EditorBrowserRegistry} from 'vs/editor/browser/editorBrowserExtensions';
import {IQuickFix2} from '../common/quickFix';
import {QuickFixModel} from './quickFixModel';
import {QuickFixSelectionWidget} from './quickFixSelectionWidget';

export class QuickFixController implements IEditorContribution {

	private static ID = 'editor.contrib.quickFixController';

	static getQuickFixController(editor:ICommonCodeEditor): QuickFixController {
		return <QuickFixController>editor.getContribution(QuickFixController.ID);
	}

	private editor:ICodeEditor;
	private model:QuickFixModel;
	private suggestWidget: QuickFixSelectionWidget;
	private quickFixWidgetVisible: IKeybindingContextKey<boolean>;

	constructor(editor: ICodeEditor,
		@IMarkerService private _markerService: IMarkerService,
		@IKeybindingService private _keybindingService: IKeybindingService,
		@ICommandService private _commandService: ICommandService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IEditorService editorService: IEditorService,
		@IMessageService messageService: IMessageService
	) {
		this.editor = editor;
		this.model = new QuickFixModel(this.editor, this._markerService, this.onAccept.bind(this));

		this.quickFixWidgetVisible = CONTEXT_QUICK_FIX_WIDGET_VISIBLE.bindTo(this._keybindingService);
		this.suggestWidget = new QuickFixSelectionWidget(this.editor, telemetryService,() => {
			this.quickFixWidgetVisible.set(true);
		},() => {
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

export class QuickFixAction extends EditorAction {

	constructor() {
		super(
			'editor.action.quickFix',
			nls.localize('quickfix.trigger.label', "Quick Fix"),
			'Quick Fix',
			true
		);

		this._precondition = KbExpr.and(EditorContextKeys.TextFocus, EditorContextKeys.Writable, ModeContextKeys.hasCodeActionsProvider);

		this.kbOpts = {
			kbExpr: EditorContextKeys.TextFocus,
			primary: KeyMod.CtrlCmd | KeyCode.US_DOT
		};
	}

	public run(accessor:ServicesAccessor, editor:ICommonCodeEditor): void {
		QuickFixController.getQuickFixController(editor).run();
	}
}

var CONTEXT_QUICK_FIX_WIDGET_VISIBLE = new KbCtxKey<boolean>('quickFixWidgetVisible', false);

const QuickFixCommand = EditorCommand.bindToContribution<QuickFixController>(
	QuickFixController.getQuickFixController, {
		weight: CommonEditorRegistry.commandWeight(80),
		kbExpr: KbExpr.and(EditorContextKeys.Focus, CONTEXT_QUICK_FIX_WIDGET_VISIBLE)
	}
);

// register action
CommonEditorRegistry.registerEditorAction(new QuickFixAction());
CommonEditorRegistry.registerEditorCommand2(new QuickFixCommand(
	'acceptQuickFixSuggestion',
	x => x.acceptSelectedSuggestion(),
	{
		primary: KeyCode.Enter,
		secondary: [KeyCode.Tab]
	}
));
CommonEditorRegistry.registerEditorCommand2(new QuickFixCommand(
	'closeQuickFixWidget',
	x => x.closeWidget(),
	{
		primary: KeyCode.Escape,
		secondary: [KeyMod.Shift | KeyCode.Escape]
	}
));
CommonEditorRegistry.registerEditorCommand2(new QuickFixCommand(
	'selectNextQuickFix',
	x => x.selectNextSuggestion(),
	{
		primary: KeyCode.DownArrow,
		mac: { primary: KeyCode.DownArrow, secondary: [KeyMod.WinCtrl | KeyCode.KEY_N] }
	}
));
CommonEditorRegistry.registerEditorCommand2(new QuickFixCommand(
	'selectNextPageQuickFix',
	x => x.selectNextPageSuggestion(),
	{
		primary: KeyCode.PageDown
	}
));
CommonEditorRegistry.registerEditorCommand2(new QuickFixCommand(
	'selectPrevQuickFix',
	x => x.selectPrevSuggestion(),
	{
		primary: KeyCode.UpArrow,
		mac: { primary: KeyCode.UpArrow, secondary: [KeyMod.WinCtrl | KeyCode.KEY_P] }
	}
));
CommonEditorRegistry.registerEditorCommand2(new QuickFixCommand(
	'selectPrevPageQuickFix',
	x => x.selectPrevPageSuggestion(),
	{
		primary: KeyCode.PageUp
	}
));

EditorBrowserRegistry.registerEditorContribution(QuickFixController);