/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

const bootstrapWindow = require('../../../../bootstrap-window');

bootstrapWindow.load(['vs/code/electron-browser/issue/issueReporterMain'],

	function (loaderFilename, loaderSource, clb) {
		require('vm').runInThisContext(loaderSource, { filename: loaderFilename });

		clb(require);
	},

	function (issueReporter, configuration) {
		issueReporter.startup(configuration);
	});