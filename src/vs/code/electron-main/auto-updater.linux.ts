/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { EventEmitter } from 'events';
import { isString } from 'vs/base/common/types';
import { Promise } from 'vs/base/common/winjs.base';
import { json } from 'vs/base/node/request';
import { getProxyAgent } from 'vs/base/node/proxy';
import { ISettingsService } from 'vs/code/electron-main/settings';
import { IEnvironmentService } from 'vs/code/electron-main/env';

export interface IUpdate {
	url: string;
	name: string;
	releaseNotes?: string;
	version?: string;
}

export class LinuxAutoUpdaterImpl extends EventEmitter {

	private url: string;
	private currentRequest: Promise;

	constructor(
		@IEnvironmentService private envService: IEnvironmentService,
		@ISettingsService private settingsService: ISettingsService
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

		const proxyUrl = this.settingsService.getValue<string>('http.proxy');
		const strictSSL = this.settingsService.getValue('http.proxyStrictSSL', true);
		const agent = getProxyAgent(this.url, { proxyUrl, strictSSL });

		this.currentRequest = json<IUpdate>({ url: this.url, agent })
			.then(update => {
				if (!update || !update.url || !update.version) {
					this.emit('update-not-available');
				} else {
					this.emit('update-available', null, this.envService.product.downloadUrl);
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
}
