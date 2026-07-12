/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { FunctionDeclaration, Schema, Type } from '@google/genai';

export type ToolJsonSchema = {
	type?: string;
	description?: string;
	properties?: Record<string, ToolJsonSchema>;
	items?: ToolJsonSchema;
	required?: string[];
	enum?: string[];

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

// Recursive transformation for nested properties
function transformProperties(props: Record<string, ToolJsonSchema>): Record<string, any> {
	const result: Record<string, any> = {};

	for (const [key, value] of Object.entries(props)) {

		// Handle anyOf, oneOf, allOf by picking the first valid entry
		const effectiveValue =
			(value.anyOf?.[0] || value.oneOf?.[0] || value.allOf?.[0] || value) as ToolJsonSchema;


		const transformed: any = {
			// If type is undefined, throw an error to avoid incorrect assumptions
			type: effectiveValue.type
				? mapType(effectiveValue.type)
				: Type.OBJECT
		};

		if (effectiveValue.description) {
			transformed.description = effectiveValue.description;
		}

		// Enum support
		if (effectiveValue.enum) {
			transformed.enum = effectiveValue.enum;
		}

		if (effectiveValue.type === 'object' && effectiveValue.properties) {
			transformed.properties = transformProperties(effectiveValue.properties);
			if (effectiveValue.required) {
				transformed.required = effectiveValue.required;
			}
		} else if (effectiveValue.type === 'array' && effectiveValue.items) {
			const itemType = effectiveValue.items.type === 'object' ? Type.OBJECT : mapType(effectiveValue.items.type ?? 'object');
			const itemSchema: any = { type: itemType };

			if (effectiveValue.items.description) {
				itemSchema.description = effectiveValue.items.description;
			}

			if (effectiveValue.items.enum) {
				itemSchema.enum = effectiveValue.items.enum;
			}

			if (effectiveValue.items.properties) {
				itemSchema.properties = transformProperties(effectiveValue.items.properties);
				if (effectiveValue.items.required) {
					itemSchema.required = effectiveValue.items.required;
				}
			}

			transformed.items = itemSchema;
		}

		result[key] = transformed;
	}

	return result;
}