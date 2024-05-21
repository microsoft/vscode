/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { ExtensionsRegistry } from 'vs/workbench/services/extensions/common/extensionsRegistry';
import { IColorRegistry, Extensions as ColorRegistryExtensions } from 'vs/platform/theme/common/colorRegistry';
import { Color } from 'vs/base/common/color';
import { Registry } from 'vs/platform/registry/common/platform';
import { Disposable } from 'vs/base/common/lifecycle';
import { Extensions, IExtensionFeatureTableRenderer, IExtensionFeaturesRegistry, IRenderedData, IRowData, ITableData } from 'vs/workbench/services/extensionManagement/common/extensionFeatures';
import { SyncDescriptor } from 'vs/platform/instantiation/common/descriptors';
import { IExtensionManifest } from 'vs/platform/extensions/common/extensions';
import { MarkdownString } from 'vs/base/common/htmlContent';

interface IColorExtensionPoint {
	id: string;
	description: string;
	defaults: { light: string; dark: string; highContrast: string; highContrastLight?: string };
}

const colorRegistry: IColorRegistry = Registry.as<IColorRegistry>(ColorRegistryExtensions.ColorContribution);

const colorReferenceSchema = colorRegistry.getColorReferenceSchema();
const colorIdPattern = '^\\w+[.\\w+]*$';

const configurationExtPoint = ExtensionsRegistry.registerExtensionPoint<IColorExtensionPoint[]>({
	extensionPoint: 'colors',
	jsonSchema: {
		description: nls.localize('contributes.color', 'Contributes extension defined themable colors'),
		type: 'array',
		items: {
			type: 'object',
			properties: {
				id: {
					type: 'string',
					description: nls.localize('contributes.color.id', 'The identifier of the themable color'),
					pattern: colorIdPattern,
					patternErrorMessage: nls.localize('contributes.color.id.format', 'Identifiers must only contain letters, digits and dots and can not start with a dot'),
				},
				description: {
					type: 'string',
					description: nls.localize('contributes.color.description', 'The description of the themable color'),
				},
				defaults: {
					type: 'object',
					properties: {
						light: {
							description: nls.localize('contributes.defaults.light', 'The default color for light themes. Either a color value in hex (#RRGGBB[AA]) or the identifier of a themable color which provides the default.'),
							type: 'string',
							anyOf: [
								colorReferenceSchema,
								{ type: 'string', format: 'color-hex' }
							]
						},
						dark: {
							description: nls.localize('contributes.defaults.dark', 'The default color for dark themes. Either a color value in hex (#RRGGBB[AA]) or the identifier of a themable color which provides the default.'),
							type: 'string',
							anyOf: [
								colorReferenceSchema,
								{ type: 'string', format: 'color-hex' }
							]
						},
						highContrast: {
							description: nls.localize('contributes.defaults.highContrast', 'The default color for high contrast dark themes. Either a color value in hex (#RRGGBB[AA]) or the identifier of a themable color which provides the default. If not provided, the `dark` color is used as default for high contrast dark themes.'),
							type: 'string',
							anyOf: [
								colorReferenceSchema,
								{ type: 'string', format: 'color-hex' }
							]
						},
						highContrastLight: {
							description: nls.localize('contributes.defaults.highContrastLight', 'The default color for high contrast light themes. Either a color value in hex (#RRGGBB[AA]) or the identifier of a themable color which provides the default. If not provided, the `light` color is used as default for high contrast light themes.'),
							type: 'string',
							anyOf: [
								colorReferenceSchema,
								{ type: 'string', format: 'color-hex' }
							]
						}
					},
					required: ['light', 'dark']
				}
			}
		}
	}
});

export class ColorExtensionPoint {

	constructor() {
		configurationExtPoint.setHandler((extensions, delta) => {
			for (const extension of delta.added) {
				const extensionValue = <IColorExtensionPoint[]>extension.value;
				const collector = extension.collector;

				if (!extensionValue || !Array.isArray(extensionValue)) {
					collector.error(nls.localize('invalid.colorConfiguration', "'configuration.colors' must be a array"));
					return;
				}
				const parseColorValue = (s: string, name: string) => {
					if (s.length > 0) {
						if (s[0] === '#') {
							return Color.Format.CSS.parseHex(s);
						} else {
							return s;
						}
					}
					collector.error(nls.localize('invalid.default.colorType', "{0} must be either a color value in hex (#RRGGBB[AA] or #RGB[A]) or the identifier of a themable color which provides the default.", name));
					return Color.red;
				};

				for (const colorContribution of extensionValue) {
					if (typeof colorContribution.id !== 'string' || colorContribution.id.length === 0) {
						collector.error(nls.localize('invalid.id', "'configuration.colors.id' must be defined and can not be empty"));
						return;
					}
					if (!colorContribution.id.match(colorIdPattern)) {
						collector.error(nls.localize('invalid.id.format', "'configuration.colors.id' must only contain letters, digits and dots and can not start with a dot"));
						return;
					}
					if (typeof colorContribution.description !== 'string' || colorContribution.id.length === 0) {
						collector.error(nls.localize('invalid.description', "'configuration.colors.description' must be defined and can not be empty"));
						return;
					}
					const defaults = colorContribution.defaults;
					if (!defaults || typeof defaults !== 'object' || typeof defaults.light !== 'string' || typeof defaults.dark !== 'string') {
						collector.error(nls.localize('invalid.defaults', "'configuration.colors.defaults' must be defined and must contain 'light' and 'dark'"));
						return;
					}
					if (defaults.highContrast && typeof defaults.highContrast !== 'string') {
						collector.error(nls.localize('invalid.defaults.highContrast', "If defined, 'configuration.colors.defaults.highContrast' must be a string."));
						return;
					}
					if (defaults.highContrastLight && typeof defaults.highContrastLight !== 'string') {
						collector.error(nls.localize('invalid.defaults.highContrastLight', "If defined, 'configuration.colors.defaults.highContrastLight' must be a string."));
						return;
					}

					colorRegistry.registerColor(colorContribution.id, {
						light: parseColorValue(defaults.light, 'configuration.colors.defaults.light'),
						dark: parseColorValue(defaults.dark, 'configuration.colors.defaults.dark'),
						hcDark: parseColorValue(defaults.highContrast ?? defaults.dark, 'configuration.colors.defaults.highContrast'),
						hcLight: parseColorValue(defaults.highContrastLight ?? defaults.light, 'configuration.colors.defaults.highContrastLight'),
					}, colorContribution.description);
				}
			}
			for (const extension of delta.removed) {
				const extensionValue = <IColorExtensionPoint[]>extension.value;
				for (const colorContribution of extensionValue) {
					colorRegistry.deregisterColor(colorContribution.id);
				}
			}
		});
	}
}

class ColorDataRenderer extends Disposable implements IExtensionFeatureTableRenderer {

	readonly type = 'table';

	shouldRender(manifest: IExtensionManifest): boolean {
		return !!manifest.contributes?.colors;
	}

	render(manifest: IExtensionManifest): IRenderedData<ITableData> {
		const colors = manifest.contributes?.colors || [];
		if (!colors.length) {
			return { data: { headers: [], rows: [] }, dispose: () => { } };
		}

		const headers = [
			nls.localize('id', "ID"),
			nls.localize('description', "Description"),
			nls.localize('defaultDark', "Dark Default"),
			nls.localize('defaultLight', "Light Default"),
			nls.localize('defaultHC', "High Contrast Default"),
		];

		const toColor = (colorReference: string): Color | undefined => colorReference[0] === '#' ? Color.fromHex(colorReference) : undefined;

		const rows: IRowData[][] = colors.sort((a, b) => a.id.localeCompare(b.id))
			.map(color => {
				return [
					new MarkdownString().appendMarkdown(`\`${color.id}\``),
					color.description,
					toColor(color.defaults.dark) ?? new MarkdownString().appendMarkdown(`\`${color.defaults.dark}\``),
					toColor(color.defaults.light) ?? new MarkdownString().appendMarkdown(`\`${color.defaults.light}\``),
					toColor(color.defaults.highContrast) ?? new MarkdownString().appendMarkdown(`\`${color.defaults.highContrast}\``),
				];
			});

		return {
			data: {
				headers,
				rows
			},
			dispose: () => { }
		};
	}
}

Registry.as<IExtensionFeaturesRegistry>(Extensions.ExtensionFeaturesRegistry).registerExtensionFeature({
	id: 'colors',
	label: nls.localize('colors', "Colors"),
	access: {
		canToggle: false
	},
	renderer: new SyncDescriptor(ColorDataRenderer),
});
