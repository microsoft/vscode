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

import EditorContextKeys = editorCommon.EditorContextKeys;

const CLIPBOARD_CONTEXT_MENU_GROUP = '9_cutcopypaste';

abstract class ExecCommandAction extends EditorAction {

	private browserCommand:string;

	constructor(id:string, label:string, alias:string, needsWritableEditor:boolean, browserCommand:string) {
		super(id, label, alias, needsWritableEditor);
		this.browserCommand = browserCommand;
	}

	public runCommand(accessor:ServicesAccessor, args: any): void {
		let focusedEditor = findFocusedEditor(this.id, accessor, false);
		// Only if editor text focus (i.e. not if editor has widget focus).
		if (focusedEditor && focusedEditor.isFocused()) {
			focusedEditor.trigger('keyboard', this.id, args);
			return;
		}

		document.execCommand(this.browserCommand);
	}

	public run(accessor:ServicesAccessor, editor:editorCommon.ICommonCodeEditor): void {
		editor.focus();
		document.execCommand(this.browserCommand);
	}
}

abstract class ClipboardWritingAction extends ExecCommandAction {

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

class ExecCommandCutAction extends ClipboardWritingAction {

	constructor() {
		super(
			'editor.action.clipboardCutAction',
			nls.localize('actions.clipboard.cutLabel', "Cut"),
			'Cut',
			true,
			'cut'
		);

		this._precondition = KbExpr.and(EditorContextKeys.Writable);

		this.kbOpts = {
			kbExpr: KbExpr.and(EditorContextKeys.TextFocus, EditorContextKeys.Writable),
			primary: KeyMod.CtrlCmd | KeyCode.KEY_X,
			win: { primary: KeyMod.CtrlCmd | KeyCode.KEY_X, secondary: [KeyMod.Shift | KeyCode.Delete] }
		};

		this.menuOpts = {
			kbExpr: EditorContextKeys.Writable,
			menu: MenuId.EditorContext,
			group: CLIPBOARD_CONTEXT_MENU_GROUP,
			order: 1
		};
	}
}

class ExecCommandCopyAction extends ClipboardWritingAction {

	constructor() {
		super(
			'editor.action.clipboardCopyAction',
			nls.localize('actions.clipboard.copyLabel', "Copy"),
			'Copy',
			false,
			'copy'
		);

		this._precondition = null;

		this.kbOpts = {
			kbExpr: EditorContextKeys.TextFocus,
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
}

class ExecCommandPasteAction extends ExecCommandAction {

	constructor() {
		super(
			'editor.action.clipboardPasteAction',
			nls.localize('actions.clipboard.pasteLabel', "Paste"),
			'Paste',
			true,
			'paste'
		);

		this._precondition = EditorContextKeys.Writable;

		this.kbOpts = {
			kbExpr: KbExpr.and(EditorContextKeys.TextFocus, EditorContextKeys.Writable),
			primary: KeyMod.CtrlCmd | KeyCode.KEY_V,
			win: { primary: KeyMod.CtrlCmd | KeyCode.KEY_V, secondary: [KeyMod.Shift | KeyCode.Insert] }
		};

		this.menuOpts = {
			kbExpr: EditorContextKeys.Writable,
			menu: MenuId.EditorContext,
			group: CLIPBOARD_CONTEXT_MENU_GROUP,
			order: 3
		};
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
