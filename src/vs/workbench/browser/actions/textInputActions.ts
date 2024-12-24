/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IAction, Action, Separator } from '../../../base/common/actions.js';
import { localize } from '../../../nls.js';
import { IWorkbenchLayoutService } from '../../services/layout/browser/layoutService.js';
import { IContextMenuService } from '../../../platform/contextview/browser/contextView.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { EventHelper, addDisposableListener, getActiveDocument, getWindow, isHTMLElement, isHTMLInputElement, isHTMLTextAreaElement } from '../../../base/browser/dom.js';
import { IWorkbenchContribution, WorkbenchPhase, registerWorkbenchContribution2 } from '../../common/contributions.js';
import { isNative } from '../../../base/common/platform.js';
import { IClipboardService } from '../../../platform/clipboard/common/clipboardService.js';
import { StandardMouseEvent } from '../../../base/browser/mouseEvent.js';
import { Event as BaseEvent } from '../../../base/common/event.js';
import { Lazy } from '../../../base/common/lazy.js';

export class TextInputActionsProvider extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.textInputActionsProvider';

	private readonly textInputActions = new Lazy<IAction[]>(() => this.createActions());

	constructor(
		@IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService,
		@IContextMenuService private readonly contextMenuService: IContextMenuService,
		@IClipboardService private readonly clipboardService: IClipboardService
	) {
		super();

		this.registerListeners();
	}

	private createActions(): IAction[] {
		return [

			// Undo/Redo
			new Action('undo', localize('undo', "Undo"), undefined, true, async () => getActiveDocument().execCommand('undo')),
			new Action('redo', localize('redo', "Redo"), undefined, true, async () => getActiveDocument().execCommand('redo')),
			new Separator(),

			// Cut / Copy / Paste
			new Action('editor.action.clipboardCutAction', localize('cut', "Cut"), undefined, true, async () => getActiveDocument().execCommand('cut')),
			new Action('editor.action.clipboardCopyAction', localize('copy', "Copy"), undefined, true, async () => getActiveDocument().execCommand('copy')),
			new Action('editor.action.clipboardPasteAction', localize('paste', "Paste"), undefined, true, async element => {

				// Native: paste is supported
				if (isNative) {
					getActiveDocument().execCommand('paste');
				}

				// Web: paste is not supported due to security reasons
				else {
					const clipboardText = await this.clipboardService.readText();
					if (
						isHTMLTextAreaElement(element) ||
						isHTMLInputElement(element)
					) {
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

			// Select All
			new Action('editor.action.selectAll', localize('selectAll', "Select All"), undefined, true, async () => getActiveDocument().execCommand('selectAll'))
		];
	}

	private registerListeners(): void {

		// Context menu support in input/textarea
		this._register(BaseEvent.runAndSubscribe(this.layoutService.onDidAddContainer, ({ container, disposables }) => {
			disposables.add(addDisposableListener(container, 'contextmenu', e => this.onContextMenu(getWindow(container), e)));
		}, { container: this.layoutService.mainContainer, disposables: this._store }));
	}

	private onContextMenu(targetWindow: Window, e: MouseEvent): void {
		if (e.defaultPrevented) {
			return; // make sure to not show these actions by accident if component indicated to prevent
		}

		const target = e.target;
		if (!(isHTMLElement(target)) || (target.nodeName.toLowerCase() !== 'input' && target.nodeName.toLowerCase() !== 'textarea')) {
			return; // only for inputs or textareas
		}

		EventHelper.stop(e, true);

		const event = new StandardMouseEvent(targetWindow, e);

		this.contextMenuService.showContextMenu({
			getAnchor: () => event,
			getActions: () => this.textInputActions.value,
			getActionsContext: () => target,
		});
	}
}

registerWorkbenchContribution2(
	TextInputActionsProvider.ID,
	TextInputActionsProvider,
	WorkbenchPhase.BlockRestore // Block to allow right-click into input fields before restore finished
);
