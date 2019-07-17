/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Action } from 'vs/base/common/actions';
import { Command } from 'vs/editor/browser/editorExtensions';
import * as nls from 'vs/nls';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { WebviewEditor } from 'vs/workbench/contrib/webview/browser/webviewEditor';

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
			.filter(control => control && (control as WebviewEditor).isWebviewEditor)
			.map(control => control as WebviewEditor);
	}
}

function getActiveWebviewEditor(accessor: ServicesAccessor): WebviewEditor | null {
	const editorService = accessor.get(IEditorService);
	const activeControl = editorService.activeControl as WebviewEditor;
	return activeControl.isWebviewEditor ? activeControl : null;
}