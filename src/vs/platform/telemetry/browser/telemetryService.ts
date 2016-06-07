/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import {localize} from 'vs/nls';
import {escapeRegExpCharacters} from 'vs/base/common/strings';
import {ITelemetryService, ITelemetryAppender, ITelemetryInfo} from 'vs/platform/telemetry/common/telemetry';
import {optional} from 'vs/platform/instantiation/common/instantiation';
import {IConfigurationService} from 'vs/platform/configuration/common/configuration';
import {IConfigurationRegistry, Extensions} from 'vs/platform/configuration/common/configurationRegistry';
import {IIdleMonitor, IdleMonitor, UserStatus} from 'vs/base/browser/idleMonitor';
import {TPromise} from 'vs/base/common/winjs.base';
import {IDisposable, dispose} from 'vs/base/common/lifecycle';
import {TimeKeeper, ITimerEvent} from 'vs/base/common/timer';
import {cloneAndChange, mixin} from 'vs/base/common/objects';
import {Registry} from 'vs/platform/platform';

export interface ITelemetryServiceConfig {
	appender: ITelemetryAppender[];
	hardIdleMonitor?: IIdleMonitor;
	softIdleMonitor?: IIdleMonitor;
	commonProperties?: TPromise<{ [name: string]: any }>;
	piiPaths?: string[];
	userOptIn?: boolean;
}

export class TelemetryService implements ITelemetryService {

	// how long of inactivity before a user is considered 'inactive' - 2 minutes
	public static SOFT_IDLE_TIME = 2 * 60 * 1000;
	public static IDLE_START_EVENT_NAME = 'UserIdleStart';
	public static IDLE_STOP_EVENT_NAME = 'UserIdleStop';

	public serviceId = ITelemetryService;

	private _configuration: ITelemetryServiceConfig;
	private _disposables: IDisposable[] = [];
	private _timeKeeper: TimeKeeper;
	private _hardIdleMonitor: IIdleMonitor;
	private _softIdleMonitor: IIdleMonitor;
	private _cleanupPatterns: [RegExp, string][] = [];

	constructor(
		config: ITelemetryServiceConfig,
		@optional(IConfigurationService) private _configurationService: IConfigurationService
	) {
		this._configuration = mixin(config, <ITelemetryServiceConfig>{
			appender: [],
			commonProperties: TPromise.as({}),
			piiPaths: [],
			userOptIn: true
		}, false);

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

		this._hardIdleMonitor = this._configuration.hardIdleMonitor || new IdleMonitor();
		// TODO@joao remove
		this._disposables.push(this._hardIdleMonitor);

		this._softIdleMonitor = this._configuration.softIdleMonitor || new IdleMonitor(TelemetryService.SOFT_IDLE_TIME);
		this._disposables.push(this._softIdleMonitor.onStatusChange(status => this._onIdleStatus(status)));
		// TODO@joao remove
		this._disposables.push(this._softIdleMonitor);

		if (this._configurationService) {
			this._updateUserOptIn();
			this._configurationService.onDidUpdateConfiguration(this._updateUserOptIn, this, this._disposables);
			this.publicLog('optInStatus', { optIn: this._configuration.userOptIn });
		}
	}

	private _onIdleStatus(status: UserStatus): void {
		if (status === UserStatus.Active) {
			this._onUserActive();
		} else {
			this._onUserIdle();
		}
	}

	private _updateUserOptIn(): void {
		const config = this._configurationService.getConfiguration<any>(TELEMETRY_SECTION_ID);
		this._configuration.userOptIn = config ? config.enableTelemetry : this._configuration.userOptIn;
	}

	private _onUserIdle(): void {
		this.publicLog(TelemetryService.IDLE_START_EVENT_NAME);
	}

	private _onUserActive(): void {
		this.publicLog(TelemetryService.IDLE_STOP_EVENT_NAME);
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
		return this._configuration.commonProperties.then(values => {
			// well known properties
			let sessionId = values['sessionID'];
			let instanceId = values['common.instanceId'];
			let machineId = values['common.machineId'];

			return { sessionId, instanceId, machineId };
		});
	}

	public dispose(): void {
		this._disposables = dispose(this._disposables);
	}

	public timedPublicLog(name: string, data?: any): ITimerEvent {
		let topic = 'public';
		let event = this._timeKeeper.start(topic, name);
		if (data) {
			event.data = data;
		}
		return event;
	}

	public publicLog(eventName: string, data?: any): TPromise<any> {

		if (this._hardIdleMonitor && this._hardIdleMonitor.status === UserStatus.Idle) {
			return TPromise.as(undefined);
		}

		// don't send events when the user is optout unless the event is the opt{in|out} signal
		if (!this._configuration.userOptIn && eventName !== 'optInStatus') {
			return TPromise.as(undefined);
		}

		return this._configuration.commonProperties.then(values => {

			// (first) add common properties
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

		}, err => {
			// unsure what to do now...
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


const TELEMETRY_SECTION_ID = 'telemetry';

Registry.as<IConfigurationRegistry>(Extensions.Configuration).registerConfiguration({
	'id': TELEMETRY_SECTION_ID,
	'order': 20,
	'type': 'object',
	'title': localize('telemetryConfigurationTitle', "Telemetry configuration"),
	'properties': {
		'telemetry.enableTelemetry': {
			'type': 'boolean',
			'description': localize('telemetry.enableTelemetry', "Enable usage data and errors to be sent to Microsoft."),
			'default': true
		}
	}
});