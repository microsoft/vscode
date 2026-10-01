/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { raceTimeout } from '../../../../base/common/async.js';
import { getWindow } from '../../../../base/browser/dom.js';
import { DisposableStore, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { ChatTreeItem, IChatWidget, IChatWidgetService } from '../../../../workbench/contrib/chat/browser/chat.js';
import { IChatProgressResponseContent } from '../../../../workbench/contrib/chat/common/model/chatModel.js';
import { isRequestVM, isResponseVM } from '../../../../workbench/contrib/chat/common/model/chatViewModel.js';
import { whenChatWidgetForSession } from '../../chat/browser/chatWidgetUtils.js';

const TURN_HIGHLIGHT_CLASS = 'session-comparison-turn-highlight';
const TURN_HIGHLIGHT_DURATION_MS = 1600;

/** Where in a run's transcript a comparison reference points. */
export interface ISessionTurnTarget {
	/** Repository-relative files; the turn that first edited one of them is revealed. */
	readonly files?: readonly string[];
}

function getEditedResource(part: IChatProgressResponseContent): URI | undefined {
	switch (part.kind) {
		case 'externalEdit':
		case 'textEditGroup':
			return part.uri;
		default:
			return undefined;
	}
}

function isSameFile(resource: URI, file: string): boolean {
	const normalized = file.replace(/\\/g, '/').replace(/^\.?\//, '');
	return resource.path === normalized || resource.path.endsWith(`/${normalized}`);
}

/**
 * The turn a reference points at: the response that first edited one of the
 * target's files, otherwise the run's last response, which is where it
 * reports what it did.
 */
export function findSessionTurn(items: readonly ChatTreeItem[], target: ISessionTurnTarget | undefined): ChatTreeItem | undefined {
	const responses = items.filter(isResponseVM);
	const files = target?.files ?? [];
	if (files.length > 0) {
		const match = responses.find(response => response.response.value.some(part => {
			const resource = getEditedResource(part);
			return !!resource && files.some(file => isSameFile(resource, file));
		}));
		if (match) {
			return match;
		}
	}
	return responses.at(-1) ?? items.filter(isRequestVM).at(-1);
}

/**
 * Reveals and focuses the referenced turn in the chat already showing
 * `chatResource`, waiting for the transcript to load, then briefly highlights it
 * so the eye lands on it.
 */
export async function revealSessionTurn(chatWidgetService: IChatWidgetService, chatResource: URI, target: ISessionTurnTarget | undefined, timeoutMs = 10_000): Promise<boolean> {
	const widget = await whenChatWidgetForSession(chatWidgetService, chatResource, timeoutMs);
	const item = widget ? await whenSessionTurn(widget, target, timeoutMs) : undefined;
	if (!widget || !item) {
		return false;
	}
	widget.reveal(item);
	widget.focus(item);
	highlightFocusedTurn(widget);
	return true;
}

async function whenSessionTurn(widget: IChatWidget, target: ISessionTurnTarget | undefined, timeoutMs: number): Promise<ChatTreeItem | undefined> {
	const find = () => widget.viewModel ? findSessionTurn(widget.viewModel.getItems(), target) : undefined;
	const found = find();
	if (found) {
		return found;
	}
	const store = new DisposableStore();
	try {
		return await raceTimeout(new Promise<ChatTreeItem>(resolve => {
			const check = () => {
				const item = find();
				if (item) {
					resolve(item);
				}
			};
			const viewModelListener = store.add(new MutableDisposable());
			const listen = () => {
				viewModelListener.value = widget.viewModel?.onDidChange(check);
				check();
			};
			store.add(widget.onDidChangeViewModel(listen));
			listen();
		}), timeoutMs);
	} finally {
		store.dispose();
	}
}

function highlightFocusedTurn(widget: IChatWidget): void {
	// The chat widget exposes no row elements, and focus has just moved to the turn's row.
	// eslint-disable-next-line no-restricted-syntax
	const row = widget.domNode.querySelector<HTMLElement>('.monaco-list-row.focused');
	if (!row) {
		return;
	}
	row.classList.remove(TURN_HIGHLIGHT_CLASS);
	// Restart the animation when the same turn is revealed twice in a row.
	void row.offsetWidth;
	row.classList.add(TURN_HIGHLIGHT_CLASS);
	getWindow(row).setTimeout(() => row.classList.remove(TURN_HIGHLIGHT_CLASS), TURN_HIGHLIGHT_DURATION_MS);
}
