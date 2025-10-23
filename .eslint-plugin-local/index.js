/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// @ts-check
const glob = require('glob');
const path = require('path');

require('ts-node').register({
	experimentalResolver: true,
	transpileOnly: true,
	compilerOptions: {
		module: 'nodenext',
		moduleResolution: 'nodenext',
	}
});

// Re-export all .ts files as rules
/** @type {Record<string, import('@typescript-eslint/utils/dist/ts-eslint').LooseRuleDefinition>} */
const rules = {};
glob.sync(`${__dirname}/*.ts`).forEach((file) => {
	rules[path.basename(file, '.ts')] = require(file);
});

exports.rules = rules;
