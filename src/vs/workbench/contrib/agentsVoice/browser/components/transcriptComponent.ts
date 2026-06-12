/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
import type { ITranscriptTurn } from '../../../chat/browser/voiceClient/voiceSessionController.js';
import { COLOR, FONT_SIZE } from './tokens.js';

const MAX_LINES = 10;
const LINE_HEIGHT = 1.4;
const MAX_HEIGHT = `${MAX_LINES * LINE_HEIGHT}em`;
const FADE_PX = 20;

const USER_CONTAINER_STYLE = [
	`max-height:${MAX_HEIGHT}`,
	'overflow:hidden',
	'display:flex',
	'flex-direction:column-reverse',
].join(';');

const ASSISTANT_STYLE = [
	'display:-webkit-box',
	`-webkit-line-clamp:${MAX_LINES}`,
	'-webkit-box-orient:vertical',
	'overflow:hidden',
	`color:${COLOR.assistantTranscript}`,
].join(';');

const TRANSCRIPT_CSS = `
	@keyframes textPulse { 0%,100%{opacity:0.9} 50%{opacity:0.4} }
	.voice-user-transcript.overflowing {
		mask-image: linear-gradient(to bottom, transparent, black ${FADE_PX}px);
		-webkit-mask-image: linear-gradient(to bottom, transparent, black ${FADE_PX}px);
	}
`;

export interface TranscriptProps {
	readonly turns: readonly ITranscriptTurn[];
}

function createUserTurn(turn: ITranscriptTurn): HTMLElement {
	const wrapper = dom.$('div.voice-user-transcript');
	wrapper.style.cssText = USER_CONTAINER_STYLE;

	const inner = dom.$('div');
	if (!turn.isPartial) {
		const span = dom.$('span');
		span.style.color = COLOR.userTranscript;
		span.textContent = turn.text;
		inner.append(span);
	} else {
		const unsure = turn.committed ? turn.text.slice(turn.committed.length) : turn.text;
		if (turn.committed) {
			const committedSpan = dom.$('span');
			committedSpan.style.color = COLOR.userTranscript;
			committedSpan.textContent = turn.committed;
			inner.append(committedSpan);
		}
		const unsureSpan = dom.$('span');
		unsureSpan.style.cssText = `color:${COLOR.userTranscript};opacity:0.6;font-style:italic;animation:textPulse 1.5s ease-in-out infinite;`;
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

function createAssistantTurn(turn: ITranscriptTurn): HTMLElement {
	const el = dom.$('div');
	el.style.cssText = ASSISTANT_STYLE;
	el.textContent = turn.text;
	return el;
}

export interface TranscriptComponent {
	readonly element: HTMLElement;
	update(props: TranscriptProps): void;
}

export function createTranscript(): TranscriptComponent {
	const wrapper = dom.$('div');
	const container = dom.$('div');
	container.style.cssText = `display:flex;flex-direction:column;gap:2px;padding:2px 2px 4px;font-size:${FONT_SIZE.body};line-height:${LINE_HEIGHT};word-break:break-word;`;

	const style = dom.$('style');
	style.textContent = TRANSCRIPT_CSS;
	wrapper.append(style, container);

	return {
		element: wrapper,
		update(props: TranscriptProps) {
			let visible = props.turns.filter(t => t.text.length > 0 || (t.speaker === 'user' && t.isPartial));
			if (visible.length >= 2 &&
				visible[visible.length - 1].speaker === 'assistant' &&
				visible[visible.length - 2].speaker === 'assistant') {
				visible = [visible[visible.length - 1]];
			}
			dom.clearNode(container);
			if (visible.length === 0) {
				container.style.display = 'none';
				return;
			}
			container.style.display = 'flex';
			for (const turn of visible) {
				container.append(turn.speaker === 'user' ? createUserTurn(turn) : createAssistantTurn(turn));
			}
		}
	};
}

/**
 * Toggle the `overflowing` class on each user-transcript container based on
 * whether its inner child exceeds its clipped height. Call after each render.
 */
export function updateTranscriptOverflowState(container: HTMLElement): void {
	// eslint-disable-next-line no-restricted-syntax
	const containers = container.querySelectorAll('.voice-user-transcript');
	containers.forEach(el => {
		const inner = el.firstElementChild as HTMLElement | null;
		if (!inner) { return; }
		el.classList.toggle('overflowing', inner.scrollHeight > (el as HTMLElement).clientHeight);
	});
}
