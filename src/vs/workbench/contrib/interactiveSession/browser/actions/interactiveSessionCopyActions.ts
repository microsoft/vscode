/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ServicesAccessor } from 'vs/editor/browser/editorExtensions';
import { localize } from 'vs/nls';
import { Action2, MenuId, registerAction2 } from 'vs/platform/actions/common/actions';
import { IClipboardService } from 'vs/platform/clipboard/common/clipboardService';
import { INTERACTIVE_SESSION_CATEGORY } from 'vs/workbench/contrib/interactiveSession/browser/actions/interactiveSessionActions';
import { IInteractiveSessionWidgetService } from 'vs/workbench/contrib/interactiveSession/browser/interactiveSessionWidget';
import { IInteractiveRequestViewModel, IInteractiveResponseViewModel, isRequestVM, isResponseVM } from 'vs/workbench/contrib/interactiveSession/common/interactiveSessionViewModel';

export function registerInteractiveSessionCopyActions() {
	registerAction2(class CopyAllAction extends Action2 {
		constructor() {
			super({
				id: 'workbench.action.interactiveSession.copyAll',
				title: {
					value: localize('interactive.copyAll.label', "Copy All"),
					original: 'Copy All'
				},
				f1: false,
				category: INTERACTIVE_SESSION_CATEGORY,
				menu: {
					id: MenuId.InteractiveSessionContext
				}
			});
		}

		run(accessor: ServicesAccessor, ...args: any[]) {
			const clipboardService = accessor.get(IClipboardService);
			const interactiveWidgetService = accessor.get(IInteractiveSessionWidgetService);
			const widget = interactiveWidgetService.lastFocusedWidget;
			if (widget) {
				const viewModel = widget.viewModel;
				const sessionAsText = viewModel?.getItems()
					.map(stringifyItem)
					.join('\n\n');
				if (sessionAsText) {
					clipboardService.writeText(sessionAsText);
				}
			}
		}
	});

	registerAction2(class CopyItemAction extends Action2 {
		constructor() {
			super({
				id: 'workbench.action.interactiveSession.copyItem',
				title: {
					value: localize('interactive.copyItem.label', "Copy"),
					original: 'Copy'
				},
				f1: false,
				category: INTERACTIVE_SESSION_CATEGORY,
				menu: {
					id: MenuId.InteractiveSessionContext
				}
			});
		}

		run(accessor: ServicesAccessor, ...args: any[]) {
			const item = args[0];
			if (!isRequestVM(item) && !isResponseVM(item)) {
				return;
			}

			const clipboardService = accessor.get(IClipboardService);
			const text = stringifyItem(item);
			clipboardService.writeText(text);
		}
	});
}

function stringifyItem(item: IInteractiveRequestViewModel | IInteractiveResponseViewModel): string {
	return isRequestVM(item) ?
		`${item.username}: ${item.message}` : `${item.username}: ${item.response.value}`;
}
