/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {EventProvider} from 'vs/base/common/eventProvider';
import {EventSource} from 'vs/base/common/eventSource';
import {ILifecycleService, IBeforeShutdownParticipant} from 'vs/platform/lifecycle/common/lifecycle';
import {IThreadService} from 'vs/platform/thread/common/thread';

class NullLifecycleService implements ILifecycleService {
	public serviceId = ILifecycleService;
	private _onBeforeShutdown: EventSource<() => any> = new EventSource<() => any>();
	private _onShutdown: EventSource<() => any> = new EventSource<() => any>();

	public addBeforeShutdownParticipant(p: IBeforeShutdownParticipant): void {
	}

	public get onShutdown(): EventProvider<() => any> {
		return this._onShutdown.value;
	}

	public setThreadService(service:IThreadService): void {

	}
}

export var Instance: ILifecycleService = new NullLifecycleService();