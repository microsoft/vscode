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
import {findFocusedEditor} from 'vs/editor/common/config/config';
import * as editorCommon from 'vs/editor/common/editorCommon';
import {IActionOptions, EditorAction, CommonEditorRegistry} from 'vs/editor/common/editorCommonExtensions';
import {MenuId} from 'vs/platform/actions/common/actions';

import EditorContextKeys = editorCommon.EditorContextKeys;

const CLIPBOARD_CONTEXT_MENU_GROUP = '9_cutcopypaste';

abstract class ExecCommandAction extends EditorAction {

	private browserCommand:string;

	constructor(browserCommand:string, opts:IActionOptions) {
		super(opts);
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

class ExecCommandCutAction extends ExecCommandAction {

	constructor() {
		super('cut', {
			id: 'editor.action.clipboardCutAction',
			label: nls.localize('actions.clipboard.cutLabel', "Cut"),
			alias: 'Cut',
			precondition: EditorContextKeys.Writable,
			kbOpts: {
				kbExpr: EditorContextKeys.TextFocus,
				primary: KeyMod.CtrlCmd | KeyCode.KEY_X,
				win: { primary: KeyMod.CtrlCmd | KeyCode.KEY_X, secondary: [KeyMod.Shift | KeyCode.Delete] }
			},
			menuOpts: {
				kbExpr: EditorContextKeys.Writable,
				menu: MenuId.EditorContext,
				group: CLIPBOARD_CONTEXT_MENU_GROUP,
				order: 1
			}
		});
	}

	public run(accessor:ServicesAccessor, editor:editorCommon.ICommonCodeEditor): void {
		if (!browser.enableEmptySelectionClipboard && editor.getSelection().isEmpty()) {
			return;
		}

		super.run(accessor, editor);
	}
}

class ExecCommandCopyAction extends ExecCommandAction {

	constructor() {
		super('copy', {
			id: 'editor.action.clipboardCopyAction',
			label: nls.localize('actions.clipboard.copyLabel', "Copy"),
			alias: 'Copy',
			precondition: null,
			kbOpts: {
				kbExpr: EditorContextKeys.TextFocus,
				primary: KeyMod.CtrlCmd | KeyCode.KEY_C,
				win: { primary: KeyMod.CtrlCmd | KeyCode.KEY_C, secondary: [KeyMod.CtrlCmd | KeyCode.Insert] }
			},
			menuOpts: {
				kbExpr: null,
				menu: MenuId.EditorContext,
				group: CLIPBOARD_CONTEXT_MENU_GROUP,
				order: 2
			}
		});
	}

	public run(accessor:ServicesAccessor, editor:editorCommon.ICommonCodeEditor): void {
		if (!browser.enableEmptySelectionClipboard && editor.getSelection().isEmpty()) {
			return;
		}

		super.run(accessor, editor);
	}
}

class ExecCommandPasteAction extends ExecCommandAction {

	constructor() {
		super('paste', {
			id: 'editor.action.clipboardPasteAction',
			label: nls.localize('actions.clipboard.pasteLabel', "Paste"),
			alias: 'Paste',
			precondition: EditorContextKeys.Writable,
			kbOpts: {
				kbExpr: EditorContextKeys.TextFocus,
				primary: KeyMod.CtrlCmd | KeyCode.KEY_V,
				win: { primary: KeyMod.CtrlCmd | KeyCode.KEY_V, secondary: [KeyMod.Shift | KeyCode.Insert] }
			},
			menuOpts: {
				kbExpr: EditorContextKeys.Writable,
				menu: MenuId.EditorContext,
				group: CLIPBOARD_CONTEXT_MENU_GROUP,
				order: 3
			}
		});
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
