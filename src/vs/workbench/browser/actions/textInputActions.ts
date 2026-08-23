/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IAction, Separator, toAction } from '../../../base/common/actions.js';
import { localize } from '../../../nls.js';
import { IWorkbenchLayoutService } from '../../services/layout/browser/layoutService.js';
import { IContextMenuService } from '../../../platform/contextview/browser/contextView.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { EventHelper, addDisposableListener, getActiveDocument, getWindow, isHTMLInputElement, isHTMLTextAreaElement } from '../../../base/browser/dom.js';
import { IWorkbenchContribution, WorkbenchPhase, registerWorkbenchContribution2 } from '../../common/contributions.js';
import { IClipboardService } from '../../../platform/clipboard/common/clipboardService.js';
import { StandardMouseEvent } from '../../../base/browser/mouseEvent.js';
import { Event as BaseEvent } from '../../../base/common/event.js';
import { Lazy } from '../../../base/common/lazy.js';
import { ILogService } from '../../../platform/log/common/log.js';

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

export class TextInputActionsProvider extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.textInputActionsProvider';

	private readonly textInputActions = new Lazy<IAction[]>(() => createTextInputActions(this.clipboardService, this.logService));

	constructor(
		@IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService,
		@IContextMenuService private readonly contextMenuService: IContextMenuService,
		@IClipboardService private readonly clipboardService: IClipboardService,
		@ILogService private readonly logService: ILogService
	) {
		super();

		this.registerListeners();
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
		if (!isHTMLTextAreaElement(target) && !isHTMLInputElement(target)) {
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
