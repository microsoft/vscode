/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isObject } from 'vs/base/common/types';

export type JSONSchemaType = 'string' | 'number' | 'integer' | 'boolean' | 'null' | 'array' | 'object';

export interface IJSONSchema {
	id?: string;
	$id?: string;
	$schema?: string;
	type?: JSONSchemaType | JSONSchemaType[];
	title?: string;
	default?: any;
	definitions?: IJSONSchemaMap;
	description?: string;
	properties?: IJSONSchemaMap;
	patternProperties?: IJSONSchemaMap;
	additionalProperties?: boolean | IJSONSchema;
	minProperties?: number;
	maxProperties?: number;
	dependencies?: IJSONSchemaMap | { [prop: string]: string[] };
	items?: IJSONSchema | IJSONSchema[];
	minItems?: number;
	maxItems?: number;
	uniqueItems?: boolean;
	additionalItems?: boolean | IJSONSchema;
	pattern?: string;
	minLength?: number;
	maxLength?: number;
	minimum?: number;
	maximum?: number;
	exclusiveMinimum?: boolean | number;
	exclusiveMaximum?: boolean | number;
	multipleOf?: number;
	required?: string[];
	$ref?: string;
	anyOf?: IJSONSchema[];
	allOf?: IJSONSchema[];
	oneOf?: IJSONSchema[];
	not?: IJSONSchema;
	enum?: any[];
	format?: string;

	// schema draft 06
	const?: any;
	contains?: IJSONSchema;
	propertyNames?: IJSONSchema;
	examples?: any[];

	// schema draft 07
	$comment?: string;
	if?: IJSONSchema;
	then?: IJSONSchema;
	else?: IJSONSchema;

	// schema 2019-09
	unevaluatedProperties?: boolean | IJSONSchema;
	unevaluatedItems?: boolean | IJSONSchema;
	minContains?: number;
	maxContains?: number;
	deprecated?: boolean;
	dependentRequired?: { [prop: string]: string[] };
	dependentSchemas?: IJSONSchemaMap;
	$defs?: { [name: string]: IJSONSchema };
	$anchor?: string;
	$recursiveRef?: string;
	$recursiveAnchor?: string;
	$vocabulary?: any;

	// schema 2020-12
	prefixItems?: IJSONSchema[];
	$dynamicRef?: string;
	$dynamicAnchor?: string;

	// VSCode extensions

	defaultSnippets?: IJSONSchemaSnippet[];
	errorMessage?: string;
	patternErrorMessage?: string;
	deprecationMessage?: string;
	markdownDeprecationMessage?: string;
	enumDescriptions?: string[];
	markdownEnumDescriptions?: string[];
	markdownDescription?: string;
	doNotSuggest?: boolean;
	suggestSortText?: string;
	allowComments?: boolean;
	allowTrailingCommas?: boolean;
}

export interface IJSONSchemaMap {
	[name: string]: IJSONSchema;
}

export interface IJSONSchemaSnippet {
	label?: string;
	description?: string;
	body?: any; // a object that will be JSON stringified
	bodyText?: string; // an already stringified JSON object that can contain new lines (\n) and tabs (\t)
}

/**
 * Converts a basic JSON schema to a TypeScript type.
 *
 * TODO: only supports basic schemas. Doesn't support all JSON schema features.
 */
export type SchemaToType<T> = T extends { type: 'string' }
	? string
	: T extends { type: 'number' }
	? number
	: T extends { type: 'boolean' }
	? boolean
	: T extends { type: 'null' }
	? null
	: T extends { type: 'object'; properties: infer P }
	? { [K in keyof P]: SchemaToType<P[K]> }
	: T extends { type: 'array'; items: infer I }
	? Array<SchemaToType<I>>
	: never;

interface Partition { stringified: string; schemas: IJSONSchema[]; id: string }

class Partitions {
	private partitionByString: Map<string, Partition> | undefined;
	private nodeToPartition: Map<IJSONSchema, Partition> | undefined;

	private idCount: number = 0;

	constructor(private firstSchema: IJSONSchema, private property: string) {
	}

	private addNewDefinition(str: string, schema: IJSONSchema): Partition {
		const def = { stringified: str, schemas: [this.firstSchema], id: `${this.property}-${this.idCount++}` };
		this.partitionByString!.set(str, def);
		this.nodeToPartition!.set(schema, def);
		return def;
	}

	public add(schema: IJSONSchema): boolean {
		if (this.partitionByString === undefined || this.nodeToPartition === undefined) {
			this.partitionByString = new Map<string, Partition>();
			this.nodeToPartition = new Map<IJSONSchema, Partition>();
			this.addNewDefinition(JSON.stringify(this.firstSchema), this.firstSchema);
		}

		const str = JSON.stringify(schema);
		const def = this.partitionByString.get(str);
		if (!def) {
			this.addNewDefinition(str, schema);
			return false;
		}
		def.schemas.push(schema);
		this.nodeToPartition.set(schema, def);
		return true;
	}

	public get(schema: IJSONSchema): Partition | undefined {
		return this.nodeToPartition?.get(schema);
	}
}


export function getCompressedContent(schema: IJSONSchema): string {
	const start = new Date();
	let hasDups = false;

	const groupByProperty = new Map<string, Partitions>();
	const visitSchemas = (property: string, next: IJSONSchema) => {
		let group = groupByProperty.get(property);
		if (!group) {
			group = new Partitions(next, property);
			groupByProperty.set(property, group);
			return true;
		}
		const isDup = group.add(next);
		if (isDup) {
			hasDups = true;
		}
		return !isDup;
	};
	traverseNodes(schema, visitSchemas);

	if (!hasDups) {
		return JSON.stringify(schema);
	}

	let defNodeName = '$defs';
	while (schema.hasOwnProperty(defNodeName)) {
		defNodeName += '_';
	}

	let dups = 0;

	const definitions: Record<string, IJSONSchema> = {};
	const str = JSON.stringify(schema, (key, value) => {
		const partitions = groupByProperty.get(key);
		if (partitions) {
			const def = partitions.get(value);
			if (def && def.schemas.length > 1) {
				dups++;
				definitions[def.id] = def.schemas[0];
				return { $ref: `#${defNodeName}/${def.id}` };
			}
		}
		return value;
	});

	console.log(`Found ${dups} duplicates in schema. Took ${new Date().getTime() - start.getTime()}ms.`);

	return `${str.substring(0, str.length - 1)},"${defNodeName}":${JSON.stringify(definitions)}`;
}

type IJSONSchemaRef = IJSONSchema | boolean;

function traverseNodes(root: IJSONSchema, visit: (property: string, schema: IJSONSchema) => boolean) {
	if (!root || typeof root !== 'object') {
		return;
	}
	const collectEntries = (...entries: (IJSONSchemaRef | undefined)[]) => {
		for (const entry of entries) {
			if (isObject(entry)) {
				toWalk.push(entry);
			}
		}
	};
	const collectMapEntries = (...maps: (IJSONSchemaMap | undefined)[]) => {
		for (const map of maps) {
			if (isObject(map)) {
				for (const key in map) {
					const entry = map[key];
					if (isObject(entry)) {
						toWalk.push([key, entry]);
					}
				}
			}
		}
	};
	const collectArrayEntries = (...arrays: (IJSONSchemaRef[] | undefined)[]) => {
		for (const array of arrays) {
			if (Array.isArray(array)) {
				for (const entry of array) {
					if (isObject(entry)) {
						toWalk.push(entry);
					}
				}
			}
		}
	};
	const collectEntryOrArrayEntries = (items: (IJSONSchemaRef[] | IJSONSchemaRef | undefined)) => {
		if (Array.isArray(items)) {
			for (const entry of items) {
				if (isObject(entry)) {
					toWalk.push(entry);
				}
			}
		} else if (isObject(items)) {
			toWalk.push(items);
		}
	};

	const toWalk: (IJSONSchema | [string, IJSONSchema])[] = [root];

	let next = toWalk.pop();
	while (next) {
		let visitChildern = true;
		if (Array.isArray(next)) {
			visitChildern = visit(next[0], next[1]);
			next = next[1];
		}
		if (visitChildern) {
			collectEntries(next.additionalItems, next.additionalProperties, next.not, next.contains, next.propertyNames, next.if, next.then, next.else, next.unevaluatedItems, next.unevaluatedProperties);
			collectMapEntries(next.definitions, next.$defs, next.properties, next.patternProperties, <IJSONSchemaMap>next.dependencies, next.dependentSchemas);
			collectArrayEntries(next.anyOf, next.allOf, next.oneOf, next.prefixItems);
			collectEntryOrArrayEntries(next.items);
		}
		next = toWalk.pop();
	}
}

