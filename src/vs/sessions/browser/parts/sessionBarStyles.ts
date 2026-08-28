/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Color } from '../../../base/common/color.js';
import { ColorIdentifier } from '../../../platform/theme/common/colorRegistry.js';
import { IColorTheme } from '../../../platform/theme/common/themeService.js';
import { MODERN_EDITOR_TAB_ACTIVE_BACKGROUND, MODERN_EDITOR_TAB_ACTIVE_HOVER_BACKGROUND, MODERN_EDITOR_TAB_HOVER_BACKGROUND, PANEL_ACTIVE_TITLE_BORDER, PANEL_ACTIVE_TITLE_FOREGROUND, PANEL_INACTIVE_TITLE_FOREGROUND, TAB_ACTIVE_BACKGROUND, TAB_HOVER_BACKGROUND, TAB_UNFOCUSED_ACTIVE_BACKGROUND, TAB_UNFOCUSED_HOVER_BACKGROUND } from '../../../workbench/common/theme.js';
import { ColorThemeData } from '../../../workbench/services/themes/common/colorThemeData.js';
import { activeSessionViewBackground, activeSessionViewForeground, agentsPanelBackground, inactiveSessionViewBackground, inactiveSessionViewForeground } from '../../common/theme.js';

/**
 * Applies the shared session bar CSS custom properties onto the given container.
 *
 * These tokens drive the foreground/background/border treatment that the session
 * header and the chat tab strip share, so both surfaces stay visually in sync.
 */
export function applySessionBarThemeColors(container: HTMLElement, theme: IColorTheme): void {
	const bg = theme.getColor(agentsPanelBackground);
	const activeFg = theme.getColor(PANEL_ACTIVE_TITLE_FOREGROUND);
	const inactiveFg = theme.getColor(PANEL_INACTIVE_TITLE_FOREGROUND);
	const activeBorder = theme.getColor(PANEL_ACTIVE_TITLE_BORDER);

	container.style.setProperty('--chat-bar-background', bg?.toString() ?? '');
	container.style.setProperty('--chat-tab-active-foreground', activeFg?.toString() ?? '');
	container.style.setProperty('--chat-tab-inactive-foreground', inactiveFg?.toString() ?? '');
	container.style.setProperty('--chat-tab-active-border', activeBorder?.toString() ?? '');
}

export function applySessionViewThemeColors(container: HTMLElement, theme: IColorTheme, active: boolean): void {
	const background = theme.getColor(active ? activeSessionViewBackground : inactiveSessionViewBackground);
	const foreground = theme.getColor(active ? activeSessionViewForeground : inactiveSessionViewForeground);
	const activeTabBackground = theme.getColor(MODERN_EDITOR_TAB_ACTIVE_BACKGROUND);
	const hoverTabBackground = theme.getColor(MODERN_EDITOR_TAB_HOVER_BACKGROUND);
	const activeHoverTabBackground = theme.getColor(MODERN_EDITOR_TAB_ACTIVE_HOVER_BACKGROUND);
	const unfocusedActiveTabBackground = getLegacyTabBackgroundCustomization(theme, TAB_UNFOCUSED_ACTIVE_BACKGROUND, TAB_ACTIVE_BACKGROUND) ?? activeTabBackground;
	const legacyUnfocusedHoverTabBackground = getLegacyTabBackgroundCustomization(theme, TAB_UNFOCUSED_HOVER_BACKGROUND, TAB_HOVER_BACKGROUND);
	const unfocusedHoverTabBackground = legacyUnfocusedHoverTabBackground ?? hoverTabBackground;
	const unfocusedActiveHoverTabBackground = legacyUnfocusedHoverTabBackground ?? activeHoverTabBackground;

	container.style.setProperty('--session-view-background', background?.toString() ?? '');
	container.style.setProperty('--session-view-foreground', foreground?.toString() ?? '');
	container.style.setProperty('--part-background', background?.toString() ?? '');
	container.style.setProperty('--part-foreground', foreground?.toString() ?? '');
	container.style.setProperty('--modern-ui-editor-tab-action-active-background', activeTabBackground && background ? activeTabBackground.makeOpaque(background).toString() : '');
	container.style.setProperty('--modern-ui-editor-tab-action-hover-background', hoverTabBackground && background ? hoverTabBackground.makeOpaque(background).toString() : '');
	container.style.setProperty('--modern-ui-editor-tab-action-active-hover-background', activeHoverTabBackground && background ? activeHoverTabBackground.makeOpaque(background).toString() : '');
	container.style.setProperty('--modern-ui-editor-tab-action-unfocused-active-background', unfocusedActiveTabBackground && background ? unfocusedActiveTabBackground.makeOpaque(background).toString() : '');
	container.style.setProperty('--modern-ui-editor-tab-action-unfocused-hover-background', unfocusedHoverTabBackground && background ? unfocusedHoverTabBackground.makeOpaque(background).toString() : '');
	container.style.setProperty('--modern-ui-editor-tab-action-unfocused-active-hover-background', unfocusedActiveHoverTabBackground && background ? unfocusedActiveHoverTabBackground.makeOpaque(background).toString() : '');
}

function getLegacyTabBackgroundCustomization(theme: IColorTheme, colorId: ColorIdentifier, relatedColorId: ColorIdentifier): Color | undefined {
	if (theme instanceof ColorThemeData && !theme.getColorCustomization(colorId) && !theme.getColorCustomization(relatedColorId)) {
		return undefined;
	}
	return theme.getColor(colorId);
}
