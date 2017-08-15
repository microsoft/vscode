/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import nls = require('vs/nls');
import { ExtensionsRegistry } from 'vs/platform/extensions/common/extensionsRegistry';
import { registerColor, getColorRegistry } from 'vs/platform/theme/common/colorRegistry';
import { Color } from 'vs/base/common/color';

interface IColorExtensionPoint {
	id: string;
	description: string;
	defaults: { light: string, dark: string, highContrast: string };
}

const colorReferenceSchema = getColorRegistry().getColorReferenceSchema();
const colorIdPattern = '^\\w+[.\\w+]*$';

const configurationExtPoint = ExtensionsRegistry.registerExtensionPoint<IColorExtensionPoint[]>('colors', [], {
	description: nls.localize('contributes.color', 'Contributes extension defined themable colors'),
	type: 'array',
	items: {
		type: 'object',
		properties: {
			id: {
				type: 'string',
				description: nls.localize('contributes.color.id', 'The identifier of the themable color'),
				pattern: colorIdPattern,
				patternErrorMessage: nls.localize('contributes.color.id.format', 'Identifiers should be in the form aa[.bb]*'),
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
							{ type: 'string', format: 'color' }
						]
					},
					dark: {
						description: nls.localize('contributes.defaults.dark', 'The default color for dark themes. Either a color value in hex (#RRGGBB[AA]) or the identifier of a themable color which provides the default.'),
						type: 'string',
						anyOf: [
							colorReferenceSchema,
							{ type: 'string', format: 'color' }
						]
					},
					highContrast: {
						description: nls.localize('contributes.defaults.highContrast', 'The default color for high contrast themes. Either a color value in hex (#RRGGBB[AA]) or the identifier of a themable color which provides the default.'),
						type: 'string',
						anyOf: [
							colorReferenceSchema,
							{ type: 'string', format: 'color' }
						]
					}
				}
			},
		}
	}
});

export class ColorExtensionPoint {

	constructor() {
		configurationExtPoint.setHandler((extensions) => {
			for (var i = 0; i < extensions.length; i++) {
				var extensionValue = <IColorExtensionPoint[]>extensions[i].value;
				var collector = extensions[i].collector;

				if (!extensionValue || !Array.isArray(extensionValue)) {
					collector.error(nls.localize('invalid.colorConfiguration', "'configuration.colors' must be a array"));
					return;
				}
				let parseColorValue = (s: string, name: string) => {
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

				extensionValue.forEach(extension => {
					if (typeof extension.id !== 'string' || extension.id.length === 0) {
						collector.error(nls.localize('invalid.id', "'configuration.colors.id' must be defined an can not be empty"));
						return;
					}
					if (!extension.id.match(colorIdPattern)) {
						collector.error(nls.localize('invalid.id.format', "'configuration.colors.id' must follow the word[.word]*"));
						return;
					}
					if (typeof extension.description !== 'string' || extension.id.length === 0) {
						collector.error(nls.localize('invalid.description', "'configuration.colors.description' must be defined an can not be empty"));
						return;
					}
					let defaults = extension.defaults;
					if (typeof defaults !== 'object' || typeof defaults.light !== 'string' || typeof defaults.dark !== 'string' || typeof defaults.highContrast !== 'string') {
						collector.error(nls.localize('invalid.defaults', "'configuration.colors.defaults' must be defined and must contain 'light', 'dark' and 'highContrast'"));
						return;
					}
					registerColor(extension.id, {
						light: parseColorValue(defaults.light, 'configuration.colors.defaults.light'),
						dark: parseColorValue(defaults.dark, 'configuration.colors.defaults.dark'),
						hc: parseColorValue(defaults.highContrast, 'configuration.colors.defaults.highContrast')
					}, extension.description);
				});
			}
		});
	}
}



