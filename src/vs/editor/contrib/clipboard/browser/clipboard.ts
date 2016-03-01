/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./clipboard';
import * as nls from 'vs/nls';
import {KeyCode, KeyMod} from 'vs/base/common/keyCodes';
import {cAll} from 'vs/base/common/lifecycle';
import {TPromise} from 'vs/base/common/winjs.base';
import * as browser from 'vs/base/browser/browser';
import {ServicesAccessor} from 'vs/platform/instantiation/common/instantiation';
import {IKeybindings} from 'vs/platform/keybinding/common/keybindingService';
import {findFocusedEditor} from 'vs/editor/common/config/config';
import {EditorAction} from 'vs/editor/common/editorAction';
import {Behaviour} from 'vs/editor/common/editorActionEnablement';
import * as editorCommon from 'vs/editor/common/editorCommon';
import {CommonEditorRegistry, ContextKey, EditorActionDescriptor} from 'vs/editor/common/editorCommonExtensions';

class ClipboardWritingAction extends EditorAction {

	private toUnhook:Function[];

	constructor(descriptor:editorCommon.IEditorActionDescriptorData, editor:editorCommon.ICommonCodeEditor, condition:Behaviour) {
		super(descriptor, editor, condition);
		this.toUnhook = [];
		this.toUnhook.push(this.editor.addListener(editorCommon.EventType.CursorSelectionChanged, (e:editorCommon.ICursorSelectionChangedEvent) => {
			this.resetEnablementState();
		}));
	}

	public dispose(): void {
		this.toUnhook = cAll(this.toUnhook);
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
		super(descriptor, editor, Behaviour.Writeable | Behaviour.WidgetFocus | Behaviour.ShowInContextMenu | Behaviour.UpdateOnCursorPositionChange);
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
		super(descriptor, editor, Behaviour.WidgetFocus | Behaviour.ShowInContextMenu);
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
		super(descriptor, editor, Behaviour.Writeable | Behaviour.WidgetFocus | Behaviour.ShowInContextMenu | Behaviour.UpdateOnCursorPositionChange);
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
}
function registerClipboardAction(desc:IClipboardCommand) {
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
		mac: desc.mac
	}));
}

registerClipboardAction({
	ctor: ExecCommandCutAction,
	id: 'editor.action.clipboardCutAction',
	label: nls.localize('actions.clipboard.cutLabel', "Cut"),
	execCommand: 'cut',
	primary: KeyMod.CtrlCmd | KeyCode.KEY_X,
	win: { primary: KeyMod.CtrlCmd | KeyCode.KEY_X, secondary: [KeyMod.Shift | KeyCode.Delete] }
});
registerClipboardAction({
	ctor: ExecCommandCopyAction,
	id: 'editor.action.clipboardCopyAction',
	label: nls.localize('actions.clipboard.copyLabel', "Copy"),
	execCommand: 'copy',
	primary: KeyMod.CtrlCmd | KeyCode.KEY_C,
	win: { primary: KeyMod.CtrlCmd | KeyCode.KEY_C, secondary: [KeyMod.CtrlCmd | KeyCode.Insert] }
});
registerClipboardAction({
	ctor: ExecCommandPasteAction,
	id: 'editor.action.clipboardPasteAction',
	label: nls.localize('actions.clipboard.pasteLabel', "Paste"),
	execCommand: 'paste',
	primary: KeyMod.CtrlCmd | KeyCode.KEY_V,
	win: { primary: KeyMod.CtrlCmd | KeyCode.KEY_V, secondary: [KeyMod.Shift | KeyCode.Insert] }
});

function execCommandToHandler(actionId: string, browserCommand: string, accessor: ServicesAccessor, args: any): void {
	// If editor text focus
	if (args.context[editorCommon.KEYBINDING_CONTEXT_EDITOR_TEXT_FOCUS]) {
		var focusedEditor = findFocusedEditor(actionId, accessor, args, false);
		if (focusedEditor) {
			focusedEditor.trigger('keyboard', actionId, args);
			return;
		}
	}

	document.execCommand(browserCommand);
}
