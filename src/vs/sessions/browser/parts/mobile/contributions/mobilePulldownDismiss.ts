/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DisposableStore, IDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { addDisposableListener, EventType } from '../../../../../base/browser/dom.js';

/**
 * Vertical travel (in px) past which the gesture commits and the overlay
 * is dismissed on `pointerup`.
 */
const COMMIT_THRESHOLD_PX = 120;

/**
 * Initial dead-zone (in px) before any visual feedback is applied. This
 * keeps small accidental drags during taps on the back button or chevrons
 * from briefly translating the overlay.
 */
const DEAD_ZONE_PX = 8;

/**
 * Velocity threshold (in px / ms) past which the gesture commits regardless
 * of total travel — supports quick flick-down dismissal.
 */
const COMMIT_VELOCITY = 0.6;

/**
 * Animation duration (in ms) for the dismiss slide-down.
 */
const DISMISS_ANIM_MS = 250;

/**
 * Animation duration (in ms) for the snap-back when the gesture is
 * abandoned without committing.
 */
const SNAP_BACK_ANIM_MS = 200;

/**
 * Installs a pull-down-to-dismiss gesture on a header element. While the
 * user drags downward on `headerHandle`, `overlayRoot` follows the pointer
 * via `transform: translateY()` and its opacity fades toward 0.5 of its
 * original value. On `pointerup`:
 *
 * - Above {@link COMMIT_THRESHOLD_PX} of travel **or** flick velocity past
 *   {@link COMMIT_VELOCITY}, the overlay animates fully off-screen and
 *   `onDismiss` is invoked.
 * - Otherwise the overlay snaps back to its original position.
 *
 * Horizontal drags and small vertical motions inside the {@link DEAD_ZONE_PX}
 * window are ignored so the existing tap targets on the header (back
 * button, chevrons) continue to receive click / tap events normally.
 *
 * Returns an {@link IDisposable} that detaches all listeners and resets
 * inline styles applied to `overlayRoot`.
 */
export function installPulldownDismiss(
	overlayRoot: HTMLElement,
	headerHandle: HTMLElement,
	onDismiss: () => void,
): IDisposable {
	const store = new DisposableStore();

	let tracking = false;
	let dragging = false;
	let dismissed = false;
	let activePointerId: number | undefined;
	let startX = 0;
	let startY = 0;
	let startTime = 0;
	let lastY = 0;
	let lastT = 0;
	let velocity = 0;
	let originalTransition = '';

	const applyDragStyles = () => {
		originalTransition = overlayRoot.style.transition;
		overlayRoot.style.transition = 'none';
		overlayRoot.style.willChange = 'transform, opacity';
	};

	const resetStyles = () => {
		overlayRoot.style.transform = '';
		overlayRoot.style.opacity = '';
		overlayRoot.style.transition = originalTransition;
		overlayRoot.style.willChange = '';
	};

	const update = (dy: number) => {
		const translate = Math.max(0, dy);
		overlayRoot.style.transform = `translateY(${translate}px)`;
		const opacity = Math.max(0.5, 1 - Math.min(translate / COMMIT_THRESHOLD_PX, 0.5));
		overlayRoot.style.opacity = String(opacity);
	};

	const finish = (commit: boolean) => {
		if (!commit) {
			overlayRoot.style.transition = `transform ${SNAP_BACK_ANIM_MS}ms ease, opacity ${SNAP_BACK_ANIM_MS}ms ease`;
			overlayRoot.style.transform = 'translateY(0)';
			overlayRoot.style.opacity = '1';
			const onEnd = () => {
				resetStyles();
				overlayRoot.removeEventListener('transitionend', onEnd);
			};
			overlayRoot.addEventListener('transitionend', onEnd, { once: true });
			return;
		}

		if (dismissed) {
			return;
		}
		dismissed = true;
		overlayRoot.style.transition = `transform ${DISMISS_ANIM_MS}ms ease, opacity ${DISMISS_ANIM_MS}ms ease`;
		overlayRoot.style.transform = 'translateY(100%)';
		overlayRoot.style.opacity = '0';
		const timeoutId = overlayRoot.ownerDocument.defaultView?.setTimeout(() => {
			onDismiss();
		}, DISMISS_ANIM_MS) ?? 0;
		store.add(toDisposable(() => {
			overlayRoot.ownerDocument.defaultView?.clearTimeout(timeoutId);
		}));
	};

	store.add(addDisposableListener(headerHandle, EventType.POINTER_DOWN, (e: PointerEvent) => {
		if (tracking || dismissed) {
			return;
		}
		if (e.pointerType !== 'touch' && e.pointerType !== 'pen') {
			return;
		}
		tracking = true;
		dragging = false;
		activePointerId = e.pointerId;
		startX = e.clientX;
		startY = e.clientY;
		startTime = Date.now();
		lastY = startY;
		lastT = startTime;
		velocity = 0;
	}));

	store.add(addDisposableListener(headerHandle, EventType.POINTER_MOVE, (e: PointerEvent) => {
		if (!tracking || e.pointerId !== activePointerId) {
			return;
		}
		const dy = e.clientY - startY;
		const dx = e.clientX - startX;

		if (!dragging) {
			if (Math.abs(dy) < DEAD_ZONE_PX) {
				return;
			}
			if (dy <= 0 || Math.abs(dx) > Math.abs(dy)) {
				// Not a downward-dominant drag — release the gesture so
				// regular pointer handlers (e.g. native scroll) can take
				// over for the remainder of this pointer interaction.
				tracking = false;
				activePointerId = undefined;
				return;
			}
			dragging = true;
			applyDragStyles();
			// Capture the pointer so POINTER_MOVE/UP keep arriving on
			// `headerHandle` even when the finger drifts off it during
			// the drag — otherwise we could miss release and leave the
			// overlay stuck mid-translate.
			try {
				headerHandle.setPointerCapture(e.pointerId);
			} catch {
				// Ignore environments without pointer capture support.
			}
		}

		// Update running velocity sample for flick detection.
		const now = Date.now();
		const dt = now - lastT;
		if (dt > 0) {
			velocity = (e.clientY - lastY) / dt;
		}
		lastY = e.clientY;
		lastT = now;

		update(dy);
		e.preventDefault();
	}, { passive: false }));

	const release = (e: PointerEvent) => {
		if (e.pointerId !== activePointerId) {
			return;
		}
		const wasDragging = dragging;
		const dy = e.clientY - startY;
		tracking = false;
		dragging = false;
		activePointerId = undefined;

		if (!wasDragging) {
			return;
		}

		const commit = dy > COMMIT_THRESHOLD_PX || velocity > COMMIT_VELOCITY;
		finish(commit);
	};
	store.add(addDisposableListener(headerHandle, EventType.POINTER_UP, release));
	store.add(addDisposableListener(headerHandle, 'pointercancel', release));

	store.add(toDisposable(() => {
		if (!dismissed) {
			resetStyles();
		}
	}));

	return store;
}
