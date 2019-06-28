/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Action } from 'vs/base/common/actions';
import * as nls from 'vs/nls';
import { Command, ServicesAccessor } from 'vs/editor/browser/editorExtensions';
import { WebviewEditor } from 'vs/workbench/contrib/webview/browser/webviewEditor';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { WebviewElement } from 'vs/workbench/contrib/webview/electron-browser/webviewElement';

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

export class CopyWebviewEditorCommand extends Command {
	public static readonly ID = 'editor.action.webvieweditor.copy';

	public runCommand(accessor: ServicesAccessor, _args: any): void {
		return withActiveWebviewBasedWebview(accessor, webview => webview.copy());
	}
}

export class PasteWebviewEditorCommand extends Command {
	public static readonly ID = 'editor.action.webvieweditor.paste';

	public runCommand(accessor: ServicesAccessor, _args: any): void {
		return withActiveWebviewBasedWebview(accessor, webview => webview.paste());
	}
}

export class CutWebviewEditorCommand extends Command {
	public static readonly ID = 'editor.action.webvieweditor.cut';

	public runCommand(accessor: ServicesAccessor, _args: any): void {
		return withActiveWebviewBasedWebview(accessor, webview => webview.cut());
	}
}

function getActiveWebviewEditor(accessor: ServicesAccessor): WebviewEditor | undefined {
	const editorService = accessor.get(IEditorService);
	const activeControl = editorService.activeControl as WebviewEditor;
	return activeControl.isWebviewEditor ? activeControl : undefined;
}

function withActiveWebviewBasedWebview(accessor: ServicesAccessor, f: (webview: WebviewElement) => void): void {
	const webViewEditor = getActiveWebviewEditor(accessor);
	if (webViewEditor) {
		webViewEditor.withWebview(webview => {
			if (webview instanceof WebviewElement) {
				f(webview);
			}
		});
	}
}