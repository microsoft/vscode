/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as nls from 'vs/nls';

import * as crypto from 'crypto';

import * as Objects from 'vs/base/common/objects';

import { TaskIdentifier, TaskDefinition } from 'vs/workbench/parts/tasks/common/tasks';

namespace TaskIdentifier {
	export function create(value: { type: string;[name: string]: any }): TaskIdentifier {
		const hash = crypto.createHash('md5');
		hash.update(JSON.stringify(value));
		let result = { _key: hash.digest('hex'), type: value.taskType };
		Objects.assign(result, value);
		return result;
	}
}

namespace TaskDefinition {
	export function createTaskIdentifier(definition: TaskDefinition, external: { type?: string;[name: string]: any }, reporter: { error(message: string): void; }): TaskIdentifier | undefined {
		if (definition.taskType !== external.type) {
			reporter.error(nls.localize(
				'TaskDefinition.missingType',
				'Error: the task configuration \'{0}\' is missing the required property \'type\'. The task configuration will be ignored.', JSON.stringify(external, undefined, 0)
			));
			return undefined;
		}
		let literal: { type: string;[name: string]: any } = Object.create(null);
		literal.type = definition.taskType;
		let required: Set<string> = new Set();
		definition.required.forEach(element => required.add(element));

		let properties = definition.properties;
		for (let property of Object.keys(properties)) {
			let value = external[property];
			if (value !== void 0 && value !== null) {
				literal[property] = value;
			} else if (required.has(property)) {
				let schema = properties[property];
				if (schema.default !== void 0) {
					literal[property] = Objects.deepClone(schema.default);
				} else {
					switch (schema.type) {
						case 'boolean':
							literal[property] = false;
							break;
						case 'number':
						case 'integer':
							literal[property] = 0;
							break;
						case 'string':
							literal[property] = '';
							break;
						default:
							reporter.error(nls.localize(
								'TaskDefinition.missingRequiredProperty',
								'Error: the task configuration \'{0}\' is missing the required property \'{1}\'. The task configuration will be ignored.', JSON.stringify(external, undefined, 0), property
							));
							return undefined;
					}
				}
			}
		}
		return TaskIdentifier.create(literal);
	}
}

export { TaskIdentifier, TaskDefinition };
