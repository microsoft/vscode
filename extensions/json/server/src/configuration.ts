/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {ISchemaContributions} from './jsonSchemaService';

import * as nls from 'vscode-nls';
const localize = nls.loadMessageBundle();

export var schemaContributions: ISchemaContributions = {
	schemaAssociations: {

	},
	schemas: {
		// bundle the schema-schema to include (localized) descriptions
		'http://json-schema.org/draft-04/schema#': {
			'title': localize('schema.json', 'Describes a JSON file using a schema. See json-schema.org for more info.'),
			'$schema': 'http://json-schema.org/draft-04/schema#',
			'definitions': {
				'schemaArray': {
					'type': 'array',
					'minItems': 1,
					'items': { '$ref': '#' }
				},
				'positiveInteger': {
					'type': 'integer',
					'minimum': 0
				},
				'positiveIntegerDefault0': {
					'allOf': [{ '$ref': '#/definitions/positiveInteger' }, { 'default': 0 }]
				},
				'simpleTypes': {
					'type': 'string',
					'enum': ['array', 'boolean', 'integer', 'null', 'number', 'object', 'string']
				},
				'stringArray': {
					'type': 'array',
					'items': { 'type': 'string' },
					'minItems': 1,
					'uniqueItems': true
				}
			},
			'type': 'object',
			'properties': {
				'id': {
					'type': 'string',
					'format': 'uri',
					'description': localize('schema.json.id', 'A unique identifier for the schema.')
				},
				'$schema': {
					'type': 'string',
					'format': 'uri',
					'description': localize('schema.json.$schema', 'The schema to verify this document against ')
				},
				'title': {
					'type': 'string',
					'description': localize('schema.json.title', 'A descriptive title of the element')
				},
				'description': {
					'type': 'string',
					'description': localize('schema.json.description', 'A long description of the element. Used in hover menus and suggestions.')
				},
				'default': {
					'description': localize('schema.json.default', 'A default value. Used by suggestions.')
				},
				'multipleOf': {
					'type': 'number',
					'minimum': 0,
					'exclusiveMinimum': true,
					'description': localize('schema.json.multipleOf', 'A number that should cleanly divide the current value (i.e. have no remainder)')
				},
				'maximum': {
					'type': 'number',
					'description': localize('schema.json.maximum', 'The maximum numerical value, inclusive by default.')
				},
				'exclusiveMaximum': {
					'type': 'boolean',
					'default': false,
					'description': localize('schema.json.exclusiveMaximum', 'Makes the maximum property exclusive.')
				},
				'minimum': {
					'type': 'number',
					'description': localize('schema.json.minimum', 'The minimum numerical value, inclusive by default.')
				},
				'exclusiveMinimum': {
					'type': 'boolean',
					'default': false,
					'description': localize('schema.json.exclusiveMininum', 'Makes the minimum property exclusive.')
				},
				'maxLength': {
					'allOf': [
						{ '$ref': '#/definitions/positiveInteger' }
					],
					'description': localize('schema.json.maxLength', 'The maximum length of a string.')
				},
				'minLength': {
					'allOf': [
						{ '$ref': '#/definitions/positiveIntegerDefault0' }
					],
					'description': localize('schema.json.minLength', 'The minimum length of a string.')
				},
				'pattern': {
					'type': 'string',
					'format': 'regex',
					'description': localize('schema.json.pattern', 'A regular expression to match the string against. It is not implicitly anchored.')
				},
				'additionalItems': {
					'anyOf': [
						{ 'type': 'boolean' },
						{ '$ref': '#' }
					],
					'default': {},
					'description': localize('schema.json.additionalItems', 'For arrays, only when items is set as an array. If it is a schema, then this schema validates items after the ones specified by the items array. If it is false, then additional items will cause validation to fail.')
				},
				'items': {
					'anyOf': [
						{ '$ref': '#' },
						{ '$ref': '#/definitions/schemaArray' }
					],
					'default': {},
					'description': localize('schema.json.items', 'For arrays. Can either be a schema to validate every element against or an array of schemas to validate each item against in order (the first schema will validate the first element, the second schema will validate the second element, and so on.')
				},
				'maxItems': {
					'allOf': [
						{ '$ref': '#/definitions/positiveInteger' }
					],
					'description': localize('schema.json.maxItems', 'The maximum number of items that can be inside an array. Inclusive.')
				},
				'minItems': {
					'allOf': [
						{ '$ref': '#/definitions/positiveIntegerDefault0' }
					],
					'description': localize('schema.json.minItems', 'The minimum number of items that can be inside an array. Inclusive.')
				},
				'uniqueItems': {
					'type': 'boolean',
					'default': false,
					'description': localize('schema.json.uniqueItems', 'If all of the items in the array must be unique. Defaults to false.')
				},
				'maxProperties': {
					'allOf': [
						{ '$ref': '#/definitions/positiveInteger' }
					],
					'description': localize('schema.json.maxProperties', 'The maximum number of properties an object can have. Inclusive.')
				},
				'minProperties': {
					'allOf': [
						{ '$ref': '#/definitions/positiveIntegerDefault0' },
					],
					'description': localize('schema.json.minProperties', 'The minimum number of properties an object can have. Inclusive.')
				},
				'required': {
					'allOf': [
						{ '$ref': '#/definitions/stringArray' }
					],
					'description': localize('schema.json.required', 'An array of strings that lists the names of all properties required on this object.')
				},
				'additionalProperties': {
					'anyOf': [
						{ 'type': 'boolean' },
						{ '$ref': '#' }
					],
					'default': {},
					'description': localize('schema.json.additionalProperties', 'Either a schema or a boolean. If a schema, then used to validate all properties not matched by \'properties\' or \'patternProperties\'. If false, then any properties not matched by either will cause this schema to fail.')
				},
				'definitions': {
					'type': 'object',
					'additionalProperties': { '$ref': '#' },
					'default': {},
					'description': localize('schema.json.definitions', 'Not used for validation. Place subschemas here that you wish to reference inline with $ref')
				},
				'properties': {
					'type': 'object',
					'additionalProperties': { '$ref': '#' },
					'default': {},
					'description': localize('schema.json.properties', 'A map of property names to schemas for each property.')
				},
				'patternProperties': {
					'type': 'object',
					'additionalProperties': { '$ref': '#' },
					'default': {},
					'description': localize('schema.json.patternProperties', 'A map of regular expressions on property names to schemas for matching properties.')
				},
				'dependencies': {
					'type': 'object',
					'additionalProperties': {
						'anyOf': [
							{ '$ref': '#' },
							{ '$ref': '#/definitions/stringArray' }
						]
					},
					'description': localize('schema.json.dependencies', 'A map of property names to either an array of property names or a schema. An array of property names means the property named in the key depends on the properties in the array being present in the object in order to be valid. If the value is a schema, then the schema is only applied to the object if the property in the key exists on the object.')
				},
				'enum': {
					'type': 'array',
					'minItems': 1,
					'uniqueItems': true,
					'description': localize('schema.json.enum', 'The set of literal values that are valid')
				},
				'type': {
					'anyOf': [
						{ '$ref': '#/definitions/simpleTypes' },
						{
							'type': 'array',
							'items': { '$ref': '#/definitions/simpleTypes' },
							'minItems': 1,
							'uniqueItems': true
						}
					],
					'description': localize('schema.json.type', 'Either a string of one of the basic schema types (number, integer, null, array, object, boolean, string) or an array of strings specifying a subset of those types.')
				},
				'format': {
					'anyOf': [
						{
							'type': 'string',
							'description': localize('schema.json.format', 'Describes the format expected for the value.'),
							'enum': ['date-time', 'uri', 'email', 'hostname', 'ipv4', 'ipv6', 'regex']
						}, {
							'type': 'string'
						}
					]
				},
				'allOf': {
					'allOf': [
						{ '$ref': '#/definitions/schemaArray' }
					],
					'description': localize('schema.json.allOf', 'An array of schemas, all of which must match.')
				},
				'anyOf': {
					'allOf': [
						{ '$ref': '#/definitions/schemaArray' }
					],
					'description': localize('schema.json.anyOf', 'An array of schemas, where at least one must match.')
				},
				'oneOf': {
					'allOf': [
						{ '$ref': '#/definitions/schemaArray' }
					],
					'description': localize('schema.json.oneOf', 'An array of schemas, exactly one of which must match.')
				},
				'not': {
					'allOf': [
						{ '$ref': '#' }
					],
					'description': localize('schema.json.not', 'A schema which must not match.')
				}
			},
			'dependencies': {
				'exclusiveMaximum': ['maximum'],
				'exclusiveMinimum': ['minimum']
			},
			'default': {}
		}
	}
};