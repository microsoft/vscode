/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as nls from '../../../../nls.js';

import { Registry } from '../../../../platform/registry/common/platform.js';
import { Extensions as JSONExtensions, IJSONContributionRegistry } from '../../../../platform/jsonschemas/common/jsonContributionRegistry.js';
import { IJSONSchema } from '../../../../base/common/jsonSchema.js';
import { fontWeightRegex, fontStyleRegex, fontSizeRegex, fontIdRegex, fontColorRegex, fontIdErrorMessage } from '../../../../platform/theme/common/iconRegistry.js';

const schemaId = 'vscode://schemas/icon-theme';
const schema: IJSONSchema = {
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
	const schemaRegistry = Registry.as<IJSONContributionRegistry>(JSONExtensions.JSONContribution);
	schemaRegistry.registerSchema(schemaId, schema);
}
