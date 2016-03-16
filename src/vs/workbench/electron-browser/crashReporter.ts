/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import nls = require('vs/nls');
import {IConfigurationRegistry, Extensions} from 'vs/platform/configuration/common/configurationRegistry';
import {IConfigurationService} from 'vs/platform/configuration/common/configuration';
import {ITelemetryService} from 'vs/platform/telemetry/common/telemetry';
import {Registry} from 'vs/platform/platform';

import {ipcRenderer as ipc, crashReporter} from 'electron';

let TELEMETRY_SECTION_ID = 'telemetry';

let configurationRegistry = <IConfigurationRegistry>Registry.as(Extensions.Configuration);
configurationRegistry.registerConfiguration({
	'id': TELEMETRY_SECTION_ID,
	'order': 20,
	'type': 'object',
	'title': nls.localize('telemetryConfigurationTitle', "Telemetry configuration"),
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
		@ITelemetryService private telemetryService: ITelemetryService,
		@IConfigurationService private configurationService: IConfigurationService
	) {
		this.configurationService = configurationService;
		this.telemetryService = telemetryService;
		this.sessionId = this.telemetryService ? this.telemetryService.getSessionId() : null;
		this.version = version;
		this.commit = commit;

		this.isStarted = false;
		this.config = null;
	}

	public start(rawConfiguration:Electron.CrashReporterStartOptions): void {
		if (!this.isStarted) {
			if (!this.config) {
				this.configurationService.loadConfiguration(TELEMETRY_SECTION_ID).done((c) => {
					this.config = c;
					if (this.config && this.config.enableCrashReporter) {
						this.doStart(rawConfiguration);
					}
				});
			} else {
				if (this.config.enableCrashReporter) {
					this.doStart(rawConfiguration);
				}
			}
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