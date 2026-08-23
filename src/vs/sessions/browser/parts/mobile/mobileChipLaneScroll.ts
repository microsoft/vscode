/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { DisposableStore, IDisposable } from '../../../../base/common/lifecycle.js';
import { IWorkbenchLayoutService } from '../../../../workbench/services/layout/browser/layoutService.js';
import { isPhoneLayout } from './mobileLayout.js';

/** Pixels of pointer movement before a drag is treated as a scroll
 * gesture rather than a tap. Small enough that taps stay responsive,
 * large enough that micro-jitter on touch devices doesn't hijack
 * clicks. */
const TAP_THRESHOLD_PX = 6;

/**
 * Wires pointer-event-based horizontal scrolling on a chip lane.
 *
 * On phone, the chat-input chip row uses `overflow-x: auto` to scroll
 * natively when content overflows the viewport, but each chip's
 * `Gesture.addTarget` (in monaco's action-bar item renderer) calls
 * `preventDefault` on `touchmove`, swallowing the pan before the lane
 * can scroll. To restore the scroll behavior, this helper listens for
 * pointer events on the lane element and translates horizontal drags
 * into `scrollLeft` updates. A small movement threshold keeps single
 * taps falling through to the chip click handlers (so taps still open
 * pickers); once the threshold is crossed the gesture is claimed via
 * `setPointerCapture` and the trailing synthetic click is suppressed.
 *
 * The pointer handlers self-gate on phone-layout: on desktop they
 * return immediately so mouse-drag semantics on the bottom toolbar
 * are unchanged. The cost on desktop is one DOM-class read per
 * pointer-down — negligible.
 *
 * @param lane The element with `overflow-x: auto` (the chip row).
 * @param layoutService Used to read the current viewport class.
 * @returns Disposable that detaches all pointer listeners.
 */
export function installMobileChipLaneScroll(lane: HTMLElement, layoutService: IWorkbenchLayoutService): IDisposable {
	const store = new DisposableStore();

	let pointerId: number | undefined;
	let startX = 0;
	let startScrollLeft = 0;
	let didDrag = false;

	store.add(dom.addDisposableListener(lane, dom.EventType.POINTER_DOWN, (e: PointerEvent) => {
		// Bail on desktop so mouse drags in the bottom toolbar keep
		// their default behavior (selection, etc.). The check is a
		// cheap DOM class read on `mainContainer`, evaluated lazily
		// per pointerdown so resize-to-phone keeps working.
		if (!isPhoneLayout(layoutService)) {
			return;
		}
		// Only react to primary input. Ignore right-clicks and
		// non-touch/-mouse pointer types (e.g. pen) to avoid
		// fighting other gesture handlers.
		if (!e.isPrimary || (e.pointerType !== 'touch' && e.pointerType !== 'mouse')) {
			return;
		}
		pointerId = e.pointerId;
		startX = e.clientX;
		startScrollLeft = lane.scrollLeft;
		didDrag = false;
	}));

	store.add(dom.addDisposableListener(lane, dom.EventType.POINTER_MOVE, (e: PointerEvent) => {
		if (pointerId !== e.pointerId) {
			return;
		}
		const deltaX = e.clientX - startX;
		if (!didDrag && Math.abs(deltaX) < TAP_THRESHOLD_PX) {
			return;
		}
		if (!didDrag) {
			didDrag = true;
			// Once we've crossed the threshold, claim the gesture
			// so the chip's Gesture handler doesn't also fire a
			// tap when the pointer is released.
			try {
				lane.setPointerCapture(e.pointerId);
			} catch { /* not all browsers support setPointerCapture on every element */ }
		}
		lane.scrollLeft = startScrollLeft - deltaX;
		e.preventDefault();
	}));

	const endDrag = (e: PointerEvent) => {
		if (pointerId !== e.pointerId) {
			return;
		}
		pointerId = undefined;
		if (!didDrag) {
			return;
		}
		try {
			lane.releasePointerCapture(e.pointerId);
		} catch { /* ignore */ }
		// Suppress the synthetic click that follows a drag so the
		// chip we ended on doesn't open its picker. `addEventListener`
		// is used rather than `addDisposableListener` because the
		// listener needs to remove itself once the click fires (or
		// the next-frame fallback below).
		const swallow = (clickEvent: MouseEvent) => {
			clickEvent.preventDefault();
			clickEvent.stopPropagation();
			lane.removeEventListener('click', swallow, true);
		};
		lane.addEventListener('click', swallow, true);
		// Drop the suppressor on the next frame in case no click
		// ever fires (e.g. lifted off-screen).
		dom.getWindow(lane).setTimeout(() => lane.removeEventListener('click', swallow, true), 0);
	};
	store.add(dom.addDisposableListener(lane, dom.EventType.POINTER_UP, endDrag));
	// `pointercancel` isn't in the workbench's `EventType` enum (only
	// the events shared with mouse/touch are), so register it via the
	// raw literal. Browsers fire it when the pointer leaves the page or
	// the gesture is interrupted (e.g. iOS scroll/zoom takeover) and
	// we need to release pointer capture in those cases too.
	store.add(dom.addDisposableListener(lane, 'pointercancel', endDrag));

	return store;
}
