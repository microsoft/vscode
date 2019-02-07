/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';

import * as crypto from 'crypto';

import * as Objects from 'vs/base/common/objects';

import { TaskIdentifier, KeyedTaskIdentifier, TaskDefinition } from 'vs/workbench/parts/tasks/common/tasks';
import { TaskDefinitionRegistry } from 'vs/workbench/parts/tasks/common/taskDefinitionRegistry';

namespace KeyedTaskIdentifier {
	export function create(value: TaskIdentifier): KeyedTaskIdentifier {
		const hash = crypto.createHash('md5');
		hash.update(JSON.stringify(value));
		let result = { _key: hash.digest('hex'), type: value.taskType };
		Objects.assign(result, value);
		return result;
	}
}

namespace TaskDefinition {
	export function createTaskIdentifier(external: TaskIdentifier, reporter: { error(message: string): void; }): KeyedTaskIdentifier | undefined {
		let definition = TaskDefinitionRegistry.get(external.type);
		if (definition === undefined) {
			// We have no task definition so we can't sanitize the literal. Take it as is
			let copy = Objects.deepClone(external);
			delete copy._key;
			return KeyedTaskIdentifier.create(copy);
		}

		let literal: { type: string;[name: string]: any } = Object.create(null);
		literal.type = definition.taskType;
		let required: Set<string> = new Set();
		definition.required.forEach(element => required.add(element));

		let properties = definition.properties;
		for (let property of Object.keys(properties)) {
			let value = external[property];
			if (value !== undefined && value !== null) {
				literal[property] = value;
			} else if (required.has(property)) {
				let schema = properties[property];
				if (schema.default !== undefined) {
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
								'Error: the task identifier \'{0}\' is missing the required property \'{1}\'. The task identifier will be ignored.', JSON.stringify(external, undefined, 0), property
							));
							return undefined;
					}
				}
			}
		}
		return KeyedTaskIdentifier.create(literal);
	}
}

export { KeyedTaskIdentifier, TaskDefinition };
