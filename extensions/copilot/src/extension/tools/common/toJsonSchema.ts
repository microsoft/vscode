/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { JsonSchema, JsonSchemaType } from '../../../platform/configuration/common/jsonSchema';

/**
 * Generates a JSON schema from a plain JavaScript object.
 * The input should be a JSON-serializable value.
 */
export function toJsonSchema(obj: unknown): JsonSchema {
	if (obj === null) {
		return { type: 'null' as JsonSchemaType };
	}

	switch (typeof obj) {
		case 'string':
			return { type: 'string' };
		case 'number':
			return { type: Number.isInteger(obj) ? 'integer' : 'number' };
		case 'boolean':
			return { type: 'boolean' as JsonSchemaType };
		case 'object':
			if (Array.isArray(obj)) {
				return toArraySchema(obj);
			}
			return toObjectSchema(obj as Record<string, unknown>);
		default:
			// For undefined or other non-JSON types, return empty schema
			return {};
	}
}

function toArraySchema(arr: unknown[]): JsonSchema {
	if (arr.length === 0) {
		// Empty array, no item schema can be inferred
		return { type: 'array' };
	}

	// Check if all elements are non-null objects (not arrays)
	const allObjects = arr.every(item => item !== null && typeof item === 'object' && !Array.isArray(item));

	if (allObjects) {
		// Merge object schemas, only common properties are required
		const itemSchema = mergeObjectSchemas(arr as Record<string, unknown>[]);
		return {
			type: 'array',
			items: itemSchema,
		};
	}

	// Collect unique schemas for different types
	const schemas = getUniqueSchemas(arr);

	if (schemas.length === 1) {
		return {
			type: 'array',
			items: schemas[0],
		};
	}

	// Multiple different types, use oneOf
	return {
		type: 'array',
		items: { oneOf: schemas },
	};
}

function getSchemaKey(schema: JsonSchema): string {
	// Create a key to identify unique schema types
	if ('type' in schema) {
		if (schema.type === 'object') {
			return 'object';
		}
		if (schema.type === 'array') {
			return 'array';
		}
		return String(schema.type);
	}
	return JSON.stringify(schema);
}

function getUniqueSchemas(arr: unknown[]): JsonSchema[] {
	const schemaMap = new Map<string, JsonSchema>();
	const objectValues: Record<string, unknown>[] = [];

	for (const item of arr) {
		// Collect objects to merge later
		if (item !== null && typeof item === 'object' && !Array.isArray(item)) {
			objectValues.push(item as Record<string, unknown>);
			continue;
		}

		const schema = toJsonSchema(item);
		const key = getSchemaKey(schema);
		if (!schemaMap.has(key)) {
			schemaMap.set(key, schema);
		}
	}

	// Merge all object values into a single schema
	if (objectValues.length > 0) {
		schemaMap.set('object', mergeObjectSchemas(objectValues));
	}

	return Array.from(schemaMap.values());
}

function mergeObjectSchemas(objects: Record<string, unknown>[]): JsonSchema {
	// Collect all values for each property
	const propertyValues = new Map<string, unknown[]>();

	for (const obj of objects) {
		for (const [key, value] of Object.entries(obj)) {
			if (!propertyValues.has(key)) {
				propertyValues.set(key, []);
			}
			propertyValues.get(key)!.push(value);
		}
	}

	const properties: Record<string, JsonSchema> = {};
	const required: string[] = [];

	for (const [key, values] of propertyValues) {
		properties[key] = mergeValues(values);
		// Only mark as required if present in all objects
		if (values.length === objects.length) {
			required.push(key);
		}
	}

	const schema: JsonSchema = {
		type: 'object',
		properties,
	};

	if (required.length > 0) {
		(schema as { required?: string[] }).required = required;
	}

	return schema;
}

function mergeValues(values: unknown[]): JsonSchema {
	// Check if all values are non-null objects (not arrays)
	const allObjects = values.every(v => v !== null && typeof v === 'object' && !Array.isArray(v));

	if (allObjects) {
		return mergeObjectSchemas(values as Record<string, unknown>[]);
	}

	// Get unique schemas for the values
	const schemas = getUniqueSchemas(values);

	if (schemas.length === 1) {
		return schemas[0];
	}

	return { oneOf: schemas };
}

function toObjectSchema(obj: Record<string, unknown>): JsonSchema {
	const properties: Record<string, JsonSchema> = {};
	const required: string[] = [];

	for (const [key, value] of Object.entries(obj)) {
		properties[key] = toJsonSchema(value);
		// All keys present in the object are considered required
		required.push(key);
	}

	const schema: JsonSchema = {
		type: 'object',
		properties,
	};

	if (required.length > 0) {
		(schema as { required?: string[] }).required = required;
	}

	return schema;
}
