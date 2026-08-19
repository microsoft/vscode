/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Color } from '../../../../base/common/color.js';
import { ColorIdentifier, editorBackground } from '../../../../platform/theme/common/colorRegistry.js';
import { registerThemingParticipant } from '../../../../platform/theme/common/themeService.js';
import { MODERN_EDITOR_TAB_ACTIVE_ACTION_BACKGROUND, MODERN_EDITOR_TAB_ACTIVE_BACKGROUND, MODERN_EDITOR_TAB_ACTIVE_FOREGROUND, MODERN_EDITOR_TAB_ACTIVE_HOVER_ACTION_BACKGROUND, MODERN_EDITOR_TAB_ACTIVE_HOVER_BACKGROUND, MODERN_EDITOR_TAB_HOVER_ACTION_BACKGROUND, MODERN_EDITOR_TAB_HOVER_BACKGROUND, MODERN_EDITOR_TAB_HOVER_FOREGROUND, MODERN_EDITOR_TAB_INACTIVE_BACKGROUND, MODERN_TAB_ACTIVE_BACKGROUND, MODERN_TAB_ACTIVE_FOREGROUND, MODERN_TAB_HOVER_BACKGROUND, MODERN_TAB_HOVER_FOREGROUND, TAB_ACTIVE_BACKGROUND, TAB_ACTIVE_BORDER, TAB_ACTIVE_BORDER_TOP, TAB_ACTIVE_FOREGROUND, TAB_BORDER, TAB_HOVER_BACKGROUND, TAB_HOVER_BORDER, TAB_HOVER_FOREGROUND, TAB_INACTIVE_BACKGROUND, TAB_INACTIVE_FOREGROUND, TAB_LAST_PINNED_BORDER, TAB_UNFOCUSED_ACTIVE_BACKGROUND, TAB_UNFOCUSED_ACTIVE_BORDER, TAB_UNFOCUSED_ACTIVE_BORDER_TOP, TAB_UNFOCUSED_ACTIVE_FOREGROUND, TAB_UNFOCUSED_HOVER_BACKGROUND, TAB_UNFOCUSED_HOVER_BORDER, TAB_UNFOCUSED_HOVER_FOREGROUND, TAB_UNFOCUSED_INACTIVE_BACKGROUND, TAB_UNFOCUSED_INACTIVE_FOREGROUND } from '../../../common/theme.js';
import { ColorThemeData } from '../common/colorThemeData.js';

/**
 * Resolves the tab color to emit as a Modern UI variable, or `undefined` to leave the CSS default in place.
 *
 * When `relatedLegacyColorIds` are passed, `legacyColorId`'s default definition in the color registry is assumed
 * to derive from them (e.g. `tab.unfocusedInactiveForeground` derives transitively from `tab.inactiveForeground`
 * and `tab.activeForeground`), so customizing any related color flows through `getColor` into the derived value.
 */
function resolveLegacyTabColor(theme: ColorThemeData, legacyColorId: ColorIdentifier, modernColorIds: readonly ColorIdentifier[], ...relatedLegacyColorIds: ColorIdentifier[]): Color | undefined {
	if (modernColorIds.some(id => theme.getColorCustomization(id))) {
		return undefined;
	}
	if (!theme.getColorCustomization(legacyColorId) && !relatedLegacyColorIds.some(id => theme.getColorCustomization(id))) {
		return undefined;
	}
	return theme.getColor(legacyColorId);
}

function addColorVariable(declarations: string[], name: string, color: Color | undefined): void {
	if (color) {
		declarations.push(`${name}: ${color};`);
	}
}

function flattenActionBackground(color: Color, editorBackgroundColor: Color | undefined): Color {
	return editorBackgroundColor ? color.makeOpaque(editorBackgroundColor) : color;
}

registerThemingParticipant((theme, collector) => {
	if (!(theme instanceof ColorThemeData)) {
		return;
	}

	const declarations: string[] = [];
	const activeBackground = resolveLegacyTabColor(theme, TAB_ACTIVE_BACKGROUND, [MODERN_EDITOR_TAB_ACTIVE_BACKGROUND, MODERN_TAB_ACTIVE_BACKGROUND]);
	const unfocusedActiveBackground = resolveLegacyTabColor(theme, TAB_UNFOCUSED_ACTIVE_BACKGROUND, [MODERN_EDITOR_TAB_ACTIVE_BACKGROUND, MODERN_TAB_ACTIVE_BACKGROUND], TAB_ACTIVE_BACKGROUND);
	const inactiveBackground = resolveLegacyTabColor(theme, TAB_INACTIVE_BACKGROUND, [MODERN_EDITOR_TAB_INACTIVE_BACKGROUND]);
	const unfocusedInactiveBackground = resolveLegacyTabColor(theme, TAB_UNFOCUSED_INACTIVE_BACKGROUND, [MODERN_EDITOR_TAB_INACTIVE_BACKGROUND], TAB_INACTIVE_BACKGROUND);
	const hoverBackground = resolveLegacyTabColor(theme, TAB_HOVER_BACKGROUND, [MODERN_EDITOR_TAB_HOVER_BACKGROUND, MODERN_TAB_HOVER_BACKGROUND]);
	const unfocusedHoverBackground = resolveLegacyTabColor(theme, TAB_UNFOCUSED_HOVER_BACKGROUND, [MODERN_EDITOR_TAB_HOVER_BACKGROUND, MODERN_TAB_HOVER_BACKGROUND], TAB_HOVER_BACKGROUND);
	const activeHoverBackground = resolveLegacyTabColor(theme, TAB_HOVER_BACKGROUND, [MODERN_EDITOR_TAB_ACTIVE_HOVER_BACKGROUND, MODERN_EDITOR_TAB_HOVER_BACKGROUND, MODERN_TAB_HOVER_BACKGROUND]);
	const unfocusedActiveHoverBackground = resolveLegacyTabColor(theme, TAB_UNFOCUSED_HOVER_BACKGROUND, [MODERN_EDITOR_TAB_ACTIVE_HOVER_BACKGROUND, MODERN_EDITOR_TAB_HOVER_BACKGROUND, MODERN_TAB_HOVER_BACKGROUND], TAB_HOVER_BACKGROUND);
	const editorBackgroundColor = theme.getColor(editorBackground);
	const hasModernActiveActionBackground = !!theme.getColorCustomization(MODERN_EDITOR_TAB_ACTIVE_ACTION_BACKGROUND);
	const hasModernHoverActionBackground = !!theme.getColorCustomization(MODERN_EDITOR_TAB_HOVER_ACTION_BACKGROUND);
	const hasModernActiveHoverActionBackground = !!theme.getColorCustomization(MODERN_EDITOR_TAB_ACTIVE_HOVER_ACTION_BACKGROUND);

	addColorVariable(declarations, '--modern-ui-editor-tab-active-background', activeBackground);
	addColorVariable(declarations, '--modern-ui-editor-tab-unfocused-active-background', unfocusedActiveBackground);
	addColorVariable(declarations, '--modern-ui-editor-tab-inactive-background', inactiveBackground);
	addColorVariable(declarations, '--modern-ui-editor-tab-unfocused-inactive-background', unfocusedInactiveBackground);
	addColorVariable(declarations, '--modern-ui-editor-tab-hover-background', hoverBackground);
	addColorVariable(declarations, '--modern-ui-editor-tab-unfocused-hover-background', unfocusedHoverBackground);
	addColorVariable(declarations, '--modern-ui-editor-tab-active-hover-background', activeHoverBackground);
	addColorVariable(declarations, '--modern-ui-editor-tab-unfocused-active-hover-background', unfocusedActiveHoverBackground);
	addColorVariable(declarations, '--modern-ui-editor-tab-active-foreground', resolveLegacyTabColor(theme, TAB_ACTIVE_FOREGROUND, [MODERN_EDITOR_TAB_ACTIVE_FOREGROUND, MODERN_TAB_ACTIVE_FOREGROUND]));
	addColorVariable(declarations, '--modern-ui-editor-tab-unfocused-active-foreground', resolveLegacyTabColor(theme, TAB_UNFOCUSED_ACTIVE_FOREGROUND, [MODERN_EDITOR_TAB_ACTIVE_FOREGROUND, MODERN_TAB_ACTIVE_FOREGROUND], TAB_ACTIVE_FOREGROUND));
	addColorVariable(declarations, '--modern-ui-editor-tab-inactive-foreground', resolveLegacyTabColor(theme, TAB_INACTIVE_FOREGROUND, [], TAB_ACTIVE_FOREGROUND));
	addColorVariable(declarations, '--modern-ui-editor-tab-unfocused-inactive-foreground', resolveLegacyTabColor(theme, TAB_UNFOCUSED_INACTIVE_FOREGROUND, [], TAB_INACTIVE_FOREGROUND, TAB_ACTIVE_FOREGROUND));
	addColorVariable(declarations, '--modern-ui-editor-tab-hover-foreground', resolveLegacyTabColor(theme, TAB_HOVER_FOREGROUND, [MODERN_EDITOR_TAB_HOVER_FOREGROUND, MODERN_TAB_HOVER_FOREGROUND]));
	addColorVariable(declarations, '--modern-ui-editor-tab-unfocused-hover-foreground', resolveLegacyTabColor(theme, TAB_UNFOCUSED_HOVER_FOREGROUND, [MODERN_EDITOR_TAB_HOVER_FOREGROUND, MODERN_TAB_HOVER_FOREGROUND], TAB_HOVER_FOREGROUND));
	addColorVariable(declarations, '--modern-ui-editor-tab-border', resolveLegacyTabColor(theme, TAB_BORDER, []));
	addColorVariable(declarations, '--modern-ui-editor-tab-last-pinned-border', resolveLegacyTabColor(theme, TAB_LAST_PINNED_BORDER, []));
	addColorVariable(declarations, '--modern-ui-editor-tab-active-border', resolveLegacyTabColor(theme, TAB_ACTIVE_BORDER, []));
	addColorVariable(declarations, '--modern-ui-editor-tab-unfocused-active-border', resolveLegacyTabColor(theme, TAB_UNFOCUSED_ACTIVE_BORDER, [], TAB_ACTIVE_BORDER));
	addColorVariable(declarations, '--modern-ui-editor-tab-active-border-top', resolveLegacyTabColor(theme, TAB_ACTIVE_BORDER_TOP, []));
	addColorVariable(declarations, '--modern-ui-editor-tab-unfocused-active-border-top', resolveLegacyTabColor(theme, TAB_UNFOCUSED_ACTIVE_BORDER_TOP, [], TAB_ACTIVE_BORDER_TOP));
	addColorVariable(declarations, '--modern-ui-editor-tab-hover-border', resolveLegacyTabColor(theme, TAB_HOVER_BORDER, []));
	addColorVariable(declarations, '--modern-ui-editor-tab-unfocused-hover-border', resolveLegacyTabColor(theme, TAB_UNFOCUSED_HOVER_BORDER, [], TAB_HOVER_BORDER));

	if (activeBackground && !hasModernActiveActionBackground) {
		addColorVariable(declarations, '--modern-ui-editor-tab-action-active-background', flattenActionBackground(activeBackground, editorBackgroundColor));
	}
	if (unfocusedActiveBackground && !hasModernActiveActionBackground) {
		addColorVariable(declarations, '--modern-ui-editor-tab-action-unfocused-active-background', flattenActionBackground(unfocusedActiveBackground, editorBackgroundColor));
	}
	if (hoverBackground && !hasModernHoverActionBackground) {
		addColorVariable(declarations, '--modern-ui-editor-tab-action-hover-background', flattenActionBackground(hoverBackground, editorBackgroundColor));
	}
	if (unfocusedHoverBackground && !hasModernHoverActionBackground) {
		addColorVariable(declarations, '--modern-ui-editor-tab-action-unfocused-hover-background', flattenActionBackground(unfocusedHoverBackground, editorBackgroundColor));
	}
	if (activeHoverBackground && !hasModernActiveHoverActionBackground) {
		addColorVariable(declarations, '--modern-ui-editor-tab-action-active-hover-background', flattenActionBackground(activeHoverBackground, editorBackgroundColor));
	}
	if (unfocusedActiveHoverBackground && !hasModernActiveHoverActionBackground) {
		addColorVariable(declarations, '--modern-ui-editor-tab-action-unfocused-active-hover-background', flattenActionBackground(unfocusedActiveHoverBackground, editorBackgroundColor));
	}

	if (declarations.length > 0) {
		// The doubled `.monaco-workbench` raises specificity above the defaults in tabs.css so these overrides win regardless of style injection order.
		collector.addRule(`.modern-ui-tabs.monaco-workbench.monaco-workbench { ${declarations.join('\n')} }`);
	}
});
