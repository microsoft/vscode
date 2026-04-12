/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as DOM from '../../../../../base/browser/dom.js';
import { BreadcrumbsItem } from '../../../../../base/browser/ui/breadcrumbs/breadcrumbsWidget.js';
import { RawContextKey } from '../../../../../platform/contextkey/common/contextkey.js';
const $ = DOM.$;
export var ViewState;
(function (ViewState) {
    ViewState["Home"] = "home";
    ViewState["Overview"] = "overview";
    ViewState["Logs"] = "logs";
    ViewState["FlowChart"] = "flowchart";
})(ViewState || (ViewState = {}));
export var LogsViewMode;
(function (LogsViewMode) {
    LogsViewMode["List"] = "list";
    LogsViewMode["Tree"] = "tree";
})(LogsViewMode || (LogsViewMode = {}));
export const CHAT_DEBUG_FILTER_ACTIVE = new RawContextKey('chatDebugFilterActive', false);
export const CHAT_DEBUG_KIND_TOOL_CALL = new RawContextKey('chatDebug.kindToolCall', true);
export const CHAT_DEBUG_KIND_MODEL_TURN = new RawContextKey('chatDebug.kindModelTurn', true);
export const CHAT_DEBUG_KIND_PROMPT_DISCOVERY = new RawContextKey('chatDebug.kindPromptDiscovery', true);
export const CHAT_DEBUG_KIND_SUBAGENT = new RawContextKey('chatDebug.kindSubagent', true);
// Filter toggle command IDs
export const CHAT_DEBUG_CMD_TOGGLE_TOOL_CALL = 'chatDebug.filter.toggleToolCall';
export const CHAT_DEBUG_CMD_TOGGLE_MODEL_TURN = 'chatDebug.filter.toggleModelTurn';
export const CHAT_DEBUG_CMD_TOGGLE_PROMPT_DISCOVERY = 'chatDebug.filter.togglePromptDiscovery';
export const CHAT_DEBUG_CMD_TOGGLE_SUBAGENT = 'chatDebug.filter.toggleSubagent';
export class TextBreadcrumbItem extends BreadcrumbsItem {
    constructor(_text, _isLink = false) {
        super();
        this._text = _text;
        this._isLink = _isLink;
    }
    equals(other) {
        return other instanceof TextBreadcrumbItem && other._text === this._text;
    }
    dispose() {
        // Nothing to dispose
    }
    render(container) {
        container.classList.add('chat-debug-breadcrumb-item');
        if (this._isLink) {
            container.classList.add('chat-debug-breadcrumb-item-link');
        }
        DOM.append(container, $('span.chat-debug-breadcrumb-item-label', undefined, this._text));
    }
}
/**
 * Wire up Left/Right arrow, Home/End, and Enter keyboard navigation
 * on a BreadcrumbsWidget container.
 */
export function setupBreadcrumbKeyboardNavigation(container, widget) {
    return DOM.addDisposableListener(container, DOM.EventType.KEY_DOWN, (e) => {
        switch (e.key) {
            case 'ArrowLeft':
                e.preventDefault();
                widget.focusPrev();
                break;
            case 'ArrowRight':
                e.preventDefault();
                widget.focusNext();
                break;
            case 'Home':
                e.preventDefault();
                widget.setFocused(widget.getItems()[0]);
                break;
            case 'End': {
                e.preventDefault();
                const items = widget.getItems();
                widget.setFocused(items[items.length - 1]);
                break;
            }
            case 'Enter':
            case ' ': {
                e.preventDefault();
                const focused = widget.getFocused();
                if (focused) {
                    widget.setSelection(focused);
                }
                break;
            }
        }
    });
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdERlYnVnVHlwZXMuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9jaGF0L2Jyb3dzZXIvY2hhdERlYnVnL2NoYXREZWJ1Z1R5cGVzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sS0FBSyxHQUFHLE1BQU0sb0NBQW9DLENBQUM7QUFDMUQsT0FBTyxFQUFFLGVBQWUsRUFBcUIsTUFBTSxpRUFBaUUsQ0FBQztBQUdySCxPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0seURBQXlELENBQUM7QUFHeEYsTUFBTSxDQUFDLEdBQUcsR0FBRyxDQUFDLENBQUMsQ0FBQztBQWFoQixNQUFNLENBQU4sSUFBa0IsU0FLakI7QUFMRCxXQUFrQixTQUFTO0lBQzFCLDBCQUFhLENBQUE7SUFDYixrQ0FBcUIsQ0FBQTtJQUNyQiwwQkFBYSxDQUFBO0lBQ2Isb0NBQXVCLENBQUE7QUFDeEIsQ0FBQyxFQUxpQixTQUFTLEtBQVQsU0FBUyxRQUsxQjtBQUVELE1BQU0sQ0FBTixJQUFrQixZQUdqQjtBQUhELFdBQWtCLFlBQVk7SUFDN0IsNkJBQWEsQ0FBQTtJQUNiLDZCQUFhLENBQUE7QUFDZCxDQUFDLEVBSGlCLFlBQVksS0FBWixZQUFZLFFBRzdCO0FBRUQsTUFBTSxDQUFDLE1BQU0sd0JBQXdCLEdBQUcsSUFBSSxhQUFhLENBQVUsdUJBQXVCLEVBQUUsS0FBSyxDQUFDLENBQUM7QUFDbkcsTUFBTSxDQUFDLE1BQU0seUJBQXlCLEdBQUcsSUFBSSxhQUFhLENBQVUsd0JBQXdCLEVBQUUsSUFBSSxDQUFDLENBQUM7QUFDcEcsTUFBTSxDQUFDLE1BQU0sMEJBQTBCLEdBQUcsSUFBSSxhQUFhLENBQVUseUJBQXlCLEVBQUUsSUFBSSxDQUFDLENBQUM7QUFDdEcsTUFBTSxDQUFDLE1BQU0sZ0NBQWdDLEdBQUcsSUFBSSxh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