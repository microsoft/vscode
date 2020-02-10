/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { WebviewTag } from 'electron';
import { Action } from 'vs/base/common/actions';
import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { ServicesAccessor } from 'vs/editor/browser/editorExtensions';
import * as nls from 'vs/nls';
import { Action2 } from 'vs/platform/actions/common/actions';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { InputFocusedContextKey } from 'vs/platform/contextkey/common/contextkeys';
import { KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { WebviewEditorOverlay, webviewHasOwnEditFunctionsContextKey } from 'vs/workbench/contrib/webview/browser/webview';
import { getActiveWebviewEditor } from 'vs/workbench/contrib/webview/browser/webviewCommands';
import { ElectronWebviewBasedWebview } from 'vs/workbench/contrib/webview/electron-browser/webviewElement';

export class OpenWebviewDeveloperToolsAction extends Action {
	static readonly ID = 'workbench.action.webview.openDeveloperTools';
	static readonly ALIAS = 'Open Webview Developer Tools';
	static readonly LABEL = nls.localize('openToolsLabel', "Open Webview Developer Tools");

	public constructor(id: string, label: string) {
		super(id, label);
	}

	public run(): Promise<any> {
		const elements = document.querySelectorAll('webview.ready');
		for (let i = 0; i < elements.length; i++) {
			try {
				(elements.item(i) as WebviewTag).openDevTools();
			} catch (e) {
				console.error(e);
			}
		}
		return Promise.resolve(true);
	}
}

export class SelectAllWebviewEditorCommand extends Action2 {
	public static readonly ID = 'editor.action.webvieweditor.selectAll';
	public static readonly LABEL = nls.localize('editor.action.webvieweditor.selectAll', 'Select all');

	constructor(contextKeyExpr: ContextKeyExpr) {
		const precondition = ContextKeyExpr.and(contextKeyExpr, ContextKeyExpr.not(InputFocusedContextKey));
		super({
			id: SelectAllWebviewEditorCommand.ID,
			title: SelectAllWebviewEditorCommand.LABEL,
			keybinding: {
				when: precondition,
				primary: KeyMod.CtrlCmd | KeyCode.KEY_A,
				weight: KeybindingWeight.EditorContrib
			}
		});
	}

	public run(accessor: ServicesAccessor, args: any): void {
		withActiveWebviewBasedWebview(accessor, webview => webview.selectAll());
	}
}

export class CopyWebviewEditorCommand extends Action2 {
	public static readonly ID = 'editor.action.webvieweditor.copy';
	public static readonly LABEL = nls.localize('editor.action.webvieweditor.copy', "Copy2");

	constructor(contextKeyExpr: ContextKeyExpr) {
		super({
			id: CopyWebviewEditorCommand.ID,
			title: CopyWebviewEditorCommand.LABEL,
			keybinding: {
				when: ContextKeyExpr.and(contextKeyExpr, ContextKeyExpr.not(InputFocusedContextKey)),
				primary: KeyMod.CtrlCmd | KeyCode.KEY_C,
				weight: KeybindingWeight.EditorContrib
			}
		});
	}

	public run(accessor: ServicesAccessor): void {
		withActiveWebviewBasedWebview(accessor, webview => webview.copy());
	}
}

export class PasteWebviewEditorCommand extends Action2 {
	public static readonly ID = 'editor.action.webvieweditor.paste';
	public static readonly LABEL = nls.localize('editor.action.webvieweditor.paste', 'Paste');

	constructor(contextKeyExpr: ContextKeyExpr) {
		super({
			id: PasteWebviewEditorCommand.ID,
			title: PasteWebviewEditorCommand.LABEL,
			keybinding: {
				when: ContextKeyExpr.and(contextKeyExpr, ContextKeyExpr.not(InputFocusedContextKey)),
				primary: KeyMod.CtrlCmd | KeyCode.KEY_V,
				weight: KeybindingWeight.EditorContrib
			}
		});
	}

	public run(accessor: ServicesAccessor): void {
		withActiveWebviewBasedWebview(accessor, webview => webview.paste());
	}
}

export class CutWebviewEditorCommand extends Action2 {
	public static readonly ID = 'editor.action.webvieweditor.cut';
	public static readonly LABEL = nls.localize('editor.action.webvieweditor.cut', 'Cut');

	constructor(contextKeyExpr: ContextKeyExpr) {
		super({
			id: CutWebviewEditorCommand.ID,
			title: CutWebviewEditorCommand.LABEL,
			keybinding: {
				when: ContextKeyExpr.and(contextKeyExpr, ContextKeyExpr.not(InputFocusedContextKey)),
				primary: KeyMod.CtrlCmd | KeyCode.KEY_X,
				weight: KeybindingWeight.EditorContrib
			}
		});
	}

	public run(accessor: ServicesAccessor): void {
		withActiveWebviewBasedWebview(accessor, webview => webview.cut());
	}
}

export class UndoWebviewEditorCommand extends Action2 {
	public static readonly ID = 'editor.action.webvieweditor.undo';
	public static readonly LABEL = nls.localize('editor.action.webvieweditor.undo', "Undo");

	constructor(contextKeyExpr: ContextKeyExpr) {
		super({
			id: UndoWebviewEditorCommand.ID,
			title: UndoWebviewEditorCommand.LABEL,
			keybinding: {
				when: ContextKeyExpr.and(contextKeyExpr, ContextKeyExpr.not(InputFocusedContextKey), ContextKeyExpr.not(webviewHasOwnEditFunctionsContextKey)),
				primary: KeyMod.CtrlCmd | KeyCode.KEY_Z,
				weight: KeybindingWeight.EditorContrib
			}
		});
	}

	public run(accessor: ServicesAccessor, args: any): void {
		withActiveWebviewBasedWebview(accessor, webview => webview.undo());
	}
}

export class RedoWebviewEditorCommand extends Action2 {
	public static readonly ID = 'editor.action.webvieweditor.redo';
	public static readonly LABEL = nls.localize('editor.action.webvieweditor.redo', "Redo");

	constructor(contextKeyExpr: ContextKeyExpr) {
		super({
			id: RedoWebviewEditorCommand.ID,
			title: RedoWebviewEditorCommand.LABEL,
			keybinding: {
				when: ContextKeyExpr.and(contextKeyExpr, ContextKeyExpr.not(InputFocusedContextKey), ContextKeyExpr.not(webviewHasOwnEditFunctionsContextKey)),
				primary: KeyMod.CtrlCmd | KeyCode.KEY_Y,
				secondary: [KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KEY_Z],
				mac: { primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KEY_Z },
				weight: KeybindingWeight.EditorContrib
			}
		});
	}

	public run(accessor: ServicesAccessor, args: any): void {
		withActiveWebviewBasedWebview(accessor, webview => webview.redo());
	}
}

function withActiveWebviewBasedWebview(accessor: ServicesAccessor, f: (webview: ElectronWebviewBasedWebview) => void): void {
	const webViewEditor = getActiveWebviewEditor(accessor);
	if (webViewEditor) {
		webViewEditor.withWebview(webview => {
			if (webview instanceof ElectronWebviewBasedWebview) {
				f(webview);
			} else if ((webview as WebviewEditorOverlay).getInnerWebview) {
				const innerWebview = (webview as WebviewEditorOverlay).getInnerWebview();
				if (innerWebview instanceof ElectronWebviewBasedWebview) {
					f(innerWebview);
				}
			}
		});
	}
}
