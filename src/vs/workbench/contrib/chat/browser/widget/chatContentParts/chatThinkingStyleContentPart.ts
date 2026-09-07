/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $ } from '../../../../../../base/browser/dom.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { autorun } from '../../../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../../../base/common/themables.js';
import { getCompactCodicon } from '../../chatIcons.js';
import { ChatCollapsibleContentPart } from './chatCollapsibleContentPart.js';
// NOTE: the chrome's stylesheet is deliberately NOT imported here. It is owned by
// `chatThinkingContentPart.ts`, and pulling it in from this base would hoist a
// large stylesheet earlier in the bundle and change the cascade for everything
// that currently loads after it.

/**
 * A collapsible row styled like the "Thinking" row: a status dot and shimmering
 * title while it is working, a checkmark once it settles, and an indented list
 * of items as its body.
 *
 * Subclasses own *what* the row says; this owns how it looks and how its header
 * reflects working/settled state.
 */
export abstract class ChatThinkingStyleContentPart extends ChatCollapsibleContentPart {

	private _thinkingActive = false;
	private _shimmerSpan: HTMLElement | undefined;

	/** Whether the row is still working. */
	protected get thinkingActive(): boolean {
		return this._thinkingActive;
	}

	protected override init(): HTMLElement {
		const node = super.init();
		node.classList.add('chat-thinking-box');
		node.classList.toggle('chat-thinking-active', this._thinkingActive);
		this._register(autorun(reader => {
			const expanded = this.expanded.read(reader);
			if (this._collapseButton) {
				this._collapseButton.icon = this.getThinkingIcon(this._thinkingActive, expanded);
			}
		}));
		return node;
	}

	/**
	 * Marks the row as working or settled, updating the status class and icon.
	 * Safe to call before the row is rendered.
	 */
	protected setThinkingActive(active: boolean): void {
		this._thinkingActive = active;
		this.domNode.classList.toggle('chat-thinking-active', active);
		if (this._collapseButton) {
			this._collapseButton.icon = this.getThinkingIcon(active, this.isExpanded());
		}
	}

	/**
	 * The header icon for a given state. The default settles to a checkmark and
	 * shows a status dot while working; override to vary while working.
	 */
	protected getThinkingIcon(active: boolean, _expanded: boolean): ThemeIcon {
		return active ? Codicon.circleFilledCompact : Codicon.checkCompact;
	}

	/**
	 * Renders the title as a shimmering span, reusing the existing one so the
	 * animation does not restart on every update.
	 */
	protected setShimmerTitle(text: string): void {
		const labelElement = this._collapseButton?.labelElement;
		if (!labelElement) {
			return;
		}
		if (!this._shimmerSpan?.parentElement) {
			labelElement.textContent = '';
			this._shimmerSpan = $('span.chat-thinking-title-shimmer');
			labelElement.appendChild(this._shimmerSpan);
		}
		this._shimmerSpan.textContent = text;
	}

	/**
	 * Drops the reference to the shimmering title, for callers that rebuild the
	 * label as static content. Does not touch the DOM.
	 */
	protected forgetShimmerTitle(): void {
		this._shimmerSpan = undefined;
	}

	/** The indented list that thinking-style rows put their items in. */
	protected createThinkingBody(): HTMLElement {
		return $('.chat-used-context-list.chat-thinking-collapsible');
	}

	/** A single body row, prefixed with the chain-of-thought dot. */
	protected createThinkingRow(icon: ThemeIcon = Codicon.circleFilled): HTMLElement {
		const row = $('.chat-thinking-item.markdown-content');
		row.appendChild(createThinkingIcon(icon));
		return row;
	}

	/**
	 * The shimmering "still working" row that tails the body. The label is
	 * returned so callers can cycle its message while the row lives.
	 */
	protected createThinkingSpinnerRow(message: string): { readonly row: HTMLElement; readonly label: HTMLElement } {
		const row = $('.chat-thinking-item.chat-thinking-spinner-item');
		row.appendChild(createThinkingIcon(Codicon.circleFilled));
		const label = $('span.chat-thinking-spinner-label');
		label.textContent = message;
		row.appendChild(label);
		return { row, label };
	}
}

export function createThinkingIcon(icon: ThemeIcon): HTMLElement {
	const iconElement = $('span.chat-thinking-icon');
	iconElement.classList.add(...ThemeIcon.asClassNameArray(getCompactCodicon(icon)));
	return iconElement;
}
