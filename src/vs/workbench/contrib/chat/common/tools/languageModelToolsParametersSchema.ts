/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IJSONSchema } from '../../../../../base/common/jsonSchema.js';
import { Extensions as JSONExtensions, IJSONContributionRegistry } from '../../../../../platform/jsonschemas/common/jsonContributionRegistry.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';

/**
 * A schema for parametersSchema
 * This is a subset of https://json-schema.org/draft-07/schema to capture what is actually supported by language models for tools, mainly, that they must be an object at the top level.
 * Possibly it can be whittled down some more based on which attributes are supported by language models.
 */
export const toolsParametersSchemaSchemaId = 'vscode://schemas/toolsParameters';
const toolsParametersSchemaSchema: IJSONSchema = {
	definitions: {
		schemaArray: {
			type: 'array',
			minItems: 1,
			items: {
				$ref: '#'
			}
		},
		nonNegativeInteger: {
			type: 'integer',
			minimum: 0
		},
		nonNegativeIntegerDefault0: {
			allOf: [
				{
					$ref: '#/definitions/nonNegativeInteger'
				},
				{
					default: 0
				}
			]
		},
		simpleTypes: {
			enum: [
				'array',
				'boolean',
				'integer',
				'null',
				'number',
				'object',
				'string'
			]
		},
		stringArray: {
			type: 'array',
			items: {
				type: 'string'
			},
			uniqueItems: true,
			default: []
		}
	},
	type: ['object'],
	properties: {
		$id: {
			type: 'string',
			format: 'uri-reference'
		},
		$schema: {
			type: 'string',
			format: 'uri'
		},
		$ref: {
			type: 'string',
			format: 'uri-reference'
		},
		$comment: {
			type: 'string'
		},
		title: {
			type: 'string'
		},
		description: {
			type: 'string'
		},
		readOnly: {
			type: 'boolean',
			default: false
		},
		writeOnly: {
			type: 'boolean',
			default: false
		},
		multipleOf: {
			type: 'number',
			exclusiveMinimum: 0
		},
		maximum: {
			type: 'number'
		},
		exclusiveMaximum: {
			type: 'number'
		},
		minimum: {
			type: 'number'
		},
		exclusiveMinimum: {
			type: 'number'
		},
		maxLength: {
			$ref: '#/definitions/nonNegativeInteger'
		},
		minLength: {
			$ref: '#/definitions/nonNegativeIntegerDefault0'
		},
		pattern: {
			type: 'string',
			format: 'regex'
		},
		additionalItems: {
			$ref: '#'
		},
		items: {
			anyOf: [
				{
					$ref: '#'
				},
				{
					$ref: '#/definitions/schemaArray'
				}
			],
			default: true
		},
		maxItems: {
			$ref: '#/definitions/nonNegativeInteger'
		},
		minItems: {
			$ref: '#/definitions/nonNegativeIntegerDefault0'
		},
		uniqueItems: {
			type: 'boolean',
			default: false
		},
		contains: {
			$ref: '#'
		},
		maxProperties: {
			$ref: '#/definitions/nonNegativeInteger'
		},
		minProperties: {
			$ref: '#/definitions/nonNegativeIntegerDefault0'
		},
		required: {
			$ref: '#/definitions/stringArray'
		},
		additionalProperties: {
			$ref: '#'
		},
		definitions: {
			type: 'object',
			additionalProperties: {
				$ref: '#'
			},
			default: {}
		},
		properties: {
			type: 'object',
			additionalProperties: {
				$ref: '#'
			},
			default: {}
		},
		patternProperties: {
			type: 'object',
			additionalProperties: {
				$ref: '#'
			},
			propertyNames: {
				format: 'regex'
			},
			default: {}
		},
		dependencies: {
			type: 'object',
			additionalProperties: {
				anyOf: [
					{
						$ref: '#'
					},
					{
						$ref: '#/definitions/stringArray'
					}
				]
			}
		},
		propertyNames: {
			$ref: '#'
		},
		enum: {
			type: 'array',
			minItems: 1,
			uniqueItems: true
		},
		type: {
			anyOf: [
				{
					$ref: '#/definitions/simpleTypes'
				},
				{
					type: 'array',
					items: {
						$ref: '#/definitions/simpleTypes'
					},
					minItems: 1,
					uniqueItems: true
				}
			]
		},
		format: {
			type: 'string'
		},
		contentMediaType: {
			type: 'string'
		},
		contentEncoding: {
			type: 'string'
		},
		if: {
			$ref: '#'
		},
		then: {
			$ref: '#'
		},
		else: {
			$ref: '#'
		},
		allOf: {
			$ref: '#/definitions/schemaArray'
		},
		anyOf: {
			$ref: '#/definitions/schemaArray'
		},
		oneOf: {
			$ref: '#/definitions/schemaArray'
		},
		not: {
			$ref: '#'
		}
	},
	defaultSnippets: [{
		body: {
			type: 'object',
			properties: {
				'${1:paramName}': {
					type: 'string',
					description: '${2:description}'
				}
			}
		},
	}],
};
const contributionRegistry = Registry.as<IJSONContributionRegistry>(JSONExtensions.JSONContribution);
contributionRegistry.registerSchema(toolsParametersSchemaSchemaId, toolsParametersSchemaSchema);
