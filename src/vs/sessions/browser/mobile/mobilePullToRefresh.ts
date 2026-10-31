/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/mobilePullToRefresh.css';
import * as dom from '../../../base/browser/dom.js';
import { Codicon } from '../../../base/common/codicons.js';
import { DisposableStore, IDisposable } from '../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../base/common/themables.js';
import { localize } from '../../../nls.js';

const $ = dom.$;

/** Finger travel (after the dead zone) that arms the refresh. */
const TRIGGER_DISTANCE_PX = 72;
/** Where the indicator rests while a refresh runs. */
const REFRESHING_OFFSET_PX = 48;
const MAX_PULL_PX = 96;
const DEAD_ZONE_PX = 10;
/** The indicator moves slower than the finger, like a stretched spring. */
const RESISTANCE = 0.6;

export interface IPullToRefreshOptions {
	/** Whether the host list is scrolled to its top; pulls only begin there. */
	readonly isAtTop: () => boolean;
	/** Performs the refresh. The indicator spins until the promise settles. */
	readonly refresh: () => Promise<unknown>;
}

/**
 * Installs the pull-to-refresh gesture on a scrollable phone list. Dragging
 * down from the top reveals a spinner that follows the finger with
 * resistance; releasing past the threshold runs the refresh and holds the
 * spinner until it settles. Honors `prefers-reduced-motion` by skipping the
 * snap-back animation.
 */
export function installPullToRefresh(container: HTMLElement, options: IPullToRefreshOptions): IDisposable {
	const store = new DisposableStore();

	const indicator = dom.prepend(container, $('div.mobile-pull-indicator', { 'aria-hidden': 'true' }));
	const glyph = dom.append(indicator, $('span.mobile-pull-glyph'));
	glyph.classList.add(...ThemeIcon.asClassNameArray(Codicon.arrowDown));
	const live = dom.append(container, $('div.mobile-pull-live', { role: 'status', 'aria-live': 'polite' }));

	let startY: number | undefined;
	let armed = false;
	let refreshing = false;

	const setPull = (px: number, animate: boolean) => {
		indicator.style.transition = animate && !dom.getWindow(container).matchMedia('(prefers-reduced-motion: reduce)').matches ? 'transform 200ms ease-out, opacity 200ms ease-out' : 'none';
		indicator.style.transform = `translateY(${px}px)`;
		indicator.style.opacity = String(Math.min(1, px / REFRESHING_OFFSET_PX));
	};
	const setArmed = (value: boolean) => {
		armed = value;
		indicator.classList.toggle('armed', value);
	};

	store.add(dom.addDisposableListener(container, 'touchstart', (e: TouchEvent) => {
		if (refreshing || e.touches.length !== 1 || !options.isAtTop()) {
			startY = undefined;
			return;
		}
		startY = e.touches[0].clientY;
	}, { passive: true }));

	store.add(dom.addDisposableListener(container, 'touchmove', (e: TouchEvent) => {
		if (startY === undefined || refreshing) {
			return;
		}
		const delta = e.touches[0].clientY - startY - DEAD_ZONE_PX;
		if (delta <= 0 || !options.isAtTop()) {
			setPull(0, false);
			setArmed(false);
			return;
		}
		setPull(Math.min(MAX_PULL_PX, delta * RESISTANCE), false);
		setArmed(delta >= TRIGGER_DISTANCE_PX);
	}, { passive: true }));

	const end = async () => {
		if (startY === undefined) {
			return;
		}
		startY = undefined;
		if (!armed || refreshing) {
			setPull(0, true);
			setArmed(false);
			return;
		}
		refreshing = true;
		indicator.classList.add('refreshing');
		glyph.className = `mobile-pull-glyph ${ThemeIcon.asClassName(ThemeIcon.modify(Codicon.loading, 'spin'))}`;
		live.textContent = localize('mobilePullToRefresh.refreshing', "Refreshing");
		setPull(REFRESHING_OFFSET_PX, true);
		try {
			await options.refresh();
		} finally {
			refreshing = false;
			indicator.classList.remove('refreshing');
			setArmed(false);
			glyph.className = `mobile-pull-glyph ${ThemeIcon.asClassName(Codicon.arrowDown)}`;
			live.textContent = localize('mobilePullToRefresh.done', "Refreshed");
			setPull(0, true);
		}
	};
	store.add(dom.addDisposableListener(container, 'touchend', () => void end(), { passive: true }));
	store.add(dom.addDisposableListener(container, 'touchcancel', () => void end(), { passive: true }));

	store.add({ dispose: () => { indicator.remove(); live.remove(); } });
	return store;
}
