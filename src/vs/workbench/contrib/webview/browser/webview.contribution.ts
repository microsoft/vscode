/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getActiveElement } from '../../../../base/browser/dom.js';
import { MultiCommand, RedoCommand, SelectAllCommand, UndoCommand } from '../../../../editor/browser/editorExtensions.js';
import { CopyAction, CutAction, PasteAction } from '../../../../editor/contrib/clipboard/browser/clipboard.js';
import * as nls from '../../../../nls.js';
import { MenuId, MenuRegistry } from '../../../../platform/actions/common/actions.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { IWebviewService, IWebview } from './webview.js';
import { WebviewInput } from '../../webviewPanel/browser/webviewEditorInput.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';


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
