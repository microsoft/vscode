/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

const { createModuleDescription, createEditorWorkerModuleDescription } = require('../base/buildfile');

exports.collectModules = function () {
	return [
		createEditorWorkerModuleDescription('vs/workbench/contrib/output/common/outputLinkComputer'),
		createModuleDescription('vs/code/browser/workbench/workbench', ['vs/workbench/workbench.web.api']),
	];
};
