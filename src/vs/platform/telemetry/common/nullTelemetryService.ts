/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import {TPromise} from 'vs/base/common/winjs.base';
import {IDisposable, empty} from 'vs/base/common/lifecycle';
import {ITimerEvent, nullEvent} from 'vs/base/common/timer';
import {ITelemetryService, ITelemetryInfo} from 'vs/platform/telemetry/common/telemetry';
import {IInstantiationService} from 'vs/platform/instantiation/common/instantiation';

export class NullTelemetryService implements ITelemetryService {

	static Instance = new NullTelemetryService();

	public serviceId = ITelemetryService;

	private _sessionId = 'someValue.sessionId';
	private _instanceId = 'someValue.instanceId';
	private _machineId = 'someValue.machineId';

	publicLog(eventName: string, data?: any): void {
	}

	start(name: string, data?: any): ITimerEvent {
		return nullEvent;
	}

	getAppendersCount(): number {
		return 0;
	}

	getAppenders(): any[] {
		return [];
	}

	addTelemetryAppender(appender): IDisposable {
		return empty;
	}

	dispose(): void {
	}

	getSessionId(): string {
		return this._sessionId;
	}

	getTelemetryInfo(): TPromise<ITelemetryInfo> {
		return TPromise.as({
			instanceId: this._instanceId,
			sessionId: this._sessionId,
			machineId: this._machineId
		});
	}

	setInstantiationService(instantiationService: IInstantiationService) {
	}
}