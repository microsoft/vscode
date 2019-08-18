/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IssueReporterStyles, IIssueService, IssueReporterData, ProcessExplorerData, IssueReporterExtensionData } from 'vs/platform/issue/node/issue';
import { ITheme, IThemeService } from 'vs/platform/theme/common/themeService';
import { textLinkForeground, inputBackground, inputBorder, inputForeground, buttonBackground, buttonHoverBackground, buttonForeground, inputValidationErrorBorder, foreground, inputActiveOptionBorder, scrollbarSliderActiveBackground, scrollbarSliderBackground, scrollbarSliderHoverBackground, editorBackground, editorForeground, listHoverBackground, listHoverForeground, listHighlightForeground, textLinkActiveForeground } from 'vs/platform/theme/common/colorRegistry';
import { SIDE_BAR_BACKGROUND } from 'vs/workbench/common/theme';
import { IExtensionManagementService } from 'vs/platform/extensionManagement/common/extensionManagement';
import { IExtensionEnablementService } from 'vs/workbench/services/extensionManagement/common/extensionManagement';
import { webFrame } from 'electron';
import { assign } from 'vs/base/common/objects';
import { IWorkbenchIssueService } from 'vs/workbench/contrib/issue/electron-browser/issue';
import { ExtensionType } from 'vs/platform/extensions/common/extensions';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';

export class WorkbenchIssueService implements IWorkbenchIssueService {
	_serviceBrand: any;

	constructor(
		@IIssueService private readonly issueService: IIssueService,
		@IThemeService private readonly themeService: IThemeService,
		@IExtensionManagementService private readonly extensionManagementService: IExtensionManagementService,
		@IExtensionEnablementService private readonly extensionEnablementService: IExtensionEnablementService,
		@IWorkbenchEnvironmentService private readonly environmentService: IWorkbenchEnvironmentService
	) { }

	openReporter(dataOverrides: Partial<IssueReporterData> = {}): Promise<void> {
		return this.extensionManagementService.getInstalled(ExtensionType.User).then(extensions => {
			const enabledExtensions = extensions.filter(extension => this.extensionEnablementService.isEnabled(extension));
			const extensionData: IssueReporterExtensionData[] = enabledExtensions.map(extension => {
				const { manifest } = extension;
				const manifestKeys = manifest.contributes ? Object.keys(manifest.contributes) : [];
				const isTheme = !manifest.activationEvents && manifestKeys.length === 1 && manifestKeys[0] === 'themes';

				return {
					name: manifest.name,
					publisher: manifest.publisher,
					version: manifest.version,
					repositoryUrl: manifest.repository && manifest.repository.url,
					bugsUrl: manifest.bugs && manifest.bugs.url,
					displayName: manifest.displayName,
					id: extension.identifier.id,
					isTheme: isTheme
				};
			});
			const theme = this.themeService.getTheme();
			const issueReporterData: IssueReporterData = assign(
				{
					styles: getIssueReporterStyles(theme),
					zoomLevel: webFrame.getZoomLevel(),
					enabledExtensions: extensionData
				},
				dataOverrides);

			return this.issueService.openReporter(issueReporterData);
		});
	}

	openProcessExplorer(): Promise<void> {
		const theme = this.themeService.getTheme();
		const data: ProcessExplorerData = {
			pid: this.environmentService.configuration.mainPid,
			zoomLevel: webFrame.getZoomLevel(),
			styles: {
				backgroundColor: getColor(theme, editorBackground),
				color: getColor(theme, editorForeground),
				hoverBackground: getColor(theme, listHoverBackground),
				hoverForeground: getColor(theme, listHoverForeground),
				highlightForeground: getColor(theme, listHighlightForeground),
			}
		};
		return this.issueService.openProcessExplorer(data);
	}
}

export function getIssueReporterStyles(theme: ITheme): IssueReporterStyles {
	return {
		backgroundColor: getColor(theme, SIDE_BAR_BACKGROUND),
		color: getColor(theme, foreground),
		textLinkColor: getColor(theme, textLinkForeground),
		textLinkActiveForeground: getColor(theme, textLinkActiveForeground),
		inputBackground: getColor(theme, inputBackground),
		inputForeground: getColor(theme, inputForeground),
		inputBorder: getColor(theme, inputBorder),
		inputActiveBorder: getColor(theme, inputActiveOptionBorder),
		inputErrorBorder: getColor(theme, inputValidationErrorBorder),
		buttonBackground: getColor(theme, buttonBackground),
		buttonForeground: getColor(theme, buttonForeground),
		buttonHoverBackground: getColor(theme, buttonHoverBackground),
		sliderActiveColor: getColor(theme, scrollbarSliderActiveBackground),
		sliderBackgroundColor: getColor(theme, scrollbarSliderBackground),
		sliderHoverColor: getColor(theme, scrollbarSliderHoverBackground),
	};
}

function getColor(theme: ITheme, key: string): string | undefined {
	const color = theme.getColor(key);
	return color ? color.toString() : undefined;
}
