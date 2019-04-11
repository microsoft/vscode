/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event, Emitter } from 'vs/base/common/event';
import { ipcRenderer as ipc } from 'electron';
import { ILogService } from 'vs/platform/log/common/log';
import { Disposable } from 'vs/base/common/lifecycle';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { IWindowService } from 'vs/platform/windows/common/windows';
import { IBroadcastService, IBroadcast } from 'vs/workbench/services/broadcast/common/broadcast';

class BroadcastService extends Disposable implements IBroadcastService {
	_serviceBrand: any;

	private readonly _onBroadcast: Emitter<IBroadcast> = this._register(new Emitter<IBroadcast>());
	get onBroadcast(): Event<IBroadcast> { return this._onBroadcast.event; }

	private windowId: number;

	constructor(
		@IWindowService readonly windowService: IWindowService,
		@ILogService private readonly logService: ILogService
	) {
		super();

		this.windowId = windowService.windowId;

		this.registerListeners();
	}

	private registerListeners(): void {
		ipc.on('vscode:broadcast', (event: unknown, b: IBroadcast) => {
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
