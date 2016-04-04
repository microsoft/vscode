/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import {ITelemetryService, ITelemetryInfo} from 'vs/platform/telemetry/common/telemetry';
import {IInstantiationService} from 'vs/platform/instantiation/common/instantiation';

export class NullTelemetryService implements ITelemetryService {
	public serviceId = ITelemetryService;

	protected sessionId: string = null;
	protected instanceId: string = null;
	protected machineId: string = null;

	publicLog(eventName: string, data?: any): void {
	}

	start(name: string, data?: any): any {
		return null;
	}

	getAppendersCount(): number {
		return -1;
	}

	getAppenders(): any[] {
		return [];
	}

	addTelemetryAppender(appender): void {
	}

	removeTelemetryAppender(appender): void {
	}

	dispose(): void {
	}

	getSessionId(): string {
		return this.sessionId;
	}

	getMachineId(): string {
		return this.machineId;
	}

	getInstanceId(): string {
		return this.instanceId;
	}

	getTelemetryInfo(): TPromise<ITelemetryInfo> {
		return TPromise.as({
			instanceId: this.instanceId,
			sessionId: this.sessionId,
			machineId: this.machineId
		});
	}

	setInstantiationService(instantiationService: IInstantiationService) {
	}
}