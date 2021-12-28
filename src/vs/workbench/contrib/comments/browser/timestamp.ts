/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { Disposable } from 'vs/base/common/lifecycle';
import { Timestamp } from 'vs/editor/common/modes';
import * as dayjs from 'dayjs';
import * as relativeTime from 'dayjs/plugin/relativeTime';
import * as updateLocale from 'dayjs/plugin/updateLocale';
import * as localizedFormat from 'dayjs/plugin/localizedFormat'

dayjs.extend(relativeTime, {
	thresholds: [
		{ l: 's', r: 44, d: 'second' },
		{ l: 'm', r: 89 },
		{ l: 'mm', r: 44, d: 'minute' },
		{ l: 'h', r: 89 },
		{ l: 'hh', r: 21, d: 'hour' },
		{ l: 'd', r: 35 },
		{ l: 'dd', r: 6, d: 'day' },
		{ l: 'w', r: 7 },
		{ l: 'ww', r: 3, d: 'week' },
		{ l: 'M', r: 4 },
		{ l: 'MM', r: 10, d: 'month' },
		{ l: 'y', r: 17 },
		{ l: 'yy', d: 'year' },
	],
});

dayjs.extend(updateLocale);
dayjs.updateLocale('en', {
	relativeTime: {
		past: '%s ago',
		s: 'seconds',
		m: 'a minute',
		mm: '%d minutes',
		h: 'an hour',
		hh: '%d hours',
		d: 'a day',
		dd: '%d days',
		w: 'a week',
		ww: '%d weeks',
		M: 'a month',
		MM: '%d months',
		y: 'a year',
		yy: '%d years',
	},
});
dayjs.extend(localizedFormat);

export class TimestampWidget extends Disposable {
	private _date: HTMLElement;
	private _timestamp: Timestamp | undefined;

	constructor(container: HTMLElement, timeStamp?: Timestamp) {
		super();
		this._date = dom.append(container, dom.$('span.timestamp'));
		this.setTimestamp(timeStamp);
	}

	public async setTimestamp(timestamp: Timestamp | undefined) {
		if ((timestamp?.date !== this._timestamp?.date) || (timestamp?.useRelativeTime !== this._timestamp?.useRelativeTime)) {
			this.updateDate(timestamp);
		}
		this._timestamp = timestamp;
	}

	private updateDate(timestamp?: Timestamp) {
		if (!timestamp) {
			this._date.textContent = '';
		} else if ((timestamp.date !== this._timestamp?.date)
			|| (timestamp.useRelativeTime !== this._timestamp.useRelativeTime)) {

			let textContent: string;
			let tooltip: string | undefined;
			if (timestamp.useRelativeTime) {
				textContent = this.getRelative(timestamp.date);
				tooltip = timestamp.label ?? this.getDateString(timestamp.date);
			} else {
				textContent = timestamp.label ?? this.getDateString(timestamp.date);
			}

			this._date.textContent = textContent;
			if (tooltip) {
				this._date.title = tooltip;
			}
		}
	}

	private getRelative(date: Date): string {
		const djs = dayjs(date);
		const now = Date.now();
		const diff = djs.diff(now, 'month');
		if ((diff < 1) && (diff > -11)) {
			return djs.fromNow();
		}
		return this.getDateString(date);
	}

	private getDateString(date: Date): string {
		const djs = dayjs(date);
		return djs.format('lll');
	}
}
