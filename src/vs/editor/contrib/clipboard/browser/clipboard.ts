/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./clipboard';
import * as nls from 'vs/nls';
import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import * as browser from 'vs/base/browser/browser';
import * as platform from 'vs/base/common/platform';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { ICodeEditorService } from 'vs/editor/common/services/codeEditorService';
import * as editorCommon from 'vs/editor/common/editorCommon';
import { editorAction, IActionOptions, EditorAction, ICommandKeybindingsOptions } from 'vs/editor/common/editorCommonExtensions';
import { CopyOptions } from 'vs/editor/browser/controller/textAreaInput';
import { EditorContextKeys } from 'vs/editor/common/editorContextKeys';

const CLIPBOARD_CONTEXT_MENU_GROUP = '9_cutcopypaste';

const supportsCut = (platform.isNative || document.queryCommandSupported('cut'));
const supportsCopy = (platform.isNative || document.queryCommandSupported('copy'));
// IE and Edge have trouble with setting html content in clipboard
const supportsCopyWithSyntaxHighlighting = (supportsCopy && !browser.isEdgeOrIE);
// Chrome incorrectly returns true for document.queryCommandSupported('paste')
// when the paste feature is available but the calling script has insufficient
// privileges to actually perform the action
const supportsPaste = (platform.isNative || (!browser.isChrome && document.queryCommandSupported('paste')));

type ExecCommand = 'cut' | 'copy' | 'paste';

function conditionalEditorAction(condition: boolean) {
	if (!condition) {
		return () => { };
	}
	return editorAction;
}

abstract class ExecCommandAction extends EditorAction {

	private browserCommand: ExecCommand;

	constructor(browserCommand: ExecCommand, opts: IActionOptions) {
		super(opts);
		this.browserCommand = browserCommand;
	}

	public runCommand(accessor: ServicesAccessor, args: any): void {
		let focusedEditor = accessor.get(ICodeEditorService).getFocusedCodeEditor();
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

@conditionalEditorAction(supportsCut)
class ExecCommandCutAction extends ExecCommandAction {

	constructor() {
		let kbOpts: ICommandKeybindingsOptions = {
			kbExpr: EditorContextKeys.textFocus,
			primary: KeyMod.CtrlCmd | KeyCode.KEY_X,
			win: { primary: KeyMod.CtrlCmd | KeyCode.KEY_X, secondary: [KeyMod.Shift | KeyCode.Delete] }
		};
		// Do not bind cut keybindings in the browser,
		// since browsers do that for us and it avoids security prompts
		if (!platform.isNative) {
			kbOpts = null;
		}
		super('cut', {
			id: 'editor.action.clipboardCutAction',
			label: nls.localize('actions.clipboard.cutLabel', "Cut"),
			alias: 'Cut',
			precondition: EditorContextKeys.writable,
			kbOpts: kbOpts,
			menuOpts: {
				group: CLIPBOARD_CONTEXT_MENU_GROUP,
				order: 1
			}
		});
	}

	public run(accessor: ServicesAccessor, editor: editorCommon.ICommonCodeEditor): void {
		const emptySelectionClipboard = editor.getConfiguration().emptySelectionClipboard;

		if (!emptySelectionClipboard && editor.getSelection().isEmpty()) {
			return;
		}

		super.run(accessor, editor);
	}
}

@conditionalEditorAction(supportsCopy)
class ExecCommandCopyAction extends ExecCommandAction {

	constructor() {
		let kbOpts: ICommandKeybindingsOptions = {
			kbExpr: EditorContextKeys.textFocus,
			primary: KeyMod.CtrlCmd | KeyCode.KEY_C,
			win: { primary: KeyMod.CtrlCmd | KeyCode.KEY_C, secondary: [KeyMod.CtrlCmd | KeyCode.Insert] }
		};
		// Do not bind copy keybindings in the browser,
		// since browsers do that for us and it avoids security prompts
		if (!platform.isNative) {
			kbOpts = null;
		}

		super('copy', {
			id: 'editor.action.clipboardCopyAction',
			label: nls.localize('actions.clipboard.copyLabel', "Copy"),
			alias: 'Copy',
			precondition: null,
			kbOpts: kbOpts,
			menuOpts: {
				group: CLIPBOARD_CONTEXT_MENU_GROUP,
				order: 2
			}
		});
	}

	public run(accessor: ServicesAccessor, editor: editorCommon.ICommonCodeEditor): void {
		const emptySelectionClipboard = editor.getConfiguration().emptySelectionClipboard;

		if (!emptySelectionClipboard && editor.getSelection().isEmpty()) {
			return;
		}

		super.run(accessor, editor);
	}
}

@conditionalEditorAction(supportsPaste)
class ExecCommandPasteAction extends ExecCommandAction {

	constructor() {
		let kbOpts: ICommandKeybindingsOptions = {
			kbExpr: EditorContextKeys.textFocus,
			primary: KeyMod.CtrlCmd | KeyCode.KEY_V,
			win: { primary: KeyMod.CtrlCmd | KeyCode.KEY_V, secondary: [KeyMod.Shift | KeyCode.Insert] }
		};
		// Do not bind paste keybindings in the browser,
		// since browsers do that for us and it avoids security prompts
		if (!platform.isNative) {
			kbOpts = null;
		}

		super('paste', {
			id: 'editor.action.clipboardPasteAction',
			label: nls.localize('actions.clipboard.pasteLabel', "Paste"),
			alias: 'Paste',
			precondition: EditorContextKeys.writable,
			kbOpts: kbOpts,
			menuOpts: {
				group: CLIPBOARD_CONTEXT_MENU_GROUP,
				order: 3
			}
		});
	}
}

@conditionalEditorAction(supportsCopyWithSyntaxHighlighting)
class ExecCommandCopyWithSyntaxHighlightingAction extends ExecCommandAction {

	constructor() {
		super('copy', {
			id: 'editor.action.clipboardCopyWithSyntaxHighlightingAction',
			label: nls.localize('actions.clipboard.copyWithSyntaxHighlightingLabel', "Copy With Syntax Highlighting"),
			alias: 'Copy With Syntax Highlighting',
			precondition: null,
			kbOpts: {
				kbExpr: EditorContextKeys.textFocus,
				primary: null
			}
		});
	}

	public run(accessor: ServicesAccessor, editor: editorCommon.ICommonCodeEditor): void {
		const emptySelectionClipboard = editor.getConfiguration().emptySelectionClipboard;

		if (!emptySelectionClipboard && editor.getSelection().isEmpty()) {
			return;
		}

		CopyOptions.forceCopyWithSyntaxHighlighting = true;
		super.run(accessor, editor);
		CopyOptions.forceCopyWithSyntaxHighlighting = false;
	}
}
