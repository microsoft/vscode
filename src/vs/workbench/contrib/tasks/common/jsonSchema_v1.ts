/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from '../../../../nls.js';
import * as Objects from '../../../../base/common/objects.js';
import { IJSONSchema } from '../../../../base/common/jsonSchema.js';

import { ProblemMatcherRegistry } from './problemMatcher.js';

import commonSchema from './jsonSchemaCommon.js';

const schema: IJSONSchema = {
	oneOf: [
		{
			allOf: [
				{
					type: 'object',
					required: ['version'],
					properties: {
						version: {
							type: 'string',
							enum: ['0.1.0'],
							deprecationMessage: nls.localize('JsonSchema.version.deprecated', 'Task version 0.1.0 is deprecated. Please use 2.0.0'),
							description: nls.localize('JsonSchema.version', 'The config\'s version number')
						},
						_runner: {
							deprecationMessage: nls.localize('JsonSchema._runner', 'The runner has graduated. Use the official runner property')
						},
						runner: {
							type: 'string',
							enum: ['process', 'terminal'],
							default: 'process',
							description: nls.localize('JsonSchema.runner', 'Defines whether the task is executed as a process and the output is shown in the output window or inside the terminal.')
						},
						windows: {
							$ref: '#/definitions/taskRunnerConfiguration',
							description: nls.localize('JsonSchema.windows', 'Windows specific command configuration')
						},
						osx: {
							$ref: '#/definitions/taskRunnerConfiguration',
							description: nls.localize('JsonSchema.mac', 'Mac specific command configuration')
						},
						linux: {
							$ref: '#/definitions/taskRunnerConfiguration',
							description: nls.localize('JsonSchema.linux', 'Linux specific command configuration')
						}
					}
				},
				{
					$ref: '#/definitions/taskRunnerConfiguration'
				}
			]
		}
	]
};

const shellCommand: IJSONSchema = {
	type: 'boolean',
	default: true,
	description: nls.localize('JsonSchema.shell', 'Specifies whether the command is a shell command or an external program. Defaults to false if omitted.')
};

schema.definitions = Objects.deepClone(commonSchema.definitions);
const definitions = schema.definitions!;
definitions['commandConfiguration']['properties']!['isShellCommand'] = Objects.deepClone(shellCommand);
definitions['taskDescription']['properties']!['isShellCommand'] = Objects.deepClone(shellCommand);
definitions['taskRunnerConfiguration']['properties']!['isShellCommand'] = Objects.deepClone(shellCommand);

Object.getOwnPropertyNames(definitions).forEach(key => {
	const newKey = key + '1';
	definitions[newKey] = definitions[key];
	delete definitions[key];
});

function fixReferences(literal: any) {
	if (Array.isArray(literal)) {
		literal.forEach(fixReferences);
	} else if (typeof literal === 'object') {
		if (literal['$ref']) {
			literal['$ref'] = literal['$ref'] + '1';
		}
		Object.getOwnPropertyNames(literal).forEach(property => {
			const value = literal[property];
			if (Array.isArray(value) || typeof value === 'object') {
				fixReferences(value);
			}
		});
	}
}
fixReferences(schema);

ProblemMatcherRegistry.onReady().then(() => {
	try {
		const matcherIds = ProblemMatcherRegistry.keys().map(key => '$' + key);
		definitions.problemMatcherType1.oneOf![0].enum = matcherIds;
		(definitions.problemMatcherType1.oneOf![2].items as IJSONSchema).anyOf![1].enum = matcherIds;
	} catch (err) {
		console.log('Installing problem matcher ids failed');
	}
});

export default schema;
