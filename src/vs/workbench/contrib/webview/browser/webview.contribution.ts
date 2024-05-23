/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getActiveElement } from 'vs/base/browser/dom';
import { MultiCommand, RedoCommand, SelectAllCommand, UndoCommand } from 'vs/editor/browser/editorExtensions';
import { CopyAction, CutAction, PasteAction } from 'vs/editor/contrib/clipboard/browser/clipboard';
import * as nls from 'vs/nls';
import { MenuId, MenuRegistry } from 'vs/platform/actions/common/actions';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { IWebviewService, IWebview } from 'vs/workbench/contrib/webview/browser/webview';
import { WebviewInput } from 'vs/workbench/contrib/webviewPanel/browser/webviewEditorInput';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';


const PRIORITY = 100;

function overrideCommandForWebview(command: MultiCommand | undefined, f: (webview: IWebview) => void) {
	command?.addImplementation(PRIORITY, 'webview', accessor => {
		const webviewService = accessor.get(IWebviewService);
		const webview = webviewService.activeWebview;
		if (webview?.isFocused) {
			f(webview);
			return true;
		}

		// When focused in a custom menu try to fallback to the active webview
		// This is needed for context menu actions and the menubar
		if (getActiveElement()?.classList.contains('action-menu-item')) {
			const editorService = accessor.get(IEditorService);
			if (editorService.activeEditor instanceof WebviewInput) {
				f(editorService.activeEditor.webview);
				return true;
			}
		}

		return false;
	});
}

overrideCommandForWebview(UndoCommand, webview => webview.undo());
overrideCommandForWebview(RedoCommand, webview => webview.redo());
overrideCommandForWebview(SelectAllCommand, webview => webview.selectAll());
overrideCommandForWebview(CopyAction, webview => webview.copy());
overrideCommandForWebview(PasteAction, webview => webview.paste());
overrideCommandForWebview(CutAction, webview => webview.cut());

export const PreventDefaultContextMenuItemsContextKeyName = 'preventDefaultContextMenuItems';

if (CutAction) {
	MenuRegistry.appendMenuItem(MenuId.WebviewContext, {
		command: {
			id: CutAction.id,
			title: nls.localize('cut', "Cut"),
		},
		group: '5_cutcopypaste',
		order: 1,
		when: ContextKeyExpr.not(PreventDefaultContextMenuItemsContextKeyName),
	});
}

if (CopyAction) {
	MenuRegistry.appendMenuItem(MenuId.WebviewContext, {
		command: {
			id: CopyAction.id,
			title: nls.localize('copy', "Copy"),
		},
		group: '5_cutcopypaste',
		order: 2,
		when: ContextKeyExpr.not(PreventDefaultContextMenuItemsContextKeyName),
	});
}

if (PasteAction) {
	MenuRegistry.appendMenuItem(MenuId.WebviewContext, {
		command: {
			id: PasteAction.id,
			title: nls.localize('paste', "Paste"),
		},
		group: '5_cutcopypaste',
		order: 3,
		when: ContextKeyExpr.not(PreventDefaultContextMenuItemsContextKeyName),
	});
}
