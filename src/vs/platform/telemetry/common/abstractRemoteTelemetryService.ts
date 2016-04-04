/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import AbstractTelemetryService = require('vs/platform/telemetry/common/abstractTelemetryService');
import {ITelemetryService, ITelemetryInfo, ITelemetryAppender} from 'vs/platform/telemetry/common/telemetry';
import {Remotable, IThreadService} from 'vs/platform/thread/common/thread';

/**
 * Helper always instantiated in the main process to receive telemetry events from remote telemetry services
 */
@Remotable.MainContext('RemoteTelemetryServiceHelper')
export class RemoteTelemetryServiceHelper {

	private _telemetryService: ITelemetryService;

	constructor( @ITelemetryService telemetryService: ITelemetryService) {
		this._telemetryService = telemetryService;
	}

	public _handleRemoteTelemetryEvent(eventName: string, data?: any): void {
		this._telemetryService.publicLog(eventName, data);
	}

	public getTelemetryInfo(): TPromise<ITelemetryInfo> {
		return this._telemetryService.getTelemetryInfo();
	}
}

/**
 * Base class for remote telemetry services (instantiated in extension host or in web workers)
 */
export class AbstractRemoteTelemetryService extends AbstractTelemetryService.AbstractTelemetryService implements ITelemetryService {

	private _proxy: RemoteTelemetryServiceHelper;

	constructor(threadService: IThreadService) {
		// Log all events including public, since they will be forwarded to the main which will do the real filtering
		super();
		this._proxy = threadService.getRemotable(RemoteTelemetryServiceHelper);
	}

	getTelemetryInfo(): TPromise<ITelemetryInfo> {
		return this._proxy.getTelemetryInfo();
	}

	public addTelemetryAppender(appender: ITelemetryAppender): void {
		throw new Error('Telemetry appenders are not supported in this execution envirnoment');
	}

	protected handleEvent(eventName: string, data?: any): void {
		this._proxy._handleRemoteTelemetryEvent(eventName, data);
	}
}

