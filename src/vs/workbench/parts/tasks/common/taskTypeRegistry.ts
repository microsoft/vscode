/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as nls from 'vs/nls';
import { IJSONSchema, IJSONSchemaMap } from 'vs/base/common/jsonSchema';
import { IStringDictionary } from 'vs/base/common/collections';
import { TPromise } from 'vs/base/common/winjs.base';
import * as Types from 'vs/base/common/types';
import * as Objects from 'vs/base/common/objects';

import { ExtensionsRegistry, ExtensionMessageCollector } from 'vs/platform/extensions/common/extensionsRegistry';

import * as Tasks from 'vs/workbench/parts/tasks/common/tasks';


const taskTypeSchema: IJSONSchema = {
	type: 'object',
	additionalProperties: false,
	properties: {
		type: {
			type: 'string',
			description: nls.localize('TaskType.description', 'The actual task type')
		},
		properties: {
			type: 'object',
			description: nls.localize('TaskType.properties', 'Additional properties of the task type'),
			additionalProperties: {
				$ref: 'http://json-schema.org/draft-04/schema#'
			}
		}
	}
};

namespace Configuration {
	export interface TaskTypeDescription {
		type?: string;
		required?: string[];
		properties?: IJSONSchemaMap;
	}

	export function from(value: TaskTypeDescription, messageCollector: ExtensionMessageCollector): Tasks.TaskTypeDescription {
		if (!value) {
			return undefined;
		}
		let taskType = Types.isString(value.type) ? value.type : undefined;
		if (!taskType || taskType.length === 0) {
			messageCollector.error(nls.localize('TaskTypeConfiguration.noType', 'The task type configuration is missing the required \'taskType\' property'));
			return undefined;
		}
		let required: string[] = [];
		if (Array.isArray(value.required)) {
			for (let element of value.required) {
				if (Types.isString(element)) {
					required.push(element);
				}
			}
		}
		return { taskType, required: required.length >= 0 ? required : undefined, properties: value.properties ? Objects.deepClone(value.properties) : undefined };
	}
}


const taskTypesExtPoint = ExtensionsRegistry.registerExtensionPoint<Configuration.TaskTypeDescription[]>('taskTypes', [], {
	description: nls.localize('TaskTypeExtPoint', 'Contributes task kinds'),
	type: 'array',
	items: taskTypeSchema
});

export interface ITaskTypeRegistry {
	onReady(): TPromise<void>;

	exists(key: string): boolean;
	get(key: string): Tasks.TaskTypeDescription;
	all(): Tasks.TaskTypeDescription[];
}

class TaskTypeRegistryImpl implements ITaskTypeRegistry {

	private taskTypes: IStringDictionary<Tasks.TaskTypeDescription>;
	private readyPromise: TPromise<void>;

	constructor() {
		this.taskTypes = Object.create(null);
		this.readyPromise = new TPromise<void>((resolve, reject) => {
			taskTypesExtPoint.setHandler((extensions) => {
				try {
					extensions.forEach(extension => {
						let taskTypes = extension.value;
						for (let taskType of taskTypes) {
							let type = Configuration.from(taskType, extension.collector);
							if (type) {
								this.taskTypes[type.taskType] = type;
							}
						}
					});
				} catch (error) {
				}
				resolve(undefined);
			});
		});
	}

	public onReady(): TPromise<void> {
		return this.readyPromise;
	}

	public get(key: string): Tasks.TaskTypeDescription {
		return this.taskTypes[key];
	}

	public exists(key: string): boolean {
		return !!this.taskTypes[key];
	}

	public all(): Tasks.TaskTypeDescription[] {
		return Object.keys(this.taskTypes).map(key => this.taskTypes[key]);
	}
}

export const TaskTypeRegistry: ITaskTypeRegistry = new TaskTypeRegistryImpl();