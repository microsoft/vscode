/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as nls from 'vs/nls';
import * as Objects from 'vs/base/common/objects';
import { IJSONSchema } from 'vs/base/common/jsonSchema';

import commonSchema from './jsonSchemaCommon';

const schema: IJSONSchema = {
	oneOf: [
		{
			'allOf': [
				{
					'type': 'object',
					'required': ['version'],
					'properties': {
						'version': {
							'type': 'string',
							'enum': ['2.0.0'],
							'description': nls.localize('JsonSchema.version', 'The config\'s version number')
						},
						'windows': {
							'$ref': '#/definitions/taskRunnerConfiguration',
							'description': nls.localize('JsonSchema.windows', 'Windows specific command configuration')
						},
						'osx': {
							'$ref': '#/definitions/taskRunnerConfiguration',
							'description': nls.localize('JsonSchema.mac', 'Mac specific command configuration')
						},
						'linux': {
							'$ref': '#/definitions/taskRunnerConfiguration',
							'description': nls.localize('JsonSchema.linux', 'Linux specific command configuration')
						}
					}
				},
				{
					'$ref': '#/definitions/taskRunnerConfiguration'
				}
			]
		}
	]
};

const shellCommand: IJSONSchema = {
	anyOf: [
		{
			type: 'boolean',
			default: true,
			description: nls.localize('JsonSchema.shell', 'Specifies whether the command is a shell command or an external program. Defaults to false if omitted.')
		},
		{
			$ref: '#definitions/shellConfiguration'
		}
	]
};

const dependsOn: IJSONSchema = {
	anyOf: [
		{
			type: 'string',
			default: true,
			description: nls.localize('JsonSchema.tasks.dependsOn.string', 'Another task this task depends on.')
		},
		{
			type: 'array',
			description: nls.localize('JsonSchema.tasks.dependsOn.array', 'The other tasks this task depends on.'),
			items: {
				type: 'string'
			}
		}
	]
};

const terminal: IJSONSchema = {
	type: 'object',
	default: {
		reveal: 'always',
		echo: false
	},
	description: nls.localize('JsonSchema.tasks.terminal', 'Describe how the terminal used to execute a task behaves.'),
	properties: {
		echo: {
			type: 'boolean',
			default: false,
			description: nls.localize('JsonSchema.tasks.terminal.echo', 'Controls whether the executed command is echoed to the terminal. Default is false.')
		},
		reveal: {
			type: 'string',
			enum: ['always', 'silent', 'never'],
			default: 'always',
			description: nls.localize('JsonSchema.tasks.terminal.reveals', 'Controls whether the terminal running the task is revealed or not. Default is \"always\".')
		}
	}
};

const group: IJSONSchema = {
	type: 'string',
	enum: ['none', 'clean', 'build', 'rebuildAll', 'test'],
	default: 'none',
	description: nls.localize('JsonSchema.tasks.group', 'Defines to which execution group this task belongs to. If omitted the task belongs to no group')
};

const taskType: IJSONSchema = {
	type: 'string',
	enum: ['shell', 'process'],
	default: 'process',
	description: nls.localize('JsonSchema.tasks.type', 'Defines whether the task is run as a process or as a command inside a shell. Default is process')
};

schema.definitions = Objects.deepClone(commonSchema.definitions);
let definitions = schema.definitions;
definitions.commandConfiguration.properties.isShellCommand = Objects.deepClone(shellCommand);
definitions.taskDescription.properties.isShellCommand = Objects.deepClone(shellCommand);
definitions.taskDescription.properties.dependsOn = dependsOn;
definitions.showOutputType.deprecationMessage = nls.localize('JsonSchema.tasks.showOputput.deprecated', 'The property showOutput is deprecated. Use the terminal property instead.');
definitions.taskDescription.properties.echoCommand.deprecationMessage = nls.localize('JsonSchema.tasks.echoCommand.deprecated', 'The property echoCommand is deprecated. Use the terminal property instead.');
definitions.taskDescription.properties.isBuildCommand.deprecationMessage = nls.localize('JsonSchema.tasks.isBuildCommand.deprecated', 'The property isBuildCommand is deprecated. Use the group property instead.');
definitions.taskDescription.properties.isTestCommand.deprecationMessage = nls.localize('JsonSchema.tasks.isTestCommand.deprecated', 'The property isTestCommand is deprecated. Use the group property instead.');
definitions.taskDescription.properties.type = taskType;
definitions.taskDescription.properties.isShellCommand.deprecationMessage = nls.localize('JsonSchema.tasks.isShellCommand.deprecated', 'The property isShellCommand is deprecated. Use the type property instead.');
definitions.taskDescription.properties.terminal = terminal;
definitions.taskDescription.properties.group = group;
definitions.taskRunnerConfiguration.properties.isShellCommand = Objects.deepClone(shellCommand);

Object.getOwnPropertyNames(definitions).forEach(key => {
	let newKey = key + '2';
	definitions[newKey] = definitions[key];
	delete definitions[key];
});

function fixReferences(literal: any) {
	if (Array.isArray(literal)) {
		literal.forEach(fixReferences);
	} else if (typeof literal === 'object') {
		if (literal['$ref']) {
			literal['$ref'] = literal['$ref'] + '2';
		}
		Object.getOwnPropertyNames(literal).forEach(property => {
			let value = literal[property];
			if (Array.isArray(value) || typeof value === 'object') {
				fixReferences(value);
			}
		});
	}
}
fixReferences(schema);

export default schema;