/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import {ElectronWindow} from 'vs/workbench/electron-browser/window';
import {createDecorator, ServiceIdentifier} from 'vs/platform/instantiation/common/instantiation';
import Event, {Emitter} from 'vs/base/common/event';

import {ipcRenderer as ipc, remote} from 'electron';

const windowId = remote.getCurrentWindow().id;

export var IWindowService = createDecorator<IWindowService>('windowService');

export interface IWindowServices {
	windowService?: IWindowService;
}

export interface IBroadcast {
	channel: string;
	payload: any;
}

export interface IWindowService {
	serviceId: ServiceIdentifier<any>;

	getWindowId(): number;

	getWindow(): ElectronWindow;

	registerWindow(win: ElectronWindow): void;

	broadcast(b: IBroadcast, target?: string): void;

	onBroadcast: Event<IBroadcast>;
}

export class WindowService implements IWindowService {
	public serviceId = IWindowService;

	private win: ElectronWindow;
	private windowId: number;
	private _onBroadcast: Emitter<IBroadcast>;

	constructor() {
		this._onBroadcast = new Emitter<IBroadcast>();
		this.windowId = windowId;

		this.registerListeners();
	}

	private registerListeners(): void {
		ipc.on('vscode:broadcast', (event, b: IBroadcast) => {
			this._onBroadcast.fire(b);
		});
	}

	public get onBroadcast(): Event<IBroadcast> {
		return this._onBroadcast.event;
	}

	public getWindowId(): number {
		return this.windowId;
	}

	public getWindow(): ElectronWindow {
		return this.win;
	}

	public registerWindow(win: ElectronWindow): void {
		this.win = win;
	}

	public broadcast(b: IBroadcast, target?: string): void {
		ipc.send('vscode:broadcast', this.getWindowId(), target, {
			channel: b.channel,
			payload: b.payload
		});
	}
}