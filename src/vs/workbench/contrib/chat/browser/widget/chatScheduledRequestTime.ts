/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
import { fromNow, safeIntl } from '../../../../../base/common/date.js';
import { DisposableStore, IDisposable } from '../../../../../base/common/lifecycle.js';
import { language } from '../../../../../base/common/platform.js';
import { localize } from '../../../../../nls.js';

const clockFormat = safeIntl.DateTimeFormat(language, { hour: 'numeric', minute: '2-digit' });
const weekdayFormat = safeIntl.DateTimeFormat(language, { weekday: 'short' });
const dateFormat = safeIntl.DateTimeFormat(language, { month: 'short', day: 'numeric' });
const dateWithYearFormat = safeIntl.DateTimeFormat(language, { month: 'short', day: 'numeric', year: 'numeric' });

export function getScheduledRequestTimeLabel(runAt: string, actionLabel = false): string {
	const timestamp = Date.parse(runAt);
	const remaining = timestamp - Date.now();
	return remaining <= 0 ? localize('scheduledRequestDue', "Waiting to send")
		: remaining < 60_000 ? actionLabel ? localize('scheduledRequestSendSoon', "Send in less than a minute") : localize('scheduledRequestSoon', "Sends in less than a minute")
			: actionLabel ? localize('scheduledRequestSendRelativeTime', "Send {0}", fromNow(timestamp, false, true)) : localize('scheduledRequestRelativeTime', "Sends {0}", fromNow(timestamp, false, true));
}

export function getScheduledRequestAbsoluteTimeLabel(runAt: string, now: number = Date.now()): string {
	const timestamp = Date.parse(runAt);
	if (!Number.isFinite(timestamp)) {
		return localize('scheduledRequestTimeUnavailable', "Time unavailable");
	}
	const date = new Date(timestamp);
	const today = new Date(now);
	const days = Math.round((Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) - Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())) / 86_400_000);
	const clock = clockFormat.value.format(date);
	if (days === 0) {
		return localize('scheduledRequestTodayAt', "Today at {0}", clock);
	}
	if (days === 1) {
		return localize('scheduledRequestTomorrowAt', "Tomorrow at {0}", clock);
	}
	if (days > 1 && days < 7) {
		return localize('scheduledRequestWeekdayAt', "{0} at {1}", weekdayFormat.value.format(date), clock);
	}
	const day = (date.getFullYear() === today.getFullYear() ? dateFormat : dateWithYearFormat).value.format(date);
	return localize('scheduledRequestDateAt', "{0} at {1}", day, clock);
}

export function renderScheduledRequestTime(runAt: string, element: HTMLElement, render: (label: string) => void, actionLabel = false): IDisposable {
	return renderScheduledRequestLabel(element, () => getScheduledRequestTimeLabel(runAt, actionLabel), render);
}

export function renderScheduledRequestAbsoluteTime(runAt: string, element: HTMLElement, render: (label: string) => void): IDisposable {
	return renderScheduledRequestLabel(element, () => getScheduledRequestAbsoluteTimeLabel(runAt), render);
}

function renderScheduledRequestLabel(element: HTMLElement, getLabel: () => string, render: (label: string) => void): IDisposable {
	const store = new DisposableStore();
	const targetWindow = dom.getWindow(element);
	let previousLabel: string | undefined;
	const update = () => {
		const label = getLabel();
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
