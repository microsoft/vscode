/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { html, nothing, type TemplateResult } from '../../../../../base/common/lit-html/lit-html.js';
import type { ITranscriptTurn } from '../../../chat/browser/voiceClient/voiceSessionController.js';
import { COLOR, FONT_SIZE } from './tokens.js';

const MAX_LINES = 10;
const LINE_HEIGHT = 1.4;
const MAX_HEIGHT = `${MAX_LINES * LINE_HEIGHT}em`;
const FADE_PX = 20;

// User turn: bottom-pinned chat-log style. The container is at most MAX_HEIGHT
// tall; if the inner content is taller, it overflows off the TOP and the fade
// mask (toggled at runtime when overflowing) hints at the truncation.
const USER_CONTAINER_STYLE = [
	`max-height:${MAX_HEIGHT}`,
	'overflow:hidden',
	'display:flex',
	'flex-direction:column-reverse',
].join(';');

// Assistant turn: classic multi-line line-clamp with trailing ellipsis.
const ASSISTANT_STYLE = [
	'display:-webkit-box',
	`-webkit-line-clamp:${MAX_LINES}`,
	'-webkit-box-orient:vertical',
	'overflow:hidden',
	`color:${COLOR.assistantTranscript}`,
].join(';');

const TRANSCRIPT_STYLE = `
	@keyframes textPulse { 0%,100%{opacity:0.9} 50%{opacity:0.4} }
	.voice-user-transcript.overflowing {
		mask-image: linear-gradient(to bottom, transparent, black ${FADE_PX}px);
		-webkit-mask-image: linear-gradient(to bottom, transparent, black ${FADE_PX}px);
	}
`;

export interface TranscriptProps {
	readonly turns: readonly ITranscriptTurn[];
}

export function renderTranscript(props: TranscriptProps): TemplateResult | typeof nothing {
	// Skip empty user turns (e.g. PTT pressed but no speech yet) so the layout
	// doesn't reserve space for nothing.
	let visible = props.turns.filter(t => t.text.length > 0 || (t.speaker === 'user' && t.isPartial));

	// If the last two visible turns are both assistant, only show the latest one.
	// Back-to-back user turns are kept (e.g. user correcting themselves).
	if (visible.length >= 2 &&
		visible[visible.length - 1].speaker === 'assistant' &&
		visible[visible.length - 2].speaker === 'assistant') {
		visible = [visible[visible.length - 1]];
	}
	if (visible.length === 0) {
		return nothing;
	}

	return html`
		<div style="display:flex;flex-direction:column;gap:2px;padding:2px 2px 4px;font-size:${FONT_SIZE.body};line-height:${LINE_HEIGHT};word-break:break-word;">
			${visible.map(turn => turn.speaker === 'user' ? renderUserTurn(turn) : renderAssistantTurn(turn))}
		</div>
		<style>${TRANSCRIPT_STYLE}</style>
	`;
}

function renderUserTurn(turn: ITranscriptTurn): TemplateResult {
	let inner: TemplateResult;
	if (!turn.isPartial) {
		inner = html`<span style="color:${COLOR.userTranscript};">${turn.text}</span>`;
	} else {
		const unsure = turn.committed ? turn.text.slice(turn.committed.length) : turn.text;
		const committedPart = turn.committed ? html`<span style="color:${COLOR.userTranscript};">${turn.committed}</span>` : nothing;
		// allow-any-unicode-next-line
		const unsurePart = html`<span style="color:${COLOR.userTranscript};opacity:0.6;font-style:italic;animation:textPulse 1.5s ease-in-out infinite;">${unsure}<span style="font-style:normal;">&#9611;</span></span>`;
		inner = html`${committedPart}${unsurePart}`;
	}

	return html`<div class="voice-user-transcript" style="${USER_CONTAINER_STYLE};"><div>${inner}</div></div>`;
}

function renderAssistantTurn(turn: ITranscriptTurn): TemplateResult {
	return html`<div style="${ASSISTANT_STYLE};">${turn.text}</div>`;
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
