/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CopyAction, CutAction, PasteAction } from 'vs/editor/contrib/clipboard/clipboard';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { ElectronWebviewBasedWebview } from 'vs/workbench/contrib/webview/electron-browser/webviewElement';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { UndoCommand, RedoCommand } from 'vs/editor/browser/editorExtensions';
import { getNotebookEditorFromEditorPane } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';

function getFocusedElectronBasedWebviewDelegate(accessor: ServicesAccessor): ElectronWebviewBasedWebview | undefined {
	const editorService = accessor.get(IEditorService);
	const editor = getNotebookEditorFromEditorPane(editorService.activeEditorPane);
	if (!editor?.hasFocus()) {
		return;
	}

	if (!editor?.hasWebviewFocus()) {
		return;
	}

	const webview = editor?.getInnerWebview();
	if (webview && webview instanceof ElectronWebviewBasedWebview) {
		return webview;
	}
	return;
}

function withWebview(accessor: ServicesAccessor, f: (webviewe: ElectronWebviewBasedWebview) => void) {
	const webview = getFocusedElectronBasedWebviewDelegate(accessor);
	if (webview) {
		f(webview);
		return true;
	}
	return false;
}

const PRIORITY = 105;

UndoCommand.addImplementation(PRIORITY, 'notebook-webview', accessor => {
	return withWebview(accessor, webview => webview.undo());
});

RedoCommand.addImplementation(PRIORITY, 'notebook-webview', accessor => {
	return withWebview(accessor, webview => webview.redo());
});

CopyAction?.addImplementation(PRIORITY, 'notebook-webview', accessor => {
	return withWebview(accessor, webview => webview.copy());
});

PasteAction?.addImplementation(PRIORITY, 'notebook-webview', accessor => {
	return withWebview(accessor, webview => webview.paste());
});

CutAction?.addImplementation(PRIORITY, 'notebook-webview', accessor => {
	return withWebview(accessor, webview => webview.cut());
});

