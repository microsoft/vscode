/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as dom from '../../../../../base/browser/dom.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { localize2 } from '../../../../../nls.js';
import { Action2, MenuId, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { IClipboardService } from '../../../../../platform/clipboard/common/clipboardService.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { katexContainerClassName, katexContainerLatexAttributeName } from '../../../markdown/common/markedKatexExtension.js';
import { ChatContextKeys } from '../../common/actions/chatContextKeys.js';
import { isChatTreeItem, isRequestVM, isResponseVM } from '../../common/model/chatViewModel.js';
import { IChatWidgetService } from '../chat.js';
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
        run(accessor, context) {
            const clipboardService = accessor.get(IClipboardService);
            const chatWidgetService = accessor.get(IChatWidgetService);
            const widget = ((isRequestVM(context) || isResponseVM(context)) && chatWidgetService.getWidgetBySessionResource(context.sessionResource)) || chatWidgetService.lastFocusedWidget;
            if (widget) {
                const viewModel = widget.viewModel;
                const sessionAsText = viewModel?.getItems()
                    .filter((item) => isRequestVM(item) || (isResponseVM(item) && !item.errorDetails?.responseIsFiltered))
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
                icon: Codicon.copy,
                menu: [
                    {
                        id: MenuId.ChatContext,
                        when: ChatContextKeys.responseIsFiltered.negate(),
                        group: 'copy',
                    },
                    {
                        id: MenuId.ChatMessageFooter,
                        group: 'navigation',
                        order: 1,
                        when: ContextKeyExpr.and(ChatContextKeys.isResponse, ChatContextKeys.responseIsFiltered.negate()),
                    }
                ]
            });
        }
        async run(accessor, ...args) {
            const chatWidgetService = accessor.get(IChatWidgetService);
            const clipboardService = accessor.get(IClipboardService);
            const widget = chatWidgetService.lastFocusedWidget;
            let item = args[0];
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
            if (!isRequestVM(item) && !isResponseVM(item)) {
                return;
            }
            const text = stringifyItem(item, false);
            await clipboardService.writeText(text);
        }
    });
    registerAction2(class CopyFinalResponseAction extends Action2 {
        constructor() {
            super({
                id: 'workbench.action.chat.copyFinalResponse',
                title: localize2('interactive.copyFinalResponse.label', "Copy Final Response"),
                f1: false,
                category: CHAT_CATEGORY,
                menu: {
                    id: MenuId.ChatContext,
                    when: ContextKeyExpr.and(ChatContextKeys.isResponse, ChatContextKeys.responseIsFiltered.negate()),
                    group: 'copy',
                }
            });
        }
        async run(accessor, ...args) {
            const chatWidgetService = accessor.get(IChatWidgetService);
            const clipboardService = accessor.get(IClipboardService);
            const widget = chatWidgetService.lastFocusedWidget;
            let item = args[0];
            if (!isChatTreeItem(item)) {
                item = widget?.getFocus();
                if (!item) {
                    return;
                }
            }
            if (!isResponseVM(item)) {
                return;
            }
            const text = item.response.getFinalResponse();
            if (text) {
                await clipboardService.writeText(text);
            }
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
        async run(accessor, ...args) {
            const chatWidgetService = accessor.get(IChatWidgetService);
            const clipboardService = accessor.get(IClipboardService);
            const widget = chatWidgetService.lastFocusedWidget;
            let item = args[0];
            if (!isChatTreeItem(item)) {
                item = widget?.getFocus();
                if (!item) {
                    return;
                }
            }
            // Try to find a KaTeX element from the selection or active element
            let selectedElement = null;
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdENvcHlBY3Rpb25zLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9icm93c2VyL2FjdGlvbnMvY2hhdENvcHlBY3Rpb25zLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sS0FBSyxHQUFHLE1BQU0sb0NBQW9DLENBQUM7QUFDMUQsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBRWpFLE9BQU8sRUFBRSxTQUFTLEVBQUUsTUFBTSx1QkFBdUIsQ0FBQztBQUNsRCxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sRUFBRSxlQUFlLEVBQUUsTUFBTSxtREFBbUQsQ0FBQztBQUNyRyxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSw4REFBOEQsQ0FBQztBQUNqRyxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0seURBQXlELENBQUM7QUFDekYsT0FBTyxFQUFFLHVCQUF1QixFQUFFLGdDQUFnQyxFQUFFLE1BQU0sa0RBQWtELENBQUM7QUFDN0gsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQzFFLE9BQU8sRUFBaUQsY0FBYyxFQUFFLFdBQVcsRUFBRSxZQUFZLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUMvSSxPQUFPLEVBQWdCLGtCQUFrQixFQUFFLE1BQU0sWUFBWSxDQUFDO0FBQzlELE9BQU8sRUFBRSxhQUFhLEVBQUUsYUFBYSxFQUFFLE1BQU0sa0JBQWtCLENBQUM7QUFFaEUsTUFBTSxVQUFVLHVCQUF1QjtJQUN0QyxlQUFlLENBQUMsTUFBTSxhQUFjLFNBQVEsT0FBTztRQUNsRDtZQUNDLEtBQUssQ0FBQztnQkFDTCxFQUFFLEVBQUUsK0JBQStCO2dCQUNuQyxLQUFLLEVBQUUsU0FBUyxDQUFDLDJCQUEyQixFQUFFLFVBQVUsQ0FBQztnQkFD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