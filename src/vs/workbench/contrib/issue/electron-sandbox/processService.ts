/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getZoomLevel } from '../../../../base/browser/browser.js';
import { platform } from '../../../../base/common/process.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IProcessMainService, ProcessExplorerData } from '../../../../platform/process/common/process.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { activeContrastBorder, editorBackground, editorForeground, listActiveSelectionBackground, listActiveSelectionForeground, listFocusBackground, listFocusForeground, listFocusOutline, listHoverBackground, listHoverForeground, scrollbarShadow, scrollbarSliderActiveBackground, scrollbarSliderBackground, scrollbarSliderHoverBackground } from '../../../../platform/theme/common/colorRegistry.js';
import { IColorTheme, IThemeService } from '../../../../platform/theme/common/themeService.js';
import { INativeWorkbenchEnvironmentService } from '../../../services/environment/electron-sandbox/environmentService.js';
import { IWorkbenchProcessService } from '../common/issue.js';
import { mainWindow } from '../../../../base/browser/window.js';

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
