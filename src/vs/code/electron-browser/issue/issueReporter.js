/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

//@ts-check
'use strict';

const bootstrapWindow = require('../../../../bootstrap-window');

bootstrapWindow.load(['vs/code/electron-browser/issue/issueReporterMain'], function (issueReporter, configuration) {
	issueReporter.startup(configuration);
}, { forceEnableDeveloperKeybindings: true });