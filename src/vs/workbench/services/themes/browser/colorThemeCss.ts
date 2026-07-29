/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IColorTheme, ICssStyleCollector, IThemingParticipant } from '../../../../platform/theme/common/themeService.js';
import { asCssVariableName, getColorRegistry } from '../../../../platform/theme/common/colorRegistry.js';
import { asCssVariableName as asSizeCssVariableName, getSizeRegistry, sizeValueToCss } from '../../../../platform/theme/common/sizeRegistry.js';
import { IEnvironmentService } from '../../../../platform/environment/common/environment.js';

/**
 * Generates CSS content (variables + theming participant rules) for a color theme.
 * Pure function - no DOM side effects.
 *
 * @param theme The color theme to generate CSS for
 * @param scopeSelector CSS selector to scope the rules (e.g. '.monaco-workbench')
 * @param themingParticipants Functions that contribute additional CSS rules (optional)
 * @param environmentService Passed to theming participants (required if themingParticipants is non-empty)
 */
export function generateColorThemeCSS(
	theme: IColorTheme,
	scopeSelector: string,
	themingParticipants?: readonly IThemingParticipant[],
	environmentService?: IEnvironmentService
): CSSValue {
	const cssRules = new Set<string>();
	const ruleCollector: ICssStyleCollector = {
		addRule: (rule: string) => {
			if (!cssRules.has(rule)) {
				cssRules.add(rule);
			}
		}
	};

	// Base rule
	ruleCollector.addRule(`${scopeSelector} { forced-color-adjust: none; }`);

	// Theming participant rules
	if (themingParticipants && environmentService) {
		for (const participant of themingParticipants) {
			participant(theme, ruleCollector, environmentService);
		}
	}

	// Color CSS variables
	const variables: string[] = [];
	for (const item of getColorRegistry().getColors()) {
		const color = theme.getColor(item.id, true);
		if (color) {
			variables.push(`${asCssVariableName(item.id)}: ${color.toString()};`);
		}
	}

	// Size CSS variables
	for (const item of getSizeRegistry().getSizes()) {
		const sizeValue = getSizeRegistry().resolveDefaultSize(item.id, theme);
		if (sizeValue) {
			variables.push(`${asSizeCssVariableName(item.id)}: ${sizeValueToCss(sizeValue)};`);
		}
	}

	ruleCollector.addRule(`${scopeSelector} { ${variables.join('\n')} }`);

	return new CSSValue([...cssRules].join('\n'));
}

/**
 * A typed wrapper for CSS content
 */
export class CSSValue {
	constructor(readonly code: string) { }
}
