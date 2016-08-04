/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./clipboard';
import * as nls from 'vs/nls';
import {KeyCode, KeyMod} from 'vs/base/common/keyCodes';
import * as browser from 'vs/base/browser/browser';
import {ServicesAccessor} from 'vs/platform/instantiation/common/instantiation';
import {KbExpr} from 'vs/platform/keybinding/common/keybinding';
import {findFocusedEditor} from 'vs/editor/common/config/config';
import * as editorCommon from 'vs/editor/common/editorCommon';
import {EditorAction, CommonEditorRegistry} from 'vs/editor/common/editorCommonExtensions';
import {MenuId} from 'vs/platform/actions/common/actions';

const CLIPBOARD_CONTEXT_MENU_GROUP = '9_cutcopypaste';

abstract class ClipboardWritingAction extends EditorAction {

	constructor(id:string, label:string, alias:string, needsWritableEditor:boolean) {
		super(id, label, alias, needsWritableEditor);
	}

	public enabled(accessor:ServicesAccessor, editor:editorCommon.ICommonCodeEditor): boolean {
		if (!super.enabled(accessor, editor)) {
			return false;
		}

		if (browser.enableEmptySelectionClipboard) {
			return true;
		} else {
			return !editor.getSelection().isEmpty();
		}
	}
}

function editorCursorIsInEditableRange(editor:editorCommon.ICommonCodeEditor): boolean {
	let model = editor.getModel();
	if (!model) {
		return false;
	}
	let hasEditableRange = model.hasEditableRange();
	if (!hasEditableRange) {
		return true;
	}
	let editableRange = model.getEditableRange();
	let editorPosition = editor.getPosition();
	return editableRange.containsPosition(editorPosition);
}

class ExecCommandCutAction extends ClipboardWritingAction {

	constructor() {
		super(
			'editor.action.clipboardCutAction',
			nls.localize('actions.clipboard.cutLabel', "Cut"),
			'Cut',
			true
		);

		this.kbOpts = {
			commandHandler: execCommandToHandler.bind(null, this.id, 'cut'),
			kbExpr: KbExpr.and(editorCommon.EditorKbExpr.TextFocus, editorCommon.EditorKbExpr.Writable),
			primary: KeyMod.CtrlCmd | KeyCode.KEY_X,
			win: { primary: KeyMod.CtrlCmd | KeyCode.KEY_X, secondary: [KeyMod.Shift | KeyCode.Delete] }
		};

		this.menuOpts = {
			kbExpr: editorCommon.EditorKbExpr.Writable,
			menu: MenuId.EditorContext,
			group: CLIPBOARD_CONTEXT_MENU_GROUP,
			order: 1
		};
	}

	public enabled(accessor:ServicesAccessor, editor:editorCommon.ICommonCodeEditor): boolean {
		if (!super.enabled(accessor, editor)) {
			return false;
		}
		return editorCursorIsInEditableRange(editor);
	}

	public run(accessor:ServicesAccessor, editor:editorCommon.ICommonCodeEditor): void {
		editor.focus();
		document.execCommand('cut');
	}
}

class ExecCommandCopyAction extends ClipboardWritingAction {

	constructor() {
		super(
			'editor.action.clipboardCopyAction',
			nls.localize('actions.clipboard.copyLabel', "Copy"),
			'Copy',
			false
		);

		this.kbOpts = {
			commandHandler: execCommandToHandler.bind(null, this.id, 'copy'),
			kbExpr: editorCommon.EditorKbExpr.TextFocus,
			primary: KeyMod.CtrlCmd | KeyCode.KEY_C,
			win: { primary: KeyMod.CtrlCmd | KeyCode.KEY_C, secondary: [KeyMod.CtrlCmd | KeyCode.Insert] }
		};

		this.menuOpts = {
			kbExpr: null,
			menu: MenuId.EditorContext,
			group: CLIPBOARD_CONTEXT_MENU_GROUP,
			order: 2
		};
	}

	public run(accessor:ServicesAccessor, editor:editorCommon.ICommonCodeEditor): void {
		editor.focus();
		document.execCommand('copy');
	}
}

class ExecCommandPasteAction extends EditorAction {

	constructor() {
		super(
			'editor.action.clipboardPasteAction',
			nls.localize('actions.clipboard.pasteLabel', "Paste"),
			'Paste',
			true
		);

		this.kbOpts = {
			commandHandler: execCommandToHandler.bind(null, this.id, 'paste'),
			kbExpr: KbExpr.and(editorCommon.EditorKbExpr.TextFocus, editorCommon.EditorKbExpr.Writable),
			primary: KeyMod.CtrlCmd | KeyCode.KEY_V,
			win: { primary: KeyMod.CtrlCmd | KeyCode.KEY_V, secondary: [KeyMod.Shift | KeyCode.Insert] }
		};

		this.menuOpts = {
			kbExpr: editorCommon.EditorKbExpr.Writable,
			menu: MenuId.EditorContext,
			group: CLIPBOARD_CONTEXT_MENU_GROUP,
			order: 3
		};
	}

	public enabled(accessor:ServicesAccessor, editor:editorCommon.ICommonCodeEditor): boolean {
		if (!super.enabled(accessor, editor)) {
			return false;
		}
		return editorCursorIsInEditableRange(editor);
	}

	public run(accessor:ServicesAccessor, editor:editorCommon.ICommonCodeEditor): void {
		editor.focus();
		document.execCommand('paste');
	}
}

if (browser.supportsExecCommand('cut')) {
	CommonEditorRegistry.registerEditorAction(new ExecCommandCutAction());
}
if (browser.supportsExecCommand('copy')) {
	CommonEditorRegistry.registerEditorAction(new ExecCommandCopyAction());
}
if (browser.supportsExecCommand('paste')) {
	CommonEditorRegistry.registerEditorAction(new ExecCommandPasteAction());
}

function execCommandToHandler(actionId: string, browserCommand: string, accessor: ServicesAccessor, args: any): void {
	let focusedEditor = findFocusedEditor(actionId, accessor, false);
	// Only if editor text focus (i.e. not if editor has widget focus).
	if (focusedEditor && focusedEditor.isFocused()) {
		focusedEditor.trigger('keyboard', actionId, args);
		return;
	}

	document.execCommand(browserCommand);
}
