/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { EventEmitter } from 'events';
import { isString } from 'vs/base/common/types';
import { Promise } from 'vs/base/common/winjs.base';
import { asJson } from 'vs/base/node/request';
import { IRequestService } from 'vs/platform/request/node/request';
import { IAutoUpdater } from 'vs/platform/update/common/update';
import product from 'vs/platform/node/product';

interface IUpdate {
	url: string;
	name: string;
	releaseNotes?: string;
	version: string;
	productVersion: string;
	hash: string;
}

export class LinuxAutoUpdaterImpl extends EventEmitter implements IAutoUpdater {

	private url: string;
	private currentRequest: Promise;

	constructor(
		@IRequestService private requestService: IRequestService
	) {
		super();

		this.url = null;
		this.currentRequest = null;
	}

	setFeedURL(url: string): void {
		this.url = url;
	}

	checkForUpdates(): void {
		if (!this.url) {
			throw new Error('No feed url set.');
		}

		if (this.currentRequest) {
			return;
		}

		this.emit('checking-for-update');

		this.currentRequest = this.requestService.request({ url: this.url })
			.then<IUpdate>(asJson)
			.then(update => {
				if (!update || !update.url || !update.version || !update.productVersion) {
					this.emit('update-not-available');
				} else {
					this.emit('update-available', null, product.downloadUrl, update.productVersion);
				}
			})
			.then(null, e => {
				if (isString(e) && /^Server returned/.test(e)) {
					return;
				}

				this.emit('update-not-available');
				this.emit('error', e);
			})
			.then(() => this.currentRequest = null);
	}

	quitAndInstall(): void {
		// noop
	}
}
