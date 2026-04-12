/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as nls from '../../../../nls.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { Extensions as JSONExtensions } from '../../../../platform/jsonschemas/common/jsonContributionRegistry.js';
import { fontIdErrorMessage, fontIdRegex, fontStyleRegex, fontWeightRegex, iconsSchemaId } from '../../../../platform/theme/common/iconRegistry.js';
const schemaId = 'vscode://schemas/product-icon-theme';
const schema = {
    type: 'object',
    allowComments: true,
    allowTrailingCommas: true,
    properties: {
        fonts: {
            type: 'array',
            items: {
                type: 'object',
                properties: {
                    id: {
                        type: 'string',
                        description: nls.localize('schema.id', 'The ID of the font.'),
                        pattern: fontIdRegex.source,
                        patternErrorMessage: fontIdErrorMessage
                    },
                    src: {
                        type: 'array',
                        description: nls.localize('schema.src', 'The location of the font.'),
                        items: {
                            type: 'object',
                            properties: {
                                path: {
                                    type: 'string',
                                    description: nls.localize('schema.font-path', 'The font path, relative to the current product icon theme file.'),
                                },
                                format: {
                                    type: 'string',
                                    description: nls.localize('schema.font-format', 'The format of the font.'),
                                    enum: ['woff', 'woff2', 'truetype', 'opentype', 'embedded-opentype', 'svg']
                                }
                            },
                            required: [
                                'path',
                                'format'
                            ]
                        }
                    },
                    weight: {
                        type: 'string',
                        description: nls.localize('schema.font-weight', 'The weight of the font. See https://developer.mozilla.org/en-US/docs/Web/CSS/font-weight for valid values.'),
                        anyOf: [
                            { enum: ['normal', 'bold', 'lighter', 'bolder'] },
                            { type: 'string', pattern: fontWeightRegex.source }
                        ]
                    },
                    style: {
                        type: 'string',
                        description: nls.localize('schema.font-style', 'The style of the font. See https://developer.mozilla.org/en-US/docs/Web/CSS/font-style for valid values.'),
                        anyOf: [
                            { enum: ['normal', 'italic', 'oblique'] },
                            { type: 'string', pattern: fontStyleRegex.source }
                        ]
                    }
                },
                required: [
                    'id',
                    'src'
                ]
            }
        },
        iconDefinitions: {
            description: nls.localize('schema.iconDefinitions', 'Association of icon name to a font character.'),
            $ref: iconsSchemaId
        }
    }
};
export function registerProductIconThemeSchemas() {
    const schemaRegistry = Registry.as(JSONExtensions.JSONContribution);
    schemaRegistry.registerSchema(schemaId, schema);
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicHJvZHVjdEljb25UaGVtZVNjaGVtYS5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9zZXJ2aWNlcy90aGVtZXMvY29tbW9uL3Byb2R1Y3RJY29uVGhlbWVTY2hlbWEudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFDaEcsT0FBTyxLQUFLLEdBQUcsTUFBTSxvQkFBb0IsQ0FBQztBQUUxQyxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sa0RBQWtELENBQUM7QUFDNUUsT0FBTyxFQUFFLFVBQVUsSUFBSSxjQUFjLEVBQTZCLE1BQU0scUVBQXFFLENBQUM7QUFFOUksT0FBTyxFQUFFLGtCQUFrQixFQUFFLFdBQVcsRUFBRSxjQUFjLEVBQUUsZUFBZSxFQUFFLGFBQWEsRUFBRSxNQUFNLG1EQUFtRCxDQUFDO0FBRXBKLE1BQU0sUUFBUSxHQUFHLHFDQUFxQyxDQUFDO0FBQ3ZELE1BQU0sTUFBTSxHQUFnQjtJQUMzQixJQUFJLEVBQUUsUUFBUTtJQUNkLGFBQWEsRUFBRSxJQUFJO0lBQ25CLG1CQUFtQixFQUFFLElBQUk7SUFDekIsVUFBVSxFQUFFO1FBQ1gsS0FBSyxFQUFFO1lBQ04sSUFBSSxFQUFFLE9BQU87WUFDYixLQUFLLEVBQUU7Z0JBQ04sSUFBSSxFQUFFLFFBQVE7Z0JBQ2QsVUFBVSxFQUFFO29CQUNYLEVBQUUsRUFBRTt3QkFDSCxJQUFJLEVBQUUsUUFBUTt3QkFDZCxXQUFXLEVBQUUsR0FBRyxDQUFDLFFBQVEsQ0FBQyxXQUFXLEVBQUUscUJBQXFCLENBQUM7d0JBQzdELE9BQU8sRUFBRSxXQUFXLENBQUMsTUFBTTt3QkFDM0IsbUJBQW1CLEVBQUUsa0JBQWtCO3FCQUN2QztvQkFDRCxHQUFHLEVBQUU7d0JBQ0osSUFBSSxFQUFFLE9BQU87d0JBQ2IsV0FBVyxFQUFFLEdBQUcsQ0FBQyxRQUFRLENBQUMsWUFBWSxFQUFFLDJCQUEyQixDQUFDO3dCQUNwRSxLQUFLLEVBQUU7NEJBQ04sSUFBSSxFQUFFLFFBQVE7NEJBQ2QsVUFBVSxFQUFFO2dDQUNYLElBQUksRUFBRTtvQ0FDTCxJQUFJLEVBQUUsUUFBUTtvQ0FDZCxXQUFXLEVBQUUsR0FBRyxDQUFDLFFBQVEsQ0FBQyxrQkFBa0IsRUFBRSxpRUFBaUUsQ0FBQztpQ0FDaEg7Z0NBQ0QsTUFBTSxFQUFFO29DQUNQLElBQUksRUFBRSxRQUFRO29DQUNkLFdBQVcsRUFBRSxHQUFHLENBQUMsUUFBUSxDQUFDLG9CQUFvQixFQUFFLHlCQUF5QixDQUFDO29DQUMxRSxJQUFJLEVBQUUsQ0FBQyxNQUFNLEVBQUUsT0FBTyxFQUFFLFVBQVUsRUFBRSxVQUFVLEVBQUUsbUJBQW1CLEVBQUUsS0FBSyxDQUFDO2lDQUMzRTs2QkFDRDs0QkFDRCxRQUFRLEVBQUU7Z0NBQ1QsTUFBTTtnQ0FDTixRQUFROzZCQUNSO3lCQUNEO3FCQUNEO29CQUNELE1BQU0sRUFBRTt3QkFDUCxJQUFJLEVBQUUsUUFBUTt3QkFDZCxXQUFXLEVBQUUsR0FBRyxDQUFDLFFBQVEsQ0FBQyxvQkFBb0IsRUFBRSw0R0FBNEcsQ0FBQzt3QkFDN0osS0FBSyxFQUFFOzRCQUNOLEVBQUUsSUFBSSxFQUFFLENBQUMsUUFBUSxFQUFFLE1BQU0sRUFBRSxTQUFTLEVBQUUsUUFBUSxDQUFDLEVBQUU7NEJBQ2pELEVBQUUsSUFBSSxFQUFFLFFBQVEsRUFBRSxPQUFPLEVBQUUsZUFBZSxDQUFDLE1BQU0sRUFBRTt5QkFDbkQ7cUJBQ0Q7b0JBQ0QsS0FBSyxFQUFFO3dCQUNOLElBQUksRUFBRSxRQUFRO3dCQUNkLFdBQVcsRUFBRSxHQUFHLENBQUMsUUFBUSxDQUFDLG1CQUFtQixFQUFFLDBHQUEwRyxDQUFDO3dCQUMxSixLQUFLLEVBQUU7NEJBQ04sRUFBRSxJQUFJLEVBQUUsQ0FBQyxRQUFRLEVBQUUsUUFBUSxFQUFFLFNBQVMsQ0FBQyxFQUFFOzRCQUN6QyxFQUFFLElBQUksRUFBRSxRQUFRLEVBQUUsT0FBTyxFQUFFLGNBQWMsQ0FBQyxNQUFNLEVBQUU7eUJBQ2xEO3FCQUNEO2lCQUNEO2dCQUNELFFBQVEsRUFBRTtvQkFDVCxJQUFJO29CQUNKLEtBQUs7aUJBQ0w7YUFDRDtTQUNEO1FBQ0QsZUFBZSxFQUFFO1lBQ2hCLFdBQVcsRUFBRSxHQUFHLENBQUMsUUFBUSxDQUFDLHdCQUF3QixFQUFFLCtDQUErQyxDQUFDO1lBQ3BHLElBQUksRUFBRSxhQUFhO1NBQ25CO0tBQ0Q7Q0FDRCxDQUFDO0FBRUYsTUFBTSxVQUFVLCtCQUErQjtJQUM5QyxNQUFNLGNBQWMsR0FBRyxRQUFRLENBQUMsRUFBRSxDQUE0QixjQUFjLENBQUMsZ0JBQWdCLENBQUMsQ0FBQztJQUMvRixjQUFjLENBQUMsY0FBYyxDQUFDLFFBQVEsRUFBRSxNQUFNLENBQUMsQ0FBQztBQUNqRCxDQUFDIn0=