/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getActiveDocument, isHTMLInputElement, isHTMLTextAreaElement } from '../../../base/browser/dom.js';
import { IAction, Separator, toAction } from '../../../base/common/actions.js';
import { localize } from '../../../nls.js';
import { ILogService } from '../../log/common/log.js';
import { IClipboardService } from '../common/clipboardService.js';

/**
 * Creates the Undo, Redo, Cut, Copy, Paste and Select All actions for the context
 * menu of an `<input>` or `<textarea>`. The element is passed as actions context.
 */
export function createTextInputActions(clipboardService: IClipboardService, logService: ILogService): IAction[] {
	return [

		toAction({ id: 'undo', label: localize('undo', "Undo"), run: () => getActiveDocument().execCommand('undo') }),
		toAction({ id: 'redo', label: localize('redo', "Redo"), run: () => getActiveDocument().execCommand('redo') }),
		new Separator(),
		toAction({
			id: 'editor.action.clipboardCutAction', label: localize('cut', "Cut"), run: () => {
				logService.trace('TextInputActionsProvider#cut');
				getActiveDocument().execCommand('cut');
			}
		}),
		toAction({
			id: 'editor.action.clipboardCopyAction', label: localize('copy', "Copy"), run: () => {
				logService.trace('TextInputActionsProvider#copy');
				getActiveDocument().execCommand('copy');
			}
		}),
		toAction({
			id: 'editor.action.clipboardPasteAction',
			label: localize('paste', "Paste"),
			run: async (element: unknown) => {
				logService.trace('TextInputActionsProvider#paste');
				const clipboardText = await clipboardService.readText();
				if (!clipboardText) {
					return; // nothing to paste, or the clipboard could not be read: keep the selection
				}
				if (isHTMLTextAreaElement(element) || isHTMLInputElement(element)) {
					const selectionStart = element.selectionStart || 0;
					const selectionEnd = element.selectionEnd || 0;

					element.value = `${element.value.substring(0, selectionStart)}${clipboardText}${element.value.substring(selectionEnd, element.value.length)}`;
					element.selectionStart = selectionStart + clipboardText.length;
					element.selectionEnd = element.selectionStart;
					element.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
				}
			}
		}),
		new Separator(),
		toAction({ id: 'editor.action.selectAll', label: localize('selectAll', "Select All"), run: () => getActiveDocument().execCommand('selectAll') })
	];
}
