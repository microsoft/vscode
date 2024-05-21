/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { ExtensionsRegistry } from 'vs/workbench/services/extensions/common/extensionsRegistry';
import { IIconRegistry, Extensions as IconRegistryExtensions } from 'vs/platform/theme/common/iconRegistry';
import { Registry } from 'vs/platform/registry/common/platform';
import { ThemeIcon } from 'vs/base/common/themables';
import * as resources from 'vs/base/common/resources';
import { IExtensionDescription } from 'vs/platform/extensions/common/extensions';
import { extname, posix } from 'vs/base/common/path';

interface IIconExtensionPoint {
	[id: string]: {
		description: string;
		default: { fontPath: string; fontCharacter: string } | string;
	};
}

const iconRegistry: IIconRegistry = Registry.as<IIconRegistry>(IconRegistryExtensions.IconContribution);

const iconReferenceSchema = iconRegistry.getIconReferenceSchema();
const iconIdPattern = `^${ThemeIcon.iconNameSegment}(-${ThemeIcon.iconNameSegment})+$`;

const iconConfigurationExtPoint = ExtensionsRegistry.registerExtensionPoint<IIconExtensionPoint>({
	extensionPoint: 'icons',
	jsonSchema: {
		description: nls.localize('contributes.icons', 'Contributes extension defined themable icons'),
		type: 'object',
		propertyNames: {
			pattern: iconIdPattern,
			description: nls.localize('contributes.icon.id', 'The identifier of the themable icon'),
			patternErrorMessage: nls.localize('contributes.icon.id.format', 'Identifiers can only contain letters, digits and minuses and need to consist of at least two segments in the form `component-iconname`.'),
		},
		additionalProperties: {
			type: 'object',
			properties: {
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
								fontPath: {
									description: nls.localize('contributes.icon.default.fontPath', 'The path of the icon font that defines the icon.'),
									type: 'string'
								},
								fontCharacter: {
									description: nls.localize('contributes.icon.default.fontCharacter', 'The character for the icon in the icon font.'),
									type: 'string'
								}
							},
							required: ['fontPath', 'fontCharacter'],
							defaultSnippets: [{ body: { fontPath: '${1:myiconfont.woff}', fontCharacter: '${2:\\\\E001}' } }]
						}
					],
					description: nls.localize('contributes.icon.default', 'The default of the icon. Either a reference to an extisting ThemeIcon or an icon in an icon font.'),
				}
			},
			required: ['description', 'default'],
			defaultSnippets: [{ body: { description: '${1:my icon}', default: { fontPath: '${2:myiconfont.woff}', fontCharacter: '${3:\\\\E001}' } } }]
		},
		defaultSnippets: [{ body: { '${1:my-icon-id}': { description: '${2:my icon}', default: { fontPath: '${3:myiconfont.woff}', fontCharacter: '${4:\\\\E001}' } } } }]
	}
});

export class IconExtensionPoint {

	constructor() {
		iconConfigurationExtPoint.setHandler((extensions, delta) => {
			for (const extension of delta.added) {
				const extensionValue = <IIconExtensionPoint>extension.value;
				const collector = extension.collector;

				if (!extensionValue || typeof extensionValue !== 'object') {
					collector.error(nls.localize('invalid.icons.configuration', "'configuration.icons' must be an object with the icon names as properties."));
					return;
				}

				for (const id in extensionValue) {
					if (!id.match(iconIdPattern)) {
						collector.error(nls.localize('invalid.icons.id.format', "'configuration.icons' keys represent the icon id and can only contain letter, digits and minuses. They need to consist of at least two segments in the form `component-iconname`."));
						return;
					}
					const iconContribution = extensionValue[id];
					if (typeof iconContribution.description !== 'string' || iconContribution.description.length === 0) {
						collector.error(nls.localize('invalid.icons.description', "'configuration.icons.description' must be defined and can not be empty"));
						return;
					}
					const defaultIcon = iconContribution.default;
					if (typeof defaultIcon === 'string') {
						iconRegistry.registerIcon(id, { id: defaultIcon }, iconContribution.description);
					} else if (typeof defaultIcon === 'object' && typeof defaultIcon.fontPath === 'string' && typeof defaultIcon.fontCharacter === 'string') {
						const fileExt = extname(defaultIcon.fontPath).substring(1);
						const format = formatMap[fileExt];
						if (!format) {
							collector.warn(nls.localize('invalid.icons.default.fontPath.extension', "Expected `contributes.icons.default.fontPath` to have file extension 'woff', woff2' or 'ttf', is '{0}'.", fileExt));
							return;
						}
						const extensionLocation = extension.description.extensionLocation;
						const iconFontLocation = resources.joinPath(extensionLocation, defaultIcon.fontPath);
						if (!resources.isEqualOrParent(iconFontLocation, extensionLocation)) {
							collector.warn(nls.localize('invalid.icons.default.fontPath.path', "Expected `contributes.icons.default.fontPath` ({0}) to be included inside extension's folder ({0}).", iconFontLocation.path, extensionLocation.path));
							return;
						}
						const fontId = getFontId(extension.description, defaultIcon.fontPath);
						const definition = iconRegistry.registerIconFont(fontId, { src: [{ location: iconFontLocation, format }] });
						iconRegistry.registerIcon(id, {
							fontCharacter: defaultIcon.fontCharacter,
							font: {
								id: fontId,
								definition
							}
						}, iconContribution.description);
					} else {
						collector.error(nls.localize('invalid.icons.default', "'configuration.icons.default' must be either a reference to the id of an other theme icon (string) or a icon definition (object) with properties `fontPath` and `fontCharacter`."));
					}
				}
			}
			for (const extension of delta.removed) {
				const extensionValue = <IIconExtensionPoint>extension.value;
				for (const id in extensionValue) {
					iconRegistry.deregisterIcon(id);
				}
			}
		});
	}
}

const formatMap: Record<string, string> = {
	'ttf': 'truetype',
	'woff': 'woff',
	'woff2': 'woff2'
};

function getFontId(description: IExtensionDescription, fontPath: string) {
	return posix.join(description.identifier.value, fontPath);
}
