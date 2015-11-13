/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import arrays = require('vs/base/common/arrays');
import winjs = require('vs/base/common/winjs.base');
import {EventProvider} from 'vs/base/common/eventProvider';
import {EventSource} from 'vs/base/common/eventSource';

import {ILifecycleService, IBeforeShutdownParticipant} from './lifecycle';

export class BaseLifecycleService implements ILifecycleService {
	public serviceId = ILifecycleService;

	private _beforeShutdownParticipants: IBeforeShutdownParticipant[];
	private _onShutdown: EventSource<() => void>;

	constructor() {
		this._beforeShutdownParticipants = [];
		this._onShutdown = new EventSource<() => void>();
	}

	protected fireShutdown(): void{
		this._onShutdown.fire();
	}

	public addBeforeShutdownParticipant(p: IBeforeShutdownParticipant): void {
		this._beforeShutdownParticipants.push(p);
	}

	protected get beforeShutdownParticipants(): IBeforeShutdownParticipant[] {
		return this._beforeShutdownParticipants;
	}

	public get onShutdown(): EventProvider<() => void> {
		return this._onShutdown.value;
	}
}
