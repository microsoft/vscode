/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./clipboard';
import * as nls from 'vs/nls';
import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import * as browser from 'vs/base/browser/browser';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { findFocusedEditor } from 'vs/editor/common/config/config';
import * as editorCommon from 'vs/editor/common/editorCommon';
import { editorAction, IActionOptions, EditorAction } from 'vs/editor/common/editorCommonExtensions';
import { CopyOptions } from 'vs/editor/common/controller/textAreaHandler';

import EditorContextKeys = editorCommon.EditorContextKeys;

const CLIPBOARD_CONTEXT_MENU_GROUP = '9_cutcopypaste';

function conditionalEditorAction(testCommand: string) {
	if (!browser.supportsExecCommand(testCommand)) {
		return () => { };
	}
	return editorAction;
}

function conditionalCopyWithSyntaxHighlighting() {
	if (browser.isEdgeOrIE || !browser.supportsExecCommand('copy')) {
		return () => { };
	}

	return editorAction;
}

abstract class ExecCommandAction extends EditorAction {

	private browserCommand: string;

	constructor(browserCommand: string, opts: IActionOptions) {
		super(opts);
		this.browserCommand = browserCommand;
	}

	public runCommand(accessor: ServicesAccessor, args: any): void {
		let focusedEditor = findFocusedEditor(this.id, accessor, false);
		// Only if editor text focus (i.e. not if editor has widget focus).
		if (focusedEditor && focusedEditor.isFocused()) {
			focusedEditor.trigger('keyboard', this.id, args);
			return;
		}

		document.execCommand(this.browserCommand);
	}

	public run(accessor: ServicesAccessor, editor: editorCommon.ICommonCodeEditor): void {
		editor.focus();
		document.execCommand(this.browserCommand);
	}
}

@conditionalEditorAction('cut')
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
				group: CLIPBOARD_CONTEXT_MENU_GROUP,
				order: 1
			}
		});
	}

	public run(accessor: ServicesAccessor, editor: editorCommon.ICommonCodeEditor): void {
		var enableEmptySelectionClipboard = editor.getConfiguration().contribInfo.emptySelectionClipboard && browser.enableEmptySelectionClipboard;

		if (!enableEmptySelectionClipboard && editor.getSelection().isEmpty()) {
			return;
		}

		super.run(accessor, editor);
	}
}

@conditionalEditorAction('copy')
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
				group: CLIPBOARD_CONTEXT_MENU_GROUP,
				order: 2
			}
		});
	}

	public run(accessor: ServicesAccessor, editor: editorCommon.ICommonCodeEditor): void {
		var enableEmptySelectionClipboard = editor.getConfiguration().contribInfo.emptySelectionClipboard && browser.enableEmptySelectionClipboard;

		if (!enableEmptySelectionClipboard && editor.getSelection().isEmpty()) {
			return;
		}

		super.run(accessor, editor);
	}
}

@conditionalEditorAction('paste')
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
				group: CLIPBOARD_CONTEXT_MENU_GROUP,
				order: 3
			}
		});
	}
}

@conditionalCopyWithSyntaxHighlighting()
class ExecCommandCopyWithSyntaxHighlightingAction extends ExecCommandAction {

	constructor() {
		super('copy', {
			id: 'editor.action.clipboardCopyWithSyntaxHighlightingAction',
			label: nls.localize('actions.clipboard.copyWithSyntaxHighlightingLabel', "Copy With Syntax Highlighting"),
			alias: 'Copy With Syntax Highlighting',
			precondition: null,
			kbOpts: {
				kbExpr: EditorContextKeys.TextFocus,
				primary: null
			}
		});
	}

	public run(accessor: ServicesAccessor, editor: editorCommon.ICommonCodeEditor): void {
		var enableEmptySelectionClipboard = editor.getConfiguration().contribInfo.emptySelectionClipboard && browser.enableEmptySelectionClipboard;

		if (!enableEmptySelectionClipboard && editor.getSelection().isEmpty()) {
			return;
		}

		CopyOptions.forceCopyWithSyntaxHighlighting = true;
		super.run(accessor, editor);
		CopyOptions.forceCopyWithSyntaxHighlighting = false;
	}
}
