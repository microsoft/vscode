/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../../base/common/codicons.js';
import { Color } from '../../../../../base/common/color.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { localize } from '../../../../../nls.js';
import { asCssVariable } from '../../../../../platform/theme/common/colorUtils.js';
import { foreground } from '../../../../../platform/theme/common/colors/baseColors.js';
import { editorBackground } from '../../../../../platform/theme/common/colors/editorColors.js';
import { inputBackground } from '../../../../../platform/theme/common/colors/inputColors.js';
import { quickInputBackground } from '../../../../../platform/theme/common/colors/quickpickColors.js';
import { getIconRegistry } from '../../../../../platform/theme/common/iconRegistry.js';
import { isHighContrast } from '../../../../../platform/theme/common/theme.js';
import { IColorTheme } from '../../../../../platform/theme/common/themeService.js';
import { SIDE_BAR_BACKGROUND } from '../../../../common/theme.js';

/** A color that a workspace's icon can have. */
export interface ISessionWorkspaceColor {
	/** The theme color ID that the workspace file keeps. */
	readonly id: string;
	readonly label: string;
}

/** The colors that the Workspace editor offers, besides a custom color. */
export const SESSION_WORKSPACE_COLORS: readonly ISessionWorkspaceColor[] = [
	{ id: 'terminal.ansiRed', label: localize('workspaceColor.red', "Red") },
	{ id: 'terminal.ansiYellow', label: localize('workspaceColor.yellow', "Yellow") },
	{ id: 'terminal.ansiGreen', label: localize('workspaceColor.green', "Green") },
	{ id: 'terminal.ansiCyan', label: localize('workspaceColor.cyan', "Cyan") },
	{ id: 'terminal.ansiBlue', label: localize('workspaceColor.blue', "Blue") },
	{ id: 'terminal.ansiMagenta', label: localize('workspaceColor.magenta', "Magenta") },
];

/** Whether a workspace color is a custom `#rrggbb` color rather than a theme color ID. */
export function isCustomSessionWorkspaceColor(color: string): boolean {
	return /^#[0-9a-f]{6}$/i.test(color);
}

/** The least contrast that an icon needs against its background (WCAG 1.4.11). */
const MIN_ICON_CONTRAST = 3;

/**
 * The CSS color to draw a workspace icon in: a theme color, or a custom color where it is readable on the backgrounds
 * that workspace icons show on, otherwise the foreground. High contrast themes always use the foreground.
 */
export function getSessionWorkspaceCssColor(color: string | undefined, theme: IColorTheme): string | undefined {
	if (!color) {
		return undefined;
	}
	if (!isCustomSessionWorkspaceColor(color)) {
		return asCssVariable(color);
	}
	if (isHighContrast(theme.type)) {
		return asCssVariable(foreground);
	}
	const value = Color.fromHex(color);
	const editor = theme.getColor(editorBackground);
	const readable = [SIDE_BAR_BACKGROUND, quickInputBackground, inputBackground, editorBackground].every(id => {
		const background = theme.getColor(id);
		if (!background) {
			return true;
		}
		const opaque = editor && !background.isOpaque() ? background.makeOpaque(editor) : background;
		return value.getContrastRatio(opaque) >= MIN_ICON_CONTRAST;
	});
	return readable ? color : asCssVariable(foreground);
}

/** The icon of a workspace: the registered icon it keeps, otherwise a folder. */
export function getSessionWorkspaceIcon(icon: string | undefined): ThemeIcon {
	return icon && getIconRegistry().getIcon(icon) ? ThemeIcon.fromId(icon) : Codicon.folder;
}
