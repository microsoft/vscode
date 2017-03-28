/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { localize } from 'vs/nls';
import { escapeRegExpCharacters } from 'vs/base/common/strings';
import { ITelemetryService, ITelemetryInfo, ITelemetryExperiments, ITelemetryData } from 'vs/platform/telemetry/common/telemetry';
import { ITelemetryAppender, defaultExperiments } from 'vs/platform/telemetry/common/telemetryUtils';
import { optional } from 'vs/platform/instantiation/common/instantiation';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IConfigurationRegistry, Extensions } from 'vs/platform/configuration/common/configurationRegistry';
import { TPromise } from 'vs/base/common/winjs.base';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { cloneAndChange, mixin } from 'vs/base/common/objects';
import { Registry } from 'vs/platform/platform';

export interface ITelemetryServiceConfig {
	appender: ITelemetryAppender;
	commonProperties?: TPromise<{ [name: string]: any }>;
	piiPaths?: string[];
	userOptIn?: boolean;
	experiments?: ITelemetryExperiments;
}

export class TelemetryService implements ITelemetryService {

	static IDLE_START_EVENT_NAME = 'UserIdleStart';
	static IDLE_STOP_EVENT_NAME = 'UserIdleStop';

	_serviceBrand: any;

	private _appender: ITelemetryAppender;
	private _commonProperties: TPromise<{ [name: string]: any; }>;
	private _piiPaths: string[];
	private _userOptIn: boolean;
	private _experiments: ITelemetryExperiments;

	private _disposables: IDisposable[] = [];
	private _cleanupPatterns: [RegExp, string][] = [];

	constructor(
		config: ITelemetryServiceConfig,
		@optional(IConfigurationService) private _configurationService: IConfigurationService
	) {
		this._appender = config.appender;
		this._commonProperties = config.commonProperties || TPromise.as({});
		this._piiPaths = config.piiPaths || [];
		this._userOptIn = typeof config.userOptIn === 'undefined' ? true : config.userOptIn;
		this._experiments = config.experiments || defaultExperiments;

		// static cleanup patterns for:
		// #1 `file:///DANGEROUS/PATH/resources/app/Useful/Information`
		// #2 // Any other file path that doesn't match the approved form above should be cleaned.
		// #3 "Error: ENOENT; no such file or directory" is often followed with PII, clean it
		this._cleanupPatterns.push(
			[/file:\/\/\/.*?\/resources\/app\//gi, ''],
			[/file:\/\/\/.*/gi, ''],
			[/ENOENT: no such file or directory.*?\'([^\']+)\'/gi, 'ENOENT: no such file or directory']
		);

		for (let piiPath of this._piiPaths) {
			this._cleanupPatterns.push([new RegExp(escapeRegExpCharacters(piiPath), 'gi'), '']);
		}

		if (this._configurationService) {
			this._updateUserOptIn();
			this._configurationService.onDidUpdateConfiguration(this._updateUserOptIn, this, this._disposables);
			this.publicLog('optInStatus', { optIn: this._userOptIn });
		}
	}

	private _updateUserOptIn(): void {
		const config = this._configurationService.getConfiguration<any>(TELEMETRY_SECTION_ID);
		this._userOptIn = config ? config.enableTelemetry : this._userOptIn;
	}

	get isOptedIn(): boolean {
		return this._userOptIn;
	}

	getExperiments(): ITelemetryExperiments {
		return this._experiments;
	}

	getTelemetryInfo(): TPromise<ITelemetryInfo> {
		return this._commonProperties.then(values => {
			// well known properties
			let sessionId = values['sessionID'];
			let instanceId = values['common.instanceId'];
			let machineId = values['common.machineId'];

			return { sessionId, instanceId, machineId };
		});
	}

	dispose(): void {
		this._disposables = dispose(this._disposables);
	}

	publicLog(eventName: string, data?: ITelemetryData): TPromise<any> {
		// don't send events when the user is optout
		if (!this._userOptIn) {
			return TPromise.as(undefined);
		}

		return this._commonProperties.then(values => {

			// (first) add common properties
			data = mixin(data, values);

			// (last) remove all PII from data
			data = cloneAndChange(data, value => {
				if (typeof value === 'string') {
					return this._cleanupInfo(value);
				}
				return undefined;
			});

			this._appender.log(eventName, data);

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
	'order': 110,
	'type': 'object',
	'title': localize('telemetryConfigurationTitle', "Telemetry"),
	'properties': {
		'telemetry.enableTelemetry': {
			'type': 'boolean',
			'description': localize('telemetry.enableTelemetry', "Enable usage data and errors to be sent to Microsoft."),
			'default': true
		}
	}
});