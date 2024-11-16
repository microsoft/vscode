/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getActiveWindow, isHTMLInputElement, isHTMLTextAreaElement } from '../../../../../base/browser/dom.js';
import { StandardMouseEvent } from '../../../../../base/browser/mouseEvent.js';
import { Action, IAction, Separator } from '../../../../../base/common/actions.js';
import { isNative } from '../../../../../base/common/platform.js';
import { localize } from '../../../../../nls.js';
import { IClipboardService } from '../../../../../platform/clipboard/common/clipboardService.js';
import { IContextMenuService } from '../../../../../platform/contextview/browser/contextView.js';

export function openContextMenu(targetWindow: Window, event: MouseEvent, clipboardService: IClipboardService, contextMenuService: IContextMenuService): void {
	const standardEvent = new StandardMouseEvent(targetWindow, event);

	// Actions from workbench/browser/actions/textInputActions
	const actions: IAction[] = [];
	actions.push(

		// Undo/Redo
		new Action('undo', localize('undo', "Undo"), undefined, true, async () => getActiveWindow().document.execCommand('undo')),
		new Action('redo', localize('redo', "Redo"), undefined, true, async () => getActiveWindow().document.execCommand('redo')),
		new Separator(),

		// Cut / Copy / Paste
		new Action('editor.action.clipboardCutAction', localize('cut', "Cut"), undefined, true, async () => getActiveWindow().document.execCommand('cut')),
		new Action('editor.action.clipboardCopyAction', localize('copy', "Copy"), undefined, true, async () => getActiveWindow().document.execCommand('copy')),
		new Action('editor.action.clipboardPasteAction', localize('paste', "Paste"), undefined, true, async element => {

			// Native: paste is supported
			if (isNative) {
				getActiveWindow().document.execCommand('paste');
			}

			// Web: paste is not supported due to security reasons
			else {
				const clipboardText = await clipboardService.readText();
				if (
					isHTMLTextAreaElement(element) ||
					isHTMLInputElement(element)
				) {
					const selectionStart = element.selectionStart || 0;
					const selectionEnd = element.selectionEnd || 0;

					element.value = `${element.value.substring(0, selectionStart)}${clipboardText}${element.value.substring(selectionEnd, element.value.length)}`;
					element.selectionStart = selectionStart + clipboardText.length;
					element.selectionEnd = element.selectionStart;
				}
			}
		}),
		new Separator(),

		// Select All
		new Action('editor.action.selectAll', localize('selectAll', "Select All"), undefined, true, async () => getActiveWindow().document.execCommand('selectAll'))
	);

	contextMenuService.showContextMenu({
		getAnchor: () => standardEvent,
		getActions: () => actions,
		getActionsContext: () => event.target,
	});
}
