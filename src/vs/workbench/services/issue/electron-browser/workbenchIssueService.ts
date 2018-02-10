/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { IssueReporterStyles, IIssueService, IssueReporterData } from 'vs/platform/issue/common/issue';
import { TPromise } from 'vs/base/common/winjs.base';
import { ITheme, IThemeService } from 'vs/platform/theme/common/themeService';
import { textLinkForeground, inputBackground, inputBorder, inputForeground, buttonBackground, buttonHoverBackground, buttonForeground, inputValidationErrorBorder, foreground, inputActiveOptionBorder, scrollbarSliderActiveBackground, scrollbarSliderBackground, scrollbarSliderHoverBackground } from 'vs/platform/theme/common/colorRegistry';
import { SIDE_BAR_BACKGROUND } from 'vs/workbench/common/theme';
import { IExtensionManagementService, IExtensionEnablementService, LocalExtensionType } from 'vs/platform/extensionManagement/common/extensionManagement';
import { getGalleryExtensionIdFromLocal } from 'vs/platform/extensionManagement/common/extensionManagementUtil';
import { webFrame } from 'electron';
import { assign } from 'vs/base/common/objects';
import { IWorkbenchIssueService } from 'vs/workbench/services/issue/common/issue';

export class WorkbenchIssueService implements IWorkbenchIssueService {
	_serviceBrand: any;

	constructor(
		@IIssueService private issueService: IIssueService,
		@IThemeService private themeService: IThemeService,
		@IExtensionManagementService private extensionManagementService: IExtensionManagementService,
		@IExtensionEnablementService private extensionEnablementService: IExtensionEnablementService
	) {
	}

	openReporter(dataOverrides: Partial<IssueReporterData> = {}): TPromise<void> {
		return this.extensionManagementService.getInstalled(LocalExtensionType.User).then(extensions => {
			const enabledExtensions = extensions.filter(extension => this.extensionEnablementService.isEnabled({ id: getGalleryExtensionIdFromLocal(extension) }));
			const theme = this.themeService.getTheme();
			const issueReporterData: IssueReporterData = assign(
				{
					styles: getIssueReporterStyles(theme),
					zoomLevel: webFrame.getZoomLevel(),
					enabledExtensions
				},
				dataOverrides);

			return this.issueService.openReporter(issueReporterData);
		});
	}
}

export function getIssueReporterStyles(theme: ITheme): IssueReporterStyles {
	return {
		backgroundColor: theme.getColor(SIDE_BAR_BACKGROUND) && theme.getColor(SIDE_BAR_BACKGROUND).toString(),
		color: theme.getColor(foreground).toString(),
		textLinkColor: theme.getColor(textLinkForeground) && theme.getColor(textLinkForeground).toString(),
		inputBackground: theme.getColor(inputBackground) && theme.getColor(inputBackground).toString(),
		inputForeground: theme.getColor(inputForeground) && theme.getColor(inputForeground).toString(),
		inputBorder: theme.getColor(inputBorder) && theme.getColor(inputBorder).toString(),
		inputActiveBorder: theme.getColor(inputActiveOptionBorder) && theme.getColor(inputActiveOptionBorder).toString(),
		inputErrorBorder: theme.getColor(inputValidationErrorBorder) && theme.getColor(inputValidationErrorBorder).toString(),
		buttonBackground: theme.getColor(buttonBackground) && theme.getColor(buttonBackground).toString(),
		buttonForeground: theme.getColor(buttonForeground) && theme.getColor(buttonForeground).toString(),
		buttonHoverBackground: theme.getColor(buttonHoverBackground) && theme.getColor(buttonHoverBackground).toString(),
		sliderActiveColor: theme.getColor(scrollbarSliderActiveBackground) && theme.getColor(scrollbarSliderActiveBackground).toString(),
		sliderBackgroundColor: theme.getColor(scrollbarSliderBackground) && theme.getColor(scrollbarSliderBackground).toString(),
		sliderHoverColor: theme.getColor(scrollbarSliderHoverBackground) && theme.getColor(scrollbarSliderHoverBackground).toString()
	};
}
