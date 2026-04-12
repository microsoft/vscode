/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as nls from '../../../../nls.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { Extensions as JSONExtensions } from '../../../../platform/jsonschemas/common/jsonContributionRegistry.js';
import { fontWeightRegex, fontStyleRegex, fontSizeRegex, fontIdRegex, fontColorRegex, fontIdErrorMessage } from '../../../../platform/theme/common/iconRegistry.js';
const schemaId = 'vscode://schemas/icon-theme';
const schema = {
    type: 'object',
    allowComments: true,
    allowTrailingCommas: true,
    definitions: {
        folderExpanded: {
            type: 'string',
            description: nls.localize('schema.folderExpanded', 'The folder icon for expanded folders. The expanded folder icon is optional. If not set, the icon defined for folder will be shown.')
        },
        folder: {
            type: 'string',
            description: nls.localize('schema.folder', 'The folder icon for collapsed folders, and if folderExpanded is not set, also for expanded folders.')
        },
        file: {
            type: 'string',
            description: nls.localize('schema.file', 'The default file icon, shown for all files that don\'t match any extension, filename or language id.')
        },
        rootFolder: {
            type: 'string',
            description: nls.localize('schema.rootFolder', 'The folder icon for collapsed root folders, and if rootFolderExpanded is not set, also for expanded root folders.')
        },
        rootFolderExpanded: {
            type: 'string',
            description: nls.localize('schema.rootFolderExpanded', 'The folder icon for expanded root folders. The expanded root folder icon is optional. If not set, the icon defined for root folder will be shown.')
        },
        rootFolderNames: {
            type: 'object',
            description: nls.localize('schema.rootFolderNames', 'Associates root folder names to icons. The object key is the root folder name. No patterns or wildcards are allowed. Root folder name matching is case insensitive.'),
            additionalProperties: {
                type: 'string',
                description: nls.localize('schema.folderName', 'The ID of the icon definition for the association.')
            }
        },
        rootFolderNamesExpanded: {
            type: 'object',
            description: nls.localize('schema.rootFolderNamesExpanded', 'Associates root folder names to icons for expanded root folders. The object key is the root folder name. No patterns or wildcards are allowed. Root folder name matching is case insensitive.'),
            additionalProperties: {
                type: 'string',
                description: nls.localize('schema.rootFolderNameExpanded', 'The ID of the icon definition for the association.')
            }
        },
        folderNames: {
            type: 'object',
            description: nls.localize('schema.folderNames', 'Associates folder names to icons. The object key is the folder name, not including any path segments. No patterns or wildcards are allowed. Folder name matching is case insensitive.'),
            additionalProperties: {
                type: 'string',
                description: nls.localize('schema.folderName', 'The ID of the icon definition for the association.')
            }
        },
        folderNamesExpanded: {
            type: 'object',
            description: nls.localize('schema.folderNamesExpanded', 'Associates folder names to icons for expanded folders. The object key is the folder name, not including any path segments. No patterns or wildcards are allowed. Folder name matching is case insensitive.'),
            additionalProperties: {
                type: 'string',
                description: nls.localize('schema.folderNameExpanded', 'The ID of the icon definition for the association.')
            }
        },
        fileExtensions: {
            type: 'object',
            description: nls.localize('schema.fileExtensions', 'Associates file extensions to icons. The object key is the file extension name. The extension name is the last segment of a file name after the last dot (not including the dot). Extensions are compared case insensitive.'),
            additionalProperties: {
                type: 'string',
                description: nls.localize('schema.fileExtension', 'The ID of the icon definition for the association.')
            }
        },
        fileNames: {
            type: 'object',
            description: nls.localize('schema.fileNames', 'Associates file names to icons. The object key is the full file name, but not including any path segments. File name can include dots and a possible file extension. No patterns or wildcards are allowed. File name matching is case insensitive.'),
            additionalProperties: {
                type: 'string',
                description: nls.localize('schema.fileName', 'The ID of the icon definition for the association.')
            }
        },
        languageIds: {
            type: 'object',
            description: nls.localize('schema.languageIds', 'Associates languages to icons. The object key is the language id as defined in the language contribution point.'),
            additionalProperties: {
                type: 'string',
                description: nls.localize('schema.languageId', 'The ID of the icon definition for the association.')
            }
        },
        associations: {
            type: 'object',
            properties: {
                folderExpanded: {
                    $ref: '#/definitions/folderExpanded'
                },
                folder: {
                    $ref: '#/definitions/folder'
                },
                file: {
                    $ref: '#/definitions/file'
                },
                folderNames: {
                    $ref: '#/definitions/folderNames'
                },
                folderNamesExpanded: {
                    $ref: '#/definitions/folderNamesExpanded'
                },
                rootFolder: {
                    $ref: '#/definitions/rootFolder'
                },
                rootFolderExpanded: {
                    $ref: '#/definitions/rootFolderExpanded'
                },
                rootFolderNames: {
                    $ref: '#/definitions/rootFolderNames'
                },
                rootFolderNamesExpanded: {
                    $ref: '#/definitions/rootFolderNamesExpanded'
                },
                fileExtensions: {
                    $ref: '#/definitions/fileExtensions'
                },
                fileNames: {
                    $ref: '#/definitions/fileNames'
                },
                languageIds: {
                    $ref: '#/definitions/languageIds'
                }
            }
        }
    },
    properties: {
        fonts: {
            type: 'array',
            description: nls.localize('schema.fonts', 'Fonts that are used in the icon definitions.'),
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
                                    description: nls.localize('schema.font-path', 'The font path, relative to the current file icon theme file.'),
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
                        pattern: fontWeightRegex.source
                    },
                    style: {
                        type: 'string',
                        description: nls.localize('schema.font-style', 'The style of the font. See https://developer.mozilla.org/en-US/docs/Web/CSS/font-style for valid values.'),
                        pattern: fontStyleRegex.source
                    },
                    size: {
                        type: 'string',
                        description: nls.localize('schema.font-size', 'The default size of the font. We strongly recommend using a percentage value, for example: 125%.'),
                        pattern: fontSizeRegex.source
                    }
                },
                required: [
                    'id',
                    'src'
                ]
            }
        },
        iconDefinitions: {
            type: 'object',
            description: nls.localize('schema.iconDefinitions', 'Description of all icons that can be used when associating files to icons.'),
            additionalProperties: {
                type: 'object',
                description: nls.localize('schema.iconDefinition', 'An icon definition. The object key is the ID of the definition.'),
                properties: {
                    iconPath: {
                        type: 'string',
                        description: nls.localize('schema.iconPath', 'When using a SVG or PNG: The path to the image. The path is relative to the icon set file.')
                    },
                    fontCharacter: {
                        type: 'string',
                        description: nls.localize('schema.fontCharacter', 'When using a glyph font: The character in the font to use.')
                    },
                    fontColor: {
                        type: 'string',
                        format: 'color-hex',
                        description: nls.localize('schema.fontColor', 'When using a glyph font: The color to use.'),
                        pattern: fontColorRegex.source
                    },
                    fontSize: {
                        type: 'string',
                        description: nls.localize('schema.fontSize', 'When using a font: The font size in percentage to the text font. If not set, defaults to the size in the font definition.'),
                        pattern: fontSizeRegex.source
                    },
                    fontId: {
                        type: 'string',
                        description: nls.localize('schema.fontId', 'When using a font: The id of the font. If not set, defaults to the first font definition.'),
                        pattern: fontIdRegex.source,
                        patternErrorMessage: fontIdErrorMessage
                    }
                }
            }
        },
        folderExpanded: {
            $ref: '#/definitions/folderExpanded'
        },
        folder: {
            $ref: '#/definitions/folder'
        },
        file: {
            $ref: '#/definitions/file'
        },
        folderNames: {
            $ref: '#/definitions/folderNames'
        },
        folderNamesExpanded: {
            $ref: '#/definitions/folderNamesExpanded'
        },
        rootFolder: {
            $ref: '#/definitions/rootFolder'
        },
        rootFolderExpanded: {
            $ref: '#/definitions/rootFolderExpanded'
        },
        rootFolderNames: {
            $ref: '#/definitions/rootFolderNames'
        },
        rootFolderNamesExpanded: {
            $ref: '#/definitions/rootFolderNamesExpanded'
        },
        fileExtensions: {
            $ref: '#/definitions/fileExtensions'
        },
        fileNames: {
            $ref: '#/definitions/fileNames'
        },
        languageIds: {
            $ref: '#/definitions/languageIds'
        },
        light: {
            $ref: '#/definitions/associations',
            description: nls.localize('schema.light', 'Optional associations for file icons in light color themes.')
        },
        highContrast: {
            $ref: '#/definitions/associations',
            description: nls.localize('schema.highContrast', 'Optional associations for file icons in high contrast color themes.')
        },
        hidesExplorerArrows: {
            type: 'boolean',
            description: nls.localize('schema.hidesExplorerArrows', 'Configures whether the file explorer\'s arrows should be hidden when this theme is active.')
        },
        showLanguageModeIcons: {
            type: 'boolean',
            description: nls.localize('schema.showLanguageModeIcons', 'Configures whether the default language icons should be used if the theme does not define an icon for a language.')
        }
    }
};
export function registerFileIconThemeSchemas() {
    const schemaRegistry = Registry.as(JSONExtensions.JSONContribution);
    schemaRegistry.registerSchema(schemaId, schema);
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZmlsZUljb25UaGVtZVNjaGVtYS5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9zZXJ2aWNlcy90aGVtZXMvY29tbW9uL2ZpbGVJY29uVGhlbWVTY2hlbWEudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFDaEcsT0FBTyxLQUFLLEdBQUcsTUFBTSxvQkFBb0IsQ0FBQztBQUUxQyxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sa0RBQWtELENBQUM7QUFDNUUsT0FBTyxFQUFFLFVBQVUsSUFBSSxjQUFjLEVBQTZCLE1BQU0scUVBQXFFLENBQUM7QUFFOUksT0FBTyxFQUFFLGVBQWUsRUFBRSxjQUFjLEVBQUUsYUFBYSxFQUFFLFdBQVcsRUFBRSxjQUFjLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSxtREFBbUQsQ0FBQztBQUVwSyxNQUFNLFFBQVEsR0FBRyw2QkFBNkIsQ0FBQztBQUMvQyxNQUFNLE1BQU0sR0FBZ0I7SUFDM0IsSUFBSSxFQUFFLFFBQVE7SUFDZCxhQUFhLEVBQUUsSUFBSTtJQUNuQixtQkFBbUIsRUFBRSxJQUFJO0lBQ3pCLFdBQVcsRUFBRTtRQUNaLGNBQWMsRUFBRTtZQUNmLElBQUksRUFBRSxRQUFRO1lBQ2QsV0FBVyxFQUFFLEdBQUcsQ0FBQyxRQUFRLENBQUMsdUJBQXVCLEVBQUUsb0lBQW9JLENBQUM7U0FDeEw7UUFDRCxNQUFNLEVBQUU7WUFDUCxJQUFJLEVBQUUsUUFBUTtZQUNkLFdBQVcsRUFBRSxHQUFHLENBQUMsUUFBUSxDQUFDLGVBQWUsRUFBRSxxR0FBcUcsQ0FBQztTQUVqSjtRQUNELElBQUksRUFBRTtZQUNMLElBQUksRUFBRSxRQUFRO1lBQ2QsV0FBVyxFQUFFLEdBQUcsQ0FBQyxRQUFRLENBQUMsYUFBYSxFQUFFLHNHQUFzRyxDQUFDO1NBRWhKO1FBQ0QsVUFBVSxFQUFFO1lBQ1gsSUFBSSxFQUFF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