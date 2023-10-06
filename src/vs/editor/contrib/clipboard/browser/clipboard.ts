/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as browser from 'vs/base/browser/browser';
import { getActiveDocument } from 'vs/base/browser/dom';
import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import * as platform from 'vs/base/common/platform';
import { CopyOptions, InMemoryClipboardMetadataManager } from 'vs/editor/browser/controller/textAreaInput';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { Command, EditorAction, MultiCommand, registerEditorAction } from 'vs/editor/browser/editorExtensions';
import { ICodeEditorService } from 'vs/editor/browser/services/codeEditorService';
import { EditorOption } from 'vs/editor/common/config/editorOptions';
import { Handler } from 'vs/editor/common/editorCommon';
import { EditorContextKeys } from 'vs/editor/common/editorContextKeys';
import * as nls from 'vs/nls';
import { MenuId, MenuRegistry } from 'vs/platform/actions/common/actions';
import { IClipboardService } from 'vs/platform/clipboard/common/clipboardService';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';

const CLIPBOARD_CONTEXT_MENU_GROUP = '9_cutcopypaste';

const supportsCut = (platform.isNative || document.queryCommandSupported('cut'));
const supportsCopy = (platform.isNative || document.queryCommandSupported('copy'));
// Firefox only supports navigator.clipboard.readText() in browser extensions.
// See https://developer.mozilla.org/en-US/docs/Web/API/Clipboard/readText#Browser_compatibility
// When loading over http, navigator.clipboard can be undefined. See https://github.com/microsoft/monaco-editor/issues/2313
const supportsPaste = (typeof navigator.clipboard === 'undefined' || browser.isFirefox) ? document.queryCommandSupported('paste') : true;

function registerCommand<T extends Command>(command: T): T {
	command.register();
	return command;
}

export const CutAction = supportsCut ? registerCommand(new MultiCommand({
	id: 'editor.action.clipboardCutAction',
	precondition: undefined,
	kbOpts: (
		// Do not bind cut keybindings in the browser,
		// since browsers do that for us and it avoids security prompts
		platform.isNative ? {
			primary: KeyMod.CtrlCmd | KeyCode.KeyX,
			win: { primary: KeyMod.CtrlCmd | KeyCode.KeyX, secondary: [KeyMod.Shift | KeyCode.Delete] },
			weight: KeybindingWeight.EditorContrib
		} : undefined
	),
	menuOpts: [{
		menuId: MenuId.MenubarEditMenu,
		group: '2_ccp',
		title: nls.localize({ key: 'miCut', comment: ['&& denotes a mnemonic'] }, "Cu&&t"),
		order: 1
	}, {
		menuId: MenuId.EditorContext,
		group: CLIPBOARD_CONTEXT_MENU_GROUP,
		title: nls.localize('actions.clipboard.cutLabel', "Cut"),
		when: EditorContextKeys.writable,
		order: 1,
	}, {
		menuId: MenuId.CommandPalette,
		group: '',
		title: nls.localize('actions.clipboard.cutLabel', "Cut"),
		order: 1
	}, {
		menuId: MenuId.SimpleEditorContext,
		group: CLIPBOARD_CONTEXT_MENU_GROUP,
		title: nls.localize('actions.clipboard.cutLabel', "Cut"),
		when: EditorContextKeys.writable,
		order: 1,
	}]
})) : undefined;

export const CopyAction = supportsCopy ? registerCommand(new MultiCommand({
	id: 'editor.action.clipboardCopyAction',
	precondition: undefined,
	kbOpts: (
		// Do not bind copy keybindings in the browser,
		// since browsers do that for us and it avoids security prompts
		platform.isNative ? {
			primary: KeyMod.CtrlCmd | KeyCode.KeyC,
			win: { primary: KeyMod.CtrlCmd | KeyCode.KeyC, secondary: [KeyMod.CtrlCmd | KeyCode.Insert] },
			weight: KeybindingWeight.EditorContrib
		} : undefined
	),
	menuOpts: [{
		menuId: MenuId.MenubarEditMenu,
		group: '2_ccp',
		title: nls.localize({ key: 'miCopy', comment: ['&& denotes a mnemonic'] }, "&&Copy"),
		order: 2
	}, {
		menuId: MenuId.EditorContext,
		group: CLIPBOARD_CONTEXT_MENU_GROUP,
		title: nls.localize('actions.clipboard.copyLabel', "Copy"),
		order: 2,
	}, {
		menuId: MenuId.CommandPalette,
		group: '',
		title: nls.localize('actions.clipboard.copyLabel', "Copy"),
		order: 1
	}, {
		menuId: MenuId.SimpleEditorContext,
		group: CLIPBOARD_CONTEXT_MENU_GROUP,
		title: nls.localize('actions.clipboard.copyLabel', "Copy"),
		order: 2,
	}]
})) : undefined;

MenuRegistry.appendMenuItem(MenuId.MenubarEditMenu, { submenu: MenuId.MenubarCopy, title: { value: nls.localize('copy as', "Copy As"), original: 'Copy As', }, group: '2_ccp', order: 3 });
MenuRegistry.appendMenuItem(MenuId.EditorContext, { submenu: MenuId.EditorContextCopy, title: { value: nls.localize('copy as', "Copy As"), original: 'Copy As', }, group: CLIPBOARD_CONTEXT_MENU_GROUP, order: 3 });
MenuRegistry.appendMenuItem(MenuId.EditorContext, { submenu: MenuId.EditorContextShare, title: { value: nls.localize('share', "Share"), original: 'Share', }, group: '11_share', order: -1, when: ContextKeyExpr.and(ContextKeyExpr.notEquals('resourceScheme', 'output'), EditorContextKeys.editorTextFocus) });
MenuRegistry.appendMenuItem(MenuId.EditorTitleContext, { submenu: MenuId.EditorTitleContextShare, title: { value: nls.localize('share', "Share"), original: 'Share', }, group: '11_share', order: -1 });
MenuRegistry.appendMenuItem(MenuId.ExplorerContext, { submenu: MenuId.ExplorerContextShare, title: { value: nls.localize('share', "Share"), original: 'Share', }, group: '11_share', order: -1 });

export const PasteAction = supportsPaste ? registerCommand(new MultiCommand({
	id: 'editor.action.clipboardPasteAction',
	precondition: undefined,
	kbOpts: (
		// Do not bind paste keybindings in the browser,
		// since browsers do that for us and it avoids security prompts
		platform.isNative ? {
			primary: KeyMod.CtrlCmd | KeyCode.KeyV,
			win: { primary: KeyMod.CtrlCmd | KeyCode.KeyV, secondary: [KeyMod.Shift | KeyCode.Insert] },
			linux: { primary: KeyMod.CtrlCmd | KeyCode.KeyV, secondary: [KeyMod.Shift | KeyCode.Insert] },
			weight: KeybindingWeight.EditorContrib
		} : undefined
	),
	menuOpts: [{
		menuId: MenuId.MenubarEditMenu,
		group: '2_ccp',
		title: nls.localize({ key: 'miPaste', comment: ['&& denotes a mnemonic'] }, "&&Paste"),
		order: 4
	}, {
		menuId: MenuId.EditorContext,
		group: CLIPBOARD_CONTEXT_MENU_GROUP,
		title: nls.localize('actions.clipboard.pasteLabel', "Paste"),
		when: EditorContextKeys.writable,
		order: 4,
	}, {
		menuId: MenuId.CommandPalette,
		group: '',
		title: nls.localize('actions.clipboard.pasteLabel', "Paste"),
		order: 1
	}, {
		menuId: MenuId.SimpleEditorContext,
		group: CLIPBOARD_CONTEXT_MENU_GROUP,
		title: nls.localize('actions.clipboard.pasteLabel', "Paste"),
		when: EditorContextKeys.writable,
		order: 4,
	}]
})) : undefined;

class ExecCommandCopyWithSyntaxHighlightingAction extends EditorAction {

	constructor() {
		super({
			id: 'editor.action.clipboardCopyWithSyntaxHighlightingAction',
			label: nls.localize('actions.clipboard.copyWithSyntaxHighlightingLabel', "Copy With Syntax Highlighting"),
			alias: 'Copy With Syntax Highlighting',
			precondition: undefined,
			kbOpts: {
				kbExpr: EditorContextKeys.textInputFocus,
				primary: 0,
				weight: KeybindingWeight.EditorContrib
			}
		});
	}

	public run(accessor: ServicesAccessor, editor: ICodeEditor): void {
		if (!editor.hasModel()) {
			return;
		}

		const emptySelectionClipboard = editor.getOption(EditorOption.emptySelectionClipboard);

		if (!emptySelectionClipboard && editor.getSelection().isEmpty()) {
			return;
		}

		CopyOptions.forceCopyWithSyntaxHighlighting = true;
		editor.focus();
		editor.getContainerDomNode().ownerDocument.execCommand('copy');
		CopyOptions.forceCopyWithSyntaxHighlighting = false;
	}
}

function registerExecCommandImpl(target: MultiCommand | undefined, browserCommand: 'cut' | 'copy'): void {
	if (!target) {
		return;
	}

	// 1. handle case when focus is in editor.
	target.addImplementation(10000, 'code-editor', (accessor: ServicesAccessor, args: any) => {
		// Only if editor text focus (i.e. not if editor has widget focus).
		const focusedEditor = accessor.get(ICodeEditorService).getFocusedCodeEditor();
		if (focusedEditor && focusedEditor.hasTextFocus()) {
			// Do not execute if there is no selection and empty selection clipboard is off
			const emptySelectionClipboard = focusedEditor.getOption(EditorOption.emptySelectionClipboard);
			const selection = focusedEditor.getSelection();
			if (selection && selection.isEmpty() && !emptySelectionClipboard) {
				return true;
			}
			focusedEditor.getContainerDomNode().ownerDocument.execCommand(browserCommand);
			return true;
		}
		return false;
	});

	// 2. (default) handle case when focus is somewhere else.
	target.addImplementation(0, 'generic-dom', (accessor: ServicesAccessor, args: any) => {
		getActiveDocument().execCommand(browserCommand);
		return true;
	});
}

registerExecCommandImpl(CutAction, 'cut');
registerExecCommandImpl(CopyAction, 'copy');

if (PasteAction) {
	// 1. Paste: handle case when focus is in editor.
	PasteAction.addImplementation(10000, 'code-editor', (accessor: ServicesAccessor, args: any) => {
		const codeEditorService = accessor.get(ICodeEditorService);
		const clipboardService = accessor.get(IClipboardService);

		// Only if editor text focus (i.e. not if editor has widget focus).
		const focusedEditor = codeEditorService.getFocusedCodeEditor();
		if (focusedEditor && focusedEditor.hasTextFocus()) {
			const result = focusedEditor.getContainerDomNode().ownerDocument.execCommand('paste');
			// Use the clipboard service if document.execCommand('paste') was not successful
			if (!result && platform.isWeb) {
				return (async () => {
					const clipboardText = await clipboardService.readText();
					if (clipboardText !== '') {
						const metadata = InMemoryClipboardMetadataManager.INSTANCE.get(clipboardText);
						let pasteOnNewLine = false;
						let multicursorText: string[] | null = null;
						let mode: string | null = null;
						if (metadata) {
							pasteOnNewLine = (focusedEditor.getOption(EditorOption.emptySelectionClipboard) && !!metadata.isFromEmptySelection);
							multicursorText = (typeof metadata.multicursorText !== 'undefined' ? metadata.multicursorText : null);
							mode = metadata.mode;
						}
						focusedEditor.trigger('keyboard', Handler.Paste, {
							text: clipboardText,
							pasteOnNewLine,
							multicursorText,
							mode
						});
					}
				})();
			}
			return true;
		}
		return false;
	});

	// 2. Paste: (default) handle case when focus is somewhere else.
	PasteAction.addImplementation(0, 'generic-dom', (accessor: ServicesAccessor, args: any) => {
		getActiveDocument().execCommand('paste');
		return true;
	});
}

if (supportsCopy) {
	registerEditorAction(ExecCommandCopyWithSyntaxHighlightingAction);
}
