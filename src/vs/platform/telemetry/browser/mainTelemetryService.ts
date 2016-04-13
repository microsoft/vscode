/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as Platform from 'vs/base/common/platform';
import * as uuid from 'vs/base/common/uuid';
import {ITelemetryService, ITelemetryServiceConfig, ITelemetryAppender, ITelemetryInfo} from 'vs/platform/telemetry/common/telemetry';
import {IdleMonitor, UserStatus} from 'vs/base/browser/idleMonitor';
import {TPromise} from 'vs/base/common/winjs.base';
import {IDisposable} from 'vs/base/common/lifecycle';
import Errors = require('vs/base/common/errors');
import {TimeKeeper, IEventsListener, ITimerEvent} from 'vs/base/common/timer';
import {safeStringify, withDefaults, cloneAndChange} from 'vs/base/common/objects';


const DefaultTelemetryServiceConfig: ITelemetryServiceConfig = {
	enableHardIdle: true,
	enableSoftIdle: true,
	userOptIn: true,
	cleanupPatterns: []
};

/**
 * Base class for main process telemetry services
 */
export abstract class AbstractTelemetryService implements ITelemetryService {

	public static ERROR_FLUSH_TIMEOUT: number = 5 * 1000;

	public serviceId = ITelemetryService;

	private _timeKeeper: TimeKeeper;
	private _oldOnError: any;
	private _timeKeeperListener: IEventsListener;
	private _errorBuffer: { [stack: string]: any };
	private _errorFlushTimeout: number;

	protected _config: ITelemetryServiceConfig;
	protected _sessionId: string;
	protected _instanceId: string;
	protected _machineId: string;
	protected _appenders: ITelemetryAppender[] = [];
	protected _toUnbind: any[] = [];

	constructor(config?: ITelemetryServiceConfig) {
		this._config = withDefaults(config, DefaultTelemetryServiceConfig);
		this._sessionId = 'SESSION_ID_NOT_SET';
		this._timeKeeper = new TimeKeeper();

		this._timeKeeperListener = (events: ITimerEvent[]) => this._onTelemetryTimerEventStop(events);
		this._timeKeeper.addListener(this._timeKeeperListener);
		this._toUnbind.push(Errors.errorHandler.addListener(this._onErrorEvent.bind(this)));

		this._errorBuffer = Object.create(null);
		this._enableGlobalErrorHandler();
		this._errorFlushTimeout = -1;
	}

	private _onTelemetryTimerEventStop(events: ITimerEvent[]): void {
		for (let i = 0; i < events.length; i++) {
			let event = events[i];
			let data = event.data || {};
			data.duration = event.timeTaken();
			this.publicLog(event.name, data);
		}
	}

	private _onErrorEvent(e: any): void {

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
		let message = e.message ? e.message : safeStringify(e);

		// errors without a stack are not useful telemetry
		if (!stack) {
			return;
		}

		error['message'] = this._cleanupInfo(message);
		error['stack'] = this._cleanupInfo(stack);

		this._addErrorToBuffer(error);
	}

	private _addErrorToBuffer(e: any): void {
		if (this._errorBuffer[e.stack]) {
			this._errorBuffer[e.stack].count++;
		} else {
			e.count = 1;
			this._errorBuffer[e.stack] = e;
		}
		this._tryScheduleErrorFlush();
	}

	private _tryScheduleErrorFlush(): void {
		if (this._errorFlushTimeout === -1) {
			this._errorFlushTimeout = setTimeout(() => this._flushErrorBuffer(), AbstractTelemetryService.ERROR_FLUSH_TIMEOUT);
		}
	}

	private _flushErrorBuffer(): void {
		if (this._errorBuffer) {
			for (let stack in this._errorBuffer) {
				this.publicLog('UnhandledError', this._errorBuffer[stack]);
			}
		}

		this._errorBuffer = Object.create(null);
		this._errorFlushTimeout = -1;
	}

	private _enableGlobalErrorHandler(): void {
		if (typeof Platform.globals.onerror === 'function') {
			this._oldOnError = Platform.globals.onerror;
		}

		let that = this;
		let newHandler: any = function(message: string, filename: string, line: number, column?: number, e?: any) {
			that._onUncaughtError(message, filename, line, column, e);
			if (that._oldOnError) {
				that._oldOnError.apply(this, arguments);
			}
		};

		Platform.globals.onerror = newHandler;
	}

	private _onUncaughtError(message: string, filename: string, line: number, column?: number, e?: any): void {
		filename = this._cleanupInfo(filename);
		message = this._cleanupInfo(message);
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

				data.stack = this._cleanupInfo(e.stack);
			}
		}

		if (!data.stack) {
			data.stack = data.message;
		}

		this._addErrorToBuffer(data);
	}

	public getTelemetryInfo(): TPromise<ITelemetryInfo> {
		return TPromise.as({
			instanceId: this._instanceId,
			sessionId: this._sessionId,
			machineId: this._machineId
		});
	}

	public dispose(): void {
		if (this._errorFlushTimeout !== -1) {
			clearTimeout(this._errorFlushTimeout);
			this._flushErrorBuffer();
		}

		while (this._toUnbind.length) {
			this._toUnbind.pop()();
		}
		this._timeKeeper.removeListener(this._timeKeeperListener);
		this._timeKeeper.dispose();

		for (let i = 0; i < this._appenders.length; i++) {
			this._appenders[i].dispose();
		}
	}

	public timedPublicLog(name: string, data?: any): ITimerEvent {
		let topic = 'public';
		let event = this._timeKeeper.start(topic, name);
		if (data) {
			event.data = data;
		}
		return event;
	}

	public publicLog(eventName: string, data?: any): void {
		this._handleEvent(eventName, data);
	}

	public addTelemetryAppender(appender: ITelemetryAppender): IDisposable {
		this._appenders.push(appender);
		return {
			dispose: () => {
				let index = this._appenders.indexOf(appender);
				if (index > -1) {
					this._appenders.splice(index, 1);
				}
			}
		};
	}

	protected _handleEvent(eventName: string, data?: any): void {
		throw new Error('Not implemented!');
	}


	protected _cleanupInfo(stack: string): string {

		// `file:///DANGEROUS/PATH/resources/app/Useful/Information`
		let reg = /file:\/\/\/.*?\/resources\/app\//gi;
		stack = stack.replace(reg, '');

		// Any other file path that doesn't match the approved form above should be cleaned.
		reg = /file:\/\/\/.*/gi;
		stack = stack.replace(reg, '');

		// "Error: ENOENT; no such file or directory" is often followed with PII, clean it
		reg = /ENOENT: no such file or directory.*?\'([^\']+)\'/gi;
		stack = stack.replace(reg, 'ENOENT: no such file or directory');

		// sanitize with configured cleanup patterns
		for (let pattern of this._config.cleanupPatterns) {
			stack = stack.replace(pattern, '');
		}

		return stack;
	}
}


export class MainTelemetryService extends AbstractTelemetryService implements ITelemetryService {
	// how long of inactivity before a user is considered 'inactive' - 2 minutes
	public static SOFT_IDLE_TIME = 2 * 60 * 1000;
	public static IDLE_START_EVENT_NAME = 'UserIdleStart';
	public static IDLE_STOP_EVENT_NAME = 'UserIdleStop';

	private _hardIdleMonitor: IdleMonitor;
	private _softIdleMonitor: IdleMonitor;
	private _eventCount: number;
	private _userIdHash: string;
	private _startTime: Date;
	private _optInFriendly: string[];

	constructor(config?: ITelemetryServiceConfig) {
		super(config);

		this._sessionId = this._config.sessionID || (uuid.generateUuid() + Date.now());

		if (this._config.enableHardIdle) {
			this._hardIdleMonitor = new IdleMonitor();
		}
		if (this._config.enableSoftIdle) {
			this._softIdleMonitor = new IdleMonitor(MainTelemetryService.SOFT_IDLE_TIME);
			this._softIdleMonitor.addOneTimeActiveListener(() => this._onUserActive());
			this._softIdleMonitor.addOneTimeIdleListener(() => this._onUserIdle());
		}

		this._eventCount = 0;
		this._startTime = new Date();

		//holds a cache of predefined events that can be sent regardress of user optin status
		this._optInFriendly = ['optInStatus'];
	}

	private _onUserIdle(): void {
		this.publicLog(MainTelemetryService.IDLE_START_EVENT_NAME);
		this._softIdleMonitor.addOneTimeIdleListener(() => this._onUserIdle());
	}

	private _onUserActive(): void {
		this.publicLog(MainTelemetryService.IDLE_STOP_EVENT_NAME);
		this._softIdleMonitor.addOneTimeActiveListener(() => this._onUserActive());
	}

	public dispose(): void {
		if (this._hardIdleMonitor) {
			this._hardIdleMonitor.dispose();
		}
		if (this._softIdleMonitor) {
			this._softIdleMonitor.dispose();
		}
		super.dispose();
	}

	protected _handleEvent(eventName: string, data?: any): void {
		if (this._hardIdleMonitor && this._hardIdleMonitor.getStatus() === UserStatus.Idle) {
			return;
		}

		// don't send events when the user is optout unless the event is flaged as optin friendly
		if(!this._config.userOptIn && this._optInFriendly.indexOf(eventName) === -1) {
			return;
		}

		this._eventCount++;

		data = data && cloneAndChange(data, value => typeof value === 'string' ? this._cleanupInfo(value) : void 0);
		data = this.addCommonProperties(data);

		for (let appender of this._appenders) {
			appender.log(eventName, data);
		}
	}

	protected addCommonProperties(data?: any): void {
		data = data || {};

		let eventDate: Date = new Date();
		data['sessionID'] = this._sessionId;
		data['timestamp'] = eventDate;
		data['version'] = this._config.version;
		data['userId'] = this._userIdHash;
		data['commitHash'] = this._config.commitHash;

		data['common.platform'] = Platform.Platform[Platform.platform];
		data['common.timesincesessionstart'] = (eventDate.getTime() - this._startTime.getTime());
		data['common.sequence'] = this._eventCount;
		data['common.instanceId'] = this._instanceId;
		data['common.machineId'] = this._machineId;
		return data;
	}
}
