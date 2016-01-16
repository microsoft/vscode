/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import Event, {Emitter} from 'vs/base/common/event';

import {ILifecycleService, IBeforeShutdownParticipant} from './lifecycle';

export class BaseLifecycleService implements ILifecycleService {
	public serviceId = ILifecycleService;

	private _beforeShutdownParticipants: IBeforeShutdownParticipant[];
	private _onShutdown: Emitter<void>;

	constructor() {
		this._beforeShutdownParticipants = [];
		this._onShutdown = new Emitter<void>();
	}

	protected fireShutdown(): void {
		this._onShutdown.fire();
	}

	public addBeforeShutdownParticipant(p: IBeforeShutdownParticipant): void {
		this._beforeShutdownParticipants.push(p);
	}

	protected get beforeShutdownParticipants(): IBeforeShutdownParticipant[] {
		return this._beforeShutdownParticipants;
	}

	public get onShutdown(): Event<void> {
		return this._onShutdown.event;
	}
}
