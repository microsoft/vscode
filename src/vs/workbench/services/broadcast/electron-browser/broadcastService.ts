/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { Event, Emitter } from 'vs/base/common/event';
import { ipcRenderer as ipc } from 'electron';
import { ILogService } from 'vs/platform/log/common/log';
import { Disposable } from 'vs/base/common/lifecycle';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { IWindowService } from 'vs/platform/windows/common/windows';

export const IBroadcastService = createDecorator<IBroadcastService>('broadcastService');

export interface IBroadcast {
	channel: string;
	payload: any;
}

export interface IBroadcastService {
	_serviceBrand: any;

	onBroadcast: Event<IBroadcast>;

	broadcast(b: IBroadcast): void;
}

export class BroadcastService extends Disposable implements IBroadcastService {
	_serviceBrand: any;

	private readonly _onBroadcast: Emitter<IBroadcast> = this._register(new Emitter<IBroadcast>());
	get onBroadcast(): Event<IBroadcast> { return this._onBroadcast.event; }

	private windowId: number;

	constructor(
		@IWindowService readonly windowService: IWindowService,
		@ILogService private readonly logService: ILogService
	) {
		super();

		this.windowId = windowService.getCurrentWindowId();

		this.registerListeners();
	}

	private registerListeners(): void {
		ipc.on('vscode:broadcast', (event, b: IBroadcast) => {
			this.logService.trace(`Received broadcast from main in window ${this.windowId}: `, b);

			this._onBroadcast.fire(b);
		});
	}

	broadcast(b: IBroadcast): void {
		this.logService.trace(`Sending broadcast to main from window ${this.windowId}: `, b);

		ipc.send('vscode:broadcast', this.windowId, {
			channel: b.channel,
			payload: b.payload
		});
	}
}

registerSingleton(IBroadcastService, BroadcastService, true);