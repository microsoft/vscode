/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as nls from '../../../../nls.js';
import { ExtensionsRegistry } from '../../extensions/common/extensionsRegistry.js';
import { Extensions as ColorRegistryExtensions } from '../../../../platform/theme/common/colorRegistry.js';
import { Color } from '../../../../base/common/color.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { Extensions } from '../../extensionManagement/common/extensionFeatures.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { MarkdownString } from '../../../../base/common/htmlContent.js';
const colorRegistry = Registry.as(ColorRegistryExtensions.ColorContribution);
const colorReferenceSchema = colorRegistry.getColorReferenceSchema();
const colorIdPattern = '^\\w+[.\\w+]*$';
const configurationExtPoint = ExtensionsRegistry.registerExtensionPoint({
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
                const extensionValue = extension.value;
                const collector = extension.collector;
                if (!extensionValue || !Array.isArray(extensionValue)) {
                    collector.error(nls.localize('invalid.colorConfiguration', "'configuration.colors' must be a array"));
                    return;
                }
                const parseColorValue = (s, name) => {
                    if (s.length > 0) {
                        if (s[0] === '#') {
                            return Color.Format.CSS.parseHex(s);
                        }
                        else {
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
                const extensionValue = extension.value;
                for (const colorContribution of extensionValue) {
                    colorRegistry.deregisterColor(colorContribution.id);
                }
            }
        });
    }
}
class ColorDataRenderer extends Disposable {
    constructor() {
        super(...arguments);
        this.type = 'table';
    }
    shouldRender(manifest) {
        return !!manifest.contributes?.colors;
    }
    render(manifest) {
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
        const toColor = (colorReference) => colorReference[0] === '#' ? Color.fromHex(colorReference) : undefined;
        const rows = colors.sort((a, b) => a.id.localeCompare(b.id))
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
Registry.as(Extensions.ExtensionFeaturesRegistry).registerExtensionFeature({
    id: 'colors',
    label: nls.localize('colors', "Colors"),
    access: {
        canToggle: false
    },
    renderer: new SyncDescriptor(ColorDataRenderer),
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29sb3JFeHRlbnNpb25Qb2ludC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9zZXJ2aWNlcy90aGVtZXMvY29tbW9uL2NvbG9yRXh0ZW5zaW9uUG9pbnQudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxLQUFLLEdBQUcsTUFBTSxvQkFBb0IsQ0FBQztBQUMxQyxPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSwrQ0FBK0MsQ0FBQztBQUNuRixPQUFPLEVBQWtCLFVBQVUsSUFBSSx1QkFBdUIsRUFBRSxNQUFNLG9EQUFvRCxDQUFDO0FBQzNILE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUN6RCxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sa0RBQWtELENBQUM7QUFDNUUsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ2xFLE9BQU8sRUFBRSxVQUFVLEVBQW1HLE1BQU0sdURBQXVELENBQUM7QUFDcEwsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLDBEQUEwRCxDQUFDO0FBRTFGLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQVF4RSxNQUFNLGFBQWEsR0FBbUIsUUFBUSxDQUFDLEVBQUUsQ0FBaUIsdUJBQXVCLENBQUMsaUJBQWlCLENBQUMsQ0FBQztBQUU3RyxNQUFNLG9CQUFvQixHQUFHLGFBQWEsQ0FBQyx1QkFBdUIsRUFBRSxDQUFDO0FBQ3JFLE1BQU0sY0FBYyxHQUFHLGdCQUFnQixDQUFDO0FBRXhDLE1BQU0scUJBQXFCLEdBQUcsa0JBQWtCLENBQUMsc0JBQXNCLENBQXlCO0lBQy9GLGNBQWMsRUFBRSxRQUFRO0lBQ3hCLFVBQVUsRUFBRTtRQUNYLFdBQVcsRUFBRSxHQUFHLENBQUMsUUFBUSxDQUFDLG1CQUFtQixFQUFFLCtDQUEr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