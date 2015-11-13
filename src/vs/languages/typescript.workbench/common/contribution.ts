/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import env = require('vs/base/common/flags');
import modesExt = require('vs/editor/common/modes/modesRegistry');
import javascript = require('vs/languages/javascript/common/javascript.extensions');
import typescript = require('vs/languages/typescript/common/typescript');
import {AsyncDescriptor} from 'vs/platform/instantiation/common/descriptors';

// contributes the project resolver logic to TypeScript and JavaScript
// this guy is for the workbench, but not for the standalone editor

if (env.enableJavaScriptRewriting) {
	modesExt.registerWorkerParticipant('javascript', 'vs/languages/typescript/common/js/globalVariableRewriter', 'GlobalVariableCollector');
	modesExt.registerWorkerParticipant('javascript', 'vs/languages/typescript/common/js/angularServiceRewriter', 'AngularServiceRewriter');
	modesExt.registerWorkerParticipant('javascript', 'vs/languages/typescript/common/js/requireRewriter');
	modesExt.registerWorkerParticipant('javascript', 'vs/languages/typescript/common/js/defineRewriter');
	modesExt.registerWorkerParticipant('javascript', 'vs/languages/typescript/common/js/es6PropertyDeclarator');
	modesExt.registerWorkerParticipant('javascript', 'vs/languages/typescript/common/js/importAndExportRewriter', 'ImportsAndExportsCollector');
}

typescript.Extensions.setProjectResolver(new AsyncDescriptor<typescript.IProjectResolver2>(
	'vs/languages/typescript.workbench/common/projectResolver', undefined, { files: '**/*.ts', projects: '**/tsconfig.json', maxFilesPerProject: 1500 }));

javascript.Extensions.setProjectResolver(new AsyncDescriptor<typescript.IProjectResolver2>(
	'vs/languages/typescript.workbench/common/projectResolver', undefined, { files: '{**/*.js,**/*.d.ts}', projects: '**/jsconfig.json', maxFilesPerProject: 750 }));