/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getErrorMessage } from 'vs/base/common/errors';
import { Emitter } from 'vs/base/common/event';
import { Disposable, toDisposable } from 'vs/base/common/lifecycle';
import { isString } from 'vs/base/common/types';

export class BroadcastDataChannel extends Disposable {

	private broadcastChannel: BroadcastChannel | undefined;

	private readonly _onDidReceiveData = this._register(new Emitter<string>());
	readonly onDidReceiveData = this._onDidReceiveData.event;

	constructor(private readonly channelName: string) {
		super();

		// Use BroadcastChannel
		if ('BroadcastChannel' in window) {
			try {
				this.broadcastChannel = new BroadcastChannel(channelName);
				const listener = (event: MessageEvent) => {
					if (isString(event.data)) {
						this._onDidReceiveData.fire(event.data);
					}
				};
				this.broadcastChannel.addEventListener('message', listener);
				this._register(toDisposable(() => {
					if (this.broadcastChannel) {
						this.broadcastChannel.removeEventListener('message', listener);
						this.broadcastChannel.close();
					}
				}));
			} catch (error) {
				console.warn('Error while creating broadcast channel. Falling back to localStorage.', getErrorMessage(error));
				this.createBroadcastChannel(channelName);
			}
		}

		// BroadcastChannel is not supported. Use storage.
		else {
			this.createBroadcastChannel(channelName);
		}
	}

	private createBroadcastChannel(changesKey: string): void {
		const listener = (event: StorageEvent) => {
			if (event.key === changesKey && event.newValue) {
				this._onDidReceiveData.fire(event.newValue);
			}
		};
		window.addEventListener('storage', listener);
		this._register(toDisposable(() => window.removeEventListener('storage', listener)));
	}

	postData(data: string): void {
		if (this.broadcastChannel) {
			this.broadcastChannel.postMessage(data);
		} else {
			// remove previous changes so that event is triggered even if new changes are same as old changes
			window.localStorage.removeItem(this.channelName);
			window.localStorage.setItem(this.channelName, data);
		}
	}
}
