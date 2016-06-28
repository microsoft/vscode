/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import nls = require('vs/nls');
import {TPromise} from 'vs/base/common/winjs.base';
import {onUnexpectedError} from 'vs/base/common/errors';
import {IConfigurationRegistry, Extensions} from 'vs/platform/configuration/common/configurationRegistry';
import {IConfigurationService} from 'vs/platform/configuration/common/configuration';
import {ITelemetryService, NullTelemetryService} from 'vs/platform/telemetry/common/telemetry';
import {Registry} from 'vs/platform/platform';

import {ipcRenderer as ipc, crashReporter} from 'electron';

let TELEMETRY_SECTION_ID = 'telemetry';

let configurationRegistry = <IConfigurationRegistry>Registry.as(Extensions.Configuration);
configurationRegistry.registerConfiguration({
	'id': TELEMETRY_SECTION_ID,
	'order': 110.5,
	'type': 'object',
	'properties': {
		'telemetry.enableCrashReporter': {
			'type': 'boolean',
			'description': nls.localize('telemetry.enableCrashReporting', "Enable crash reports to be sent to Microsoft.\n\t// This option requires restart to take effect."),
			'default': true
		}
	}
});

export class CrashReporter {
	private isStarted: boolean;
	private config: any;
	private version: string;
	private commit: string;
	private sessionId: string;

	constructor(version: string, commit: string,
		@ITelemetryService private telemetryService: ITelemetryService = NullTelemetryService,
		@IConfigurationService private configurationService: IConfigurationService
	) {
		this.configurationService = configurationService;
		this.telemetryService = telemetryService;
		this.version = version;
		this.commit = commit;

		this.isStarted = false;
		this.config = null;
	}

	public start(rawConfiguration:Electron.CrashReporterStartOptions): void {
		if (!this.isStarted) {

			let sessionId = !this.sessionId
				? this.telemetryService.getTelemetryInfo().then(info => this.sessionId = info.sessionId)
				: TPromise.as(undefined);

			sessionId.then(() => {
				if (!this.config) {
					this.config = this.configurationService.getConfiguration(TELEMETRY_SECTION_ID);
					if (this.config && this.config.enableCrashReporter) {
						this.doStart(rawConfiguration);
					}
				} else {
					if (this.config.enableCrashReporter) {
						this.doStart(rawConfiguration);
					}
				}
			}, onUnexpectedError);
		}
	}

	private doStart(rawConfiguration:Electron.CrashReporterStartOptions): void {
		const config = this.toConfiguration(rawConfiguration);

		crashReporter.start(config);

		//notify the main process to start the crash reporter
		ipc.send('vscode:startCrashReporter', config);
	}

	private toConfiguration(rawConfiguration:Electron.CrashReporterStartOptions): Electron.CrashReporterStartOptions {
		return JSON.parse(JSON.stringify(rawConfiguration, (key, value) => {
			if (value === '$(sessionId)') {
				return this.sessionId;
			}

			if (value === '$(version)') {
				return this.version;
			}

			if (value === '$(commit)') {
				return this.commit;
			}

			return value;
		}));
	}
}