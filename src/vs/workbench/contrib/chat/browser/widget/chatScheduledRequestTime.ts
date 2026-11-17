/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
import { fromNow } from '../../../../../base/common/date.js';
import { DisposableStore, IDisposable } from '../../../../../base/common/lifecycle.js';
import { localize } from '../../../../../nls.js';

export function getScheduledRequestTimeLabel(runAt: string, actionLabel = false): string {
	const timestamp = Date.parse(runAt);
	const remaining = timestamp - Date.now();
	return remaining <= 0 ? localize('scheduledRequestDue', "Waiting to send")
		: remaining < 60_000 ? actionLabel ? localize('scheduledRequestSendSoon', "Send in less than a minute") : localize('scheduledRequestSoon', "Sends in less than a minute")
			: actionLabel ? localize('scheduledRequestSendRelativeTime', "Send {0}", fromNow(timestamp, false, true)) : localize('scheduledRequestRelativeTime', "Sends {0}", fromNow(timestamp, false, true));
}

export function renderScheduledRequestTime(runAt: string, element: HTMLElement, render: (label: string) => void, actionLabel = false): IDisposable {
	const store = new DisposableStore();
	const targetWindow = dom.getWindow(element);
	let previousLabel: string | undefined;
	const update = () => {
		const label = getScheduledRequestTimeLabel(runAt, actionLabel);
		if (label !== previousLabel) {
			previousLabel = label;
			render(label);
		}
	};
	update();
	const updateVisible = () => {
		if (!targetWindow.document.hidden) {
			update();
		}
	};
	store.add(new dom.WindowIntervalTimer(element)).cancelAndSet(updateVisible, 60_000);
	store.add(dom.addDisposableListener(targetWindow.document, 'visibilitychange', updateVisible));
	return store;
}
