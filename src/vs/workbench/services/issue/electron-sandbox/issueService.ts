/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IssueReporterStyles, IssueReporterData, ProcessExplorerData, IssueReporterExtensionData, IIssueMainService } from 'vs/platform/issue/common/issue';
import { IColorTheme, IThemeService } from 'vs/platform/theme/common/themeService';
import { textLinkForeground, inputBackground, inputBorder, inputForeground, buttonBackground, buttonHoverBackground, buttonForeground, inputValidationErrorBorder, foreground, inputActiveOptionBorder, scrollbarSliderActiveBackground, scrollbarSliderBackground, scrollbarSliderHoverBackground, editorBackground, editorForeground, listHoverBackground, listHoverForeground, textLinkActiveForeground, inputValidationErrorBackground, inputValidationErrorForeground, listActiveSelectionBackground, listActiveSelectionForeground, listFocusOutline, listFocusBackground, listFocusForeground, activeContrastBorder, scrollbarShadow } from 'vs/platform/theme/common/colorRegistry';
import { SIDE_BAR_BACKGROUND } from 'vs/workbench/common/theme';
import { IExtensionManagementService } from 'vs/platform/extensionManagement/common/extensionManagement';
import { IWorkbenchExtensionEnablementService } from 'vs/workbench/services/extensionManagement/common/extensionManagement';
import { getZoomLevel } from 'vs/base/browser/browser';
import { IIssueUriRequestHandler, IWorkbenchIssueService } from 'vs/workbench/services/issue/common/issue';
import { INativeWorkbenchEnvironmentService } from 'vs/workbench/services/environment/electron-sandbox/environmentService';
import { ExtensionType } from 'vs/platform/extensions/common/extensions';
import { platform } from 'vs/base/common/process';
import { IProductService } from 'vs/platform/product/common/productService';
import { IWorkbenchAssignmentService } from 'vs/workbench/services/assignment/common/assignmentService';
import { IAuthenticationService } from 'vs/workbench/services/authentication/common/authentication';
import { IWorkspaceTrustManagementService } from 'vs/platform/workspace/common/workspaceTrust';
import { IIntegrityService } from 'vs/workbench/services/integrity/common/integrity';
import { ipcRenderer } from 'vs/base/parts/sandbox/electron-sandbox/globals';
import { IDisposable } from 'vs/base/common/lifecycle';
import { CancellationToken } from 'vs/base/common/cancellation';
import { URI } from 'vs/base/common/uri';
import { InstantiationType, registerSingleton } from 'vs/platform/instantiation/common/extensions';

export class NativeIssueService implements IWorkbenchIssueService {
	declare readonly _serviceBrand: undefined;

	private readonly _handlers = new Map<string, IIssueUriRequestHandler>();

	constructor(
		@IIssueMainService private readonly issueMainService: IIssueMainService,
		@IThemeService private readonly themeService: IThemeService,
		@IExtensionManagementService private readonly extensionManagementService: IExtensionManagementService,
		@IWorkbenchExtensionEnablementService private readonly extensionEnablementService: IWorkbenchExtensionEnablementService,
		@INativeWorkbenchEnvironmentService private readonly environmentService: INativeWorkbenchEnvironmentService,
		@IWorkspaceTrustManagementService private readonly workspaceTrustManagementService: IWorkspaceTrustManagementService,
		@IProductService private readonly productService: IProductService,
		@IWorkbenchAssignmentService private readonly experimentService: IWorkbenchAssignmentService,
		@IAuthenticationService private readonly authenticationService: IAuthenticationService,
		@IIntegrityService private readonly integrityService: IIntegrityService,
	) {
		ipcRenderer.on('vscode:triggerIssueUriRequestHandler', async (event: unknown, request: { replyChannel: string; extensionId: string }) => {
			const result = await this.getIssueReporterUri(request.extensionId, CancellationToken.None);
			ipcRenderer.send(request.replyChannel, result.toString());
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
					hasIssueUriRequestHandler: this._handlers.has(extension.identifier.id.toLowerCase()),
					displayName: manifest.displayName,
					id: extension.identifier.id,
					isTheme,
					isBuiltin,
				};
			}));
		} catch (e) {
			extensionData.push({
				name: 'Workbench Issue Service',
				publisher: 'Unknown',
				version: '0.0.0',
				repositoryUrl: undefined,
				bugsUrl: undefined,
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
			zoomLevel: getZoomLevel(),
			enabledExtensions: extensionData,
			experiments: experiments?.join('\n'),
			restrictedMode: !this.workspaceTrustManagementService.isWorkspaceTrusted(),
			isUnsupported,
			githubAccessToken
		}, dataOverrides);
		return this.issueMainService.openReporter(issueReporterData);
	}

	openProcessExplorer(): Promise<void> {
		const theme = this.themeService.getColorTheme();
		const data: ProcessExplorerData = {
			pid: this.environmentService.mainPid,
			zoomLevel: getZoomLevel(),
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
		return this.issueMainService.openProcessExplorer(data);
	}

	registerIssueUriRequestHandler(extensionId: string, handler: IIssueUriRequestHandler): IDisposable {
		this._handlers.set(extensionId.toLowerCase(), handler);
		return {
			dispose: () => this._handlers.delete(extensionId)
		};
	}

	private async getIssueReporterUri(extensionId: string, token: CancellationToken): Promise<URI> {
		const handler = this._handlers.get(extensionId);
		if (!handler) {
			throw new Error(`No issue uri request handler registered for extension '${extensionId}'`);
		}
		return handler.provideIssueUrl(token);
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
