/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { mainWindow } from 'vs/base/browser/window';
import { getErrorMessage } from 'vs/base/common/errors';
import { Emitter } from 'vs/base/common/event';
import { Disposable, toDisposable } from 'vs/base/common/lifecycle';

export class BroadcastDataChannel<T> extends Disposable {

	private broadcastChannel: BroadcastChannel | undefined;

	private readonly _onDidReceiveData = this._register(new Emitter<T>());
	readonly onDidReceiveData = this._onDidReceiveData.event;

	constructor(private readonly channelName: string) {
		super();

		// Use BroadcastChannel
		if ('BroadcastChannel' in mainWindow) {
			try {
				this.broadcastChannel = new BroadcastChannel(channelName);
				const listener = (event: MessageEvent) => {
					this._onDidReceiveData.fire(event.data);
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
			}
		}

		// BroadcastChannel is not supported. Use storage.
		if (!this.broadcastChannel) {
			this.channelName = `BroadcastDataChannel.${channelName}`;
			this.createBroadcastChannel();
		}
	}

	private createBroadcastChannel(): void {
		const listener = (event: StorageEvent) => {
			if (event.key === this.channelName && event.newValue) {
				this._onDidReceiveData.fire(JSON.parse(event.newValue));
			}
		};
		mainWindow.addEventListener('storage', listener);
		this._register(toDisposable(() => mainWindow.removeEventListener('storage', listener)));
	}

	/**
	 * Sends the data to other BroadcastChannel objects set up for this channel. Data can be structured objects, e.g. nested objects and arrays.
	 * @param data data to broadcast
	 */
	postData(data: T): void {
		if (this.broadcastChannel) {
			this.broadcastChannel.postMessage(data);
		} else {
			// remove previous changes so that event is triggered even if new changes are same as old changes
			localStorage.removeItem(this.channelName);
			localStorage.setItem(this.channelName, JSON.stringify(data));
		}
	}
}
