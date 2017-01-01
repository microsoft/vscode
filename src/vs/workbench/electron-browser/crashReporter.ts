/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import nls = require('vs/nls');
import { onUnexpectedError } from 'vs/base/common/errors';
import { assign, clone } from 'vs/base/common/objects';
import { IConfigurationRegistry, Extensions } from 'vs/platform/configuration/common/configurationRegistry';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IWindowsService } from 'vs/platform/windows/common/windows';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { Registry } from 'vs/platform/platform';
import { crashReporter } from 'electron';
import product from 'vs/platform/node/product';
import pkg from 'vs/platform/node/package';

const TELEMETRY_SECTION_ID = 'telemetry';

interface ICrashReporterConfig {
	enableCrashReporter: boolean;
}

const configurationRegistry = <IConfigurationRegistry>Registry.as(Extensions.Configuration);
configurationRegistry.registerConfiguration({
	'id': TELEMETRY_SECTION_ID,
	'order': 110,
	title: nls.localize('telemetryConfigurationTitle', "Telemetry"),
	'type': 'object',
	'properties': {
		'telemetry.enableCrashReporter': {
			'type': 'boolean',
			'description': nls.localize('telemetry.enableCrashReporting', "Enable crash reports to be sent to Microsoft.\nThis option requires restart to take effect."),
			'default': true
		}
	}
});

export class CrashReporter {

	constructor(
		configuration: Electron.CrashReporterStartOptions,
		@ITelemetryService telemetryService: ITelemetryService,
		@IWindowsService windowsService: IWindowsService,
		@IConfigurationService configurationService: IConfigurationService
	) {
		const config = configurationService.getConfiguration<ICrashReporterConfig>(TELEMETRY_SECTION_ID);

		if (!config.enableCrashReporter) {
			return;
		}

		telemetryService.getTelemetryInfo()
			.then(info => ({ vscode_sessionId: info.sessionId, vscode_version: pkg.version, vscode_commit: product.commit }))
			.then(extra => assign(configuration, { extra }))
			.then(configuration => {
				// start crash reporter right here
				crashReporter.start(clone(configuration));

				// TODO: start crash reporter in the main process
				return windowsService.startCrashReporter(configuration);
			})
			.done(null, onUnexpectedError);
	}
}