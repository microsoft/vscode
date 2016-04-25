/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as Platform from 'vs/base/common/platform';
import * as uuid from 'vs/base/common/uuid';
import {ITelemetryService, ITelemetryAppender, ITelemetryInfo} from 'vs/platform/telemetry/common/telemetry';
import ErrorTelemetry from 'vs/platform/telemetry/common/errorTelemetry';
import {IdleMonitor, UserStatus} from 'vs/base/browser/idleMonitor';
import {TPromise} from 'vs/base/common/winjs.base';
import {IDisposable, dispose} from 'vs/base/common/lifecycle';
import {TimeKeeper, ITimerEvent} from 'vs/base/common/timer';
import {withDefaults, cloneAndChange} from 'vs/base/common/objects';

export interface ITelemetryServiceConfig {
	userOptIn?: boolean;

	enableHardIdle?: boolean;
	enableSoftIdle?: boolean;
	sessionID?: string;
	commitHash?: string;
	version?: string;

	cleanupPatterns?: [RegExp,string][];
}

export class TelemetryService implements ITelemetryService {

	// how long of inactivity before a user is considered 'inactive' - 2 minutes
	public static SOFT_IDLE_TIME = 2 * 60 * 1000;
	public static IDLE_START_EVENT_NAME = 'UserIdleStart';
	public static IDLE_STOP_EVENT_NAME = 'UserIdleStop';

	public static ERROR_FLUSH_TIMEOUT: number = 5 * 1000;

	public serviceId = ITelemetryService;

	protected _telemetryInfo: ITelemetryInfo;
	protected _configuration: ITelemetryServiceConfig;
	protected _appenders: ITelemetryAppender[] = [];
	protected _disposables: IDisposable[] = [];

	private _timeKeeper: TimeKeeper;
	private _hardIdleMonitor: IdleMonitor;
	private _softIdleMonitor: IdleMonitor;
	private _eventCount = 0;
	private _startTime = new Date();
	private _optInFriendly = ['optInStatus']; //holds a cache of predefined events that can be sent regardress of user optin status
	private _userIdHash: string;

	constructor(config?: ITelemetryServiceConfig) {
		this._configuration = withDefaults(config, <ITelemetryServiceConfig>{
			cleanupPatterns: [],
			sessionID: uuid.generateUuid() + Date.now(),
			enableHardIdle: true,
			enableSoftIdle: true,
			userOptIn: true,
		});

		// static cleanup patterns for:
		// #1 `file:///DANGEROUS/PATH/resources/app/Useful/Information`
		// #2 // Any other file path that doesn't match the approved form above should be cleaned.
		// #3 "Error: ENOENT; no such file or directory" is often followed with PII, clean it
		this._configuration.cleanupPatterns.push(
			[/file:\/\/\/.*?\/resources\/app\//gi, ''],
			[/file:\/\/\/.*/gi, ''],
			[/ENOENT: no such file or directory.*?\'([^\']+)\'/gi, 'ENOENT: no such file or directory']
		);

		this._telemetryInfo = {
			sessionId: this._configuration.sessionID,
			instanceId: undefined,
			machineId: undefined
		};

		this._timeKeeper = new TimeKeeper();
		this._disposables.push(this._timeKeeper);
		this._disposables.push(this._timeKeeper.addListener(events => this._onTelemetryTimerEventStop(events)));

		const errorTelemetry = new ErrorTelemetry(this, TelemetryService.ERROR_FLUSH_TIMEOUT);
		this._disposables.push(errorTelemetry);

		if (this._configuration.enableHardIdle) {
			this._hardIdleMonitor = new IdleMonitor();
			this._disposables.push(this._hardIdleMonitor);
		}
		if (this._configuration.enableSoftIdle) {
			this._softIdleMonitor = new IdleMonitor(TelemetryService.SOFT_IDLE_TIME);
			this._softIdleMonitor.addOneTimeActiveListener(() => this._onUserActive());
			this._softIdleMonitor.addOneTimeIdleListener(() => this._onUserIdle());
			this._disposables.push(this._softIdleMonitor);
		}
	}

	private _onUserIdle(): void {
		this.publicLog(TelemetryService.IDLE_START_EVENT_NAME);
		this._softIdleMonitor.addOneTimeIdleListener(() => this._onUserIdle());
	}

	private _onUserActive(): void {
		this.publicLog(TelemetryService.IDLE_STOP_EVENT_NAME);
		this._softIdleMonitor.addOneTimeActiveListener(() => this._onUserActive());
	}

	private _onTelemetryTimerEventStop(events: ITimerEvent[]): void {
		for (let i = 0; i < events.length; i++) {
			let event = events[i];
			let data = event.data || {};
			data.duration = event.timeTaken();
			this.publicLog(event.name, data);
		}
	}

	public getTelemetryInfo(): TPromise<ITelemetryInfo> {
		return TPromise.as(this._telemetryInfo);
	}

	public dispose(): void {
		this._disposables = dispose(this._disposables);
		for (let appender of this._appenders) {
			appender.dispose();
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

	private _handleEvent(eventName: string, data?: any): void {
		if (this._hardIdleMonitor && this._hardIdleMonitor.getStatus() === UserStatus.Idle) {
			return;
		}

		// don't send events when the user is optout unless the event is flaged as optin friendly
		if (!this._configuration.userOptIn && this._optInFriendly.indexOf(eventName) === -1) {
			return;
		}

		this._eventCount++;

		if (!data) {
			data = Object.create(null);
		}

		// (first) add common properties
		let eventDate: Date = new Date();
		data['sessionID'] = this._telemetryInfo.sessionId;
		data['timestamp'] = eventDate;
		data['version'] = this._configuration.version;
		data['userId'] = this._userIdHash;
		data['commitHash'] = this._configuration.commitHash;
		data['common.platform'] = Platform.Platform[Platform.platform];
		data['common.timesincesessionstart'] = (eventDate.getTime() - this._startTime.getTime());
		data['common.sequence'] = this._eventCount;
		data['common.instanceId'] = this._telemetryInfo.instanceId;
		data['common.machineId'] = this._telemetryInfo.machineId;

		// (last) remove all PII from data
		data = cloneAndChange(data, value => {
			if (typeof value === 'string') {
				return this._cleanupInfo(value);
			}
		});

		for (let appender of this._appenders) {
			appender.log(eventName, data);
		}
	}

	private _cleanupInfo(stack: string): string {

		// sanitize with configured cleanup patterns
		for (let tuple of this._configuration.cleanupPatterns) {
			let [regexp, replaceValue] = tuple;
			stack = stack.replace(regexp, replaceValue);
		}

		return stack;
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
}

