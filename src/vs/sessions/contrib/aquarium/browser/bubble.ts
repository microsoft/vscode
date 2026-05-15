/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';

/** Maximum number of glyphs we render in a single bubble. */
const BUBBLE_MAX_TEXT_LENGTH = 80;

/** Default time the bubble stays at full opacity before fading out, in ms. */
export const BUBBLE_DEFAULT_DWELL_MS = 3500;

/** CSS-driven fade-out duration. Must match the `.agents-aquarium-bubble.fade-out` rule. */
export const BUBBLE_FADE_OUT_MS = 300;

/** Vertical offset above the fish where the bubble renders, in pixels. */
const BUBBLE_VERTICAL_OFFSET_PX = 8;

/**
 * A small chat-bubble that hovers above a fish, used by the sessions-aware
 * aquarium to surface the session's current activity.
 *
 * The bubble owns its DOM element; the engine is responsible for positioning
 * it each frame via {@link Bubble.setPosition}. Lifecycle is otherwise
 * self-contained: a dwell timer, an explicit hover lock, and an idempotent
 * fade-out path.
 */
export class Bubble extends Disposable {

	readonly element: HTMLDivElement;

	private readonly _textEl: HTMLSpanElement;

	private _dwellTimer: ReturnType<typeof setTimeout> | undefined;
	private _fadeTimer: ReturnType<typeof setTimeout> | undefined;
	private _hovered = false;
	private _fading = false;
	private _disposed = false;

	/** Wall-clock time the bubble was created. Used by the engine's eviction policy. */
	readonly createdAt: number;

	constructor(
		targetDocument: Document,
		container: HTMLElement,
		text: string,
		private readonly _onExpired: () => void,
	) {
		super();

		this.createdAt = Date.now();

		this.element = targetDocument.createElement('div');
		this.element.className = 'agents-aquarium-bubble';
		this.element.setAttribute('aria-hidden', 'true');

		this._textEl = targetDocument.createElement('span');
		this._textEl.className = 'agents-aquarium-bubble-text';
		this.element.appendChild(this._textEl);

		this._textEl.textContent = truncate(text);

		container.appendChild(this.element);
		this._restartDwell();
	}

	/** Replace the text and reset the dwell timer; visually a "still here" pulse. */
	setText(text: string): void {
		if (this._disposed) {
			return;
		}
		const truncated = truncate(text);
		if (this._textEl.textContent === truncated && !this._fading) {
			// Same text, still showing — no-op so we don't restart the dwell on
			// every observable tick.
			return;
		}
		this._textEl.textContent = truncated;
		// If we were already fading out, cancel and re-show.
		if (this._fading) {
			this._fading = false;
			this.element.classList.remove('fade-out');
			if (this._fadeTimer !== undefined) {
				clearTimeout(this._fadeTimer);
				this._fadeTimer = undefined;
			}
		}
		this._restartDwell();
	}

	/** Position the bubble centered above a fish at (fishX, fishY) of size {@linkcode fishSize}. */
	setPosition(fishX: number, fishY: number, fishSize: number): void {
		const cx = fishX + fishSize / 2;
		const top = fishY - BUBBLE_VERTICAL_OFFSET_PX;
		this.element.style.transform = `translate(${cx.toFixed(2)}px, ${top.toFixed(2)}px) translate(-50%, -100%)`;
	}

	setHovered(hovered: boolean): void {
		if (this._hovered === hovered || this._disposed) {
			return;
		}
		this._hovered = hovered;
		if (hovered) {
			// Pause both timers; the bubble stays until the user moves away.
			if (this._dwellTimer !== undefined) {
				clearTimeout(this._dwellTimer);
				this._dwellTimer = undefined;
			}
			if (this._fadeTimer !== undefined) {
				clearTimeout(this._fadeTimer);
				this._fadeTimer = undefined;
			}
			if (this._fading) {
				this._fading = false;
				this.element.classList.remove('fade-out');
			}
		} else {
			// Re-arm the dwell so we don't linger forever after the user's gone.
			this._restartDwell();
		}
	}

	/** Begin a fade-out and dispose when it completes. Idempotent. */
	fadeOut(): void {
		if (this._fading || this._disposed) {
			return;
		}
		this._fading = true;
		if (this._dwellTimer !== undefined) {
			clearTimeout(this._dwellTimer);
			this._dwellTimer = undefined;
		}
		this.element.classList.add('fade-out');
		this._fadeTimer = setTimeout(() => {
			this._fadeTimer = undefined;
			this.dispose();
			this._onExpired();
		}, BUBBLE_FADE_OUT_MS);
	}

	override dispose(): void {
		if (this._disposed) {
			return;
		}
		this._disposed = true;
		if (this._dwellTimer !== undefined) {
			clearTimeout(this._dwellTimer);
			this._dwellTimer = undefined;
		}
		if (this._fadeTimer !== undefined) {
			clearTimeout(this._fadeTimer);
			this._fadeTimer = undefined;
		}
		this.element.remove();
		super.dispose();
	}

	get isFading(): boolean {
		return this._fading;
	}

	get isHovered(): boolean {
		return this._hovered;
	}

	private _restartDwell(): void {
		if (this._dwellTimer !== undefined) {
			clearTimeout(this._dwellTimer);
		}
		this._dwellTimer = setTimeout(() => {
			this._dwellTimer = undefined;
			if (!this._hovered) {
				this.fadeOut();
			}
		}, BUBBLE_DEFAULT_DWELL_MS);
	}
}

function truncate(text: string): string {
	const trimmed = text.trim();
	if (trimmed.length <= BUBBLE_MAX_TEXT_LENGTH) {
		return trimmed;
	}
	// Trim mid-word but keep visual rhythm; the trailing ellipsis is a single
	// glyph so the visible width stays bounded.
	return trimmed.slice(0, BUBBLE_MAX_TEXT_LENGTH - 1) + '…';
}
