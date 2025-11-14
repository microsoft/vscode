/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from '../../../../nls.js';
import { IJSONSchema, IJSONSchemaMap } from '../../../../base/common/jsonSchema.js';
import { IStringDictionary } from '../../../../base/common/collections.js';
import * as Types from '../../../../base/common/types.js';
import * as Objects from '../../../../base/common/objects.js';

import { ExtensionsRegistry, ExtensionMessageCollector } from '../../../services/extensions/common/extensionsRegistry.js';

import * as Tasks from './tasks.js';
import { ExtensionIdentifier } from '../../../../platform/extensions/common/extensions.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { Emitter, Event } from '../../../../base/common/event.js';


const taskDefinitionSchema: IJSONSchema = {
	type: 'object',
	additionalProperties: false,
	properties: {
		type: {
			type: 'string',
			description: nls.localize('TaskDefinition.description', 'The actual task type. Please note that types starting with a \'$\' are reserved for internal usage.')
		},
		required: {
			type: 'array',
			items: {
				type: 'string'
			}
		},
		properties: {
			type: 'object',
			description: nls.localize('TaskDefinition.properties', 'Additional properties of the task type'),
			additionalProperties: {
				$ref: 'http://json-schema.org/draft-07/schema#'
			}
		},
		when: {
			type: 'string',
			markdownDescription: nls.localize('TaskDefinition.when', 'Condition which must be true to enable this type of task. Consider using `shellExecutionSupported`, `processExecutionSupported`, and `customExecutionSupported` as appropriate for this task definition. See the [API documentation](https://code.visualstudio.com/api/extension-guides/task-provider#when-clause) for more information.'),
			default: ''
		}
	}
};

namespace Configuration {
	export interface ITaskDefinition {
		type?: string;
		required?: string[];
		properties?: IJSONSchemaMap;
		when?: string;
	}

	export function from(value: ITaskDefinition, extensionId: ExtensionIdentifier, messageCollector: ExtensionMessageCollector): Tasks.ITaskDefinition | undefined {
		if (!value) {
			return undefined;
		}
		const taskType = Types.isString(value.type) ? value.type : undefined;
		if (!taskType || taskType.length === 0) {
			messageCollector.error(nls.localize('TaskTypeConfiguration.noType', 'The task type configuration is missing the required \'taskType\' property'));
			return undefined;
		}
		const required: string[] = [];
		if (Array.isArray(value.required)) {
			for (const element of value.required) {
				if (Types.isString(element)) {
					required.push(element);
				}
			}
		}
		return {
			extensionId: extensionId.value,
			taskType, required: required,
			properties: value.properties ? Objects.deepClone(value.properties) : {},
			when: value.when ? ContextKeyExpr.deserialize(value.when) : undefined
		};
	}
}


const taskDefinitionsExtPoint = ExtensionsRegistry.registerExtensionPoint<Configuration.ITaskDefinition[]>({
	extensionPoint: 'taskDefinitions',
	activationEventsGenerator: function* (contributions: readonly Configuration.ITaskDefinition[]) {
		for (const task of contributions) {
			if (task.type) {
				yield `onTaskType:${task.type}`;
			}
		}
	},
	jsonSchema: {
		description: nls.localize('TaskDefinitionExtPoint', 'Contributes task kinds'),
		type: 'array',
		items: taskDefinitionSchema
	}
});

export interface ITaskDefinitionRegistry {
	onReady(): Promise<void>;

	get(key: string): Tasks.ITaskDefinition;
	all(): Tasks.ITaskDefinition[];
	getJsonSchema(): IJSONSchema;
	readonly onDefinitionsChanged: Event<void>;
}

class TaskDefinitionRegistryImpl implements ITaskDefinitionRegistry {

	private taskTypes: IStringDictionary<Tasks.ITaskDefinition>;
	private readyPromise: Promise<void>;
	private _schema: IJSONSchema | undefined;
	private _onDefinitionsChanged: Emitter<void> = new Emitter();
	public onDefinitionsChanged: Event<void> = this._onDefinitionsChanged.event;

	constructor() {
		this.taskTypes = Object.create(null);
		this.readyPromise = new Promise<void>((resolve, reject) => {
			taskDefinitionsExtPoint.setHandler((extensions, delta) => {
				this._schema = undefined;
				try {
					for (const extension of delta.removed) {
						const taskTypes = extension.value;
						for (const taskType of taskTypes) {
							if (this.taskTypes && taskType.type && this.taskTypes[taskType.type]) {
								delete this.taskTypes[taskType.type];
							}
						}
					}
					for (const extension of delta.added) {
						const taskTypes = extension.value;
						for (const taskType of taskTypes) {
							const type = Configuration.from(taskType, extension.description.identifier, extension.collector);
							if (type) {
								this.taskTypes[type.taskType] = type;
							}
						}
					}
					if ((delta.removed.length > 0) || (delta.added.length > 0)) {
						this._onDefinitionsChanged.fire();
					}
				} catch (error) {
				}
				resolve(undefined);
			});
		});
	}

	public onReady(): Promise<void> {
		return this.readyPromise;
	}

	public get(key: string): Tasks.ITaskDefinition {
		return this.taskTypes[key];
	}

	public all(): Tasks.ITaskDefinition[] {
		return Object.keys(this.taskTypes).map(key => this.taskTypes[key]);
	}

	public getJsonSchema(): IJSONSchema {
		if (this._schema === undefined) {
			const schemas: IJSONSchema[] = [];
			for (const definition of this.all()) {
				const schema: IJSONSchema = {
					type: 'object',
					additionalProperties: false
				};
				if (definition.required.length > 0) {
					schema.required = definition.required.slice(0);
				}
				if (definition.properties !== undefined) {
					schema.properties = Objects.deepClone(definition.properties);
				} else {
					schema.properties = Object.create(null);
				}
				schema.properties!.type = {
					type: 'string',
					enum: [definition.taskType]
				};
				schemas.push(schema);
			}
			this._schema = { oneOf: schemas };
		}
		return this._schema;
	}
}

export const TaskDefinitionRegistry: ITaskDefinitionRegistry = new TaskDefinitionRegistryImpl();
