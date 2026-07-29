/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IColorTheme } from '../../../platform/theme/common/themeService.js';
import { PANEL_ACTIVE_TITLE_BORDER, PANEL_ACTIVE_TITLE_FOREGROUND, PANEL_INACTIVE_TITLE_FOREGROUND } from '../../../workbench/common/theme.js';
import { agentsPanelBackground } from '../../common/theme.js';

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
