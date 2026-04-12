/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as nls from '../../../../nls.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { Extensions as JSONExtensions } from '../../../../platform/jsonschemas/common/jsonContributionRegistry.js';
import { workbenchColorsSchemaId } from '../../../../platform/theme/common/colorRegistry.js';
import { tokenStylingSchemaId } from '../../../../platform/theme/common/tokenClassificationRegistry.js';
const textMateScopes = [
    'comment',
    'comment.block',
    'comment.block.documentation',
    'comment.line',
    'constant',
    'constant.character',
    'constant.character.escape',
    'constant.numeric',
    'constant.numeric.integer',
    'constant.numeric.float',
    'constant.numeric.hex',
    'constant.numeric.octal',
    'constant.other',
    'constant.regexp',
    'constant.rgb-value',
    'emphasis',
    'entity',
    'entity.name',
    'entity.name.class',
    'entity.name.function',
    'entity.name.method',
    'entity.name.section',
    'entity.name.selector',
    'entity.name.tag',
    'entity.name.type',
    'entity.other',
    'entity.other.attribute-name',
    'entity.other.inherited-class',
    'invalid',
    'invalid.deprecated',
    'invalid.illegal',
    'keyword',
    'keyword.control',
    'keyword.operator',
    'keyword.operator.new',
    'keyword.operator.assignment',
    'keyword.operator.arithmetic',
    'keyword.operator.logical',
    'keyword.other',
    'markup',
    'markup.bold',
    'markup.changed',
    'markup.deleted',
    'markup.heading',
    'markup.inline.raw',
    'markup.inserted',
    'markup.italic',
    'markup.list',
    'markup.list.numbered',
    'markup.list.unnumbered',
    'markup.other',
    'markup.quote',
    'markup.raw',
    'markup.underline',
    'markup.underline.link',
    'meta',
    'meta.block',
    'meta.cast',
    'meta.class',
    'meta.function',
    'meta.function-call',
    'meta.preprocessor',
    'meta.return-type',
    'meta.selector',
    'meta.tag',
    'meta.type.annotation',
    'meta.type',
    'punctuation.definition.string.begin',
    'punctuation.definition.string.end',
    'punctuation.separator',
    'punctuation.separator.continuation',
    'punctuation.terminator',
    'storage',
    'storage.modifier',
    'storage.type',
    'string',
    'string.interpolated',
    'string.other',
    'string.quoted',
    'string.quoted.double',
    'string.quoted.other',
    'string.quoted.single',
    'string.quoted.triple',
    'string.regexp',
    'string.unquoted',
    'strong',
    'support',
    'support.class',
    'support.constant',
    'support.function',
    'support.other',
    'support.type',
    'support.type.property-name',
    'support.variable',
    'variable',
    'variable.language',
    'variable.name',
    'variable.other',
    'variable.other.readwrite',
    'variable.parameter'
];
export const textmateColorsSchemaId = 'vscode://schemas/textmate-colors';
export const textmateColorGroupSchemaId = `${textmateColorsSchemaId}#/definitions/colorGroup`;
const textmateColorSchema = {
    type: 'array',
    definitions: {
        colorGroup: {
            default: '#FF0000',
            anyOf: [
                {
                    type: 'string',
                    format: 'color-hex'
                },
                {
                    $ref: '#/definitions/settings'
                }
            ]
        },
        settings: {
            type: 'object',
            description: nls.localize('schema.token.settings', 'Colors and styles for the token.'),
            properties: {
                foreground: {
                    type: 'string',
                    description: nls.localize('schema.token.foreground', 'Foreground color for the token.'),
                    format: 'color-hex',
                    default: '#ff0000'
                },
                background: {
                    type: 'string',
                    deprecationMessage: nls.localize('schema.token.background.warning', 'Token background colors are currently not supported.')
                },
                fontStyle: {
                    type: 'string',
                    description: nls.localize('schema.token.fontStyle', 'Font style of the rule: \'italic\', \'bold\', \'underline\', \'strikethrough\' or a combination. The empty string unsets inherited settings.'),
                    pattern: '^(\\s*\\b(italic|bold|underline|strikethrough))*\\s*$',
                    patternErrorMessage: nls.localize('schema.fontStyle.error', 'Font style must be \'italic\', \'bold\', \'underline\', \'strikethrough\' or a combination or the empty string.'),
                    defaultSnippets: [
                        { label: nls.localize('schema.token.fontStyle.none', 'None (clear inherited style)'), bodyText: '""' },
                        { body: 'italic' },
                        { body: 'bold' },
                        { body: 'underline' },
                        { body: 'strikethrough' },
                        { body: 'italic bold' },
                        { body: 'italic underline' },
                        { body: 'italic strikethrough' },
                        { body: 'bold underline' },
                        { body: 'bold strikethrough' },
                        { body: 'underline strikethrough' },
                        { body: 'italic bold underline' },
                        { body: 'italic bold strikethrough' },
                        { body: 'italic underline strikethrough' },
                        { body: 'bold underline strikethrough' },
                        { body: 'italic bold underline strikethrough' }
                    ]
                },
                fontFamily: {
                    type: 'string',
                    description: nls.localize('schema.token.fontFamily', 'Font family for the token (e.g., "Fira Code", "JetBrains Mono").')
                },
                fontSize: {
                    type: 'number',
                    description: nls.localize('schema.token.fontSize', 'Font size multiplier for the token (e.g., 1.2 will use 1.2 times the default font size).')
                },
                lineHeight: {
                    type: 'number',
                    description: nls.localize('schema.token.lineHeight', 'Line height multiplier for the token (e.g., 1.2 will use 1.2 times the default height). If the font size is set and the line height is not explicitly set, the line height will be computed based on the font size.')
                }
            },
            additionalProperties: false,
            defaultSnippets: [{ body: { foreground: '${1:#FF0000}', fontStyle: '${2:bold}' } }]
        }
    },
    items: {
        type: 'object',
        defaultSnippets: [{ body: { scope: '${1:keyword.operator}', settings: { foreground: '${2:#FF0000}' } } }],
        properties: {
            name: {
                type: 'string',
                description: nls.localize('schema.properties.name', 'Description of the rule.')
            },
            scope: {
                description: nls.localize('schema.properties.scope', 'Scope selector against which this rule matches.'),
                anyOf: [
                    {
                        enum: textMateScopes
                    },
                    {
                        type: 'string'
                    },
                    {
                        type: 'array',
                        items: {
                            enum: textMateScopes
                        }
                    },
                    {
                        type: 'array',
                        items: {
                            type: 'string'
                        }
                    }
                ]
            },
            settings: {
                $ref: '#/definitions/settings'
            }
        },
        required: [
            'settings'
        ],
        additionalProperties: false
    }
};
export const colorThemeSchemaId = 'vscode://schemas/color-theme';
const colorThemeSchema = {
    type: 'object',
    allowComments: true,
    allowTrailingCommas: true,
    properties: {
        colors: {
            description: nls.localize('schema.workbenchColors', 'Colors in the workbench'),
            $ref: workbenchColorsSchemaId,
            additionalProperties: false
        },
        tokenColors: {
            anyOf: [{
                    type: 'string',
                    description: nls.localize('schema.tokenColors.path', 'Path to a tmTheme file (relative to the current file).')
                },
                {
                    description: nls.localize('schema.colors', 'Colors for syntax highlighting'),
                    $ref: textmateColorsSchemaId
                }
            ]
        },
        semanticHighlighting: {
            type: 'boolean',
            description: nls.localize('schema.supportsSemanticHighlighting', 'Whether semantic highlighting should be enabled for this theme.')
        },
        semanticTokenColors: {
            type: 'object',
            description: nls.localize('schema.semanticTokenColors', 'Colors for semantic tokens'),
            $ref: tokenStylingSchemaId
        }
    }
};
export function registerColorThemeSchemas() {
    const schemaRegistry = Registry.as(JSONExtensions.JSONContribution);
    schemaRegistry.registerSchema(colorThemeSchemaId, colorThemeSchema);
    schemaRegistry.registerSchema(textmateColorsSchemaId, textmateColorSchema);
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29sb3JUaGVtZVNjaGVtYS5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9zZXJ2aWNlcy90aGVtZXMvY29tbW9uL2NvbG9yVGhlbWVTY2hlbWEudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFDaEcsT0FBTyxLQUFLLEdBQUcsTUFBTSxvQkFBb0IsQ0FBQztBQUUxQyxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sa0RBQWtELENBQUM7QUFDNUUsT0FBTyxFQUFFLFVBQVUsSUFBSSxjQUFjLEVBQTZCLE1BQU0scUVBQXFFLENBQUM7QUFHOUksT0FBTyxFQUFFLHVCQUF1QixFQUFFLE1BQU0sb0RBQW9ELENBQUM7QUFDN0YsT0FBTyxFQUFFLG9CQUFvQixFQUFFLE1BQU0sa0VBQWtFLENBQUM7QUFFeEcsTUFBTSxjQUFjLEdBQUc7SUFDdEIsU0FBUztJQUNULGVBQWU7SUFDZiw2QkFBNkI7SUFDN0IsY0FBYztJQUNkLFVBQVU7SUFDVixvQkFBb0I7SUFDcEIsMkJBQTJCO0lBQzNCLGtCQUFrQjtJQUNsQiwwQkFBMEI7SUFDMUIsd0JBQXdCO0lBQ3hCLHNCQUFzQjtJQUN0Qix3QkFBd0I7SUFDeEIsZ0JBQWdCO0lBQ2hCLGlCQUFpQjtJQUNqQixvQkFBb0I7SUFDcEIsVUFBVTtJQUNWLFFBQVE7SUFDUixhQUFhO0lBQ2IsbUJBQW1CO0lBQ25CLHNCQUFzQjtJQUN0QixvQkFBb0I7SUFDcEIscUJBQXFCO0lBQ3JCLHNCQUFzQjtJQUN0QixpQkFBaUI7SUFDakIsa0JBQWtCO0lBQ2xCLGNBQWM7SUFDZCw2QkFBNkI7SUFDN0IsOEJBQThCO0lBQzlCLFNBQVM7SUFDVCxvQkFBb0I7SUFDcEIsaUJBQWlCO0lBQ2pCLFNBQVM7SUFDVCxpQkFBaUI7SUFDakIsa0JBQWtCO0lBQ2xCLHNCQUFzQjtJQUN0Qiw2QkFBNkI7SUFDN0IsNkJBQTZC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