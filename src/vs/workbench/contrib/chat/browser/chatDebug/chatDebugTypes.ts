/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from '../../../../../base/browser/dom.js';
import { BreadcrumbsItem, BreadcrumbsWidget } from '../../../../../base/browser/ui/breadcrumbs/breadcrumbsWidget.js';
import { IDisposable } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { RawContextKey } from '../../../../../platform/contextkey/common/contextkey.js';
import { IEditorOptions } from '../../../../../platform/editor/common/editor.js';

const $ = DOM.$;

/**
 * Options passed to the chat debug editor pane to control
 * which session and view to navigate to.
 */
export interface IChatDebugEditorOptions extends IEditorOptions {
	readonly sessionResource?: URI;
	readonly viewHint?: 'home' | 'overview' | 'logs' | 'flowchart';
}

export const enum ViewState {
	Home = 'home',
	Overview = 'overview',
	Logs = 'logs',
	FlowChart = 'flowchart',
}

export const enum LogsViewMode {
	List = 'list',
	Tree = 'tree',
}

export const CHAT_DEBUG_FILTER_ACTIVE = new RawContextKey<boolean>('chatDebugFilterActive', false);
export const CHAT_DEBUG_KIND_TOOL_CALL = new RawContextKey<boolean>('chatDebug.kindToolCall', true);
export const CHAT_DEBUG_KIND_MODEL_TURN = new RawContextKey<boolean>('chatDebug.kindModelTurn', true);
export const CHAT_DEBUG_KIND_GENERIC = new RawContextKey<boolean>('chatDebug.kindGeneric', true);
export const CHAT_DEBUG_KIND_SUBAGENT = new RawContextKey<boolean>('chatDebug.kindSubagent', true);
export const CHAT_DEBUG_KIND_USER_MESSAGE = new RawContextKey<boolean>('chatDebug.kindUserMessage', true);
export const CHAT_DEBUG_KIND_AGENT_RESPONSE = new RawContextKey<boolean>('chatDebug.kindAgentResponse', true);
export const CHAT_DEBUG_LEVEL_TRACE = new RawContextKey<boolean>('chatDebug.levelTrace', true);
export const CHAT_DEBUG_LEVEL_INFO = new RawContextKey<boolean>('chatDebug.levelInfo', true);
export const CHAT_DEBUG_LEVEL_WARNING = new RawContextKey<boolean>('chatDebug.levelWarning', true);
export const CHAT_DEBUG_LEVEL_ERROR = new RawContextKey<boolean>('chatDebug.levelError', true);

// Filter toggle command IDs
export const CHAT_DEBUG_CMD_TOGGLE_TOOL_CALL = 'chatDebug.filter.toggleToolCall';
export const CHAT_DEBUG_CMD_TOGGLE_MODEL_TURN = 'chatDebug.filter.toggleModelTurn';
export const CHAT_DEBUG_CMD_TOGGLE_GENERIC = 'chatDebug.filter.toggleGeneric';
export const CHAT_DEBUG_CMD_TOGGLE_SUBAGENT = 'chatDebug.filter.toggleSubagent';
export const CHAT_DEBUG_CMD_TOGGLE_USER_MESSAGE = 'chatDebug.filter.toggleUserMessage';
export const CHAT_DEBUG_CMD_TOGGLE_AGENT_RESPONSE = 'chatDebug.filter.toggleAgentResponse';
export const CHAT_DEBUG_CMD_TOGGLE_TRACE = 'chatDebug.filter.toggleTrace';
export const CHAT_DEBUG_CMD_TOGGLE_INFO = 'chatDebug.filter.toggleInfo';
export const CHAT_DEBUG_CMD_TOGGLE_WARNING = 'chatDebug.filter.toggleWarning';
export const CHAT_DEBUG_CMD_TOGGLE_ERROR = 'chatDebug.filter.toggleError';

export class TextBreadcrumbItem extends BreadcrumbsItem {
	constructor(
		private readonly _text: string,
		private readonly _isLink: boolean = false,
	) {
		super();
	}

	equals(other: BreadcrumbsItem): boolean {
		return other instanceof TextBreadcrumbItem && other._text === this._text;
	}

	dispose(): void {
		// Nothing to dispose
	}

	render(container: HTMLElement): void {
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
export function setupBreadcrumbKeyboardNavigation(container: HTMLElement, widget: BreadcrumbsWidget): IDisposable {
	return DOM.addDisposableListener(container, DOM.EventType.KEY_DOWN, (e: KeyboardEvent) => {
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
