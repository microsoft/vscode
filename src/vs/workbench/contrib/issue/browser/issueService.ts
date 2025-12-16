/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getZoomLevel } from '../../../../base/browser/browser.js';
import { mainWindow } from '../../../../base/browser/window.js';
import { userAgent } from '../../../../base/common/platform.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IExtensionManagementService } from '../../../../platform/extensionManagement/common/extensionManagement.js';
import { ExtensionType, IExtensionDescription } from '../../../../platform/extensions/common/extensions.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { normalizeGitHubUrl } from '../common/issueReporterUtil.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { buttonBackground, buttonForeground, buttonHoverBackground, foreground, inputActiveOptionBorder, inputBackground, inputBorder, inputForeground, inputValidationErrorBackground, inputValidationErrorBorder, inputValidationErrorForeground, scrollbarSliderActiveBackground, scrollbarSliderBackground, scrollbarSliderHoverBackground, textLinkActiveForeground, textLinkForeground } from '../../../../platform/theme/common/colorRegistry.js';
import { IColorTheme, IThemeService } from '../../../../platform/theme/common/themeService.js';
import { IWorkspaceTrustManagementService } from '../../../../platform/workspace/common/workspaceTrust.js';
import { SIDE_BAR_BACKGROUND } from '../../../common/theme.js';
import { IIssueFormService, IssueReporterData, IssueReporterExtensionData, IssueReporterStyles, IWorkbenchIssueService } from '../common/issue.js';
import { IWorkbenchAssignmentService } from '../../../services/assignment/common/assignmentService.js';
import { IAuthenticationService } from '../../../services/authentication/common/authentication.js';
import { IWorkbenchExtensionEnablementService } from '../../../services/extensionManagement/common/extensionManagement.js';
import { IExtensionService } from '../../../services/extensions/common/extensions.js';
import { IIntegrityService } from '../../../services/integrity/common/integrity.js';


export class BrowserIssueService implements IWorkbenchIssueService {
	declare readonly _serviceBrand: undefined;

	constructor(
		@IExtensionService private readonly extensionService: IExtensionService,
		@IProductService private readonly productService: IProductService,
		@IIssueFormService private readonly issueFormService: IIssueFormService,
		@IThemeService private readonly themeService: IThemeService,
		@IWorkbenchAssignmentService private readonly experimentService: IWorkbenchAssignmentService,
		@IWorkspaceTrustManagementService private readonly workspaceTrustManagementService: IWorkspaceTrustManagementService,
		@IIntegrityService private readonly integrityService: IIntegrityService,
		@IExtensionManagementService private readonly extensionManagementService: IExtensionManagementService,
		@IWorkbenchExtensionEnablementService private readonly extensionEnablementService: IWorkbenchExtensionEnablementService,
		@IAuthenticationService private readonly authenticationService: IAuthenticationService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IOpenerService private readonly openerService: IOpenerService
	) { }

	async openReporter(options: Partial<IssueReporterData>): Promise<void> {
		// If web reporter setting is false open the old GitHub issue reporter
		if (!this.configurationService.getValue<boolean>('issueReporter.experimental.webReporter')) {
			const extensionId = options.extensionId;
			// If we don't have a extensionId, treat this as a Core issue
			if (!extensionId) {
				if (this.productService.reportIssueUrl) {
					const uri = this.getIssueUriFromStaticContent(this.productService.reportIssueUrl);
					await this.openerService.open(uri, { openExternal: true });
					return;
				}
				throw new Error(`No issue reporting URL configured for ${this.productService.nameLong}.`);
			}

			const selectedExtension = this.extensionService.extensions.filter(ext => ext.identifier.value === options.extensionId)[0];
			const extensionGitHubUrl = this.getExtensionGitHubUrl(selectedExtension);
			if (!extensionGitHubUrl) {
				throw new Error(`Unable to find issue reporting url for ${extensionId}`);
			}
			const uri = this.getIssueUriFromStaticContent(`${extensionGitHubUrl}/issues/new`, selectedExtension);
			await this.openerService.open(uri, { openExternal: true });
		}

		if (this.productService.reportIssueUrl) {
			const theme = this.themeService.getColorTheme();
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

			const extensionData: IssueReporterExtensionData[] = [];
			try {
				const extensions = await this.extensionManagementService.getInstalled();
				const enabledExtensions = extensions.filter(extension => this.extensionEnablementService.isEnabled(extension) || (options.extensionId && extension.identifier.id === options.extensionId));
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
						data: options.data,
						uri: options.uri,
						isTheme,
						isBuiltin,
						extensionData: 'Extensions data loading',
					};
				}));
			} catch (e) {
				extensionData.push({
					name: 'Workbench Issue Service',
					publisher: 'Unknown',
					version: 'Unknown',
					repositoryUrl: undefined,
					bugsUrl: undefined,
					extensionData: `Extensions not loaded: ${e}`,
					displayName: `Extensions not loaded: ${e}`,
					id: 'workbench.issue',
					isTheme: false,
					isBuiltin: true
				});
			}

			const issueReporterData: IssueReporterData = Object.assign({
				styles: getIssueReporterStyles(theme),
				zoomLevel: getZoomLevel(mainWindow),
				enabledExtensions: extensionData,
				experiments: experiments?.join('\n'),
				restrictedMode: !this.workspaceTrustManagementService.isWorkspaceTrusted(),
				isUnsupported,
				githubAccessToken
			}, options);

			return this.issueFormService.openReporter(issueReporterData);
		}
		throw new Error(`No issue reporting URL configured for ${this.productService.nameLong}.`);

	}

	private getExtensionGitHubUrl(extension: IExtensionDescription): string {
		if (extension.isBuiltin && this.productService.reportIssueUrl) {
			return normalizeGitHubUrl(this.productService.reportIssueUrl);
		}

		let repositoryUrl = '';

		const bugsUrl = extension?.bugs?.url;
		const extensionUrl = extension?.repository?.url;

		// If given, try to match the extension's bug url
		if (bugsUrl && bugsUrl.match(/^https?:\/\/github\.com\/(.*)/)) {
			repositoryUrl = normalizeGitHubUrl(bugsUrl);
		} else if (extensionUrl && extensionUrl.match(/^https?:\/\/github\.com\/(.*)/)) {
			repositoryUrl = normalizeGitHubUrl(extensionUrl);
		}

		return repositoryUrl;
	}

	private getIssueUriFromStaticContent(baseUri: string, extension?: IExtensionDescription): string {
		const issueDescription = `ADD ISSUE DESCRIPTION HERE

Version: ${this.productService.version}
Commit: ${this.productService.commit ?? 'unknown'}
User Agent: ${userAgent ?? 'unknown'}
Embedder: ${this.productService.embedderIdentifier ?? 'unknown'}
${extension?.version ? `\nExtension version: ${extension.version}` : ''}
<!-- generated by web issue reporter -->`;

		return `${baseUri}?body=${encodeURIComponent(issueDescription)}&labels=web`;
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

registerSingleton(IWorkbenchIssueService, BrowserIssueService, InstantiationType.Delayed);
