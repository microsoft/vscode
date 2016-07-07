/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {notImplemented} from 'vs/base/common/errors';
import {TPromise} from 'vs/base/common/winjs.base';
import {ITelemetryService, ITelemetryInfo} from 'vs/platform/telemetry/common/telemetry';
import {IThreadService} from 'vs/workbench/services/thread/common/threadService';
import {MainContext, MainThreadTelemetryShape} from './extHostProtocol';

export class RemoteTelemetryService implements ITelemetryService {

	_serviceBrand: any;

	private _name: string;
	private _proxy: MainThreadTelemetryShape;

	constructor(name: string, threadService: IThreadService) {
		this._name = name;
		this._proxy = threadService.get(MainContext.MainThreadTelemetry);
	}

	get isOptedIn(): boolean {
		throw notImplemented();
	}

	getTelemetryInfo(): TPromise<ITelemetryInfo> {
		return this._proxy.$getTelemetryInfo();
	}

	publicLog(eventName: string, data?: any): TPromise<void> {
		data = data || Object.create(null);
		data[this._name] = true;
		this._proxy.$publicLog(eventName, data);
		return TPromise.as(null);
	}

	timedPublicLog(): any {
		throw notImplemented();
	}

	addTelemetryAppender(): any {
		throw notImplemented();
	}
}
