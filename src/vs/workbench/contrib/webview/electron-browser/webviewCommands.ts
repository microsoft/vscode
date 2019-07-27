/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Action } from 'vs/base/common/actions';
import * as nls from 'vs/nls';
import { Command, ServicesAccessor } from 'vs/editor/browser/editorExtensions';
import { WebviewEditor } from 'vs/workbench/contrib/webview/browser/webviewEditor';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { ElectronWebviewBasedWebview } from 'vs/workbench/contrib/webview/electron-browser/webviewElement';
import { WebviewEditorOverlay } from 'vs/workbench/contrib/webview/common/webview';

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
				(elements.item(i) as Electron.WebviewTag).openDevTools();
			} catch (e) {
				console.error(e);
			}
		}
		return Promise.resolve(true);
	}
}

export class SelectAllWebviewEditorCommand extends Command {
	public static readonly ID = 'editor.action.webvieweditor.selectAll';

	public runCommand(accessor: ServicesAccessor, args: any): void {
		withActiveWebviewBasedWebview(accessor, webview => webview.selectAll());
	}
}

export class CopyWebviewEditorCommand extends Command {
	public static readonly ID = 'editor.action.webvieweditor.copy';

	public runCommand(accessor: ServicesAccessor, _args: any): void {
		withActiveWebviewBasedWebview(accessor, webview => webview.copy());
	}
}

export class PasteWebviewEditorCommand extends Command {
	public static readonly ID = 'editor.action.webvieweditor.paste';

	public runCommand(accessor: ServicesAccessor, _args: any): void {
		withActiveWebviewBasedWebview(accessor, webview => webview.paste());
	}
}

export class CutWebviewEditorCommand extends Command {
	public static readonly ID = 'editor.action.webvieweditor.cut';

	public runCommand(accessor: ServicesAccessor, _args: any): void {
		withActiveWebviewBasedWebview(accessor, webview => webview.cut());
	}
}

export class UndoWebviewEditorCommand extends Command {
	public static readonly ID = 'editor.action.webvieweditor.undo';

	public runCommand(accessor: ServicesAccessor, args: any): void {
		withActiveWebviewBasedWebview(accessor, webview => webview.undo());
	}
}

export class RedoWebviewEditorCommand extends Command {
	public static readonly ID = 'editor.action.webvieweditor.redo';

	public runCommand(accessor: ServicesAccessor, args: any): void {
		withActiveWebviewBasedWebview(accessor, webview => webview.redo());
	}
}

function getActiveWebviewEditor(accessor: ServicesAccessor): WebviewEditor | undefined {
	const editorService = accessor.get(IEditorService);
	const activeControl = editorService.activeControl as WebviewEditor;
	return activeControl.isWebviewEditor ? activeControl : undefined;
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