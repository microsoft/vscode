/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { WebviewTag } from 'electron';
import { Action } from 'vs/base/common/actions';
import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { Command, ServicesAccessor } from 'vs/editor/browser/editorExtensions';
import * as nls from 'vs/nls';
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

export class SelectAllWebviewEditorCommand extends Command {
	public static readonly ID = 'editor.action.webvieweditor.selectAll';

	constructor(contextKeyExpr: ContextKeyExpr) {
		super({
			id: SelectAllWebviewEditorCommand.ID,
			precondition: ContextKeyExpr.and(contextKeyExpr, ContextKeyExpr.not(InputFocusedContextKey)),
			kbOpts: {
				primary: KeyMod.CtrlCmd | KeyCode.KEY_A,
				weight: KeybindingWeight.EditorContrib
			}
		});
	}

	public runCommand(accessor: ServicesAccessor, args: any): void {
		withActiveWebviewBasedWebview(accessor, webview => webview.selectAll());
	}
}

export class CopyWebviewEditorCommand extends Command {
	public static readonly ID = 'editor.action.webvieweditor.copy';

	constructor(contextKeyExpr: ContextKeyExpr) {
		super({
			id: CopyWebviewEditorCommand.ID,
			precondition: ContextKeyExpr.and(contextKeyExpr, ContextKeyExpr.not(InputFocusedContextKey)),
			kbOpts: {
				primary: KeyMod.CtrlCmd | KeyCode.KEY_C,
				weight: KeybindingWeight.EditorContrib
			}
		});
	}

	public runCommand(accessor: ServicesAccessor, _args: any): void {
		withActiveWebviewBasedWebview(accessor, webview => webview.copy());
	}
}

export class PasteWebviewEditorCommand extends Command {
	public static readonly ID = 'editor.action.webvieweditor.paste';

	constructor(contextKeyExpr: ContextKeyExpr) {
		super({
			id: PasteWebviewEditorCommand.ID,
			precondition: ContextKeyExpr.and(contextKeyExpr, ContextKeyExpr.not(InputFocusedContextKey)),
			kbOpts: {
				primary: KeyMod.CtrlCmd | KeyCode.KEY_V,
				weight: KeybindingWeight.EditorContrib
			}
		});
	}

	public runCommand(accessor: ServicesAccessor, _args: any): void {
		withActiveWebviewBasedWebview(accessor, webview => webview.paste());
	}
}

export class CutWebviewEditorCommand extends Command {
	public static readonly ID = 'editor.action.webvieweditor.cut';

	constructor(contextKeyExpr: ContextKeyExpr) {
		super({
			id: CutWebviewEditorCommand.ID,
			precondition: ContextKeyExpr.and(contextKeyExpr, ContextKeyExpr.not(InputFocusedContextKey)),
			kbOpts: {
				primary: KeyMod.CtrlCmd | KeyCode.KEY_X,
				weight: KeybindingWeight.EditorContrib
			}
		});
	}

	public runCommand(accessor: ServicesAccessor, _args: any): void {
		withActiveWebviewBasedWebview(accessor, webview => webview.cut());
	}
}

export class UndoWebviewEditorCommand extends Command {
	public static readonly ID = 'editor.action.webvieweditor.undo';

	constructor(contextKeyExpr: ContextKeyExpr) {
		super({
			id: UndoWebviewEditorCommand.ID,
			precondition: ContextKeyExpr.and(contextKeyExpr, ContextKeyExpr.not(InputFocusedContextKey), ContextKeyExpr.not(webviewHasOwnEditFunctionsContextKey)),
			kbOpts: {
				primary: KeyMod.CtrlCmd | KeyCode.KEY_Z,
				weight: KeybindingWeight.EditorContrib
			}
		});
	}

	public runCommand(accessor: ServicesAccessor, args: any): void {
		withActiveWebviewBasedWebview(accessor, webview => webview.undo());
	}
}

export class RedoWebviewEditorCommand extends Command {
	public static readonly ID = 'editor.action.webvieweditor.redo';

	constructor(contextKeyExpr: ContextKeyExpr) {
		super({
			id: RedoWebviewEditorCommand.ID,
			precondition: ContextKeyExpr.and(contextKeyExpr, ContextKeyExpr.not(InputFocusedContextKey), ContextKeyExpr.not(webviewHasOwnEditFunctionsContextKey)),
			kbOpts: {
				primary: KeyMod.CtrlCmd | KeyCode.KEY_Y,
				secondary: [KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KEY_Z],
				mac: { primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KEY_Z },
				weight: KeybindingWeight.EditorContrib
			}
		});
	}

	public runCommand(accessor: ServicesAccessor, args: any): void {
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
