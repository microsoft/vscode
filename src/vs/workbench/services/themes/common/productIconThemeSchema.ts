/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as nls from '../../../../nls.js';

import { Registry } from '../../../../platform/registry/common/platform.js';
import { Extensions as JSONExtensions, IJSONContributionRegistry } from '../../../../platform/jsonschemas/common/jsonContributionRegistry.js';
import { IJSONSchema } from '../../../../base/common/jsonSchema.js';
import { iconsSchemaId } from '../../../../platform/theme/common/iconRegistry.js';

export const fontIdRegex = '^([\\w_-]+)$';
export const fontStyleRegex = '^(normal|italic|(oblique[ \\w\\s-]+))$';
export const fontWeightRegex = '^(normal|bold|lighter|bolder|(\\d{0-1000}))$';
export const fontSizeRegex = '^([\\w .%_-]+)$';
export const fontFormatRegex = '^woff|woff2|truetype|opentype|embedded-opentype|svg$';

const schemaId = 'vscode://schemas/product-icon-theme';
const schema: IJSONSchema = {
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
						pattern: fontIdRegex,
						patternErrorMessage: nls.localize('schema.id.formatError', 'The ID must only contain letters, numbers, underscore and minus.')
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
							{ type: 'string', pattern: fontWeightRegex }
						]
					},
					style: {
						type: 'string',
						description: nls.localize('schema.font-style', 'The style of the font. See https://developer.mozilla.org/en-US/docs/Web/CSS/font-style for valid values.'),
						anyOf: [
							{ enum: ['normal', 'italic', 'oblique'] },
							{ type: 'string', pattern: fontStyleRegex }
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
	const schemaRegistry = Registry.as<IJSONContributionRegistry>(JSONExtensions.JSONContribution);
	schemaRegistry.registerSchema(schemaId, schema);
}
