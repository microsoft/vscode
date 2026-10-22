/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as browser from '../../../../base/browser/browser.js';
import { getActiveDocument, getActiveWindow, getWindow } from '../../../../base/browser/dom.js';
import { createStringDataTransferItem, IReadonlyVSDataTransfer, VSDataTransfer } from '../../../../base/common/dataTransfer.js';
import { KeyCode, KeyMod } from '../../../../base/common/keyCodes.js';
import * as platform from '../../../../base/common/platform.js';
import * as nls from '../../../../nls.js';
import { MenuId, MenuRegistry } from '../../../../platform/actions/common/actions.js';
import { IClipboardService } from '../../../../platform/clipboard/common/clipboardService.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { KeybindingWeight } from '../../../../platform/keybinding/common/keybindingsRegistry.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { CopyOptions, createClipboardCopyEventFromData, createClipboardPasteEventFromData } from '../../../browser/controller/editContext/clipboardUtils.js';
import { NativeEditContextRegistry } from '../../../browser/controller/editContext/native/nativeEditContextRegistry.js';
import { toDataTransfer, toVSDataTransfer } from '../../../browser/dataTransfer.js';
import { IActiveCodeEditor, ICodeEditor } from '../../../browser/editorBrowser.js';
import { Command, EditorAction, MultiCommand, registerEditorAction } from '../../../browser/editorExtensions.js';
import { ICodeEditorService } from '../../../browser/services/codeEditorService.js';
import { EditorOption } from '../../../common/config/editorOptions.js';
import { Handler } from '../../../common/editorCommon.js';
import { EditorContextKeys } from '../../../common/editorContextKeys.js';
import { CopyPasteController } from '../../dropOrPasteInto/browser/copyPasteController.js';

const CLIPBOARD_CONTEXT_MENU_GROUP = '9_cutcopypaste';

const supportsCut = (platform.isNative || typeof navigator.clipboard !== 'undefined' || (document.queryCommandSupported && document.queryCommandSupported('cut')));
const supportsCopy = (platform.isNative || typeof navigator.clipboard !== 'undefined' || (document.queryCommandSupported && document.queryCommandSupported('copy')));
// Firefox only supports navigator.clipboard.readText() in browser extensions.
// See https://developer.mozilla.org/en-US/docs/Web/API/Clipboard/readText#Browser_compatibility
// When loading over http, navigator.clipboard can be undefined. See https://github.com/microsoft/monaco-editor/issues/2313
const supportsPaste = (typeof navigator.clipboard === 'undefined' || browser.isFirefox);

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

MenuRegistry.appendMenuItem(MenuId.MenubarEditMenu, { submenu: MenuId.MenubarCopy, title: nls.localize2('copy as', "Copy As"), group: '2_ccp', order: 3 });
MenuRegistry.appendMenuItem(MenuId.EditorContext, { submenu: MenuId.EditorContextCopy, title: nls.localize2('copy as', "Copy As"), group: CLIPBOARD_CONTEXT_MENU_GROUP, order: 3 });
MenuRegistry.appendMenuItem(MenuId.EditorContext, { submenu: MenuId.EditorContextShare, title: nls.localize2('share', "Share"), group: '11_share', order: -1, when: ContextKeyExpr.and(ContextKeyExpr.notEquals('resourceScheme', 'output'), EditorContextKeys.editorTextFocus) });
MenuRegistry.appendMenuItem(MenuId.ExplorerContext, { submenu: MenuId.ExplorerContextShare, title: nls.localize2('share', "Share"), group: '11_share', order: -1 });

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

class CopyWithSyntaxHighlightingAction extends EditorAction {

	constructor() {
		super({
			id: 'editor.action.clipboardCopyWithSyntaxHighlightingAction',
			label: nls.localize2('actions.clipboard.copyWithSyntaxHighlightingLabel', "Copy with Syntax Highlighting"),
			precondition: undefined,
			kbOpts: {
				kbExpr: EditorContextKeys.textInputFocus,
				primary: 0,
				weight: KeybindingWeight.EditorContrib
			}
		});
	}

	public async run(accessor: ServicesAccessor, editor: ICodeEditor): Promise<void> {
		const logService = accessor.get(ILogService);
		const clipboardService = accessor.get(IClipboardService);
		logService.trace('CopyWithSyntaxHighlightingAction#run');
		if (!editor.hasModel()) {
			return;
		}

		const emptySelectionClipboard = editor.getOption(EditorOption.emptySelectionClipboard);

		if (!emptySelectionClipboard && editor.getSelection().isEmpty()) {
			return;
		}

		editor.focus();
		await executeClipboardCopy(editor, clipboardService, logService, false, true);
	}
}

async function executeClipboardCopy(editor: IActiveCodeEditor, clipboardService: IClipboardService, logService: ILogService, isCut: boolean, forceCopyWithSyntaxHighlighting = false): Promise<void> {
	if (!clipboardService.supportsClipboardData && platform.isWeb) {
		executeLegacyClipboardCopy(editor, isCut, forceCopyWithSyntaxHighlighting);
		return;
	}

	const data = new DataTransfer();
	const event = createClipboardCopyEventFromData(
		data,
		isCut,
		editor._getViewModel(),
		logService,
		browser.isFirefox,
		undefined,
		forceCopyWithSyntaxHighlighting
	);

	// Let copy/cut listeners prepare data; skip the default write and cut if a listener handles the event.
	editor.handleClipboardCopy(event);
	if (event.isHandled) {
		return;
	}

	try {
		if (clipboardService.supportsClipboardData) {
			await clipboardService.writeData(toVSDataTransfer(data));
		} else {
			await clipboardService.writeText(event.dataToCopy.text);
		}
	} catch (error) {
		if (platform.isWeb) {
			logService.warn('Clipboard API write unavailable; falling back to a clipboard event.', error);
			executeLegacyClipboardCopy(editor, isCut, forceCopyWithSyntaxHighlighting);
			return;
		}
	}
	if (isCut) {
		editor.trigger('keyboard', Handler.Cut, undefined);
	}
}

function executeLegacyClipboardCopy(editor: IActiveCodeEditor, isCut: boolean, forceCopyWithSyntaxHighlighting: boolean): void {
	try {
		CopyOptions.forceCopyWithSyntaxHighlighting = forceCopyWithSyntaxHighlighting;
		const cutWithEditContext = isCut && editor.getOption(EditorOption.effectiveEditContext);
		const command = isCut && !cutWithEditContext ? 'cut' : 'copy';
		if (!editor.getContainerDomNode().ownerDocument.execCommand(command)) {
			throw new Error(nls.localize('clipboard.copyFailed', "Unable to copy to the clipboard."));
		}
		if (cutWithEditContext) {
			editor.trigger('keyboard', Handler.Cut, undefined);
		}
	} finally {
		CopyOptions.forceCopyWithSyntaxHighlighting = false;
	}
}

function registerClipboardCommandImpl(target: MultiCommand | undefined, browserCommand: 'cut' | 'copy'): void {
	if (!target) {
		return;
	}

	// 1. handle case when focus is in editor.
	target.addImplementation(10000, 'code-editor', (accessor: ServicesAccessor, args: unknown) => {
		const logService = accessor.get(ILogService);
		const clipboardService = accessor.get(IClipboardService);
		logService.trace('registerClipboardCommandImpl (addImplementation code-editor for : ', browserCommand, ')');
		// Only if editor text focus (i.e. not if editor has widget focus).
		const focusedEditor = accessor.get(ICodeEditorService).getFocusedCodeEditor();
		if (focusedEditor && focusedEditor.hasTextFocus() && focusedEditor.hasModel()) {
			// Do not execute if there is no selection and empty selection clipboard is off
			const emptySelectionClipboard = focusedEditor.getOption(EditorOption.emptySelectionClipboard);
			const selection = focusedEditor.getSelection();
			if (selection && selection.isEmpty() && !emptySelectionClipboard) {
				return true;
			}
			return executeClipboardCopy(focusedEditor, clipboardService, logService, browserCommand === 'cut');
		}
		return false;
	});

	// 2. (default) handle case when focus is somewhere else.
	target.addImplementation(0, 'generic-dom', (accessor: ServicesAccessor, args: unknown) => {
		const logService = accessor.get(ILogService);
		logService.trace('registerClipboardCommandImpl (addImplementation generic-dom for : ', browserCommand, ')');
		logService.trace('registerClipboardCommandImpl (before execCommand ' + browserCommand + ')');
		getActiveDocument().execCommand(browserCommand);
		logService.trace('registerClipboardCommandImpl (after execCommand ' + browserCommand + ')');
		return true;
	});
}

registerClipboardCommandImpl(CutAction, 'cut');
registerClipboardCommandImpl(CopyAction, 'copy');

if (PasteAction) {
	// 1. Paste: handle case when focus is in editor.
	PasteAction.addImplementation(10000, 'code-editor', (accessor: ServicesAccessor, args: unknown) => {
		const logService = accessor.get(ILogService);
		logService.trace('registerClipboardCommandImpl (addImplementation code-editor for : paste)');
		const codeEditorService = accessor.get(ICodeEditorService);
		const clipboardService = accessor.get(IClipboardService);

		// Only if editor text focus (i.e. not if editor has widget focus).
		const focusedEditor = codeEditorService.getFocusedCodeEditor();
		if (focusedEditor && focusedEditor.hasModel() && focusedEditor.hasTextFocus()) {
			return (async () => {
				const controller = CopyPasteController.get(focusedEditor);
				let data: IReadonlyVSDataTransfer | undefined;
				if (clipboardService.supportsClipboardData) {
					try {
						data = await clipboardService.readData();
					} catch (error) {
						logService.warn('Clipboard API read unavailable; using clipboard fallback.', error);
					}
				}

				if (platform.isNative && !data) {
					// Preserve native-only formats and paste when the Clipboard API is unavailable.
					NativeEditContextRegistry.get(focusedEditor.getId())?.handleWillPaste();
					await clipboardService.triggerPaste(getWindow(focusedEditor.getContainerDomNode()).vscodeWindowId);
					await controller?.finishedPaste();
					return;
				}

				if (!data) {
					const text = await clipboardService.readText();
					const textData = new VSDataTransfer();
					textData.replace('text/plain', createStringDataTransferItem(text));
					data = textData;
				}
				const clipboardData = await toDataTransfer(data);

				NativeEditContextRegistry.get(focusedEditor.getId())?.handleWillPaste();
				focusedEditor.handleClipboardPaste(createClipboardPasteEventFromData(clipboardData));
				await controller?.finishedPaste();
			})();
		}
		return false;
	});

	// 2. Paste: (default) handle case when focus is somewhere else.
	PasteAction.addImplementation(0, 'generic-dom', (accessor: ServicesAccessor, args: unknown) => {
		const logService = accessor.get(ILogService);
		logService.trace('Clipboard command DOM fallback: paste');
		const triggerPaste = accessor.get(IClipboardService).triggerPaste(getActiveWindow().vscodeWindowId);
		return triggerPaste ?? false;
	});
}

if (supportsCopy) {
	registerEditorAction(CopyWithSyntaxHighlightingAction);
}
