/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Action } from 'vs/base/common/actions';
import { Command } from 'vs/editor/browser/editorExtensions';
import * as nls from 'vs/nls';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { BaseWebviewEditor } from './baseWebviewEditor';

export class ShowWebViewEditorFindWidgetCommand extends Command {
	public static readonly ID = 'editor.action.webvieweditor.showFind';

	public runCommand(accessor: ServicesAccessor, args: any): void {
		const webViewEditor = getActiveWebviewEditor(accessor);
		if (webViewEditor) {
			webViewEditor.showFind();
		}
	}
}

export class HideWebViewEditorFindCommand extends Command {
	public static readonly ID = 'editor.action.webvieweditor.hideFind';

	public runCommand(accessor: ServicesAccessor, args: any): void {
		const webViewEditor = getActiveWebviewEditor(accessor);
		if (webViewEditor) {
			webViewEditor.hideFind();
		}
	}
}

export class SelectAllWebviewEditorCommand extends Command {
	public static readonly ID = 'editor.action.webvieweditor.selectAll';

	public runCommand(accessor: ServicesAccessor, args: any): void {
		const webViewEditor = getActiveWebviewEditor(accessor);
		if (webViewEditor) {
			webViewEditor.selectAll();
		}
	}
}

export class OpenWebviewDeveloperToolsAction extends Action {
	static readonly ID = 'workbench.action.webview.openDeveloperTools';
	static readonly LABEL = nls.localize('openToolsLabel', "Open Webview Developer Tools");

	public constructor(
		id: string,
		label: string
	) {
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

export class ReloadWebviewAction extends Action {
	static readonly ID = 'workbench.action.webview.reloadWebviewAction';
	static readonly LABEL = nls.localize('refreshWebviewLabel', "Reload Webviews");

	public constructor(
		id: string,
		label: string,
		@IEditorService private readonly editorService: IEditorService
	) {
		super(id, label);
	}

	public run(): Promise<any> {
		for (const webview of this.getVisibleWebviews()) {
			webview.reload();
		}
		return Promise.resolve(true);
	}

	private getVisibleWebviews() {
		return this.editorService.visibleControls
			.filter(control => control && (control as BaseWebviewEditor).isWebviewEditor)
			.map(control => control as BaseWebviewEditor);
	}
}

function getActiveWebviewEditor(accessor: ServicesAccessor): BaseWebviewEditor | null {
	const editorService = accessor.get(IEditorService);
	const activeControl = editorService.activeControl as BaseWebviewEditor;
	return activeControl.isWebviewEditor ? activeControl : null;
}