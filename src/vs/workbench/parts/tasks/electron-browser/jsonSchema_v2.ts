/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as nls from 'vs/nls';
import * as Objects from 'vs/base/common/objects';
import { IJSONSchema } from 'vs/base/common/jsonSchema';

import commonSchema from './jsonSchemaCommon';

import { ProblemMatcherRegistry } from 'vs/platform/markers/common/problemMatcher';

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
	// deprecationMessage: nls.localize('JsonSchema.tasks.isShellCommand.deprecated', 'The property isShellCommand is deprecated. Use the type property and the shell property in the options instead.')
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

const presentation: IJSONSchema = {
	type: 'object',
	default: {
		reveal: 'always'
	},
	description: nls.localize('JsonSchema.tasks.terminal', 'Configures the panel that is used to present the task\'s ouput and reads its input.'),
	additionalProperties: false,
	properties: {
		echo: {
			type: 'boolean',
			default: true,
			description: nls.localize('JsonSchema.tasks.terminal.echo', 'Controls whether the executed command is echoed to the panel. Default is true.')
		},
		focus: {
			type: 'boolean',
			default: false,
			description: nls.localize('JsonSchema.tasks.terminal.focus', 'Controls whether the panel takes focus. Default is false. If set to true the panel is revealed as well.')
		},
		reveal: {
			type: 'string',
			enum: ['always', 'silent', 'never'],
			default: 'always',
			description: nls.localize('JsonSchema.tasks.terminal.reveals', 'Controls whether the panel running the task is revealed or not. Default is \"always\".')
		},
		panel: {
			type: 'string',
			enum: ['shared', 'dedicated', 'new'],
			default: 'shared',
			description: nls.localize('JsonSchema.tasks.terminal.instance', 'Controls if the panel is shared between tasks, dedicated to this task or a new one is created on every run.')
		}
	}
};

const group: IJSONSchema = {
	type: 'string',
	enum: ['none', 'clean', 'build', 'rebuildAll', 'test'],
	default: 'none',
	description: nls.localize('JsonSchema.tasks.group', 'Defines to which execution group this task belongs to. If omitted the task belongs to no group.')
};

const taskType: IJSONSchema = {
	type: 'string',
	enum: ['shell', 'process'],
	default: 'process',
	description: nls.localize('JsonSchema.tasks.type', 'Defines whether the task is run as a process or as a command inside a shell. Default is process.')
};

const version: IJSONSchema = {
	type: 'string',
	enum: ['2.0.0'],
	description: nls.localize('JsonSchema.version', 'The config\'s version number.')
};

const customize: IJSONSchema = {
	type: 'string',
	description: nls.localize('JsonSchema.tasks.customize', 'The contributed task to be customized.')
};

const schema: IJSONSchema = {
	oneOf: [
		{
			'allOf': [
				{
					type: 'object',
					required: ['version'],
					properties: {
						version: Objects.deepClone(version),
						windows: {
							'$ref': '#/definitions/taskRunnerConfiguration',
							'description': nls.localize('JsonSchema.windows', 'Windows specific command configuration')
						},
						osx: {
							'$ref': '#/definitions/taskRunnerConfiguration',
							'description': nls.localize('JsonSchema.mac', 'Mac specific command configuration')
						},
						linux: {
							'$ref': '#/definitions/taskRunnerConfiguration',
							'description': nls.localize('JsonSchema.linux', 'Linux specific command configuration')
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

schema.definitions = Objects.deepClone(commonSchema.definitions);
let definitions = schema.definitions;
definitions.commandConfiguration.properties.isShellCommand = Objects.deepClone(shellCommand);
definitions.taskDescription.properties.isShellCommand = Objects.deepClone(shellCommand);
definitions.taskDescription.properties.dependsOn = dependsOn;
// definitions.showOutputType.deprecationMessage = nls.localize('JsonSchema.tasks.showOputput.deprecated', 'The property showOutput is deprecated. Use the terminal property instead.');
// definitions.taskDescription.properties.echoCommand.deprecationMessage = nls.localize('JsonSchema.tasks.echoCommand.deprecated', 'The property echoCommand is deprecated. Use the terminal property instead.');
// definitions.taskDescription.properties.isBuildCommand.deprecationMessage = nls.localize('JsonSchema.tasks.isBuildCommand.deprecated', 'The property isBuildCommand is deprecated. Use the group property instead.');
// definitions.taskDescription.properties.isTestCommand.deprecationMessage = nls.localize('JsonSchema.tasks.isTestCommand.deprecated', 'The property isTestCommand is deprecated. Use the group property instead.');
definitions.taskDescription.properties.customize = customize;
definitions.taskDescription.properties.type = Objects.deepClone(taskType);
definitions.taskDescription.properties.presentation = presentation;
definitions.taskDescription.properties.group = group;
definitions.options.properties.shell = {
	$ref: '#/definitions/shellConfiguration'
};
definitions.taskRunnerConfiguration.properties.isShellCommand = Objects.deepClone(shellCommand);
definitions.taskRunnerConfiguration.properties.type = Objects.deepClone(taskType);
definitions.taskRunnerConfiguration.properties.version = Objects.deepClone(version);

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

ProblemMatcherRegistry.onReady().then(() => {
	try {
		let matcherIds = ProblemMatcherRegistry.keys().map(key => '$' + key);
		definitions.problemMatcherType2.oneOf[0].enum = matcherIds;
		(definitions.problemMatcherType2.oneOf[2].items as IJSONSchema).anyOf[1].enum = matcherIds;
	} catch (err) {
		console.log('Installing problem matcher ids failed');
	}
});

export default schema;