/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { mainWindow } from '../../../../base/browser/window.js';
import { Event } from '../../../../base/common/event.js';
import { Disposable, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { IUserActivityService } from '../common/userActivityService.js';

/**
 * This uses a time interval and checks whether there's any activity in that
 * interval. A naive approach might be to use a debounce whenever an event
 * happens, but this has some scheduling overhead. Instead, the tracker counts
 * how many intervals have elapsed since any activity happened.
 *
 * If there's more than `MIN_INTERVALS_WITHOUT_ACTIVITY`, then say the user is
 * inactive. Therefore the maximum time before an inactive user is detected
 * is `CHECK_INTERVAL * (MIN_INTERVALS_WITHOUT_ACTIVITY + 1)`.
 */
const CHECK_INTERVAL = 30_000;

/** See {@link CHECK_INTERVAL} */
const MIN_INTERVALS_WITHOUT_ACTIVITY = 2;

const eventListenerOptions: AddEventListenerOptions = {
	passive: true, /** does not preventDefault() */
	capture: true, /** should dispatch first (before anyone stopPropagation()) */
};

export class DomActivityTracker extends Disposable {
	constructor(userActivityService: IUserActivityService) {
		super();

		let intervalsWithoutActivity = MIN_INTERVALS_WITHOUT_ACTIVITY;
		const intervalTimer = this._register(new dom.WindowIntervalTimer());
		const activeMutex = this._register(new MutableDisposable());
		activeMutex.value = userActivityService.markActive();

		const onInterval = () => {
			if (++intervalsWithoutActivity === MIN_INTERVALS_WITHOUT_ACTIVITY) {
				activeMutex.clear();
				intervalTimer.cancel();
			}
		};

		const onActivity = (targetWindow: Window & typeof globalThis) => {
			// if was inactive, they've now returned
			if (intervalsWithoutActivity === MIN_INTERVALS_WITHOUT_ACTIVITY) {
				activeMutex.value = userActivityService.markActive();
				intervalTimer.cancelAndSet(onInterval, CHECK_INTERVAL, targetWindow);
			}

			intervalsWithoutActivity = 0;
		};

		this._register(Event.runAndSubscribe(dom.onDidRegisterWindow, ({ window, disposables }) => {
			disposables.add(dom.addDisposableListener(window.document, 'touchstart', () => onActivity(window), eventListenerOptions));
			disposables.add(dom.addDisposableListener(window.document, 'mousedown', () => onActivity(window), eventListenerOptions));
			disposables.add(dom.addDisposableListener(window.document, 'keydown', () => onActivity(window), eventListenerOptions));
		}, { window: mainWindow, disposables: this._store }));

		onActivity(mainWindow);
	}
}
