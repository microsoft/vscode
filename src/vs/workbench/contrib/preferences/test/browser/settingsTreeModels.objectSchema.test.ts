/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { strictEqual } from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';

/**
 * Simplified version of the schema classification logic for testing
 */

function isSimpleType(type: string): boolean {
	return ['string', 'boolean', 'integer', 'number', 'null'].includes(type);
}

function getObjectRenderableSchemaType(schema: any, key: string): 'simple' | 'complex' | false {
	const { type } = schema;

	if (Array.isArray(type)) {
		for (const t of type) {
			if (!isSimpleType(t)) {
				return false;
			}
		}
		return 'complex';
	}

	if (isSimpleType(type)) {
		return 'simple';
	}

	if (type === 'array') {
		if (schema.items) {
			const itemSchemas = Array.isArray(schema.items) ? schema.items : [schema.items];
			for (const itemSchema of itemSchemas) {
				const { type: itemType } = itemSchema;
				if (Array.isArray(itemType)) {
					for (const t of itemType) {
						if (!isSimpleType(t)) {
							return false;
						}
					}
					return 'complex';
				}
				if (!isSimpleType(itemType)) {
					return false;
				}
				return 'complex';
			}
		}
		return false;
	}

	if (type === 'object') {
		// Handle object types with simple properties
		if (schema.properties) {
			for (const propertySchema of Object.values(schema.properties)) {
				const propertyType = (propertySchema as any).type;
				if (Array.isArray(propertyType)) {
					for (const t of propertyType) {
						if (!isSimpleType(t)) {
							return false;
						}
					}
				} else if (!isSimpleType(propertyType)) {
					return false;
				}
			}
			return 'complex';
		}
		// Object without properties is not renderable
		return false;
	}

	return false;
}

function getObjectSettingSchemaType(setting: any): 'simple' | 'complex' | false {
	const { type, objectProperties, objectPatternProperties, objectAdditionalProperties } = setting;

	if (type !== 'object') {
		return false;
	}

	// object can have any shape
	if (
		objectProperties == null &&
		objectPatternProperties == null &&
		objectAdditionalProperties == null
	) {
		return false;
	}

	// objectAdditionalProperties allow the setting to have any shape,
	// but if there's a pattern property that handles everything, then every
	// property will match that patternProperty, so we don't need to look at
	// the value of objectAdditionalProperties in that case.
	if ((objectAdditionalProperties === true || objectAdditionalProperties === undefined)
		&& !Object.keys(objectPatternProperties ?? {}).includes('.*')) {
		return false;
	}

	const schemas = [...Object.values(objectProperties ?? {}), ...Object.values(objectPatternProperties ?? {})];

	if (objectAdditionalProperties && typeof objectAdditionalProperties === 'object') {
		schemas.push(objectAdditionalProperties);
	}

	let schemaType: 'simple' | 'complex' = 'simple';
	for (const schema of schemas) {
		// Handle anyOf arrays
		const subSchemas = Array.isArray(schema.anyOf) ? schema.anyOf : [schema];
		for (const subSchema of subSchemas) {
			const subSchemaType = getObjectRenderableSchemaType(subSchema, setting.key);
			if (subSchemaType === false) {
				return false;
			}
			if (subSchemaType === 'complex') {
				schemaType = 'complex';
			}
		}
	}

	return schemaType;
}

suite('Settings Tree Models - Object Schema Classification', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('terminal auto approve setting should be classified as complex', () => {
		const terminalAutoApproveSetting = {
			key: 'chat.tools.terminal.autoApprove',
			type: 'object',
			objectProperties: undefined,
			objectPatternProperties: undefined,
			objectAdditionalProperties: {
				anyOf: [
					{
						type: 'boolean',
						enum: [true, false],
						enumDescriptions: [
							"Automatically approve the pattern.",
							"Require explicit approval for the pattern."
						],
						description: "The start of a command to match against. A regular expression can be provided by wrapping the string in `/` characters."
					},
					{
						type: 'object',
						properties: {
							approve: {
								type: 'boolean',
								enum: [true, false],
								enumDescriptions: [
									"Automatically approve the pattern.",
									"Require explicit approval for the pattern."
								],
								description: "The start of a command to match against. A regular expression can be provided by wrapping the string in `/` characters."
							},
							matchCommandLine: {
								type: 'boolean',
								enum: [true, false],
								enumDescriptions: [
									"Match against the full command line, eg. `foo && bar`.",
									"Match against sub-commands and inline commands, eg. `foo && bar` will need both `foo` and `bar` to match."
								],
								description: "Whether to match against the full command line, as opposed to splitting by sub-commands and inline commands."
							}
						},
						required: ['approve']
					},
					{
						type: 'null',
						description: "Ignore the pattern, this is useful for unsetting the same pattern set at a higher scope."
					}
				]
			}
		};

		const result = getObjectSettingSchemaType(terminalAutoApproveSetting);
		strictEqual(result, 'complex', 'Terminal auto approve setting should be classified as complex to enable UI editing');
	});

	test('object with simple properties should be classified as complex', () => {
		const objectSchema = {
			type: 'object',
			properties: {
				approve: { type: 'boolean' },
				matchCommandLine: { type: 'boolean' }
			},
			required: ['approve']
		};

		const result = getObjectRenderableSchemaType(objectSchema, 'test.key');
		strictEqual(result, 'complex', 'Object with simple properties should be classified as complex');
	});

	test('object with non-simple properties should be classified as false', () => {
		const objectSchema = {
			type: 'object',
			properties: {
				complex: { type: 'object', properties: { nested: { type: 'string' } } }
			}
		};

		const result = getObjectRenderableSchemaType(objectSchema, 'test.key');
		strictEqual(result, false, 'Object with non-simple properties should not be renderable');
	});

	test('object without properties should be classified as false', () => {
		const objectSchema = {
			type: 'object'
		};

		const result = getObjectRenderableSchemaType(objectSchema, 'test.key');
		strictEqual(result, false, 'Object without properties should not be renderable');
	});

	test('simple types should be classified as simple', () => {
		strictEqual(getObjectRenderableSchemaType({ type: 'boolean' }, 'test.key'), 'simple');
		strictEqual(getObjectRenderableSchemaType({ type: 'string' }, 'test.key'), 'simple');
		strictEqual(getObjectRenderableSchemaType({ type: 'number' }, 'test.key'), 'simple');
		strictEqual(getObjectRenderableSchemaType({ type: 'integer' }, 'test.key'), 'simple');
		strictEqual(getObjectRenderableSchemaType({ type: 'null' }, 'test.key'), 'simple');
	});
});