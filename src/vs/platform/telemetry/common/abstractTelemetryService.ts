/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import Errors = require('vs/base/common/errors');
import Types = require('vs/base/common/types');
import Platform = require('vs/base/common/platform');
import {TimeKeeper, IEventsListener, ITimerEvent} from 'vs/base/common/timer';
import {safeStringify, withDefaults} from 'vs/base/common/objects';
import {Registry} from 'vs/platform/platform';
import {ITelemetryService, ITelemetryAppender, ITelemetryInfo, ITelemetryServiceConfig} from 'vs/platform/telemetry/common/telemetry';
import {SyncDescriptor0} from 'vs/platform/instantiation/common/descriptors';
import {IInstantiationService} from 'vs/platform/instantiation/common/instantiation';

const DefaultTelemetryServiceConfig: ITelemetryServiceConfig = {
	enableTelemetry: true,
	enableHardIdle: true,
	enableSoftIdle: true,
	userOptIn: true
};

/**
 * Base class for main process telemetry services
 */
export abstract class AbstractTelemetryService implements ITelemetryService {
	public static ERROR_FLUSH_TIMEOUT: number = 5 * 1000;

	public serviceId = ITelemetryService;

	private timeKeeper: TimeKeeper;
	private appenders: ITelemetryAppender[];
	private oldOnError: any;
	private instantiationService: IInstantiationService;
	private timeKeeperListener: IEventsListener;
	private errorBuffer: { [stack: string]: any };
	private errorFlushTimeout: number;

	protected sessionId: string;
	protected instanceId: string;
	protected machineId: string;
	protected toUnbind: any[];

	protected config: ITelemetryServiceConfig;

	constructor(config?: ITelemetryServiceConfig) {
		this.sessionId = 'SESSION_ID_NOT_SET';
		this.timeKeeper = new TimeKeeper();
		this.toUnbind = [];
		this.appenders = [];
		this.timeKeeperListener = (events: ITimerEvent[]) => this.onTelemetryTimerEventStop(events);
		this.timeKeeper.addListener(this.timeKeeperListener);
		this.toUnbind.push(Errors.errorHandler.addListener(this.onErrorEvent.bind(this)));

		this.errorBuffer = Object.create(null);

		this.enableGlobalErrorHandler();

		this.errorFlushTimeout = -1;

		this.config = withDefaults(config, DefaultTelemetryServiceConfig);
	}

	private _safeStringify(data: any): string {
		return safeStringify(data);
	}

	private onTelemetryTimerEventStop(events: ITimerEvent[]): void {
		for (let i = 0; i < events.length; i++) {
			let event = events[i];
			let data = event.data || {};
			data.duration = event.timeTaken();
			this.publicLog(event.name, data);
		}
	}

	private onErrorEvent(e: any): void {

		if(!e) {
			return;
		}

		let error = Object.create(null);

		// unwrap nested errors from loader
		if (e.detail && e.detail.stack) {
			e = e.detail;
		}

		// work around behavior in workerServer.ts that breaks up Error.stack
		let stack = Array.isArray(e.stack) ? e.stack.join('\n') : e.stack;
		let message = e.message ? e.message : this._safeStringify(e);

		// errors without a stack are not useful telemetry
		if (!stack) {
			return;
		}

		error['message'] = this.cleanupInfo(message);
		error['stack'] = this.cleanupInfo(stack);

		this.addErrortoBuffer(error);
	}

	private addErrortoBuffer(e: any): void {
		if (this.errorBuffer[e.stack]) {
			this.errorBuffer[e.stack].count++;
		} else {
			e.count = 1;
			this.errorBuffer[e.stack] = e;
		}
		this.tryScheduleErrorFlush();
	}

	private tryScheduleErrorFlush(): void {
		if (this.errorFlushTimeout === -1) {
			this.errorFlushTimeout = setTimeout(() => this.flushErrorBuffer(), AbstractTelemetryService.ERROR_FLUSH_TIMEOUT);
		}
	}

	private flushErrorBuffer(): void {
		if (this.errorBuffer) {
			for (let stack in this.errorBuffer) {
				this.publicLog('UnhandledError', this.errorBuffer[stack]);
			}
		}

		this.errorBuffer = Object.create(null);
		this.errorFlushTimeout = -1;
	}

	private cleanupInfo(stack: string): string {

		// `file:///DANGEROUS/PATH/resources/app/Useful/Information`
		let reg = /file:\/\/\/.*?\/resources\/app\//gi;
		stack = stack.replace(reg, '');

		// Any other file path that doesn't match the approved form above should be cleaned.
		reg = /file:\/\/\/.*/gi;
		stack = stack.replace(reg, '');

		// "Error: ENOENT; no such file or directory" is often followed with PII, clean it
		reg = /ENOENT: no such file or directory.*?\'([^\']+)\'/gi;
		stack = stack.replace(reg, 'ENOENT: no such file or directory');
		return stack;
	}

	private enableGlobalErrorHandler(): void {
		if (Types.isFunction(Platform.globals.onerror)) {
			this.oldOnError = Platform.globals.onerror;
		}

		let that = this;
		let newHandler: any = function(message: string, filename: string, line: number, column?: number, e?: any) {
			that.onUncaughtError(message, filename, line, column, e);
			if (that.oldOnError) {
				that.oldOnError.apply(this, arguments);
			}
		};

		Platform.globals.onerror = newHandler;
	}

	private onUncaughtError(message: string, filename: string, line: number, column?: number, e?: any): void {
		filename = this.cleanupInfo(filename);
		message = this.cleanupInfo(message);
		let data: any = {
			message: message,
			filename: filename,
			line: line,
			column: column
		};

		if (e) {
			data.error = {
				name: e.name,
				message: e.message
			};

			if (e.stack) {

				if (Array.isArray(e.stack)) {
					e.stack = e.stack.join('\n');
				}

				data.stack = this.cleanupInfo(e.stack);
			}
		}

		if (!data.stack) {
			data.stack = data.message;
		}

		this.addErrortoBuffer(data);
	}

	private loadTelemetryAppendersFromRegistery(): void {
		let appendersRegistry = (<ITelemetryAppendersRegistry>Registry.as(Extenstions.TelemetryAppenders)).getTelemetryAppenderDescriptors();

		for (let i = 0; i < appendersRegistry.length; i++) {
			let descriptor = appendersRegistry[i];
			let appender = this.instantiationService.createInstance(descriptor);
			this.addTelemetryAppender(appender);
		}
	}

	public getSessionId(): string {
		return this.sessionId;
	}

	public getMachineId(): string {
		return this.machineId;
	}

	public getInstanceId(): string {
		return this.instanceId;
	}

	public getTelemetryInfo(): TPromise<ITelemetryInfo> {
		return TPromise.as({
			instanceId: this.instanceId,
			sessionId: this.sessionId,
			machineId: this.machineId
		});
	}

	public dispose(): void {
		if (this.errorFlushTimeout !== -1) {
			clearTimeout(this.errorFlushTimeout);
			this.flushErrorBuffer();
		}

		while (this.toUnbind.length) {
			this.toUnbind.pop()();
		}
		this.timeKeeper.removeListener(this.timeKeeperListener);
		this.timeKeeper.dispose();

		for (let i = 0; i < this.appenders.length; i++) {
			this.appenders[i].dispose();
		}
	}

	public start(name: string, data?: any): ITimerEvent {
		let topic = 'public';
		let event = this.timeKeeper.start(topic, name);
		if (data) {
			event.data = data;
		}
		return event;
	}

	public publicLog(eventName: string, data?: any): void {
		this.handleEvent(eventName, data);
	}

	public getAppendersCount(): number {
		return this.appenders.length;
	}

	public getAppenders(): ITelemetryAppender[] {
		return this.appenders;
	}

	public addTelemetryAppender(appender: ITelemetryAppender): void {
		this.appenders.push(appender);
	}

	public removeTelemetryAppender(appender: ITelemetryAppender): void {
		let index = this.appenders.indexOf(appender);

		if (index > -1) {
			this.appenders.splice(index, 1);
		}
	}

	public setInstantiationService(instantiationService: IInstantiationService): void {
		this.instantiationService = instantiationService;

		if (this.instantiationService) {
			this.loadTelemetryAppendersFromRegistery();
		}
	}

	protected handleEvent(eventName: string, data?: any): void {
		throw new Error('Not implemented!');
	}
}

export const Extenstions = {
	TelemetryAppenders: 'telemetry.appenders'
};

export interface ITelemetryAppendersRegistry {
	registerTelemetryAppenderDescriptor(appenderDescriptor: SyncDescriptor0<ITelemetryAppender>): void;
	getTelemetryAppenderDescriptors(): SyncDescriptor0<ITelemetryAppender>[];
}

class TelemetryAppendersRegistry implements ITelemetryAppendersRegistry {

	private telemetryAppenderDescriptors: SyncDescriptor0<ITelemetryAppender>[];

	constructor() {
		this.telemetryAppenderDescriptors = [];
	}

	public registerTelemetryAppenderDescriptor(descriptor: SyncDescriptor0<ITelemetryAppender>): void {
		this.telemetryAppenderDescriptors.push(descriptor);
	}

	public getTelemetryAppenderDescriptors(): SyncDescriptor0<ITelemetryAppender>[] {
		return this.telemetryAppenderDescriptors;
	}
}

Registry.add(Extenstions.TelemetryAppenders, new TelemetryAppendersRegistry());