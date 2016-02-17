/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import Event, {Emitter} from 'vs/base/common/event';
import {ILifecycleService, IBeforeShutdownParticipant} from 'vs/platform/lifecycle/common/lifecycle';
import {IThreadService} from 'vs/platform/thread/common/thread';

class NullLifecycleService implements ILifecycleService {

	public serviceId = ILifecycleService;

	private _onShutdown: Emitter<any> = new Emitter<any>();

	public addBeforeShutdownParticipant(p: IBeforeShutdownParticipant): void {
	}

	public get onShutdown(): Event<any> {
		return this._onShutdown.event;
	}

	public setThreadService(service: IThreadService): void {

	}
}

export const Instance: ILifecycleService = new NullLifecycleService();