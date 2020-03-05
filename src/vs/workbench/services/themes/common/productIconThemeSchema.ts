/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as nls from 'vs/nls';

import { Registry } from 'vs/platform/registry/common/platform';
import { Extensions as JSONExtensions, IJSONContributionRegistry } from 'vs/platform/jsonschemas/common/jsonContributionRegistry';
import { IJSONSchema } from 'vs/base/common/jsonSchema';

const schemaId = 'vscode://schemas/product-icon-theme';
const schema: IJSONSchema = {
	type: 'object',
	allowComments: true,
	allowTrailingCommas: true,
	properties: {
		fonts: {
			type: 'array',
			description: nls.localize('schema.fonts', 'Fonts that are used in the icon definitions.'),
			items: {
				type: 'object',
				properties: {
					id: {
						type: 'string',
						description: nls.localize('schema.id', 'The ID of the font.')
					},
					src: {
						type: 'array',
						description: nls.localize('schema.src', 'The location of the font.'),
						items: {
							type: 'object',
							properties: {
								path: {
									type: 'string',
									description: nls.localize('schema.font-path', 'The font path, relative to the current workbench icon theme file.'),
								},
								format: {
									type: 'string',
									description: nls.localize('schema.font-format', 'The format of the font.')
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
						description: nls.localize('schema.font-weight', 'The weight of the font.')
					},
					style: {
						type: 'string',
						description: nls.localize('schema.font-sstyle', 'The style of the font.')
					},
					size: {
						type: 'string',
						description: nls.localize('schema.font-size', 'The default size of the font.')
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
			description: nls.localize('schema.iconDefinitions', 'Assocation of icon name to a font character.'),
			additionalProperties: {
				type: 'object',
				description: nls.localize('schema.iconDefinition', 'An icon definition. The object key is the icon name.'),
				properties: {
					fontCharacter: {
						type: 'string',
						description: nls.localize('schema.fontCharacter', 'The character in the font to use.')
					},
					fontId: {
						type: 'string',
						description: nls.localize('schema.fontId', 'When using a font: The id of the font. If not set, defaults to the first font definition.')
					}
				}
			}
		}
	}
};

export function registerProductIconThemeSchemas() {
	let schemaRegistry = Registry.as<IJSONContributionRegistry>(JSONExtensions.JSONContribution);
	schemaRegistry.registerSchema(schemaId, schema);
}
