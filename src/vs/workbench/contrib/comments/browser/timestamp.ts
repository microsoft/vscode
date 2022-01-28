/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { fromNow } from 'vs/base/common/date';
import { Disposable } from 'vs/base/common/lifecycle';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';

const USE_RELATIVE_TIME_CONFIGURATION = 'comments.useRelativeTime';

export class TimestampWidget extends Disposable {
	private _date: HTMLElement;
	private _timestamp: Date | undefined;
	private _useRelativeTime: boolean;

	constructor(private configurationService: IConfigurationService, container: HTMLElement, timeStamp?: Date) {
		super();
		this._date = dom.append(container, dom.$('span.timestamp'));
		this._useRelativeTime = this.useRelativeTimeSetting;
		this.setTimestamp(timeStamp);
	}

	private get useRelativeTimeSetting(): boolean {
		return this.configurationService.getValue<boolean>(USE_RELATIVE_TIME_CONFIGURATION);
	}

	public async setTimestamp(timestamp: Date | undefined) {
		if ((timestamp !== this._timestamp) || (this.useRelativeTimeSetting !== this._useRelativeTime)) {
			this.updateDate(timestamp);
		}
		this._timestamp = timestamp;
		this._useRelativeTime = this.useRelativeTimeSetting;
	}

	private updateDate(timestamp?: Date) {
		if (!timestamp) {
			this._date.textContent = '';
		} else if ((timestamp !== this._timestamp)
			|| (this.useRelativeTimeSetting !== this._useRelativeTime)) {

			let textContent: string;
			let tooltip: string | undefined;
			if (this.useRelativeTimeSetting) {
				textContent = this.getRelative(timestamp);
				tooltip = this.getDateString(timestamp);
			} else {
				textContent = this.getDateString(timestamp);
			}

			this._date.textContent = textContent;
			if (tooltip) {
				this._date.title = tooltip;
			}
		}
	}

	private getRelative(date: Date): string {
		return fromNow(date, true, true);
	}

	private getDateString(date: Date): string {
		return date.toLocaleString();
	}
}
