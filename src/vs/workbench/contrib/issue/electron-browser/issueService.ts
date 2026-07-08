/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getZoomLevel } from '../../../../base/browser/browser.js';
import { mainWindow } from '../../../../base/browser/window.js';
import { DeferredPromise } from '../../../../base/common/async.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IExtensionManagementService } from '../../../../platform/extensionManagement/common/extensionManagement.js';
import { ExtensionType } from '../../../../platform/extensions/common/extensions.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { buttonBackground, buttonForeground, buttonHoverBackground, foreground, inputActiveOptionBorder, inputBackground, inputBorder, inputForeground, inputValidationErrorBackground, inputValidationErrorBorder, inputValidationErrorForeground, scrollbarSliderActiveBackground, scrollbarSliderHoverBackground, textLinkActiveForeground, textLinkForeground } from '../../../../platform/theme/common/colorRegistry.js';
import { IColorTheme, IThemeService } from '../../../../platform/theme/common/themeService.js';
import { IWorkspaceTrustManagementService } from '../../../../platform/workspace/common/workspaceTrust.js';
import { SIDE_BAR_BACKGROUND } from '../../../common/theme.js';
import { IIssueFormService, IssueReporterData, IssueReporterExtensionData, IssueReporterStyles, IWorkbenchIssueService } from '../common/issue.js';
import { IWorkbenchAssignmentService } from '../../../services/assignment/common/assignmentService.js';
import { IAuthenticationService } from '../../../services/authentication/common/authentication.js';
import { IWorkbenchExtensionEnablementService } from '../../../services/extensionManagement/common/extensionManagement.js';
import { IWorkbenchEnvironmentService } from '../../../services/environment/common/environmentService.js';
import { IIntegrityService } from '../../../services/integrity/common/integrity.js';

export class NativeIssueService implements IWorkbenchIssueService {
	declare readonly _serviceBrand: undefined;

	constructor(
		@IIssueFormService private readonly issueFormService: IIssueFormService,
		@IThemeService private readonly themeService: IThemeService,
		@IExtensionManagementService private readonly extensionManagementService: IExtensionManagementService,
		@IWorkbenchExtensionEnablementService private readonly extensionEnablementService: IWorkbenchExtensionEnablementService,
		@IWorkspaceTrustManagementService private readonly workspaceTrustManagementService: IWorkspaceTrustManagementService,
		@IWorkbenchAssignmentService private readonly experimentService: IWorkbenchAssignmentService,
		@IAuthenticationService private readonly authenticationService: IAuthenticationService,
		@IIntegrityService private readonly integrityService: IIntegrityService,
		@IWorkbenchEnvironmentService private readonly environmentService: IWorkbenchEnvironmentService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
	) { }

	async openReporter(dataOverrides: Partial<IssueReporterData> = {}): Promise<void> {
		const useWizard = this.configurationService.getValue<boolean>('issueReporter.wizard.enabled');

		if (useWizard) {
			// New wizard: show UI immediately, load data in background
			return this.openWizardReporter(dataOverrides);
		} else {
			// Old reporter: collect all data first, then open
			return this.openLegacyReporter(dataOverrides);
		}
	}

	private async openWizardReporter(dataOverrides: Partial<IssueReporterData>): Promise<void> {
		const theme = this.themeService.getColorTheme();
		const extensionsLoaded = new DeferredPromise<void>();
		const dataComplete = new DeferredPromise<void>();
		const issueReporterData: IssueReporterData = Object.assign({
			styles: getIssueReporterStyles(theme),
			zoomLevel: getZoomLevel(mainWindow),
			enabledExtensions: [],
			whenExtensionsLoaded: extensionsLoaded.p,
			whenDataComplete: dataComplete.p,
			restrictedMode: !this.workspaceTrustManagementService.isWorkspaceTrusted(),
			isInstallationPure: true,
			isSessionsWindow: this.environmentService.isSessionsWindow,
			githubAccessToken: '',
		}, dataOverrides);

		const openPromise = this.issueFormService.openReporter(issueReporterData);
		this.populateReporterDataAsync(issueReporterData, dataOverrides, extensionsLoaded).then(() => dataComplete.complete(), () => dataComplete.complete());
		return openPromise;
	}

	private async openLegacyReporter(dataOverrides: Partial<IssueReporterData>): Promise<void> {
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
			// Surface the load failure in the issue body so triage doesn't mistake an
			// empty list for "no extensions installed".
			extensionData.push({
				name: 'Extensions not loaded',
				publisher: undefined,
				version: '',
				id: 'extensions-load-error',
				isTheme: false,
				isBuiltin: false,
				displayName: undefined,
				repositoryUrl: undefined,
				bugsUrl: undefined,
				extensionData: `Extensions could not be loaded: ${e instanceof Error ? e.message : String(e)}`,
			});
		}

		const experiments = await this.experimentService.getCurrentExperiments();

		let githubAccessToken = '';
		try {
			const githubSessions = await this.authenticationService.getSessions('github');
			const repoSession = githubSessions.find(session => session.scopes.includes('repo'));
			githubAccessToken = repoSession?.accessToken ?? '';
		} catch (e) {
			// Ignore
		}

		let isInstallationPure = true;
		try {
			isInstallationPure = (await this.integrityService.isPure()).isPure;
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
			isInstallationPure,
			isSessionsWindow: this.environmentService.isSessionsWindow,
			githubAccessToken,
		}, dataOverrides);

		return this.issueFormService.openReporter(issueReporterData);
	}

	private async populateReporterDataAsync(data: IssueReporterData, dataOverrides: Partial<IssueReporterData>, extensionsLoaded?: DeferredPromise<void>): Promise<void> {
		// Extensions
		try {
			const extensions = await this.extensionManagementService.getInstalled();
			const enabledExtensions = extensions.filter(extension => this.extensionEnablementService.isEnabled(extension) || (dataOverrides.extensionId && extension.identifier.id === dataOverrides.extensionId));
			data.enabledExtensions = enabledExtensions.map((extension): IssueReporterExtensionData => {
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
			});
		} catch (e) {
			// Ignore — extensions will be empty
		} finally {
			extensionsLoaded?.complete();
		}

		// Experiments
		try {
			const experiments = await this.experimentService.getCurrentExperiments();
			data.experiments = experiments?.join('\n');
		} catch (e) {
			// Ignore
		}

		// GitHub access token — only fetch existing sessions, never prompt
		try {
			const githubSessions = await this.authenticationService.getSessions('github');
			const repoSession = githubSessions.find(session => session.scopes.includes('repo'));
			data.githubAccessToken = repoSession?.accessToken ?? '';
		} catch (e) {
			// Ignore
		}

		// Integrity check
		try {
			data.isInstallationPure = (await this.integrityService.isPure()).isPure;
		} catch (e) {
			// Ignore
		}
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
		sliderBackgroundColor: getColor(theme, SIDE_BAR_BACKGROUND),
		sliderHoverColor: getColor(theme, scrollbarSliderHoverBackground),
	};
}

function getColor(theme: IColorTheme, key: string): string | undefined {
	const color = theme.getColor(key);
	return color ? color.toString() : undefined;
}

registerSingleton(IWorkbenchIssueService, NativeIssueService, InstantiationType.Delayed);
