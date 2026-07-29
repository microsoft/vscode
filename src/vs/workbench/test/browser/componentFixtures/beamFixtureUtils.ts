/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, addDisposableListener, EventType } from '../../../../base/browser/dom.js';
import { DisposableStore, IDisposable, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { clamp } from '../../../../base/common/numbers.js';
import { applyBorderBeam, IBorderBeamOptions } from '../../../contrib/chat/browser/voiceClient/borderBeam/borderBeamElement.js';

/**
 * Shared helpers for the border-beam fixtures (voice glow, omni chat).
 *
 * These exist because the beam is awkward to drive from a fixture: the harness
 * suppresses animation for deterministic capture, and the effect owns
 * attributes on its host so it cannot simply be re-applied.
 */

/**
 * The fixture harness marks the container `disable-animations`
 * (`* { animation: none !important }`) so screenshots are deterministic. That
 * also kills every CSS-driven part of the beam — the fade-in that lifts
 * `--beam-opacity` off 0, the traveling-beam spin, and the hue drift — leaving
 * the effect invisible. Call this when a person is watching.
 */
export function enableAnimations(container: HTMLElement): void {
	container.classList.remove('disable-animations');
}

/**
 * Applies a beam to a host that may already carry one.
 *
 * `applyBorderBeam`'s disposable clears `data-beam`/`data-active` from its host,
 * so the previous beam has to be torn down *before* the replacement is created —
 * otherwise disposing the old one strips the new one's attributes off the shared
 * element and the effect silently dies.
 */
export function replaceBeam(slot: MutableDisposable<IDisposable>, host: HTMLElement, options: IBorderBeamOptions): void {
	slot.clear();
	slot.value = applyBorderBeam(host, options);
}


// ============================================================================
// Drag to resize
// ============================================================================

const MIN_BOX_WIDTH = 160;
const MIN_BOX_HEIGHT = 30;
const MAX_BOX_HEIGHT = 420;

/**
 * The grip is revealed on hover only, so screenshot fixtures (which never hover)
 * keep pixel-identical baselines while the explorer stays draggable.
 *
 * It hangs off the *wrapper*, not the input: several treatments set
 * `overflow: hidden` on the input to clip their glow to the edge, which would
 * also clip (and un-hit-test) a grip positioned outside the input's bounds.
 */
const RESIZE_HANDLE_CSS = `
.voice-beam-resize-cell { position: relative; }
.voice-beam-resize-handle {
	position: absolute;
	right: -7px;
	bottom: -7px;
	width: 14px;
	height: 14px;
	z-index: 5;
	cursor: nwse-resize;
	opacity: 0;
	transition: opacity 80ms ease-out;
	background: var(--vscode-foreground);
	clip-path: polygon(100% 0, 100% 100%, 0 100%);
	border-radius: 0 0 4px 0;
}
.voice-beam-resize-cell:hover > .voice-beam-resize-handle,
.voice-beam-resize-handle:hover,
.voice-beam-resize-handle[data-dragging] { opacity: .45; }
`;

/** A resizable box, plus the hook to rebuild its beam at the new size. */
export interface IResizableCell {
	readonly box: HTMLElement;
	/** Wrapper (caption + input) that the grip is anchored to. */
	readonly wrapper: HTMLElement;
	readonly reapplyBeam: () => void;
}

/**
 * Adds a drag-to-resize grip to every box on the page.
 *
 * All boxes resize together: each page is a comparison of the same input at
 * different states/treatments, so keeping the column one width is what makes the
 * comparison readable.
 *
 * The beam is rebuilt on release rather than per pointer move — `pulse-outside`
 * derives its halo scale from the element box at apply time, and regenerating
 * the (large) per-instance stylesheet on every move would be wasteful.
 */
export function makeResizable(cells: readonly IResizableCell[], container: HTMLElement, store: DisposableStore): void {
	const style = $('style');
	style.textContent = RESIZE_HANDLE_CSS;
	container.appendChild(style);

	const drag = store.add(new MutableDisposable<DisposableStore>());

	for (const cell of cells) {
		const handle = $('.voice-beam-resize-handle');
		cell.wrapper.classList.add('voice-beam-resize-cell');
		cell.wrapper.appendChild(handle);

		store.add(addDisposableListener(handle, EventType.POINTER_DOWN, e => {
			e.preventDefault();
			e.stopPropagation();

			const rect = cell.box.getBoundingClientRect();
			const startX = e.clientX;
			const startY = e.clientY;
			const maxWidth = Math.max(MIN_BOX_WIDTH, container.clientWidth - 90);

			handle.setPointerCapture(e.pointerId);
			handle.setAttribute('data-dragging', '');

			const listeners = new DisposableStore();
			drag.value = listeners;

			listeners.add(addDisposableListener(handle, EventType.POINTER_MOVE, move => {
				const width = clamp(rect.width + (move.clientX - startX), MIN_BOX_WIDTH, maxWidth);
				const height = clamp(rect.height + (move.clientY - startY), MIN_BOX_HEIGHT, MAX_BOX_HEIGHT);
				for (const target of cells) {
					target.box.style.width = `${Math.round(width)}px`;
					target.box.style.height = `${Math.round(height)}px`;
					// The layout's `min-height` would otherwise floor the drag.
					target.box.style.minHeight = '0px';
				}
			}));

			listeners.add(addDisposableListener(handle, EventType.POINTER_UP, () => {
				handle.removeAttribute('data-dragging');
				drag.clear();
				for (const target of cells) {
					target.reapplyBeam();
				}
			}));
		}));
	}
}
