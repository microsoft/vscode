/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { FunctionDeclaration, Schema, Type } from '@google/genai';

export type ToolJsonSchema = {
	type?: string | string[];
	description?: string;
	properties?: Record<string, ToolJsonSchema>;
	items?: ToolJsonSchema;
	required?: string[];
	enum?: unknown[];

	// Add support for JSON Schema composition keywords
	anyOf?: ToolJsonSchema[];
	oneOf?: ToolJsonSchema[];
	allOf?: ToolJsonSchema[];
};

// Map JSON schema types to Gemini Type enum
function mapType(jsonType: string): Type {
	switch (jsonType) {
		case 'object':
			return Type.OBJECT;
		case 'array':
			return Type.ARRAY;
		case 'string':
			return Type.STRING;
		case 'number':
			return Type.NUMBER;
		case 'integer':
			return Type.INTEGER;
		case 'boolean':
			return Type.BOOLEAN;
		case 'null':
			return Type.NULL;
		default:
			throw new Error(`Unsupported type: ${jsonType}`);
	}
}

// Convert JSON schema → Gemini function declaration
export function toGeminiFunction(name: string, description: string, schema: ToolJsonSchema): FunctionDeclaration {
	// If schema root is array, we use its items for function parameters
	const target = schema.type === 'array' && schema.items ? schema.items : schema;

	const parameters: Schema = {
		type: Type.OBJECT,
		properties: transformProperties(target.properties || {}),
		required: Array.isArray(target.required) ? target.required : []
	};

	return {
		name,
		description: description || 'No description provided.',
		parameters
	};
}

// Flatten a schema's unions and nullable type arrays into concrete, non-null
// alternatives, tracking whether `null` appeared anywhere along the way.
function collectAlternatives(schema: ToolJsonSchema): { alternatives: ToolJsonSchema[]; nullable: boolean } {
	const union = schema.anyOf ?? schema.oneOf;
	if (union) {
		const alternatives: ToolJsonSchema[] = [];
		let nullable = false;
		for (const branch of union) {
			const collected = collectAlternatives(branch);
			nullable = nullable || collected.nullable;
			alternatives.push(...collected.alternatives);
		}
		return { alternatives, nullable };
	}

	// Gemini has no allOf, so the intersection is approximated by the first subschema.
	if (schema.allOf) {
		return collectAlternatives(schema.allOf[0]);
	}

	if (Array.isArray(schema.type)) {
		const nonNullTypes = [...new Set(schema.type.filter(type => type !== 'null'))];
		const { description, ...rest } = schema;
		return {
			alternatives: nonNullTypes.map(type => ({ ...rest, type })),
			nullable: schema.type.includes('null')
		};
	}

	if (schema.type === 'null') {
		return { alternatives: [], nullable: true };
	}

	return { alternatives: [schema], nullable: false };
}

// Transform a single alternative whose type is already flattened to one value.
function transformConcrete(schema: ToolJsonSchema): Schema {
	const type = typeof schema.type === 'string' ? schema.type : 'object';
	const transformed: Schema = { type: mapType(type) };

	if (schema.description) {
		transformed.description = schema.description;
	}

	if (type === 'string' && schema.enum) {
		const values = schema.enum.filter((value): value is string => typeof value === 'string');
		if (values.length > 0) {
			transformed.enum = values;
		}
	}

	if (type === 'object' && schema.properties) {
		transformed.properties = transformProperties(schema.properties);
		if (schema.required) {
			transformed.required = schema.required;
		}
	} else if (type === 'array' && schema.items) {
		transformed.items = transformSchema(schema.items);
	}

	return transformed;
}

function transformSchema(schema: ToolJsonSchema): Schema {
	const { alternatives, nullable } = collectAlternatives(schema);

	if (alternatives.length === 0) {
		const transformed: Schema = { type: Type.NULL };
		if (schema.description) {
			transformed.description = schema.description;
		}
		return transformed;
	}

	if (alternatives.length === 1) {
		const transformed = transformConcrete(alternatives[0]);
		if (nullable) {
			transformed.nullable = true;
		}
		if (schema.description && !transformed.description) {
			transformed.description = schema.description;
		}
		return transformed;
	}

	const transformed: Schema = { anyOf: alternatives.map(transformConcrete) };
	if (nullable) {
		transformed.nullable = true;
	}
	if (schema.description) {
		transformed.description = schema.description;
	}
	return transformed;
}

function transformProperties(props: Record<string, ToolJsonSchema>): Record<string, Schema> {
	const result: Record<string, Schema> = {};

	for (const [key, value] of Object.entries(props)) {
		result[key] = transformSchema(value);
	}

	return result;
}