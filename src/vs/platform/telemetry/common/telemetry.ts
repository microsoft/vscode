/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {Registry} from 'vs/platform/platform';
import {TPromise} from 'vs/base/common/winjs.base';
import {IDisposable} from 'vs/base/common/lifecycle';
import {ITimerEvent, nullEvent} from 'vs/base/common/timer';
import {createDecorator, ServiceIdentifier, IInstantiationService, IConstructorSignature0} from 'vs/platform/instantiation/common/instantiation';

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

export const Extenstions = {
	TelemetryAppenders: 'telemetry.appenders'
};

export interface ITelemetryAppendersRegistry {
	registerTelemetryAppenderDescriptor(ctor: IConstructorSignature0<ITelemetryAppender>): void;
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

export class TelemetryAppendersRegistry implements ITelemetryAppendersRegistry {

	private _telemetryAppenderCtors: IConstructorSignature0<ITelemetryAppender>[];

	constructor() {
		this._telemetryAppenderCtors = [];
	}

	public registerTelemetryAppenderDescriptor(ctor: IConstructorSignature0<ITelemetryAppender>): void {
		this._telemetryAppenderCtors.push(ctor);
	}

	public activate(instantiationService: IInstantiationService): void {
		const service = instantiationService.getInstance(ITelemetryService);
		for (let ctor of this._telemetryAppenderCtors) {
			const instance = instantiationService.createInstance(ctor);
			service.addTelemetryAppender(instance);
		}

		// can only be done once
		this._telemetryAppenderCtors = undefined;
	}
}

Registry.add(Extenstions.TelemetryAppenders, new TelemetryAppendersRegistry());

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