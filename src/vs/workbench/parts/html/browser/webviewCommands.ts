/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';

import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { Command, ICommandOptions } from 'vs/editor/browser/editorExtensions';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { Action } from 'vs/base/common/actions';
import { TPromise } from 'vs/base/common/winjs.base';
import { WebviewEditor } from './webviewEditor';

export class ShowWebViewEditorFindWidgetAction extends Action {
	public static readonly ID = 'editor.action.webvieweditor.showFind';
	public static readonly LABEL = nls.localize('editor.action.webvieweditor.showFind', "Focus Find Widget");

	public constructor(
		id: string,
		label: string,
		@IWorkbenchEditorService private workbenchEditorService: IWorkbenchEditorService
	) {
		super(id, label);
	}

	public run(): TPromise<any> {
		const webViewEditor = this.getWebViewEditor();
		if (webViewEditor) {
			webViewEditor.showFind();
		}
		return null;
	}

	private getWebViewEditor(): WebviewEditor {
		const activeEditor = this.workbenchEditorService.getActiveEditor() as WebviewEditor;
		if (activeEditor.isWebviewEditor) {
			return activeEditor;
		}
		return null;
	}
}

export class HideWebViewEditorFindCommand extends Command {
	public runCommand(accessor: ServicesAccessor, args: any): void {
		const webViewEditor = this.getWebViewEditor(accessor);
		if (webViewEditor) {
			webViewEditor.hideFind();
		}
	}

	private getWebViewEditor(accessor: ServicesAccessor): WebviewEditor {
		const activeEditor = accessor.get(IWorkbenchEditorService).getActiveEditor() as WebviewEditor;
		if (activeEditor.isWebviewEditor) {
			return activeEditor;
		}
		return null;
	}
}

export class ShowWebViewEditorFindTermCommand extends Command {
	constructor(opts: ICommandOptions, private _next: boolean) {
		super(opts);
	}

	public runCommand(accessor: ServicesAccessor, args: any): void {
		const webViewEditor = this.getWebViewEditor(accessor);
		if (webViewEditor) {
			if (this._next) {
				webViewEditor.showNextFindTerm();
			} else {
				webViewEditor.showPreviousFindTerm();
			}
		}
	}

	private getWebViewEditor(accessor: ServicesAccessor): WebviewEditor {
		const activeEditor = accessor.get(IWorkbenchEditorService).getActiveEditor() as WebviewEditor;
		if (activeEditor.isWebviewEditor) {
			return activeEditor;
		}
		return null;
	}
}


export class OpenWebviewDeveloperToolsAction extends Action {
	static readonly ID = 'workbench.action.webview.openDeveloperTools';
	static LABEL = nls.localize('openToolsLabel', "Webview Tools");

	public constructor(
		id: string,
		label: string
	) {
		super(id, label);
	}

	public run(): TPromise<any> {
		const elements = document.querySelectorAll('webview.ready');
		for (let i = 0; i < elements.length; i++) {
			try {
				(elements.item(i) as Electron.WebviewTag).openDevTools();
			} catch (e) {
				console.error(e);
			}
		}
		return null;
	}
}


export class ReloadWebviewAction extends Action {
	static readonly ID = 'workbench.action.webview.reloadWebviewAction';
	static LABEL = nls.localize('refreshWebviewLabel', "Reload Webviews");

	public constructor(
		id: string,
		label: string,
		@IWorkbenchEditorService private readonly workbenchEditorService: IWorkbenchEditorService
	) {
		super(id, label);
	}

	public run(): TPromise<any> {
		for (const webview of this.getVisibleWebviews()) {
			webview.reload();
		}
		return null;
	}

	private getVisibleWebviews() {
		return this.workbenchEditorService.getVisibleEditors()
			.filter(c => c && (c as any).isWebviewEditor)
			.map(e => e as WebviewEditor);
	}
}