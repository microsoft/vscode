/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./clipboard';
import * as nls from 'vs/nls';
import {KeyCode, KeyMod} from 'vs/base/common/keyCodes';
import {dispose, IDisposable} from 'vs/base/common/lifecycle';
import {TPromise} from 'vs/base/common/winjs.base';
import * as browser from 'vs/base/browser/browser';
import {ServicesAccessor} from 'vs/platform/instantiation/common/instantiation';
import {IKeybindings, KbExpr} from 'vs/platform/keybinding/common/keybinding';
import {findFocusedEditor} from 'vs/editor/common/config/config';
import {EditorAction} from 'vs/editor/common/editorAction';
import {Behaviour} from 'vs/editor/common/editorActionEnablement';
import * as editorCommon from 'vs/editor/common/editorCommon';
import {CommonEditorRegistry, ContextKey, EditorActionDescriptor} from 'vs/editor/common/editorCommonExtensions';
import {MenuRegistry} from 'vs/platform/actions/browser/menuService';
import {MenuId} from 'vs/platform/actions/common/actions';

class ClipboardWritingAction extends EditorAction {

	private toUnhook:IDisposable[];

	constructor(descriptor:editorCommon.IEditorActionDescriptorData, editor:editorCommon.ICommonCodeEditor, condition:Behaviour) {
		super(descriptor, editor, condition);
		this.toUnhook = [];
		this.toUnhook.push(this.editor.onDidChangeCursorSelection((e:editorCommon.ICursorSelectionChangedEvent) => {
			this.resetEnablementState();
		}));
	}

	public dispose(): void {
		this.toUnhook = dispose(this.toUnhook);
		super.dispose();
	}

	public getEnablementState(): boolean {
		if (browser.enableEmptySelectionClipboard) {
			return true;
		} else {
			return !this.editor.getSelection().isEmpty();
		}
	}
}

function editorCursorIsInEditableRange(editor:editorCommon.ICommonCodeEditor): boolean {
	var model = editor.getModel();
	if (!model) {
		return false;
	}
	var hasEditableRange = model.hasEditableRange();
	if (!hasEditableRange) {
		return true;
	}
	var editableRange = model.getEditableRange();
	var editorPosition = editor.getPosition();
	return editableRange.containsPosition(editorPosition);
}

class ExecCommandCutAction extends ClipboardWritingAction {

	constructor(descriptor:editorCommon.IEditorActionDescriptorData, editor:editorCommon.ICommonCodeEditor) {
		super(descriptor, editor, Behaviour.Writeable | Behaviour.WidgetFocus | Behaviour.UpdateOnCursorPositionChange);
	}

	public getGroupId(): string {
		return '3_edit/1_cut';
	}

	public getEnablementState(): boolean {
		return super.getEnablementState() && editorCursorIsInEditableRange(this.editor);
	}

	public run(): TPromise<boolean> {
		this.editor.focus();
		document.execCommand('cut');
		return TPromise.as(true);
	}
}

class ExecCommandCopyAction extends ClipboardWritingAction {

	constructor(descriptor:editorCommon.IEditorActionDescriptorData, editor:editorCommon.ICommonCodeEditor) {
		super(descriptor, editor, Behaviour.WidgetFocus);
	}

	public getGroupId(): string {
		return '3_edit/2_copy';
	}

	public run(): TPromise<boolean> {
		this.editor.focus();
		document.execCommand('copy');
		return TPromise.as(true);
	}
}

class ExecCommandPasteAction extends EditorAction {

	constructor(descriptor:editorCommon.IEditorActionDescriptorData, editor:editorCommon.ICommonCodeEditor) {
		super(descriptor, editor, Behaviour.Writeable | Behaviour.WidgetFocus | Behaviour.UpdateOnCursorPositionChange);
	}

	public getGroupId(): string {
		return '3_edit/3_paste';
	}

	public getEnablementState(): boolean {
		return editorCursorIsInEditableRange(this.editor);
	}

	public run(): TPromise<boolean> {
		this.editor.focus();
		document.execCommand('paste');
		return null;
	}
}

interface IClipboardCommand extends IKeybindings {
	ctor: editorCommon.IEditorActionContributionCtor;
	id: string;
	label: string;
	execCommand: string;
	kbExpr: KbExpr;
}
function registerClipboardAction(desc: IClipboardCommand, alias: string, weight: number) {
	if (!browser.supportsExecCommand(desc.execCommand)) {
		return;
	}

	CommonEditorRegistry.registerEditorAction(new EditorActionDescriptor(desc.ctor, desc.id, desc.label, {
		handler: execCommandToHandler.bind(null, desc.id, desc.execCommand),
		context: ContextKey.None,
		primary: desc.primary,
		secondary: desc.secondary,
		win: desc.win,
		linux: desc.linux,
		mac: desc.mac,
		kbExpr: KbExpr.has(editorCommon.KEYBINDING_CONTEXT_EDITOR_TEXT_FOCUS)
	}, alias));

	MenuRegistry.addCommand({
		id: desc.id,
		title: desc.label
	});

	MenuRegistry.appendMenuItem(MenuId.EditorContext, {
		command: MenuRegistry.getCommand(desc.id),
		group: `cutcopypaste@${weight}`,
		when: desc.kbExpr
	});
}

registerClipboardAction({
	ctor: ExecCommandCutAction,
	id: 'editor.action.clipboardCutAction',
	label: nls.localize('actions.clipboard.cutLabel', "Cut"),
	execCommand: 'cut',
	primary: KeyMod.CtrlCmd | KeyCode.KEY_X,
	win: { primary: KeyMod.CtrlCmd | KeyCode.KEY_X, secondary: [KeyMod.Shift | KeyCode.Delete] },
	kbExpr: KbExpr.and(KbExpr.has(editorCommon.KEYBINDING_CONTEXT_EDITOR_FOCUS), KbExpr.not(editorCommon.KEYBINDING_CONTEXT_EDITOR_READONLY))
}, 'Cut', 1);

registerClipboardAction({
	ctor: ExecCommandCopyAction,
	id: 'editor.action.clipboardCopyAction',
	label: nls.localize('actions.clipboard.copyLabel', "Copy"),
	execCommand: 'copy',
	primary: KeyMod.CtrlCmd | KeyCode.KEY_C,
	win: { primary: KeyMod.CtrlCmd | KeyCode.KEY_C, secondary: [KeyMod.CtrlCmd | KeyCode.Insert] },
	kbExpr: KbExpr.has(editorCommon.KEYBINDING_CONTEXT_EDITOR_FOCUS)
}, 'Copy', 2);

registerClipboardAction({
	ctor: ExecCommandPasteAction,
	id: 'editor.action.clipboardPasteAction',
	label: nls.localize('actions.clipboard.pasteLabel', "Paste"),
	execCommand: 'paste',
	primary: KeyMod.CtrlCmd | KeyCode.KEY_V,
	win: { primary: KeyMod.CtrlCmd | KeyCode.KEY_V, secondary: [KeyMod.Shift | KeyCode.Insert] },
	kbExpr: KbExpr.and(KbExpr.has(editorCommon.KEYBINDING_CONTEXT_EDITOR_FOCUS), KbExpr.not(editorCommon.KEYBINDING_CONTEXT_EDITOR_READONLY))
}, 'Paste', 3);

function execCommandToHandler(actionId: string, browserCommand: string, accessor: ServicesAccessor, args: any): void {
	let focusedEditor = findFocusedEditor(actionId, accessor, false);
	// Only if editor text focus (i.e. not if editor has widget focus).
	if (focusedEditor && focusedEditor.isFocused()) {
		focusedEditor.trigger('keyboard', actionId, args);
		return;
	}

	document.execCommand(browserCommand);
}
