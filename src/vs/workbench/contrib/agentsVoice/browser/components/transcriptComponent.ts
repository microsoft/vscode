/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
import { DomScrollableElement } from '../../../../../base/browser/ui/scrollbar/scrollableElement.js';
import { ScrollbarVisibility } from '../../../../../base/common/scrollable.js';
import { DisposableStore, IDisposable } from '../../../../../base/common/lifecycle.js';
import type { ITranscriptTurn } from '../../../chat/browser/voiceClient/voiceSessionController.js';
import { COLOR, FONT_SIZE } from './tokens.js';

const MAX_LINES = 10;
const LINE_HEIGHT = 1.4;
const MAX_HEIGHT = `${MAX_LINES * LINE_HEIGHT}em`;

const USER_CONTAINER_STYLE = [
	'overflow-x:hidden',
].join(';');

const ASSISTANT_STYLE = [
	'overflow-x:hidden',
	'white-space:pre-wrap',
	`color:${COLOR.assistantTranscript}`,
].join(';');

const TRANSCRIPT_CSS = `
	@keyframes textPulse { 0%,100%{opacity:0.9} 50%{opacity:0.4} }
`;

export interface TranscriptProps {
	readonly turns: readonly ITranscriptTurn[];
	readonly chatStyle?: boolean;
	/** When true, keep the scroll anchored to the top instead of the bottom. */
	readonly scrollToTop?: boolean;
}

function createUserTurn(turn: ITranscriptTurn, chatStyle?: boolean): HTMLElement {
	const wrapper = dom.$('div.voice-user-transcript');
	wrapper.style.cssText = USER_CONTAINER_STYLE;
	const userColor = chatStyle ? 'var(--vscode-foreground)' : COLOR.userTranscript;

	const inner = dom.$('div');
	if (!turn.isPartial) {
		const span = dom.$('span');
		span.style.color = userColor;
		span.textContent = turn.text;
		inner.append(span);
	} else {
		const unsure = turn.committed ? turn.text.slice(turn.committed.length) : turn.text;
		if (turn.committed) {
			const committedSpan = dom.$('span');
			committedSpan.style.color = userColor;
			committedSpan.textContent = turn.committed;
			inner.append(committedSpan);
		}
		const unsureSpan = dom.$('span');
		unsureSpan.style.cssText = `color:${userColor};opacity:0.6;font-style:italic;animation:textPulse 1.5s ease-in-out infinite;`;
		unsureSpan.textContent = unsure;
		const cursor = dom.$('span');
		cursor.style.fontStyle = 'normal';
		// allow-any-unicode-next-line
		cursor.textContent = '\u2589';
		unsureSpan.append(cursor);
		inner.append(unsureSpan);
	}
	wrapper.append(inner);
	return wrapper;
}

function createAssistantTurn(turn: ITranscriptTurn, chatStyle?: boolean): HTMLElement {
	const el = dom.$('div');
	if (chatStyle) {
		el.style.cssText = ASSISTANT_STYLE.replace(`color:${COLOR.assistantTranscript}`, 'color:var(--vscode-descriptionForeground)');
	} else {
		el.style.cssText = ASSISTANT_STYLE;
	}
	el.textContent = turn.text;
	return el;
}

export interface TranscriptComponent {
	readonly element: HTMLElement;
	update(props: TranscriptProps): void;
}

export function createTranscript(): TranscriptComponent & IDisposable {
	const store = new DisposableStore();
	const container = dom.$('div');
	container.style.cssText = `display:flex;flex-direction:column;gap:2px;padding:2px 2px 4px;font-size:${FONT_SIZE.body};line-height:${LINE_HEIGHT};word-break:break-word;max-height:${MAX_HEIGHT};overflow:hidden;box-sizing:border-box;`;
	const scrollable = store.add(new DomScrollableElement(container, {
		horizontal: ScrollbarVisibility.Hidden,
		vertical: ScrollbarVisibility.Auto,
	}));
	const wrapper = scrollable.getDomNode();
	wrapper.style.maxHeight = MAX_HEIGHT;

	const style = dom.$('style');
	style.textContent = TRANSCRIPT_CSS;
	wrapper.prepend(style);

	return {
		element: wrapper,
		update(props: TranscriptProps) {
			let visible = props.turns.filter(t => t.text.length > 0 || (t.speaker === 'user' && t.isPartial));
			if (visible.length >= 2 &&
				visible[visible.length - 1].speaker === 'assistant' &&
				visible[visible.length - 2].speaker === 'assistant') {
				visible = [visible[visible.length - 1]];
			}
			// In chat style, only show the most recent turn (matches collapsed behavior)
			if (props.chatStyle && visible.length > 0) {
				visible = [visible[visible.length - 1]];
			}
			dom.clearNode(container);
			if (visible.length === 0) {
				container.style.display = 'none';
				return;
			}
			container.style.display = 'flex';
			for (const turn of visible) {
				container.append(turn.speaker === 'user' ? createUserTurn(turn, props.chatStyle) : createAssistantTurn(turn, props.chatStyle));
			}
			scrollable.scanDomNode();
			scrollable.setScrollPosition({ scrollTop: props.scrollToTop ? 0 : container.scrollHeight });
		},
		dispose() {
			store.dispose();
		}
	};
}
