/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import env = require('vs/base/common/flags');
import {ModesRegistry} from 'vs/editor/common/modes/modesRegistry';
import javascript = require('vs/languages/javascript/common/javascript.extensions');
import typescript = require('vs/languages/typescript/common/typescript');
import {AsyncDescriptor} from 'vs/platform/instantiation/common/descriptors';

// contributes the project resolver logic to TypeScript and JavaScript
// this guy is for the workbench, but not for the standalone editor

if (env.enableJavaScriptRewriting && !env.enableTypeScriptServiceModeForJS) {
	ModesRegistry.registerWorkerParticipant('javascript', 'vs/languages/typescript/common/js/globalVariableRewriter', 'GlobalVariableCollector');
	ModesRegistry.registerWorkerParticipant('javascript', 'vs/languages/typescript/common/js/angularServiceRewriter', 'AngularServiceRewriter');
	ModesRegistry.registerWorkerParticipant('javascript', 'vs/languages/typescript/common/js/requireRewriter');
	ModesRegistry.registerWorkerParticipant('javascript', 'vs/languages/typescript/common/js/defineRewriter');
	ModesRegistry.registerWorkerParticipant('javascript', 'vs/languages/typescript/common/js/es6PropertyDeclarator');
	ModesRegistry.registerWorkerParticipant('javascript', 'vs/languages/typescript/common/js/importAndExportRewriter', 'ImportsAndExportsCollector');
}

typescript.Extensions.setProjectResolver(new AsyncDescriptor<typescript.IProjectResolver2>(
	'vs/languages/typescript.workbench/common/projectResolver', undefined, { files: '**/*.ts', projects: '**/tsconfig.json', maxFilesPerProject: 1500 }));

javascript.Extensions.setProjectResolver(new AsyncDescriptor<typescript.IProjectResolver2>(
	'vs/languages/typescript.workbench/common/projectResolver', undefined, { files: '{**/*.js,**/*.d.ts}', projects: '**/jsconfig.json', maxFilesPerProject: 750 }));