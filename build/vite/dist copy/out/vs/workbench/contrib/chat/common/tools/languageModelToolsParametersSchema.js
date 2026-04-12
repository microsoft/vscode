/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Extensions as JSONExtensions } from '../../../../../platform/jsonschemas/common/jsonContributionRegistry.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
/**
 * A schema for parametersSchema
 * This is a subset of https://json-schema.org/draft-07/schema to capture what is actually supported by language models for tools, mainly, that they must be an object at the top level.
 * Possibly it can be whittled down some more based on which attributes are supported by language models.
 */
export const toolsParametersSchemaSchemaId = 'vscode://schemas/toolsParameters';
const toolsParametersSchemaSchema = {
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
const contributionRegistry = Registry.as(JSONExtensions.JSONContribution);
contributionRegistry.registerSchema(toolsParametersSchemaSchemaId, toolsParametersSchemaSchema);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibGFuZ3VhZ2VNb2RlbFRvb2xzUGFyYW1ldGVyc1NjaGVtYS5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvY29tbW9uL3Rvb2xzL2xhbmd1YWdlTW9kZWxUb29sc1BhcmFtZXRlcnNTY2hlbWEudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFHaEcsT0FBTyxFQUFFLFVBQVUsSUFBSSxjQUFjLEVBQTZCLE1BQU0sd0VBQXdFLENBQUM7QUFDakosT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLHFEQUFxRCxDQUFDO0FBRS9FOzs7O0dBSUc7QUFDSCxNQUFNLENBQUMsTUFBTSw2QkFBNkIsR0FBRyxrQ0FBa0MsQ0FBQztBQUNoRixNQUFNLDJCQUEyQixHQUFnQjtJQUNoRCxXQUFXLEVBQUU7UUFDWixXQUFXLEVBQUU7WUFDWixJQUFJLEVBQUUsT0FBTztZQUNiLFFBQVEsRUFBRSxDQUFDO1lBQ1gsS0FBSyxFQUFFO2dCQUNOLElBQUksRUFBRSxHQUFHO2FBQ1Q7U0FDRDtRQUNELGtCQUFrQixFQUFFO1lBQ25CLElBQUksRUFBRSxTQUFTO1lBQ2YsT0FBTyxFQUFFLENBQUM7U0FDVjtRQUNELDBCQUEwQixFQUFFO1lBQzNCLEtBQUssRUFBRTtnQkFDTjtvQkFDQyxJQUFJLEVBQUUsa0NBQWtDO2lCQUN4QztnQkFDRDtvQkFDQyxPQUFPLEVBQUUsQ0FBQztpQkFDVjthQUNEO1NBQ0Q7UUFDRCxXQUFXLEVBQUU7WUFDWixJQUFJLEVBQUU7Z0JBQ0wsT0FBTztnQkFDUCxTQUFTO2dCQUNULFNBQVM7Z0JBQ1QsTUFBTTtnQkFDTixRQUFRO2dCQUNSLFFBQVE7Z0JBQ1IsUUFBUTthQUNSO1NBQ0Q7UUFDRCxXQUFXLEVBQUU7WUFDWixJQUFJLEVBQUUsT0FBTztZQUNiLEtBQUssRUFBRTtnQkFDTixJQUFJLEVBQUUsUUFB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