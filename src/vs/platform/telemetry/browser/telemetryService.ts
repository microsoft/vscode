/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as Platform from 'vs/base/common/platform';
import * as uuid from 'vs/base/common/uuid';
import {escapeRegExpCharacters} from 'vs/base/common/strings';
import {IWorkspaceContextService, IEnvironment} from 'vs/platform/workspace/common/workspace';
import {ITelemetryService, ITelemetryAppender, ITelemetryInfo} from 'vs/platform/telemetry/common/telemetry';
import ErrorTelemetry from 'vs/platform/telemetry/common/errorTelemetry';
import {IdleMonitor, UserStatus} from 'vs/base/browser/idleMonitor';
import {TPromise} from 'vs/base/common/winjs.base';
import {IDisposable, dispose} from 'vs/base/common/lifecycle';
import {TimeKeeper, ITimerEvent} from 'vs/base/common/timer';
import {withDefaults, cloneAndChange, mixin} from 'vs/base/common/objects';

export interface ITelemetryServiceConfig {
	appender: ITelemetryAppender[];
	commonProperties?: TPromise<{ [name: string]: any }>[];
	piiPaths?: string[];
	userOptIn?: boolean;
	enableHardIdle?: boolean;
	enableSoftIdle?: boolean;
}

function createDefaultProperties(environment: IEnvironment): { [name: string]: any } {

	let seq = 0;
	const startTime = Date.now();
	const sessionID = uuid.generateUuid() + Date.now();

	let result = {
		sessionID,
		commitHash: environment.commitHash,
		version: environment.version
	};

	// complex names and dynamic values
	Object.defineProperties(result, {
		'timestamp': {
			get: () => new Date(),
			enumerable: true
		},
		'common.timesincesessionstart': {
			get: () => Date.now() - startTime,
			enumerable: true
		},
		'common.platform': {
			get: () => Platform.Platform[Platform.platform],
			enumerable: true
		},
		'common.sequence': {
			get: () => seq++,
			enumerable: true
		}
	});

	return result;
}

export class TelemetryService implements ITelemetryService {

	// how long of inactivity before a user is considered 'inactive' - 2 minutes
	public static SOFT_IDLE_TIME = 2 * 60 * 1000;
	public static IDLE_START_EVENT_NAME = 'UserIdleStart';
	public static IDLE_STOP_EVENT_NAME = 'UserIdleStop';
	public static ERROR_FLUSH_TIMEOUT: number = 5 * 1000;

	public serviceId = ITelemetryService;

	protected _configuration: ITelemetryServiceConfig;
	protected _disposables: IDisposable[] = [];

	private _timeKeeper: TimeKeeper;
	private _hardIdleMonitor: IdleMonitor;
	private _softIdleMonitor: IdleMonitor;

	private _commonProperties: TPromise<{ [name: string]: any }>;
	private _cleanupPatterns: [RegExp, string][] = [];

	constructor(
		config: ITelemetryServiceConfig,
		@IWorkspaceContextService contextService: IWorkspaceContextService
	) {
		this._configuration = withDefaults(config, <ITelemetryServiceConfig>{
			appender: [],
			commonProperties: [],
			piiPaths: [],
			enableHardIdle: true,
			enableSoftIdle: true,
			userOptIn: true
		});

		this._commonProperties = TPromise.join(this._configuration.commonProperties)
			.then(values => values.reduce((p, c) => mixin(p, c), createDefaultProperties(contextService.getConfiguration().env)));

		// static cleanup patterns for:
		// #1 `file:///DANGEROUS/PATH/resources/app/Useful/Information`
		// #2 // Any other file path that doesn't match the approved form above should be cleaned.
		// #3 "Error: ENOENT; no such file or directory" is often followed with PII, clean it
		for (let piiPath of this._configuration.piiPaths) {
			this._cleanupPatterns.push([new RegExp(escapeRegExpCharacters(piiPath), 'gi'), '']);
		}
		this._cleanupPatterns.push(
			[/file:\/\/\/.*?\/resources\/app\//gi, ''],
			[/file:\/\/\/.*/gi, ''],
			[/ENOENT: no such file or directory.*?\'([^\']+)\'/gi, 'ENOENT: no such file or directory']
		);

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

	get isOptedIn(): boolean {
		return this._configuration.userOptIn;
	}

	public getTelemetryInfo(): TPromise<ITelemetryInfo> {
		return this._commonProperties.then(values => {
			// well known properties
			let sessionId = values['sessionID'];
			let instanceId = values['common.instanceId'];
			let machineId = values['common.machineId'];

			return { sessionId, instanceId, machineId };
		});
	}

	public dispose(): void {
		this._disposables = dispose(this._disposables);
		for (let appender of this._configuration.appender) {
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

		// don't send events when the user is optout unless the event is the opt{in|out} signal
		if (!this._configuration.userOptIn && eventName !== 'optInStatus') {
			return;
		}

		// (first) add common properties
		this._commonProperties.then(values => {

			data = mixin(data, values);

			// (last) remove all PII from data
			data = cloneAndChange(data, value => {
				if (typeof value === 'string') {
					return this._cleanupInfo(value);
				}
			});

			for (let appender of this._configuration.appender) {
				appender.log(eventName, data);
			}

		}).done(undefined, err => {
			console.error(err);
		});
	}

	private _cleanupInfo(stack: string): string {

		// sanitize with configured cleanup patterns
		for (let tuple of this._cleanupPatterns) {
			let [regexp, replaceValue] = tuple;
			stack = stack.replace(regexp, replaceValue);
		}

		return stack;
	}
}

