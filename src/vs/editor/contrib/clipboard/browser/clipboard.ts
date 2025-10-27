/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as browser from '../../../../base/browser/browser.js';
import { getActiveDocument, getActiveWindow } from '../../../../base/browser/dom.js';
import { KeyCode, KeyMod } from '../../../../base/common/keyCodes.js';
import * as platform from '../../../../base/common/platform.js';
import { StopWatch } from '../../../../base/common/stopwatch.js';
import * as nls from '../../../../nls.js';
import { MenuId, MenuRegistry } from '../../../../platform/actions/common/actions.js';
import { IClipboardService } from '../../../../platform/clipboard/common/clipboardService.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { KeybindingWeight } from '../../../../platform/keybinding/common/keybindingsRegistry.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { CopyOptions, InMemoryClipboardMetadataManager } from '../../../browser/controller/editContext/clipboardUtils.js';
import { NativeEditContextRegistry } from '../../../browser/controller/editContext/native/nativeEditContextRegistry.js';
import { ICodeEditor } from '../../../browser/editorBrowser.js';
import { Command, EditorAction, MultiCommand, registerEditorAction } from '../../../browser/editorExtensions.js';
import { ICodeEditorService } from '../../../browser/services/codeEditorService.js';
import { EditorOption } from '../../../common/config/editorOptions.js';
import { Handler } from '../../../common/editorCommon.js';
import { EditorContextKeys } from '../../../common/editorContextKeys.js';
import { CopyPasteController } from '../../dropOrPasteInto/browser/copyPasteController.js';

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

class ExecCommandCopyWithSyntaxHighlightingAction extends EditorAction {

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

	public run(accessor: ServicesAccessor, editor: ICodeEditor): void {
		const logService = accessor.get(ILogService);
		logService.trace('ExecCommandCopyWithSyntaxHighlightingAction#run');
		if (!editor.hasModel()) {
			return;
		}

		const emptySelectionClipboard = editor.getOption(EditorOption.emptySelectionClipboard);

		if (!emptySelectionClipboard && editor.getSelection().isEmpty()) {
			return;
		}

		CopyOptions.forceCopyWithSyntaxHighlighting = true;
		editor.focus();
		logService.trace('ExecCommandCopyWithSyntaxHighlightingAction (before execCommand copy)');
		editor.getContainerDomNode().ownerDocument.execCommand('copy');
		logService.trace('ExecCommandCopyWithSyntaxHighlightingAction (after execCommand copy)');
		CopyOptions.forceCopyWithSyntaxHighlighting = false;
	}
}

function registerExecCommandImpl(target: MultiCommand | undefined, browserCommand: 'cut' | 'copy'): void {
	if (!target) {
		return;
	}

	// 1. handle case when focus is in editor.
	target.addImplementation(10000, 'code-editor', (accessor: ServicesAccessor, args: unknown) => {
		const logService = accessor.get(ILogService);
		logService.trace('registerExecCommandImpl (addImplementation code-editor for : ', browserCommand, ')');
		// Only if editor text focus (i.e. not if editor has widget focus).
		const focusedEditor = accessor.get(ICodeEditorService).getFocusedCodeEditor();
		if (focusedEditor && focusedEditor.hasTextFocus()) {
			// Do not execute if there is no selection and empty selection clipboard is off
			const emptySelectionClipboard = focusedEditor.getOption(EditorOption.emptySelectionClipboard);
			const selection = focusedEditor.getSelection();
			if (selection && selection.isEmpty() && !emptySelectionClipboard) {
				return true;
			}
			// TODO this is very ugly. The entire copy/paste/cut system needs a complete refactoring.
			if (focusedEditor.getOption(EditorOption.effectiveEditContext) && browserCommand === 'cut') {
				logCopyCommand(focusedEditor);
				// execCommand(copy) works for edit context, but not execCommand(cut).
				logService.trace('registerExecCommandImpl (before execCommand copy)');
				focusedEditor.getContainerDomNode().ownerDocument.execCommand('copy');
				focusedEditor.trigger(undefined, Handler.Cut, undefined);
				logService.trace('registerExecCommandImpl (after execCommand copy)');
			} else {
				logCopyCommand(focusedEditor);
				logService.trace('registerExecCommandImpl (before execCommand ' + browserCommand + ')');
				focusedEditor.getContainerDomNode().ownerDocument.execCommand(browserCommand);
				logService.trace('registerExecCommandImpl (after execCommand ' + browserCommand + ')');
			}
			return true;
		}
		return false;
	});

	// 2. (default) handle case when focus is somewhere else.
	target.addImplementation(0, 'generic-dom', (accessor: ServicesAccessor, args: unknown) => {
		const logService = accessor.get(ILogService);
		logService.trace('registerExecCommandImpl (addImplementation generic-dom for : ', browserCommand, ')');
		logService.trace('registerExecCommandImpl (before execCommand ' + browserCommand + ')');
		getActiveDocument().execCommand(browserCommand);
		logService.trace('registerExecCommandImpl (after execCommand ' + browserCommand + ')');
		return true;
	});
}

function logCopyCommand(editor: ICodeEditor) {
	const editContextEnabled = editor.getOption(EditorOption.effectiveEditContext);
	if (editContextEnabled) {
		const nativeEditContext = NativeEditContextRegistry.get(editor.getId());
		if (nativeEditContext) {
			nativeEditContext.onWillCopy();
		}
	}
}

registerExecCommandImpl(CutAction, 'cut');
registerExecCommandImpl(CopyAction, 'copy');

if (PasteAction) {
	// 1. Paste: handle case when focus is in editor.
	PasteAction.addImplementation(10000, 'code-editor', (accessor: ServicesAccessor, args: unknown) => {
		const logService = accessor.get(ILogService);
		logService.trace('registerExecCommandImpl (addImplementation code-editor for : paste)');
		const codeEditorService = accessor.get(ICodeEditorService);
		const clipboardService = accessor.get(IClipboardService);
		const telemetryService = accessor.get(ITelemetryService);
		const productService = accessor.get(IProductService);

		// Only if editor text focus (i.e. not if editor has widget focus).
		const focusedEditor = codeEditorService.getFocusedCodeEditor();
		if (focusedEditor && focusedEditor.hasModel() && focusedEditor.hasTextFocus()) {
			// execCommand(paste) does not work with edit context
			const editContextEnabled = focusedEditor.getOption(EditorOption.effectiveEditContext);
			if (editContextEnabled) {
				const nativeEditContext = NativeEditContextRegistry.get(focusedEditor.getId());
				if (nativeEditContext) {
					nativeEditContext.onWillPaste();
				}
			}

			const sw = StopWatch.create(true);
			logService.trace('registerExecCommandImpl (before triggerPaste)');
			const triggerPaste = clipboardService.triggerPaste(getActiveWindow().vscodeWindowId);
			if (triggerPaste) {
				logService.trace('registerExecCommandImpl (triggerPaste defined)');
				return triggerPaste.then(async () => {
					logService.trace('registerExecCommandImpl (after triggerPaste)');
					if (productService.quality !== 'stable') {
						const duration = sw.elapsed();
						type EditorAsyncPasteClassification = {
							duration: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The duration of the paste operation.' };
							owner: 'aiday-mar';
							comment: 'Provides insight into the delay introduced by pasting async via keybindings.';
						};
						type EditorAsyncPasteEvent = {
							duration: number;
						};
						telemetryService.publicLog2<EditorAsyncPasteEvent, EditorAsyncPasteClassification>(
							'editorAsyncPaste',
							{ duration }
						);
					}

					return CopyPasteController.get(focusedEditor)?.finishedPaste() ?? Promise.resolve();
				});
			} else {
				logService.trace('registerExecCommandImpl (triggerPaste undefined)');
			}
			if (platform.isWeb) {
				logService.trace('registerExecCommandImpl (Paste handling on web)');
				// Use the clipboard service if document.execCommand('paste') was not successful
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
						logService.trace('registerExecCommandImpl (clipboardText.length : ', clipboardText.length, ' id : ', metadata?.id, ')');
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
	PasteAction.addImplementation(0, 'generic-dom', (accessor: ServicesAccessor, args: unknown) => {
		const logService = accessor.get(ILogService);
		logService.trace('registerExecCommandImpl (addImplementation generic-dom for : paste)');
		const triggerPaste = accessor.get(IClipboardService).triggerPaste(getActiveWindow().vscodeWindowId);
		return triggerPaste ?? false;
	});
}

if (supportsCopy) {
	registerEditorAction(ExecCommandCopyWithSyntaxHighlightingAction);
}
