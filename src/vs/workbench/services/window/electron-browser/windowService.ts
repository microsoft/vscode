/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import {ElectronWindow} from 'vs/workbench/electron-browser/window';
import {createDecorator, ServiceIdentifier} from 'vs/platform/instantiation/common/instantiation';
import {EventProvider} from 'vs/base/common/eventProvider';
import {EventSource} from 'vs/base/common/eventSource';

import remote = require('remote');
import ipc = require('ipc');

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

	broadcast(b: IBroadcast): void;

	onBroadcast: EventProvider<(b: IBroadcast) => void>;
}

export class WindowService implements IWindowService {
	public serviceId = IWindowService;

	private win: ElectronWindow;
	private _onBroadcast: EventSource<(b: IBroadcast) => void>;

	constructor() {
		this._onBroadcast = new EventSource<(b: IBroadcast) => void>();

		this.registerListeners();
	}

	private registerListeners(): void {
		ipc.on('vscode:broadcast', (b: IBroadcast) => {
			this._onBroadcast.fire(b);
		});
	}

	public get onBroadcast(): EventProvider<(event: IBroadcast) => void> {
		return this._onBroadcast.value;
	}

	public getWindowId(): number {
		return remote.getCurrentWindow().id;
	}

	public getWindow(): ElectronWindow {
		return this.win;
	}

	public registerWindow(win: ElectronWindow): void {
		this.win = win;
	}

	public broadcast(b: IBroadcast): void {
		ipc.send('vscode:broadcast', this.getWindowId(), {
			channel: b.channel,
			payload: b.payload
		});
	}
}