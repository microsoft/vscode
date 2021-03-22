/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { ExtensionsRegistry } from 'vs/workbench/services/extensions/common/extensionsRegistry';
import { IIconRegistry, Extensions as IconRegistryExtensions, IconFontDefinition } from 'vs/platform/theme/common/iconRegistry';
import { Registry } from 'vs/platform/registry/common/platform';
import { CSSIcon } from 'vs/base/common/codicons';
import { fontIdRegex } from 'vs/workbench/services/themes/common/productIconThemeSchema';
import * as resources from 'vs/base/common/resources';
import { IExtensionDescription } from 'vs/platform/extensions/common/extensions';

interface IIconExtensionPoint {
	id: string;
	description: string;
	default: { fontId: string; fontCharacter: string; } | string;
}

interface IIconFontExtensionPoint {
	id: string;
	src: {
		path: string;
		format: string;
	}[];
}

const iconRegistry: IIconRegistry = Registry.as<IIconRegistry>(IconRegistryExtensions.IconContribution);

const iconReferenceSchema = iconRegistry.getIconReferenceSchema();
const iconIdPattern = `^${CSSIcon.iconNameSegment}-(${CSSIcon.iconNameSegment})+`;

const iconConfigurationExtPoint = ExtensionsRegistry.registerExtensionPoint<IIconExtensionPoint[]>({
	extensionPoint: 'icons',
	jsonSchema: {
		description: nls.localize('contributes.icons', 'Contributes extension defined themable icons'),
		type: 'array',
		items: {
			type: 'object',
			properties: {
				id: {
					type: 'string',
					description: nls.localize('contributes.icon.id', 'The identifier of the themable icon'),
					pattern: iconIdPattern,
					patternErrorMessage: nls.localize('contributes.icon.id.format', 'Identifiers can only contain letters, digits and minuses and need to consist of at least two segments in the form `component-iconname`.'),
				},
				description: {
					type: 'string',
					description: nls.localize('contributes.icon.description', 'The description of the themable icon'),
				},
				default: {
					anyOf: [
						iconReferenceSchema,
						{
							type: 'object',
							properties: {
								fontId: {
									description: nls.localize('contributes.icon.default.fontId', 'The id of the icon font that defines the icon.'),
									type: 'string'
								},
								fontCharacter: {
									description: nls.localize('contributes.icon.default.fontCharacter', 'The character for the icon in the icon font.'),
									type: 'string'
								}
							},
							defaultSnippets: [{ body: { fontId: '${1:myIconFont}', fontCharacter: '${2:\\\\E001}' } }]
						}
					],
					description: nls.localize('contributes.icon.default', 'The default of the icon. Either a reference to an extisting ThemeIcon or an icon in an icon font.'),
				}
			}
		}
	}
});

const iconFontConfigurationExtPoint = ExtensionsRegistry.registerExtensionPoint<IIconFontExtensionPoint[]>({
	extensionPoint: 'iconFonts',
	jsonSchema: {
		description: nls.localize('contributes.iconFonts', 'Contributes icon fonts to be used by icon contributions.'),
		type: 'array',
		items: {
			type: 'object',
			properties: {
				id: {
					type: 'string',
					description: nls.localize('contributes.iconFonts.id', 'The ID of the font.'),
					pattern: fontIdRegex,
					patternErrorMessage: nls.localize('contributes.iconFonts.id.formatError', 'The ID must only contain letters, numbers, underscore and minus.')
				},
				src: {
					type: 'array',
					description: nls.localize('contributes.iconFonts.src', 'The location of the font.'),
					items: {
						type: 'object',
						properties: {
							path: {
								type: 'string',
								description: nls.localize('contributes.iconFonts.src.path', 'The font path, relative to the current extension location.'),
							},
							format: {
								type: 'string',
								description: nls.localize('contributes.iconFonts.src.format', 'The format of the font.'),
								enum: ['woff', 'woff2', 'truetype', 'opentype', 'embedded-opentype', 'svg']
							}
						},
						required: [
							'path',
							'format'
						]
					}
				}
			}
		}
	}
});

export class IconExtensionPoint {

	constructor() {
		iconConfigurationExtPoint.setHandler((extensions, delta) => {
			for (const extension of delta.added) {
				const extensionValue = <IIconExtensionPoint[]>extension.value;
				const collector = extension.collector;

				if (!extension.description.enableProposedApi) {
					collector.error(nls.localize('invalid.icons.proposedAPI', "'configuration.icons is a proposed contribution point and only available when running out of dev or with the following command line switch: --enable-proposed-api {0}", extension.description.identifier.value));
					return;
				}

				if (!extensionValue || !Array.isArray(extensionValue)) {
					collector.error(nls.localize('invalid.icons.configuration', "'configuration.icons' must be a array"));
					return;
				}

				for (const iconContribution of extensionValue) {
					if (typeof iconContribution.id !== 'string' || iconContribution.id.length === 0) {
						collector.error(nls.localize('invalid.icons.id', "'configuration.icons.id' must be defined and can not be empty"));
						return;
					}
					if (!iconContribution.id.match(iconIdPattern)) {
						collector.error(nls.localize('invalid.icons.id.format', "'configuration.icons.id' can only contain letter, digits and minuses and need to consist of at least two segments in the form `component-iconname`."));
						return;
					}
					if (typeof iconContribution.description !== 'string' || iconContribution.id.length === 0) {
						collector.error(nls.localize('invalid.icons.description', "'configuration.icons.description' must be defined and can not be empty"));
						return;
					}
					let defaultIcon = iconContribution.default;
					if (typeof defaultIcon === 'string') {
						iconRegistry.registerIcon(iconContribution.id, { id: defaultIcon }, iconContribution.description);
					} else if (typeof defaultIcon === 'object' && typeof defaultIcon.fontId === 'string' && typeof defaultIcon.fontCharacter === 'string') {
						iconRegistry.registerIcon(iconContribution.id, {
							fontId: getFontId(extension.description, defaultIcon.fontId),
							fontCharacter: defaultIcon.fontCharacter,
						}, iconContribution.description);
					} else {
						collector.error(nls.localize('invalid.icons.default', "'configuration.icons.default' must be either a reference to the id of an other theme icon (string) or a icon definition (object) with properties `fontId` and `fontCharacter`."));
					}
				}
			}
			for (const extension of delta.removed) {
				const extensionValue = <IIconExtensionPoint[]>extension.value;
				for (const iconContribution of extensionValue) {
					iconRegistry.deregisterIcon(iconContribution.id);
				}
			}
		});
	}
}

export class IconFontExtensionPoint {

	constructor() {
		iconFontConfigurationExtPoint.setHandler((_extensions, delta) => {
			for (const extension of delta.added) {
				const extensionValue = <IIconFontExtensionPoint[]>extension.value;
				const collector = extension.collector;

				if (!extension.description.enableProposedApi) {
					collector.error(nls.localize('invalid.iconFonts.proposedAPI', "'configuration.iconFonts is a proposed contribution point and only available when running out of dev or with the following command line switch: --enable-proposed-api {0}", extension.description.identifier.value));
					return;
				}

				if (!extensionValue || !Array.isArray(extensionValue)) {
					collector.error(nls.localize('invalid.iconFonts.configuration', "'configuration.iconFonts' must be a array"));
					return;
				}

				for (const iconFontContribution of extensionValue) {
					if (typeof iconFontContribution.id !== 'string' || iconFontContribution.id.length === 0) {
						collector.error(nls.localize('invalid.iconFonts.id', "'configuration.iconFonts.id' must be defined and can not be empty"));
						return;
					}
					if (!iconFontContribution.id.match(fontIdRegex)) {
						collector.error(nls.localize('invalid.iconFonts.id.format', "'configuration.iconFonts.id'  must only contain letters, numbers, underscore and minus."));
						return;
					}
					if (!Array.isArray(iconFontContribution.src) || !iconFontContribution.src.length) {
						collector.error(nls.localize('invalid.iconFonts.src', "'configuration.iconFonts.src' must be an array with locations of the icon font."));
						return;
					}
					const def: IconFontDefinition = { src: [] };
					for (const src of iconFontContribution.src) {
						if (typeof src === 'object' && typeof src.path === 'string' && typeof src.format === 'string') {
							const extensionLocation = extension.description.extensionLocation;
							const iconFontLocation = resources.joinPath(extensionLocation, src.path);
							if (!resources.isEqualOrParent(iconFontLocation, extensionLocation)) {
								collector.warn(nls.localize('invalid.iconFonts.src.path', "Expected `contributes.iconFonts.src.path` ({0}) to be included inside extension's folder ({0}). This might make the extension non-portable.", iconFontLocation.path, extensionLocation.path));
							}
							def.src.push({
								location: iconFontLocation,
								format: src.format,
							});
						} else {
							collector.error(nls.localize('invalid.iconFonts.src.item', "Items of 'configuration.iconFonts.src' must be objects with properties 'path' and 'format'"));
						}
					}
					iconRegistry.registerIconFont(getFontId(extension.description, iconFontContribution.id), def);
				}
			}
			for (const extension of delta.removed) {
				const extensionValue = <IIconFontExtensionPoint[]>extension.value;
				for (const iconFontContribution of extensionValue) {
					iconRegistry.deregisterIconFont(getFontId(extension.description, iconFontContribution.id));
				}
			}
		});
	}
}

function getFontId(description: IExtensionDescription, fontId: string) {
	return `${description.identifier.value}/${fontId}`;
}
