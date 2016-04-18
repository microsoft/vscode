/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {TPromise} from 'vs/base/common/winjs.base';
import {IDisposable} from 'vs/base/common/lifecycle';
import {ITimerEvent, nullEvent} from 'vs/base/common/timer';
import {createDecorator, ServiceIdentifier, IInstantiationService, ServicesAccessor, IConstructorSignature0} from 'vs/platform/instantiation/common/instantiation';

export const ITelemetryService = createDecorator<ITelemetryService>('telemetryService');

export interface ITelemetryInfo {
	sessionId: string;
	machineId: string;
	instanceId: string;
}

export interface ITelemetryService {
	serviceId: ServiceIdentifier<any>;

	/**
	 * Sends a telemetry event that has been privacy approved.
	 * Do not call this unless you have been given approval.
	 */
	publicLog(eventName: string, data?: any): void;

	/**
	 * Starts a telemetry timer. Call stop() to send the event.
	 */
	timedPublicLog(name: string, data?: any): ITimerEvent;

	getTelemetryInfo(): TPromise<ITelemetryInfo>;

	addTelemetryAppender(appender: ITelemetryAppender): IDisposable;
}

export namespace Extenstions {

	let _telemetryAppenderCtors: IConstructorSignature0<ITelemetryAppender>[] = [];

	export const TelemetryAppenders = {
		activate(accessor: ServicesAccessor): void {
			const telemetryService = accessor.get(ITelemetryService);
			const instantiationService = accessor.get(IInstantiationService);
			for (let ctor of _telemetryAppenderCtors) {
				const instance = instantiationService.createInstance(ctor);
				telemetryService.addTelemetryAppender(instance);
			}
			// can only be done once
			_telemetryAppenderCtors = undefined;
		},
		registerTelemetryAppenderDescriptor(ctor: IConstructorSignature0<ITelemetryAppender>): void {
			_telemetryAppenderCtors.push(ctor);
		}
	};
};

export interface ITelemetryAppendersRegistry {
	activate(instantiationService: IInstantiationService): void;
}

export const NullTelemetryService: ITelemetryService = {
	serviceId: undefined,
	timedPublicLog(name: string, data?: any): ITimerEvent { return nullEvent; },
	publicLog(eventName: string, data?: any): void { },
	addTelemetryAppender(appender): IDisposable { return { dispose() { } }; },
	getTelemetryInfo(): TPromise<ITelemetryInfo> {
		return TPromise.as({
			instanceId: 'someValue.instanceId',
			sessionId: 'someValue.sessionId',
			machineId: 'someValue.machineId'
		});
	}
};

export interface ITelemetryAppender extends IDisposable {
	log(eventName: string, data?: any): void;
}

// --- util

export function anonymize(input: string): string {
	if (!input) {
		return input;
	}

	let r = '';
	for (let i = 0; i < input.length; i++) {
		let ch = input[i];
		if (ch >= '0' && ch <= '9') {
			r += '0';
			continue;
		}
		if (ch >= 'a' && ch <= 'z') {
			r += 'a';
			continue;
		}
		if (ch >= 'A' && ch <= 'Z') {
			r += 'A';
			continue;
		}
		r += ch;
	}
	return r;
}