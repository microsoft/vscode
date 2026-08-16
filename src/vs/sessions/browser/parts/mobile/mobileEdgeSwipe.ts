/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DisposableStore, IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { addDisposableListener, EventType } from '../../../../base/browser/dom.js';
import { IWorkbenchLayoutService, Parts } from '../../../../workbench/services/layout/browser/layoutService.js';

/**
 * Threshold (in px) from the left viewport edge within which a `pointerdown`
 * is considered a candidate edge swipe.
 */
const EDGE_HIT_ZONE_PX = 16;

/**
 * Minimum horizontal travel (in px, rightward) required to commit the
 * sidebar-open gesture.
 */
const COMMIT_TRAVEL_PX = 48;

/**
 * Maximum vertical drift (in px) allowed during the gesture. If the user
 * moves more than this along Y the gesture is treated as a scroll attempt
 * and the swipe is cancelled.
 */
const VERTICAL_TOLERANCE_PX = 32;

/**
 * Maximum duration (in ms) within which the commit travel must be reached.
 * Slower drags are treated as deliberate scrolls / selections and ignored.
 */
const COMMIT_WINDOW_MS = 500;

/**
 * Installs a left-edge swipe gesture on `mainContainer` that opens the
 * sidebar drawer on phone viewports.
 *
 * The gesture starts when `pointerdown` lands within the leftmost
 * {@link EDGE_HIT_ZONE_PX} pixels of the container while the phone layout
 * is active. It commits when the pointer travels more than
 * {@link COMMIT_TRAVEL_PX} rightward within {@link COMMIT_WINDOW_MS} ms
 * with less than {@link VERTICAL_TOLERANCE_PX} of vertical drift. The
 * gesture is cancelled on `pointerup` / `pointercancel`, or once the
 * tracking window elapses.
 *
 * Only `touch` and `pen` pointer types are considered — mouse drags from
 * the edge could conflict with text selection. The gesture also skips if
 * the sidebar is already visible so we don't replay the open on every
 * subsequent edge tap.
 *
 * Returns an {@link IDisposable} that detaches all listeners.
 */
export function installMobileEdgeSwipeToOpenSidebar(
	mainContainer: HTMLElement,
	openSidebar: () => void,
	layoutService: IWorkbenchLayoutService,
): IDisposable {
	const store = new DisposableStore();

	let tracking = false;
	let startX = 0;
	let startY = 0;
	let startTime = 0;
	let activePointerId: number | undefined;

	const reset = () => {
		tracking = false;
		activePointerId = undefined;
	};

	const isPhoneLayout = (): boolean => {
		return mainContainer.classList.contains('phone-layout');
	};

	store.add(addDisposableListener(mainContainer, EventType.POINTER_DOWN, (e: PointerEvent) => {
		if (tracking) {
			return;
		}
		if (e.pointerType !== 'touch' && e.pointerType !== 'pen') {
			return;
		}
		if (!isPhoneLayout()) {
			return;
		}
		const rect = mainContainer.getBoundingClientRect();
		const localX = e.clientX - rect.left;
		if (localX >= EDGE_HIT_ZONE_PX) {
			return;
		}
		if (layoutService.isVisible(Parts.SIDEBAR_PART)) {
			return;
		}

		tracking = true;
		activePointerId = e.pointerId;
		startX = e.clientX;
		startY = e.clientY;
		startTime = Date.now();
		// Capture the pointer so POINTER_MOVE/UP keep arriving on
		// `mainContainer` even if the target changes during the swipe
		// (e.g. the pointer crosses into an iframe/overlay), avoiding
		// a stuck `tracking` flag.
		try {
			mainContainer.setPointerCapture(e.pointerId);
		} catch {
			// Ignore environments without pointer capture support.
		}
	}, true));

	store.add(addDisposableListener(mainContainer, EventType.POINTER_MOVE, (e: PointerEvent) => {
		if (!tracking || e.pointerId !== activePointerId) {
			return;
		}

		const dx = e.clientX - startX;
		const dy = Math.abs(e.clientY - startY);
		const elapsed = Date.now() - startTime;

		if (elapsed > COMMIT_WINDOW_MS || dy > VERTICAL_TOLERANCE_PX) {
			reset();
			return;
		}

		if (dx >= COMMIT_TRAVEL_PX) {
			reset();
			openSidebar();
		}
	}, true));

	const cancel = (e: PointerEvent) => {
		if (e.pointerId === activePointerId) {
			reset();
		}
	};
	store.add(addDisposableListener(mainContainer, EventType.POINTER_UP, cancel, true));
	store.add(addDisposableListener(mainContainer, 'pointercancel', cancel, true));

	store.add(toDisposable(reset));

	return store;
}
