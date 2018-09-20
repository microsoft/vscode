/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

//@ts-check
'use strict';

// Set the below before requiring applicationinsights in the shared process
process.env['APPLICATION_INSIGHTS_NO_DIAGNOSTIC_CHANNEL'] = 'true'; // Skip monkey patching of 3rd party modules by appinsights
global['diagnosticsSource'] = {}; // Prevents diagnostic channel (which patches "require") from initializing entirely

const bootstrapWindow = require('../../../../bootstrap-window');

bootstrapWindow.load(['vs/code/electron-browser/sharedProcess/sharedProcessMain'], function (sharedProcess, configuration) {
	sharedProcess.startup({
		machineId: configuration.machineId
	});
});