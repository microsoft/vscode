/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { ExtensionsRegistry, ExtensionMessageCollector } from 'vs/workbench/services/extensions/common/extensionsRegistry';
import { getTokenClassificationRegistry, ITokenClassificationRegistry, typeAndModifierIdPattern, TokenStyleDefaults, TokenStyle, fontStylePattern } from 'vs/platform/theme/common/tokenClassificationRegistry';
import { textmateColorSettingsSchemaId } from 'vs/workbench/services/themes/common/colorThemeSchema';

interface ITokenTypeExtensionPoint {
	id: string;
	description: string;
}

interface ITokenModifierExtensionPoint {
	id: string;
	description: string;
}

interface ITokenStyleDefaultExtensionPoint {
	selector: string;
	scopes?: string[];
	light?: {
		foreground?: string;
		fontStyle?: string;
	};
	dark?: {
		foreground?: string;
		fontStyle?: string;
	};
	highContrast?: {
		foreground?: string;
		fontStyle?: string;
	};
}

const selectorPattern = '^([-_\\w]+|\\*)(\\.[-_\\w+]+)*$';
const colorPattern = '^#([0-9A-Fa-f]{6})([0-9A-Fa-f]{2})?$';

const tokenClassificationRegistry: ITokenClassificationRegistry = getTokenClassificationRegistry();

const tokenTypeExtPoint = ExtensionsRegistry.registerExtensionPoint<ITokenTypeExtensionPoint[]>({
	extensionPoint: 'tokenTypes',
	jsonSchema: {
		description: nls.localize('contributes.tokenTypes', 'Contributes semantic token types.'),
		type: 'array',
		items: {
			type: 'object',
			properties: {
				id: {
					type: 'string',
					description: nls.localize('contributes.tokenTypes.id', 'The identifier of the token type'),
					pattern: typeAndModifierIdPattern,
					patternErrorMessage: nls.localize('contributes.tokenTypes.id.format', 'Identifiers should be in the form letterOrDigit[_-letterOrDigit]*'),
				},
				description: {
					type: 'string',
					description: nls.localize('contributes.color.description', 'The description of the token type'),
				}
			}
		}
	}
});

const tokenModifierExtPoint = ExtensionsRegistry.registerExtensionPoint<ITokenModifierExtensionPoint[]>({
	extensionPoint: 'tokenModifiers',
	jsonSchema: {
		description: nls.localize('contributes.tokenModifiers', 'Contributes semantic token modifiers.'),
		type: 'array',
		items: {
			type: 'object',
			properties: {
				id: {
					type: 'string',
					description: nls.localize('contributes.tokenModifiers.id', 'The identifier of the token modifier'),
					pattern: typeAndModifierIdPattern,
					patternErrorMessage: nls.localize('contributes.tokenModifiers.id.format', 'Identifiers should be in the form letterOrDigit[_-letterOrDigit]*')
				},
				description: {
					description: nls.localize('contributes.tokenModifiers.description', 'The description of the token modifier')
				}
			}
		}
	}
});

const tokenStyleDefaultsExtPoint = ExtensionsRegistry.registerExtensionPoint<ITokenStyleDefaultExtensionPoint[]>({
	extensionPoint: 'tokenStyleDefaults',
	jsonSchema: {
		description: nls.localize('contributes.tokenStyleDefaults', 'Contributes semantic token style default.'),
		type: 'array',
		items: {
			type: 'object',
			properties: {
				selector: {
					type: 'string',
					description: nls.localize('contributes.tokenStyleDefaults.selector', 'The selector matching token types and modifiers.'),
					pattern: selectorPattern,
					patternErrorMessage: nls.localize('contributes.tokenStyleDefaults.selector.format', 'Selectors should be in the form (type|*)(.modifier)*'),
				},
				scopes: {
					type: 'array',
					description: nls.localize('contributes.scopes.light', 'A list of textmate scopes that are matched against the current color theme to find a default style'),
					items: {
						type: 'string'
					}
				},
				light: {
					description: nls.localize('contributes.tokenStyleDefaults.light', 'The default style used for light themes'),
					$ref: textmateColorSettingsSchemaId
				},
				dark: {
					description: nls.localize('contributes.tokenStyleDefaults.dark', 'The default style used for dark themes'),
					$ref: textmateColorSettingsSchemaId
				},
				highContrast: {
					description: nls.localize('contributes.tokenStyleDefaults.hc', 'The default style used for high contrast themes'),
					$ref: textmateColorSettingsSchemaId
				}
			}
		}
	}
});


export class TokenClassificationExtensionPoints {

	constructor() {
		function validateTypeOrModifier(contribution: ITokenTypeExtensionPoint | ITokenModifierExtensionPoint, extensionPoint: string, collector: ExtensionMessageCollector): boolean {
			if (typeof contribution.id !== 'string' || contribution.id.length === 0) {
				collector.error(nls.localize('invalid.id', "'configuration.{0}.id' must be defined and can not be empty", extensionPoint));
				return false;
			}
			if (!contribution.id.match(typeAndModifierIdPattern)) {
				collector.error(nls.localize('invalid.id.format', "'configuration.{0}.id' must follow the pattern letterOrDigit[-_letterOrDigit]*", extensionPoint));
				return false;
			}
			if (typeof contribution.description !== 'string' || contribution.id.length === 0) {
				collector.error(nls.localize('invalid.description', "'configuration.{0}.description' must be defined and can not be empty", extensionPoint));
				return false;
			}
			return true;
		}
		function validateStyle(style: { foreground?: string; fontStyle?: string; } | undefined, extensionPoint: string, collector: ExtensionMessageCollector): TokenStyle | undefined {
			if (!style) {
				return undefined;
			}
			if (style.foreground) {
				if (typeof style.foreground !== 'string' || !style.foreground.match(colorPattern)) {
					collector.error(nls.localize('invalid.color', "'configuration.{0}.foreground'  must follow the pattern #RRGGBB[AA]", extensionPoint));
					return undefined;
				}
			}
			if (style.fontStyle) {
				if (typeof style.fontStyle !== 'string' || !style.fontStyle.match(fontStylePattern)) {
					collector.error(nls.localize('invalid.fontStyle', "'configuration.{0}.fontStyle'  must be a one or a compination of  \'italic\', \'bold\' or \'underline\' or the empty string", extensionPoint));
					return undefined;
				}
			}
			return TokenStyle.fromSettings(style.foreground, style.fontStyle);
		}

		tokenTypeExtPoint.setHandler((extensions, delta) => {
			for (const extension of delta.added) {
				const extensionValue = <ITokenTypeExtensionPoint[]>extension.value;
				const collector = extension.collector;

				if (!extensionValue || !Array.isArray(extensionValue)) {
					collector.error(nls.localize('invalid.tokenTypeConfiguration', "'configuration.tokenType' must be a array"));
					return;
				}
				for (const contribution of extensionValue) {
					if (validateTypeOrModifier(contribution, 'tokenType', collector)) {
						tokenClassificationRegistry.registerTokenType(contribution.id, contribution.description);
					}
				}
			}
			for (const extension of delta.removed) {
				const extensionValue = <ITokenTypeExtensionPoint[]>extension.value;
				for (const contribution of extensionValue) {
					tokenClassificationRegistry.deregisterTokenType(contribution.id);
				}
			}
		});
		tokenModifierExtPoint.setHandler((extensions, delta) => {
			for (const extension of delta.added) {
				const extensionValue = <ITokenModifierExtensionPoint[]>extension.value;
				const collector = extension.collector;

				if (!extensionValue || !Array.isArray(extensionValue)) {
					collector.error(nls.localize('invalid.tokenModifierConfiguration', "'configuration.tokenModifier' must be a array"));
					return;
				}
				for (const contribution of extensionValue) {
					if (validateTypeOrModifier(contribution, 'tokenModifier', collector)) {
						tokenClassificationRegistry.registerTokenModifier(contribution.id, contribution.description);
					}
				}
			}
			for (const extension of delta.removed) {
				const extensionValue = <ITokenModifierExtensionPoint[]>extension.value;
				for (const contribution of extensionValue) {
					tokenClassificationRegistry.deregisterTokenModifier(contribution.id);
				}
			}
		});
		tokenStyleDefaultsExtPoint.setHandler((extensions, delta) => {
			for (const extension of delta.added) {
				const extensionValue = <ITokenStyleDefaultExtensionPoint[]>extension.value;
				const collector = extension.collector;

				if (!extensionValue || !Array.isArray(extensionValue)) {
					collector.error(nls.localize('invalid.tokenStyleDefaultConfiguration', "'configuration.tokenStyleDefaults' must be a array"));
					return;
				}
				for (const contribution of extensionValue) {
					if (typeof contribution.selector !== 'string' || contribution.selector.length === 0) {
						collector.error(nls.localize('invalid.selector', "'configuration.tokenStyleDefaults.selector' must be defined and can not be empty"));
						continue;
					}
					if (!contribution.selector.match(selectorPattern)) {
						collector.error(nls.localize('invalid.selector.format', "'configuration.tokenStyleDefaults.selector' must be in the form (type|*)(.modifier)*"));
						continue;
					}

					const tokenStyleDefault: TokenStyleDefaults = {};

					if (contribution.scopes) {
						if ((!Array.isArray(contribution.scopes) || contribution.scopes.some(s => typeof s !== 'string'))) {
							collector.error(nls.localize('invalid.scopes', "If defined, 'configuration.tokenStyleDefaults.scopes' must must be an array or strings"));
							continue;
						}
						tokenStyleDefault.scopesToProbe = [contribution.scopes];
					}
					tokenStyleDefault.light = validateStyle(contribution.light, 'tokenStyleDefaults.light', collector);
					tokenStyleDefault.dark = validateStyle(contribution.dark, 'tokenStyleDefaults.dark', collector);
					tokenStyleDefault.hc = validateStyle(contribution.highContrast, 'tokenStyleDefaults.highContrast', collector);

					const [type, ...modifiers] = contribution.selector.split('.');
					const classification = tokenClassificationRegistry.getTokenClassification(type, modifiers);
					if (classification) {
						tokenClassificationRegistry.registerTokenStyleDefault(classification, tokenStyleDefault);
					}
				}
			}
			for (const extension of delta.removed) {
				const extensionValue = <ITokenStyleDefaultExtensionPoint[]>extension.value;
				for (const contribution of extensionValue) {
					const [type, ...modifiers] = contribution.selector.split('.');
					const classification = tokenClassificationRegistry.getTokenClassification(type, modifiers);
					if (classification) {
						tokenClassificationRegistry.deregisterTokenStyleDefault(classification);
					}
				}
			}
		});
	}
}



