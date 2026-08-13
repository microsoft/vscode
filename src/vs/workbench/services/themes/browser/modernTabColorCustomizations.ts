/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Color } from '../../../../base/common/color.js';
import { ColorIdentifier, editorBackground } from '../../../../platform/theme/common/colorRegistry.js';
import { IColorTheme, registerThemingParticipant } from '../../../../platform/theme/common/themeService.js';
import { MODERN_TAB_ACTIVE_ACTION_BACKGROUND, MODERN_TAB_ACTIVE_BACKGROUND, MODERN_TAB_ACTIVE_FOREGROUND, MODERN_TAB_HOVER_ACTION_BACKGROUND, MODERN_TAB_HOVER_BACKGROUND, MODERN_TAB_HOVER_FOREGROUND, TAB_ACTIVE_BACKGROUND, TAB_ACTIVE_BORDER, TAB_ACTIVE_BORDER_TOP, TAB_ACTIVE_FOREGROUND, TAB_BORDER, TAB_HOVER_BACKGROUND, TAB_HOVER_BORDER, TAB_HOVER_FOREGROUND, TAB_INACTIVE_BACKGROUND, TAB_INACTIVE_FOREGROUND, TAB_LAST_PINNED_BORDER, TAB_UNFOCUSED_ACTIVE_BACKGROUND, TAB_UNFOCUSED_ACTIVE_BORDER, TAB_UNFOCUSED_ACTIVE_BORDER_TOP, TAB_UNFOCUSED_ACTIVE_FOREGROUND, TAB_UNFOCUSED_HOVER_BACKGROUND, TAB_UNFOCUSED_HOVER_BORDER, TAB_UNFOCUSED_HOVER_FOREGROUND, TAB_UNFOCUSED_INACTIVE_BACKGROUND, TAB_UNFOCUSED_INACTIVE_FOREGROUND } from '../../../common/theme.js';
import { ColorThemeData } from '../common/colorThemeData.js';
import { IWorkbenchColorTheme } from '../common/workbenchThemeService.js';

function isWorkbenchColorTheme(theme: IColorTheme): theme is IWorkbenchColorTheme {
	return theme instanceof ColorThemeData;
}

function getLegacyColorCustomization(theme: IWorkbenchColorTheme, legacyColorId: ColorIdentifier, modernColorId?: ColorIdentifier, relatedLegacyColorId?: ColorIdentifier): Color | undefined {
	if (modernColorId && theme.getColorCustomization(modernColorId)) {
		return undefined;
	}
	if (!theme.getColorCustomization(legacyColorId) && (!relatedLegacyColorId || !theme.getColorCustomization(relatedLegacyColorId))) {
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
	if (!isWorkbenchColorTheme(theme)) {
		return;
	}

	const declarations: string[] = [];
	const activeBackground = getLegacyColorCustomization(theme, TAB_ACTIVE_BACKGROUND, MODERN_TAB_ACTIVE_BACKGROUND);
	const unfocusedActiveBackground = getLegacyColorCustomization(theme, TAB_UNFOCUSED_ACTIVE_BACKGROUND, MODERN_TAB_ACTIVE_BACKGROUND, TAB_ACTIVE_BACKGROUND);
	const inactiveBackground = getLegacyColorCustomization(theme, TAB_INACTIVE_BACKGROUND);
	const unfocusedInactiveBackground = getLegacyColorCustomization(theme, TAB_UNFOCUSED_INACTIVE_BACKGROUND, undefined, TAB_INACTIVE_BACKGROUND);
	const hoverBackground = getLegacyColorCustomization(theme, TAB_HOVER_BACKGROUND, MODERN_TAB_HOVER_BACKGROUND);
	const unfocusedHoverBackground = getLegacyColorCustomization(theme, TAB_UNFOCUSED_HOVER_BACKGROUND, MODERN_TAB_HOVER_BACKGROUND, TAB_HOVER_BACKGROUND);
	const editorBackgroundColor = theme.getColor(editorBackground);

	addColorVariable(declarations, '--modern-ui-editor-tab-active-background', activeBackground);
	addColorVariable(declarations, '--modern-ui-editor-tab-unfocused-active-background', unfocusedActiveBackground);
	addColorVariable(declarations, '--modern-ui-editor-tab-inactive-background', inactiveBackground);
	addColorVariable(declarations, '--modern-ui-editor-tab-unfocused-inactive-background', unfocusedInactiveBackground);
	addColorVariable(declarations, '--modern-ui-editor-tab-hover-background', hoverBackground);
	addColorVariable(declarations, '--modern-ui-editor-tab-unfocused-hover-background', unfocusedHoverBackground);
	addColorVariable(declarations, '--modern-ui-editor-tab-active-foreground', getLegacyColorCustomization(theme, TAB_ACTIVE_FOREGROUND, MODERN_TAB_ACTIVE_FOREGROUND));
	addColorVariable(declarations, '--modern-ui-editor-tab-unfocused-active-foreground', getLegacyColorCustomization(theme, TAB_UNFOCUSED_ACTIVE_FOREGROUND, MODERN_TAB_ACTIVE_FOREGROUND, TAB_ACTIVE_FOREGROUND));
	addColorVariable(declarations, '--modern-ui-editor-tab-inactive-foreground', getLegacyColorCustomization(theme, TAB_INACTIVE_FOREGROUND));
	addColorVariable(declarations, '--modern-ui-editor-tab-unfocused-inactive-foreground', getLegacyColorCustomization(theme, TAB_UNFOCUSED_INACTIVE_FOREGROUND, undefined, TAB_INACTIVE_FOREGROUND));
	addColorVariable(declarations, '--modern-ui-editor-tab-hover-foreground', getLegacyColorCustomization(theme, TAB_HOVER_FOREGROUND, MODERN_TAB_HOVER_FOREGROUND));
	addColorVariable(declarations, '--modern-ui-editor-tab-unfocused-hover-foreground', getLegacyColorCustomization(theme, TAB_UNFOCUSED_HOVER_FOREGROUND, MODERN_TAB_HOVER_FOREGROUND, TAB_HOVER_FOREGROUND));
	addColorVariable(declarations, '--modern-ui-editor-tab-border', getLegacyColorCustomization(theme, TAB_BORDER));
	addColorVariable(declarations, '--modern-ui-editor-tab-last-pinned-border', getLegacyColorCustomization(theme, TAB_LAST_PINNED_BORDER));
	addColorVariable(declarations, '--modern-ui-editor-tab-active-border', getLegacyColorCustomization(theme, TAB_ACTIVE_BORDER));
	addColorVariable(declarations, '--modern-ui-editor-tab-unfocused-active-border', getLegacyColorCustomization(theme, TAB_UNFOCUSED_ACTIVE_BORDER, undefined, TAB_ACTIVE_BORDER));
	addColorVariable(declarations, '--modern-ui-editor-tab-active-border-top', getLegacyColorCustomization(theme, TAB_ACTIVE_BORDER_TOP));
	addColorVariable(declarations, '--modern-ui-editor-tab-unfocused-active-border-top', getLegacyColorCustomization(theme, TAB_UNFOCUSED_ACTIVE_BORDER_TOP, undefined, TAB_ACTIVE_BORDER_TOP));
	addColorVariable(declarations, '--modern-ui-editor-tab-hover-border', getLegacyColorCustomization(theme, TAB_HOVER_BORDER));
	addColorVariable(declarations, '--modern-ui-editor-tab-unfocused-hover-border', getLegacyColorCustomization(theme, TAB_UNFOCUSED_HOVER_BORDER, undefined, TAB_HOVER_BORDER));

	if (activeBackground && !theme.getColorCustomization(MODERN_TAB_ACTIVE_ACTION_BACKGROUND)) {
		addColorVariable(declarations, '--modern-ui-editor-tab-action-active-background', flattenActionBackground(activeBackground, editorBackgroundColor));
	}
	if (unfocusedActiveBackground && !theme.getColorCustomization(MODERN_TAB_ACTIVE_ACTION_BACKGROUND)) {
		addColorVariable(declarations, '--modern-ui-editor-tab-action-unfocused-active-background', flattenActionBackground(unfocusedActiveBackground, editorBackgroundColor));
	}
	if (hoverBackground && !theme.getColorCustomization(MODERN_TAB_HOVER_ACTION_BACKGROUND)) {
		addColorVariable(declarations, '--modern-ui-editor-tab-action-hover-background', flattenActionBackground(hoverBackground, editorBackgroundColor));
	}
	if (unfocusedHoverBackground && !theme.getColorCustomization(MODERN_TAB_HOVER_ACTION_BACKGROUND)) {
		addColorVariable(declarations, '--modern-ui-editor-tab-action-unfocused-hover-background', flattenActionBackground(unfocusedHoverBackground, editorBackgroundColor));
	}

	if (declarations.length > 0) {
		// Same selector/specificity as the defaults in tabs.css; relies on theme CSS being injected after bundled styles so these overrides win.
		collector.addRule(`.modern-ui-tabs.monaco-workbench { ${declarations.join('\n')} }`);
	}
});
