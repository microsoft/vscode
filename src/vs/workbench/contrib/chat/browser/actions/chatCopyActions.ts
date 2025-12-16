/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
import { ServicesAccessor } from '../../../../../editor/browser/editorExtensions.js';
import { localize2 } from '../../../../../nls.js';
import { Action2, MenuId, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { IClipboardService } from '../../../../../platform/clipboard/common/clipboardService.js';
import { katexContainerClassName, katexContainerLatexAttributeName } from '../../../markdown/common/markedKatexExtension.js';
import { ChatContextKeys } from '../../common/chatContextKeys.js';
import { IChatRequestViewModel, IChatResponseViewModel, isChatTreeItem, isRequestVM, isResponseVM } from '../../common/chatViewModel.js';
import { ChatTreeItem, IChatWidgetService } from '../chat.js';
import { CHAT_CATEGORY, stringifyItem } from './chatActions.js';

export function registerChatCopyActions() {
	registerAction2(class CopyAllAction extends Action2 {
		constructor() {
			super({
				id: 'workbench.action.chat.copyAll',
				title: localize2('interactive.copyAll.label', "Copy All"),
				f1: false,
				category: CHAT_CATEGORY,
				menu: {
					id: MenuId.ChatContext,
					when: ChatContextKeys.responseIsFiltered.negate(),
					group: 'copy',
				}
			});
		}

		run(accessor: ServicesAccessor, context?: ChatTreeItem) {
			const clipboardService = accessor.get(IClipboardService);
			const chatWidgetService = accessor.get(IChatWidgetService);
			const widget = (context?.sessionResource && chatWidgetService.getWidgetBySessionResource(context.sessionResource)) || chatWidgetService.lastFocusedWidget;
			if (widget) {
				const viewModel = widget.viewModel;
				const sessionAsText = viewModel?.getItems()
					.filter((item): item is (IChatRequestViewModel | IChatResponseViewModel) => isRequestVM(item) || (isResponseVM(item) && !item.errorDetails?.responseIsFiltered))
					.map(item => stringifyItem(item))
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
				id: 'workbench.action.chat.copyItem',
				title: localize2('interactive.copyItem.label', "Copy"),
				f1: false,
				category: CHAT_CATEGORY,
				menu: {
					id: MenuId.ChatContext,
					when: ChatContextKeys.responseIsFiltered.negate(),
					group: 'copy',
				}
			});
		}

		async run(accessor: ServicesAccessor, ...args: unknown[]) {
			const chatWidgetService = accessor.get(IChatWidgetService);
			const clipboardService = accessor.get(IClipboardService);

			const widget = chatWidgetService.lastFocusedWidget;
			let item = args[0] as ChatTreeItem | undefined;
			if (!isChatTreeItem(item)) {
				item = widget?.getFocus();
				if (!item) {
					return;
				}
			}

			// If there is a text selection, and focus is inside the widget, copy the selected text.
			// Otherwise, context menu with no selection -> copy the full item
			const nativeSelection = dom.getActiveWindow().getSelection();
			const selectedText = nativeSelection?.toString();
			if (widget && selectedText && selectedText.length > 0 && dom.isAncestor(dom.getActiveElement(), widget.domNode)) {
				await clipboardService.writeText(selectedText);
				return;
			}

			const text = stringifyItem(item, false);
			await clipboardService.writeText(text);
		}
	});

	registerAction2(class CopyKatexMathSourceAction extends Action2 {
		constructor() {
			super({
				id: 'workbench.action.chat.copyKatexMathSource',
				title: localize2('chat.copyKatexMathSource.label', "Copy Math Source"),
				f1: false,
				category: CHAT_CATEGORY,
				menu: {
					id: MenuId.ChatContext,
					group: 'copy',
					when: ChatContextKeys.isKatexMathElement,
				}
			});
		}

		async run(accessor: ServicesAccessor, ...args: unknown[]) {
			const chatWidgetService = accessor.get(IChatWidgetService);
			const clipboardService = accessor.get(IClipboardService);

			const widget = chatWidgetService.lastFocusedWidget;
			let item = args[0] as ChatTreeItem | undefined;
			if (!isChatTreeItem(item)) {
				item = widget?.getFocus();
				if (!item) {
					return;
				}
			}

			// Try to find a KaTeX element from the selection or active element
			let selectedElement: Node | null = null;

			// If there is a selection, and focus is inside the widget, extract the inner KaTeX element.
			const activeElement = dom.getActiveElement();
			const nativeSelection = dom.getActiveWindow().getSelection();
			if (widget && nativeSelection && nativeSelection.rangeCount > 0 && dom.isAncestor(activeElement, widget.domNode)) {
				const range = nativeSelection.getRangeAt(0);
				selectedElement = range.commonAncestorContainer;

				// If it's a text node, get its parent element
				if (selectedElement.nodeType === Node.TEXT_NODE) {
					selectedElement = selectedElement.parentElement;
				}
			}

			// Otherwise, fallback to querying from the active element
			if (!selectedElement) {
				// eslint-disable-next-line no-restricted-syntax
				selectedElement = activeElement?.querySelector(`.${katexContainerClassName}`) ?? null;
			}

			// Extract the LaTeX source from the annotation element
			const katexElement = dom.isHTMLElement(selectedElement) ? selectedElement.closest(`.${katexContainerClassName}`) : null;
			const latexSource = katexElement?.getAttribute(katexContainerLatexAttributeName) || '';
			if (latexSource) {
				await clipboardService.writeText(latexSource);
			}
		}
	});
}
