/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getZoomLevel } from 'vs/base/browser/browser';
import { platform } from 'vs/base/common/process';
import { InstantiationType, registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { IProcessMainService, ProcessExplorerData } from 'vs/platform/issue/common/issue';
import { IProductService } from 'vs/platform/product/common/productService';
import { activeContrastBorder, editorBackground, editorForeground, listActiveSelectionBackground, listActiveSelectionForeground, listFocusBackground, listFocusForeground, listFocusOutline, listHoverBackground, listHoverForeground, scrollbarShadow, scrollbarSliderActiveBackground, scrollbarSliderBackground, scrollbarSliderHoverBackground } from 'vs/platform/theme/common/colorRegistry';
import { IColorTheme, IThemeService } from 'vs/platform/theme/common/themeService';
import { INativeWorkbenchEnvironmentService } from 'vs/workbench/services/environment/electron-sandbox/environmentService';
import { IWorkbenchProcessService } from 'vs/workbench/contrib/issue/common/issue';
import { mainWindow } from 'vs/base/browser/window';

export class ProcessService implements IWorkbenchProcessService {
	declare readonly _serviceBrand: undefined;

	constructor(
		@IProcessMainService private readonly processMainService: IProcessMainService,
		@IThemeService private readonly themeService: IThemeService,
		@INativeWorkbenchEnvironmentService private readonly environmentService: INativeWorkbenchEnvironmentService,
		@IProductService private readonly productService: IProductService,
	) { }

	openProcessExplorer(): Promise<void> {
		const theme = this.themeService.getColorTheme();
		const data: ProcessExplorerData = {
			pid: this.environmentService.mainPid,
			zoomLevel: getZoomLevel(mainWindow),
			styles: {
				backgroundColor: getColor(theme, editorBackground),
				color: getColor(theme, editorForeground),
				listHoverBackground: getColor(theme, listHoverBackground),
				listHoverForeground: getColor(theme, listHoverForeground),
				listFocusBackground: getColor(theme, listFocusBackground),
				listFocusForeground: getColor(theme, listFocusForeground),
				listFocusOutline: getColor(theme, listFocusOutline),
				listActiveSelectionBackground: getColor(theme, listActiveSelectionBackground),
				listActiveSelectionForeground: getColor(theme, listActiveSelectionForeground),
				listHoverOutline: getColor(theme, activeContrastBorder),
				scrollbarShadowColor: getColor(theme, scrollbarShadow),
				scrollbarSliderActiveBackgroundColor: getColor(theme, scrollbarSliderActiveBackground),
				scrollbarSliderBackgroundColor: getColor(theme, scrollbarSliderBackground),
				scrollbarSliderHoverBackgroundColor: getColor(theme, scrollbarSliderHoverBackground),
			},
			platform: platform,
			applicationName: this.productService.applicationName
		};
		return this.processMainService.openProcessExplorer(data);
	}


}

function getColor(theme: IColorTheme, key: string): string | undefined {
	const color = theme.getColor(key);
	return color ? color.toString() : undefined;
}

registerSingleton(IWorkbenchProcessService, ProcessService, InstantiationType.Delayed);
