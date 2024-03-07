/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { getDefaultHoverDelegate } from 'vs/base/browser/ui/hover/hoverDelegateFactory';
import { ICustomHover, setupCustomHover } from 'vs/base/browser/ui/hover/updatableHoverWidget';
import { fromNow } from 'vs/base/common/date';
import { Disposable } from 'vs/base/common/lifecycle';
import { language } from 'vs/base/common/platform';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { COMMENTS_SECTION, ICommentsConfiguration } from 'vs/workbench/contrib/comments/common/commentsConfiguration';

export class TimestampWidget extends Disposable {
	private _date: HTMLElement;
	private _timestamp: Date | undefined;
	private _useRelativeTime: boolean;

	private hover: ICustomHover;

	constructor(private configurationService: IConfigurationService, container: HTMLElement, timeStamp?: Date) {
		super();
		this._date = dom.append(container, dom.$('span.timestamp'));
		this._date.style.display = 'none';
		this._useRelativeTime = this.useRelativeTimeSetting;
		this.hover = this._register(setupCustomHover(getDefaultHoverDelegate('mouse'), this._date, ''));
		this.setTimestamp(timeStamp);
	}

	private get useRelativeTimeSetting(): boolean {
		return this.configurationService.getValue<ICommentsConfiguration>(COMMENTS_SECTION).useRelativeTime;
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
			this._date.style.display = 'none';
		} else if ((timestamp !== this._timestamp)
			|| (this.useRelativeTimeSetting !== this._useRelativeTime)) {
			this._date.style.display = '';
			let textContent: string;
			let tooltip: string | undefined;
			if (this.useRelativeTimeSetting) {
				textContent = this.getRelative(timestamp);
				tooltip = this.getDateString(timestamp);
			} else {
				textContent = this.getDateString(timestamp);
			}

			this._date.textContent = textContent;
			this.hover.update(tooltip ?? '');
		}
	}

	private getRelative(date: Date): string {
		return fromNow(date, true, true);
	}

	private getDateString(date: Date): string {
		return date.toLocaleString(language);
	}
}
