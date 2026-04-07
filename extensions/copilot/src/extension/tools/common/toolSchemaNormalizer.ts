/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as l10n from '@vscode/l10n';
import Ajv from 'ajv';
import { ArrayJsonSchema, JsonSchema, ObjectJsonSchema } from '../../../platform/configuration/common/jsonSchema';
import { jsonSchemaDraft7 } from '../../../platform/configuration/common/jsonSchemaDraft7';
import { OpenAiFunctionDef, OpenAiFunctionTool } from '../../../platform/networking/common/fetch';
import { Iterable } from '../../../util/vs/base/common/iterator';
import { Lazy } from '../../../util/vs/base/common/lazy';
import { deepClone } from '../../../util/vs/base/common/objects';

/**
 * Normalizes tool schema for various model restrictions. This is a hack
 * just to avoid issues with certain model constraints, which currently result
 * in CAPI returning a blank 400 error. This is a terrible experience in the
 * extensible MCP scenario, so here we _try_ to normalize known cases to
 * avoid that (though there may certainly be unknown cases).
 */
export function normalizeToolSchema(family: string, tools: OpenAiFunctionTool[] | undefined, onFix?: (tool: string, rule: string) => void) {
	if (!tools?.length) {
		return undefined;
	}

	const output: OpenAiFunctionTool[] = [];
	for (const tool of tools) {
		try {
			const cloned = deepClone(tool);
			for (const rule of fnRules) {
				rule(family, cloned.function, msg => onFix?.(cloned.function.name, msg));
			}

			if (cloned.function.parameters) {
				for (const rule of jsonSchemaRules) {
					if (cloned.function.parameters) {
						rule(family, cloned.function.parameters, msg => onFix?.(cloned.function.name, msg));
					}
				}
			}

			output.push(cloned);
		} catch (e) {
			const e2 = new Error(l10n.t`Failed to validate tool ${tool.function.name}: ${e}. Please open an issue for the MCP server or extension which provides this tool`);
			e2.stack = e.stack;
			throw e2;
		}
	}


	return output;
}


const fnRules: ((family: string, node: OpenAiFunctionDef, didFix: (message: string) => void) => void)[] = [
	(_family, n, didFix) => {
		if (n.parameters === undefined) {
			return;
		}

		if (!n.parameters || (n.parameters as ObjectJsonSchema).type !== 'object') {
			n.parameters = { type: 'object', properties: {} } satisfies ObjectJsonSchema;
			didFix('schema must be an object if present');
		}

		const obj = n.parameters as ObjectJsonSchema;
		if (!obj.properties) {
			obj.properties = {};
			didFix('schema must have a properties object');
		}
	},
	(_family, n, didFix) => {
		if (!n.description) {
			n.description = 'No description provided';
			didFix('schema description may not be empty');
		}
	},
];

const ajvJsonValidator = new Lazy(() => {
	const ajv = new Ajv({
		coerceTypes: true,
		strictTypes: true,
		allowUnionTypes: true,
	});
	ajv.addFormat('uri', (value) => URL.canParse(value));
	ajv.addFormat('regex', (value) => typeof value === 'string');

	return ajv.compile(jsonSchemaDraft7);
});


const jsonSchemaRules: ((family: string, node: JsonSchema, didFix: (message: string) => void) => void)[] = [
	(_family, schema) => {
		if (!ajvJsonValidator.value(schema)) {
			throw new Error('tool parameters do not match JSON schema: ' + ajvJsonValidator.value.errors!.map(e => e.instancePath + ' ' + e.message).join('\n'));
		}
	},
	(_family, schema) => {
		forEachSchemaNode(schema, n => {
			if (n && 'type' in n && n.type === 'array' && !(n as ArrayJsonSchema).items) {
				throw new Error('tool parameters array type must have items');
			}
		});
	},
	(family, schema, onFix) => {
		if (!isGpt4ish(family)) { return; }

		forEachSchemaNode(schema, n => {
			if (n && 'description' in n && n.description && n.description.length > gpt4oMaxStringLength) {
				n.description = n.description.substring(0, gpt4oMaxStringLength);
				onFix(`object description is too long (truncated to ${gpt4oMaxStringLength} chars)`);
			}
		});
	},
	(family, schema, onFix) => {
		if (!isGpt4ish(family)) { return; }

		forEachSchemaNode(schema, n => {
			for (const key of Object.keys(n)) {
				if (gpt4oUnsupportedSchemaKeywords.has(key)) {
					delete (n as any)[key];
					onFix(`object has unsupported schema keyword '${key}'`);
				}
			}
		});
	},
	(_family, schema, onFix) => {
		// validated this fails both for claude and 4o
		const unsupported = ['oneOf', 'anyOf', 'allOf', 'not', 'if', 'then', 'else'];
		for (const key of unsupported) {
			if (schema.hasOwnProperty(key)) {
				onFix(`object has unsupported top-level schema keyword '${key}'`);
				delete (schema as any)[key];
			}
		}
	},
	(_family, schema, onFix) => {
		forEachSchemaNode(schema, n => {
			if (n && typeof n === 'object' && (n as ObjectJsonSchema).type === 'object') {
				const obj = n as ObjectJsonSchema;
				if (obj.properties && typeof obj.properties === 'object' && obj.required && Array.isArray(obj.required)) {
					obj.required = obj.required.filter(key => {
						if (obj.properties![key] === undefined) {
							onFix(`object has required property '${key}' that is not defined`);
							return false;
						}
						return true;
					});
				}
			}
		});
	},

	(family, schema, onFix) => {
		if (!isDraft2020_12Schema(family)) {
			return;
		}
		forEachSchemaNode(schema, n => {
			if (n && typeof n === 'object' && (n as ArrayJsonSchema).type === 'array') {
				const obj = n as ArrayJsonSchema;
				if (obj.items && Array.isArray(obj.items)) {
					onFix(`array schema has items as an array, which is not supported in Draft 2020-12`);
					obj.items = { anyOf: obj.items } satisfies JsonSchema;
				}
			}
		});
	},
	(family, schema, onFix) => {
		// Gemini models require nullable types to use OpenAPI 3.0 nullable keyword instead of JSON Schema union types
		if (!isGeminiFamily(family)) {
			return;
		}
		forEachSchemaNode(schema, n => {
			if (n && typeof n === 'object' && 'type' in n && Array.isArray(n.type)) {
				const types = n.type as string[];
				const hasNull = types.includes('null');
				const nonNullTypes = types.filter(t => t !== 'null');

				if (hasNull && nonNullTypes.length === 1) {
					// Convert ["string", "null"] to { type: "string", nullable: true }
					(n as any).type = nonNullTypes[0];
					(n as any).nullable = true;
					onFix(`converted nullable type array to OpenAPI nullable keyword for Gemini compatibility`);
				} else if (hasNull && nonNullTypes.length > 1) {
					// For multiple non-null types with null, we can't easily convert, so we remove null.
					// This changes the schema semantics: the field is no longer nullable and values of `null`
					// will fail validation. This is a limitation, but better than a blank 400 error from the model.
					(n as any).type = nonNullTypes;
					onFix(`removed null from multi-type union for Gemini compatibility; this makes the field non-nullable and may cause validation errors for callers that pass null`);
				}
			}
		});
	},
];


function forEachSchemaNode<T>(input: JsonSchema, fn: (node: JsonSchema) => undefined | T): T | undefined {
	if (!input || typeof input !== 'object') {
		return;
	}

	const r = fn(input);
	if (r !== undefined) {
		return r;
	}

	const children: (JsonSchema | JsonSchema[] | undefined)[] = [
		'properties' in input ? Object.values((input as ObjectJsonSchema).properties || {}) : undefined,
		'items' in input ? (Array.isArray(input.items) ? input.items : [input.items]) : undefined,
		'dependencies' in input ? Object.values((input as ObjectJsonSchema).dependencies || {}) : undefined,
		'patternProperties' in input ? Object.values((input as ObjectJsonSchema).patternProperties || {}) : undefined,
		'additionalProperties' in input ? [(input as ObjectJsonSchema).additionalProperties] : undefined,
		'anyOf' in input ? input.anyOf : undefined,
		'allOf' in input ? input.allOf : undefined,
		'oneOf' in input ? input.oneOf : undefined,
		'not' in input ? input.not : undefined,
		'if' in input ? input.if : undefined,
		'then' in input ? input.then : undefined,
		'else' in input ? input.else : undefined,
		'contains' in input ? (input as ArrayJsonSchema).contains : undefined,
	];

	for (const child of children) {
		for (const value of (Array.isArray(child) ? child : Iterable.single(child))) {
			const r = forEachSchemaNode(value, fn);

			if (r !== undefined) {
				return r;
			}
		}
	}
}

// Whether the model is a GPT-4 family model.
const isGpt4ish = (family: string) => family.startsWith('gpt-4');
// Whether the model is a model known to follow JSON Schema Draft 2020-12, (versus Draft 7).
const isDraft2020_12Schema = (family: string) => family.startsWith('gpt-4') || family.startsWith('claude-') || family.startsWith('o4');
// Whether the model is a Gemini family model.
const isGeminiFamily = (family: string) => family.toLowerCase().includes('gemini');

const gpt4oMaxStringLength = 1024;

// Keywords in schema that gpt-4o does not support. From Toby at Github who wrote a normalizer
// https://gist.github.com/toby/dfe40041ae5b02d44ea21321b9f7dfd2
const gpt4oUnsupportedSchemaKeywords = new Set([
	'minLength',
	'maxLength',
	'pattern',
	'default',
	'format',
	'minimum',
	'maximum',
	'multipleOf',
	'patternProperties',
	'unevaluatedProperties',
	'propertyNames',
	'minProperties',
	'maxProperties',
	'unevaluatedItems',
	'contains',
	'minContains',
	'maxContains',
	'minItems',
	'maxItems',
	'uniqueItems'
]);
