/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getZoomLevel } from 'vs/base/browser/browser';
import { ipcRenderer } from 'vs/base/parts/sandbox/electron-sandbox/globals';
import { IExtensionManagementService } from 'vs/platform/extensionManagement/common/extensionManagement';
import { ExtensionIdentifier, ExtensionType, ExtensionIdentifierSet } from 'vs/platform/extensions/common/extensions';
import { InstantiationType, registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { IIssueMainService, IssueReporterData, IssueReporterExtensionData, IssueReporterStyles } from 'vs/platform/issue/common/issue';
import { buttonBackground, buttonForeground, buttonHoverBackground, foreground, inputActiveOptionBorder, inputBackground, inputBorder, inputForeground, inputValidationErrorBackground, inputValidationErrorBorder, inputValidationErrorForeground, scrollbarSliderActiveBackground, scrollbarSliderBackground, scrollbarSliderHoverBackground, textLinkActiveForeground, textLinkForeground } from 'vs/platform/theme/common/colorRegistry';
import { IColorTheme, IThemeService } from 'vs/platform/theme/common/themeService';
import { IWorkspaceTrustManagementService } from 'vs/platform/workspace/common/workspaceTrust';
import { SIDE_BAR_BACKGROUND } from 'vs/workbench/common/theme';
import { IWorkbenchAssignmentService } from 'vs/workbench/services/assignment/common/assignmentService';
import { IAuthenticationService } from 'vs/workbench/services/authentication/common/authentication';
import { IWorkbenchExtensionEnablementService } from 'vs/workbench/services/extensionManagement/common/extensionManagement';
import { IIntegrityService } from 'vs/workbench/services/integrity/common/integrity';
import { IWorkbenchIssueService } from 'vs/workbench/contrib/issue/common/issue';
import { mainWindow } from 'vs/base/browser/window';
import { IMenuService, MenuId } from 'vs/platform/actions/common/actions';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';

export class NativeIssueService implements IWorkbenchIssueService {
	declare readonly _serviceBrand: undefined;
	private extensionIdentifierSet: ExtensionIdentifierSet = new ExtensionIdentifierSet();

	constructor(
		@IIssueMainService private readonly issueMainService: IIssueMainService,
		@IThemeService private readonly themeService: IThemeService,
		@IExtensionManagementService private readonly extensionManagementService: IExtensionManagementService,
		@IWorkbenchExtensionEnablementService private readonly extensionEnablementService: IWorkbenchExtensionEnablementService,
		@IWorkspaceTrustManagementService private readonly workspaceTrustManagementService: IWorkspaceTrustManagementService,
		@IWorkbenchAssignmentService private readonly experimentService: IWorkbenchAssignmentService,
		@IAuthenticationService private readonly authenticationService: IAuthenticationService,
		@IIntegrityService private readonly integrityService: IIntegrityService,
		@IMenuService private readonly menuService: IMenuService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService
	) {
		ipcRenderer.on('vscode:triggerReporterMenu', async (event, arg) => {
			const extensionId = arg.extensionId;

			// creates menu from contributed
			const menu = this.menuService.createMenu(MenuId.IssueReporter, this.contextKeyService);

			// render menu and dispose
			const actions = menu.getActions({ renderShortTitle: true }).flatMap(entry => entry[1]);
			actions.forEach(async action => {
				try {
					if (action.item && 'source' in action.item && action.item.source?.id === extensionId) {
						this.extensionIdentifierSet.add(extensionId);
						await action.run();
					}
				} catch (error) {
					console.error(error);
				}
			});

			if (!this.extensionIdentifierSet.has(extensionId)) {
				// send undefined to indicate no action was taken
				ipcRenderer.send(`vscode:triggerReporterMenuResponse:${extensionId}`, undefined);
			}
			menu.dispose();
		});
	}

	async openReporter(dataOverrides: Partial<IssueReporterData> = {}): Promise<void> {
		const extensionData: IssueReporterExtensionData[] = [];
		try {
			const extensions = await this.extensionManagementService.getInstalled();
			const enabledExtensions = extensions.filter(extension => this.extensionEnablementService.isEnabled(extension) || (dataOverrides.extensionId && extension.identifier.id === dataOverrides.extensionId));
			extensionData.push(...enabledExtensions.map((extension): IssueReporterExtensionData => {
				const { manifest } = extension;
				const manifestKeys = manifest.contributes ? Object.keys(manifest.contributes) : [];
				const isTheme = !manifest.main && !manifest.browser && manifestKeys.length === 1 && manifestKeys[0] === 'themes';
				const isBuiltin = extension.type === ExtensionType.System;
				return {
					name: manifest.name,
					publisher: manifest.publisher,
					version: manifest.version,
					repositoryUrl: manifest.repository && manifest.repository.url,
					bugsUrl: manifest.bugs && manifest.bugs.url,
					displayName: manifest.displayName,
					id: extension.identifier.id,
					data: dataOverrides.data,
					uri: dataOverrides.uri,
					isTheme,
					isBuiltin,
					extensionData: 'Extensions data loading',
				};
			}));
		} catch (e) {
			extensionData.push({
				name: 'Workbench Issue Service',
				publisher: 'Unknown',
				version: '0.0.0',
				repositoryUrl: undefined,
				bugsUrl: undefined,
				extensionData: 'Extensions data loading',
				displayName: `Extensions not loaded: ${e}`,
				id: 'workbench.issue',
				isTheme: false,
				isBuiltin: true
			});
		}
		const experiments = await this.experimentService.getCurrentExperiments();

		let githubAccessToken = '';
		try {
			const githubSessions = await this.authenticationService.getSessions('github');
			const potentialSessions = githubSessions.filter(session => session.scopes.includes('repo'));
			githubAccessToken = potentialSessions[0]?.accessToken;
		} catch (e) {
			// Ignore
		}

		// air on the side of caution and have false be the default
		let isUnsupported = false;
		try {
			isUnsupported = !(await this.integrityService.isPure()).isPure;
		} catch (e) {
			// Ignore
		}

		const theme = this.themeService.getColorTheme();
		const issueReporterData: IssueReporterData = Object.assign({
			styles: getIssueReporterStyles(theme),
			zoomLevel: getZoomLevel(mainWindow),
			enabledExtensions: extensionData,
			experiments: experiments?.join('\n'),
			restrictedMode: !this.workspaceTrustManagementService.isWorkspaceTrusted(),
			isUnsupported,
			githubAccessToken
		}, dataOverrides);

		if (issueReporterData.extensionId) {
			const extensionExists = extensionData.some(extension => ExtensionIdentifier.equals(extension.id, issueReporterData.extensionId));
			if (!extensionExists) {
				console.error(`Extension with ID ${issueReporterData.extensionId} does not exist.`);
			}
		}

		if (issueReporterData.extensionId && this.extensionIdentifierSet.has(issueReporterData.extensionId)) {
			ipcRenderer.send(`vscode:triggerReporterMenuResponse:${issueReporterData.extensionId}`, issueReporterData);
			this.extensionIdentifierSet.delete(new ExtensionIdentifier(issueReporterData.extensionId));
		}
		return this.issueMainService.openReporter(issueReporterData);
	}

}

export function getIssueReporterStyles(theme: IColorTheme): IssueReporterStyles {
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
		inputErrorBackground: getColor(theme, inputValidationErrorBackground),
		inputErrorForeground: getColor(theme, inputValidationErrorForeground),
		buttonBackground: getColor(theme, buttonBackground),
		buttonForeground: getColor(theme, buttonForeground),
		buttonHoverBackground: getColor(theme, buttonHoverBackground),
		sliderActiveColor: getColor(theme, scrollbarSliderActiveBackground),
		sliderBackgroundColor: getColor(theme, scrollbarSliderBackground),
		sliderHoverColor: getColor(theme, scrollbarSliderHoverBackground),
	};
}

function getColor(theme: IColorTheme, key: string): string | undefined {
	const color = theme.getColor(key);
	return color ? color.toString() : undefined;
}

registerSingleton(IWorkbenchIssueService, NativeIssueService, InstantiationType.Delayed);
