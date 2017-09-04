/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import nls = require('vs/nls');
import { IConfigurationRegistry, Extensions } from 'vs/platform/configuration/common/configurationRegistry';
import { Registry } from 'vs/platform/registry/common/platform';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';

export const ICrashReporterService = createDecorator<ICrashReporterService>('crashReporterService');

export const TELEMETRY_SECTION_ID = 'telemetry';

export interface ICrashReporterConfig {
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

export interface ICrashReporterService {
	_serviceBrand: any;
	getChildProcessStartOptions(processName: string): Electron.CrashReporterStartOptions;
}

export const NullCrashReporterService: ICrashReporterService = {
	_serviceBrand: undefined,
	getChildProcessStartOptions(processName: string) { return undefined; }
};