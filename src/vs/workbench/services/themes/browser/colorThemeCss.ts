/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IColorTheme, ICssStyleCollector, IThemingParticipant } from '../../../../platform/theme/common/themeService.js';
import { asCssVariableName, getColorRegistry } from '../../../../platform/theme/common/colorRegistry.js';
import { asCssVariableName as asSizeCssVariableName, buttonsCornerRadius, controlsCornerRadius, dialogsCornerRadius, getSizeRegistry, hoversCornerRadius, inputsCornerRadius, menusCornerRadius, popupsCornerRadius, sizeValueToCss } from '../../../../platform/theme/common/sizeRegistry.js';
import { IEnvironmentService } from '../../../../platform/environment/common/environment.js';
import { ISizeService } from '../../../../platform/theme/common/sizeService.js';

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
	environmentService?: IEnvironmentService,
	sizeService?: ISizeService,
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
		const sizeValue = sizeService ? sizeService.getSize(item.id, theme) : getSizeRegistry().resolveDefaultSize(item.id, theme);
		if (sizeValue) {
			variables.push(`${asSizeCssVariableName(item.id)}: ${sizeValueToCss(sizeValue)};`);
		}
	}

	// Only customized widget families override existing, context-specific default shapes.
	for (const [id, property] of [
		[controlsCornerRadius, '--workbench-custom-controls-corner-radius'],
		[buttonsCornerRadius, '--workbench-custom-buttons-corner-radius'],
		[inputsCornerRadius, '--workbench-custom-inputs-corner-radius'],
		[popupsCornerRadius, '--workbench-custom-popups-corner-radius'],
		[menusCornerRadius, '--workbench-custom-menus-corner-radius'],
		[hoversCornerRadius, '--workbench-custom-hovers-corner-radius'],
		[dialogsCornerRadius, '--workbench-custom-dialogs-corner-radius'],
	]) {
		if (sizeService?.isCustomized(id)) {
			variables.push(`${property}: var(${asSizeCssVariableName(id)});`);
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
