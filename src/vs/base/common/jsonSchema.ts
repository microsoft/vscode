/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

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
	// Object
	: T extends { type: 'object'; properties: infer P }
	? { [K in keyof P]: SchemaToType<P[K]> }
	// Array
	: T extends { type: 'array'; items: infer I }
	? Array<SchemaToType<I>>
	// OneOf
	: T extends { oneOf: infer I }
	? MapSchemaToType<I>
	// Fallthrough
	: never;

type MapSchemaToType<T> = T extends [infer First, ...infer Rest]
	? SchemaToType<First> | MapSchemaToType<Rest>
	: never;

interface Equals { schemas: IJSONSchema[]; id?: string }

export function getCompressedContent(schema: IJSONSchema): string {
	let hasDups = false;


	// visit all schema nodes and collect the ones that are equal
	const equalsByString = new Map<string, Equals>();
	const nodeToEquals = new Map<IJSONSchema, Equals>();
	const visitSchemas = (next: IJSONSchema) => {
		if (schema === next) {
			return true;
		}
		const val = JSON.stringify(next);
		if (val.length < 30) {
			// the $ref takes around 25 chars, so we don't save anything
			return true;
		}
		const eq = equalsByString.get(val);
		if (!eq) {
			const newEq = { schemas: [next] };
			equalsByString.set(val, newEq);
			nodeToEquals.set(next, newEq);
			return true;
		}
		eq.schemas.push(next);
		nodeToEquals.set(next, eq);
		hasDups = true;
		return false;
	};
	traverseNodes(schema, visitSchemas);
	equalsByString.clear();

	if (!hasDups) {
		return JSON.stringify(schema);
	}

	let defNodeName = '$defs';
	while (schema.hasOwnProperty(defNodeName)) {
		defNodeName += '_';
	}

	// used to collect all schemas that are later put in `$defs`. The index in the array is the id of the schema.
	const definitions: IJSONSchema[] = [];

	function stringify(root: IJSONSchema): string {
		return JSON.stringify(root, (_key: string, value: any) => {
			if (value !== root) {
				const eq = nodeToEquals.get(value);
				if (eq && eq.schemas.length > 1) {
					if (!eq.id) {
						eq.id = `_${definitions.length}`;
						definitions.push(eq.schemas[0]);
					}
					return { $ref: `#/${defNodeName}/${eq.id}` };
				}
			}
			return value;
		});
	}

	// stringify the schema and replace duplicate subtrees with $ref
	// this will add new items to the definitions array
	const str = stringify(schema);

	// now stringify the definitions. Each invication of stringify cann add new items to the definitions array, so the length can grow while we iterate
	const defStrings: string[] = [];
	for (let i = 0; i < definitions.length; i++) {
		defStrings.push(`"_${i}":${stringify(definitions[i])}`);
	}
	if (defStrings.length) {
		return `${str.substring(0, str.length - 1)},"${defNodeName}":{${defStrings.join(',')}}}`;
	}
	return str;
}

type IJSONSchemaRef = IJSONSchema | boolean;

function isObject(thing: any): thing is object {
	return typeof thing === 'object' && thing !== null;
}

/*
 * Traverse a JSON schema and visit each schema node
*/
function traverseNodes(root: IJSONSchema, visit: (schema: IJSONSchema) => boolean) {
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
						toWalk.push(entry);
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

	const toWalk: IJSONSchema[] = [root];

	let next = toWalk.pop();
	while (next) {
		const visitChildern = visit(next);
		if (visitChildern) {
			collectEntries(next.additionalItems, next.additionalProperties, next.not, next.contains, next.propertyNames, next.if, next.then, next.else, next.unevaluatedItems, next.unevaluatedProperties);
			collectMapEntries(next.definitions, next.$defs, next.properties, next.patternProperties, <IJSONSchemaMap>next.dependencies, next.dependentSchemas);
			collectArrayEntries(next.anyOf, next.allOf, next.oneOf, next.prefixItems);
			collectEntryOrArrayEntries(next.items);
		}
		next = toWalk.pop();
	}
}

