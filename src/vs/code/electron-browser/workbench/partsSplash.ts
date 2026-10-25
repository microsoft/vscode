/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { IPartsSplash } from '../../../platform/theme/common/themeService.js';

export function getPartsSplashLayoutMetrics(layoutInfo: NonNullable<IPartsSplash['layoutInfo']>) {
	const compact = layoutInfo.modernUICompact === true;
	return {
		floatingMargin: compact ? 0 : 4,
		floatingOuterMargin: compact ? 0 : 4,
		floatingBorderWidth: 1,
		floatingBorderRadius: compact ? 0 : 8,
	};
}

export function getPartsSplashColors(splash: IPartsSplash, hasFocus: boolean, hasWorkspace: boolean) {
	const { colorInfo } = splash;
	const titleBarBackground = (hasFocus ? colorInfo.titleBarBackground : colorInfo.titleBarInactiveBackground ?? colorInfo.titleBarBackground) ?? colorInfo.background;
	const modernUIShellBackground = hasFocus ? colorInfo.modernUIShellBackground : colorInfo.modernUIInactiveShellBackground ?? colorInfo.modernUIShellBackground;
	const statusBarBackground = hasWorkspace
		? hasFocus ? colorInfo.statusBarBackground : colorInfo.statusBarInactiveBackground ?? colorInfo.statusBarBackground
		: colorInfo.statusBarNoFolderBackground;

	return {
		background: splash.layoutInfo?.modernUI === true ? modernUIShellBackground ?? titleBarBackground : colorInfo.editorBackground,
		titleBarBackground,
		statusBarBackground,
	};
}
