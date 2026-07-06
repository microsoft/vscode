/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { DisposableStore, IDisposable } from '../../../../base/common/lifecycle.js';
import { IWorkbenchLayoutService } from '../../../../workbench/services/layout/browser/layoutService.js';
import { isPhoneLayout } from './mobileLayout.js';

/** Default hold duration, in milliseconds, before a long-press fires. */
const DEFAULT_HOLD_TIME_MS = 500;

/** Default pointer movement, in CSS pixels, that cancels a pending long-press. */
const DEFAULT_MOVE_THRESHOLD_PX = 6;

/** Hard timeout for dropping a pending click suppressor if no click follows. */
const CLICK_SUPPRESSOR_TIMEOUT_MS = 1000;

/**
 * Options for {@link installLongPress}.
 */
export interface IInstallLongPressOptions {
	/**
	 * How long the pointer must stay pressed (without moving past
	 * `moveThresholdPx`) before the long-press fires. Defaults to
	 * {@link DEFAULT_HOLD_TIME_MS} (500ms).
	 */
	holdTimeMs?: number;

	/**
	 * Pointer movement (in CSS pixels) that cancels a pending
	 * long-press. Small enough that micro-jitter on touch devices
	 * doesn't kill the gesture, large enough that an intentional
	 * scroll/pan does. Defaults to {@link DEFAULT_MOVE_THRESHOLD_PX}.
	 */
	moveThresholdPx?: number;

	/**
	 * If true (the default), the next `click` event after the
	 * long-press fires is swallowed in capture phase so the
	 * underlying element's tap handler doesn't also run.
	 */
	suppressSyntheticClick?: boolean;

	/**
	 * Optional layout service used to self-gate the long-press to
	 * phone layout. When provided, the long-press is a no-op unless
	 * `isPhoneLayout(layoutService)` returns `true` at pointerdown
	 * time. Omit for callers that want long-press to fire on all
	 * form factors.
	 */
	layoutService?: IWorkbenchLayoutService;
}

/**
 * Wires a long-press gesture on `element`.
 *
 * A long-press is defined as the pointer staying down on `element`
 * for at least `holdTimeMs` (default 500ms) without moving more than
 * `moveThresholdPx` (default 6px) from the initial down position.
 * When that happens, `handler(pointerEvent)` is invoked with the
 * original `pointerdown` event so callers can read `clientX/Y`,
 * `target`, etc. for things like positioning an action sheet.
 *
 * Movement past the threshold, `pointerup`, or `pointercancel` all
 * cancel the pending long-press; the handler does not fire.
 *
 * When `suppressSyntheticClick` is true (the default), the next
 * `click` event after the long-press fires is captured and
 * `preventDefault`+`stopPropagation`'d so the underlying element's
 * tap handler doesn't also run (e.g., long-pressing a chat row
 * shouldn't also open the session like a tap does). A
 * release-aware fallback removes the click suppressor in case no
 * click ever follows (e.g., the user lifted off-screen).
 *
 * If an `IWorkbenchLayoutService` is supplied via
 * `options.layoutService`, the gesture self-gates on phone layout:
 * on desktop the pointerdown handler returns immediately so
 * right-click-and-hold doesn't accidentally trigger anything. This
 * is intentionally opt-in so callers that want a universal
 * long-press (e.g., a touch test page) can omit it.
 *
 * Only primary `touch` and `mouse` pointer types are observed; pen
 * and non-primary pointers are ignored to avoid fighting other
 * gesture handlers.
 *
 * @example
 * // Open an action sheet when the user long-presses a chat row.
 * disposables.add(installLongPress(row, e => {
 *     actionSheet.show({ x: e.clientX, y: e.clientY });
 * }, { layoutService }));
 *
 * @param element The element to attach pointer listeners to.
 * @param handler Invoked with the originating pointerdown event
 *                when a long-press is detected.
 * @param options See {@link IInstallLongPressOptions}.
 * @returns Disposable that removes all listeners and clears any
 *          pending timer.
 */
export function installLongPress(
	element: HTMLElement,
	handler: (e: PointerEvent) => void,
	options?: IInstallLongPressOptions
): IDisposable {
	const store = new DisposableStore();
	const holdTimeMs = options?.holdTimeMs ?? DEFAULT_HOLD_TIME_MS;
	const moveThresholdPx = options?.moveThresholdPx ?? DEFAULT_MOVE_THRESHOLD_PX;
	const suppressSyntheticClick = options?.suppressSyntheticClick ?? true;
	const layoutService = options?.layoutService;

	let pointerId: number | undefined;
	let startX = 0;
	let startY = 0;
	let timerId: number | undefined;
	let clickSuppressor: DisposableStore | undefined;
	const targetWindow = dom.getWindow(element);

	const cancelTimer = () => {
		if (timerId !== undefined) {
			targetWindow.clearTimeout(timerId);
			timerId = undefined;
		}
	};

	const reset = () => {
		cancelTimer();
		pointerId = undefined;
	};

	const clearClickSuppressor = () => {
		clickSuppressor?.dispose();
		clickSuppressor = undefined;
	};

	store.add(dom.addDisposableListener(element, dom.EventType.POINTER_DOWN, (e: PointerEvent) => {
		// Self-gate on phone when a layout service was supplied so
		// desktop right-click-drag and similar don't accidentally
		// trigger anything. The check is a cheap DOM class read,
		// evaluated lazily per pointerdown so resize-to-phone keeps
		// working.
		if (layoutService && !isPhoneLayout(layoutService)) {
			return;
		}
		// Only react to primary input. Ignore right-clicks and
		// non-touch/-mouse pointer types (e.g. pen) to avoid
		// fighting other gesture handlers.
		if (!e.isPrimary || (e.pointerType !== 'touch' && e.pointerType !== 'mouse')) {
			return;
		}
		// A second pointerdown before the previous gesture ended
		// supersedes the prior one; clear any stale timer.
		cancelTimer();
		pointerId = e.pointerId;
		startX = e.clientX;
		startY = e.clientY;
		// Capture the pointer so POINTER_MOVE/UP keep firing on
		// `element` even when the finger drifts off it (e.g. during a
		// scroll attempt). Without this, a drag-off can leave the
		// long-press timer armed with no cancel event.
		try {
			element.setPointerCapture(e.pointerId);
		} catch {
			// Ignore environments without pointer capture support.
		}
		timerId = targetWindow.setTimeout(() => {
			timerId = undefined;
			pointerId = undefined;
			handler(e);
			if (suppressSyntheticClick) {
				clearClickSuppressor();
				const suppressorStore = new DisposableStore();
				clickSuppressor = suppressorStore;

				// Swallow the next click in capture phase so the
				// underlying element's tap handler doesn't also
				// run. `addEventListener` (not
				// `addDisposableListener`) is used because the
				// listener needs to remove itself once it fires.
				const swallow = (clickEvent: MouseEvent) => {
					clickEvent.preventDefault();
					clickEvent.stopPropagation();
					clearClickSuppressor();
				};
				element.addEventListener('click', swallow, true);
				suppressorStore.add({ dispose: () => element.removeEventListener('click', swallow, true) });

				// Keep suppression alive through pointerup so the
				// release-generated click can still be swallowed.
				suppressorStore.add(dom.addDisposableListener(element, dom.EventType.POINTER_UP, (pointerEvent: PointerEvent) => {
					if (pointerEvent.pointerId !== e.pointerId) {
						return;
					}
					targetWindow.setTimeout(() => clearClickSuppressor(), 0);
				}, true));
				suppressorStore.add(dom.addDisposableListener(element, 'pointercancel', () => clearClickSuppressor(), true));

				// Fallback in case neither click nor pointercancel arrives.
				const suppressorTimeout = targetWindow.setTimeout(() => clearClickSuppressor(), CLICK_SUPPRESSOR_TIMEOUT_MS);
				suppressorStore.add({ dispose: () => targetWindow.clearTimeout(suppressorTimeout) });
			}
		}, holdTimeMs);
	}));

	store.add(dom.addDisposableListener(element, dom.EventType.POINTER_MOVE, (e: PointerEvent) => {
		if (pointerId !== e.pointerId) {
			return;
		}
		const dx = e.clientX - startX;
		const dy = e.clientY - startY;
		if (Math.abs(dx) > moveThresholdPx || Math.abs(dy) > moveThresholdPx) {
			reset();
		}
	}));

	const end = (e: PointerEvent) => {
		if (pointerId !== e.pointerId) {
			return;
		}
		reset();
	};
	store.add(dom.addDisposableListener(element, dom.EventType.POINTER_UP, end));
	// `pointercancel` isn't in the workbench's `EventType` enum (only
	// the events shared with mouse/touch are), so register it via the
	// raw literal. Browsers fire it when the pointer leaves the page
	// or the gesture is interrupted (e.g. iOS scroll/zoom takeover).
	store.add(dom.addDisposableListener(element, 'pointercancel', end));

	store.add({ dispose: cancelTimer });
	store.add({ dispose: clearClickSuppressor });

	return store;
}
