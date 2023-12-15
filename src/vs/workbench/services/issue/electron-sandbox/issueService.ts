/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getZoomLevel } from 'vs/base/browser/browser';
import { CancellationToken } from 'vs/base/common/cancellation';
import { IDisposable } from 'vs/base/common/lifecycle';
import { platform } from 'vs/base/common/process';
import { URI } from 'vs/base/common/uri';
import { ipcRenderer } from 'vs/base/parts/sandbox/electron-sandbox/globals';
import { IExtensionManagementService } from 'vs/platform/extensionManagement/common/extensionManagement';
import { ExtensionIdentifier, ExtensionType } from 'vs/platform/extensions/common/extensions';
import { InstantiationType, registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { IIssueMainService, IssueReporterData, IssueReporterExtensionData, IssueReporterStyles, ProcessExplorerData } from 'vs/platform/issue/common/issue';
import { IProductService } from 'vs/platform/product/common/productService';
import { activeContrastBorder, buttonBackground, buttonForeground, buttonHoverBackground, editorBackground, editorForeground, foreground, inputActiveOptionBorder, inputBackground, inputBorder, inputForeground, inputValidationErrorBackground, inputValidationErrorBorder, inputValidationErrorForeground, listActiveSelectionBackground, listActiveSelectionForeground, listFocusBackground, listFocusForeground, listFocusOutline, listHoverBackground, listHoverForeground, scrollbarShadow, scrollbarSliderActiveBackground, scrollbarSliderBackground, scrollbarSliderHoverBackground, textLinkActiveForeground, textLinkForeground } from 'vs/platform/theme/common/colorRegistry';
import { IColorTheme, IThemeService } from 'vs/platform/theme/common/themeService';
import { IWorkspaceTrustManagementService } from 'vs/platform/workspace/common/workspaceTrust';
import { SIDE_BAR_BACKGROUND } from 'vs/workbench/common/theme';
import { IWorkbenchAssignmentService } from 'vs/workbench/services/assignment/common/assignmentService';
import { IAuthenticationService } from 'vs/workbench/services/authentication/common/authentication';
import { INativeWorkbenchEnvironmentService } from 'vs/workbench/services/environment/electron-sandbox/environmentService';
import { IWorkbenchExtensionEnablementService } from 'vs/workbench/services/extensionManagement/common/extensionManagement';
import { ImplicitActivationAwareReader } from 'vs/workbench/services/extensions/common/abstractExtensionService';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';
import { IIntegrityService } from 'vs/workbench/services/integrity/common/integrity';
import { ILogService } from 'vs/platform/log/common/log';
import { IIssueDataProvider, IIssueUriRequestHandler, IWorkbenchIssueService } from 'vs/workbench/services/issue/common/issue';
import { mainWindow } from 'vs/base/browser/window';

export class NativeIssueService implements IWorkbenchIssueService {
	declare readonly _serviceBrand: undefined;

	private readonly _handlers = new Map<string, IIssueUriRequestHandler>();
	private readonly _providers = new Map<string, IIssueDataProvider>();
	private readonly _activationEventReader = new ImplicitActivationAwareReader();

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
		@IExtensionService private readonly extensionService: IExtensionService,
		@ILogService private readonly logService: ILogService,
	) {
		ipcRenderer.on('vscode:triggerIssueUriRequestHandler', async (event: unknown, request: { replyChannel: string; extensionId: string }) => {
			const result = await this.getIssueReporterUri(request.extensionId, CancellationToken.None);
			ipcRenderer.send(request.replyChannel, result.toString());
		});
		ipcRenderer.on('vscode:triggerIssueDataProvider', async (event: unknown, request: { replyChannel: string; extensionId: string }) => {
			const result = await this.getIssueData(request.extensionId, CancellationToken.None);
			ipcRenderer.send(request.replyChannel, result);
		});
		ipcRenderer.on('vscode:triggerIssueDataTemplate', async (event: unknown, request: { replyChannel: string; extensionId: string }) => {
			const result = await this.getIssueTemplate(request.extensionId, CancellationToken.None);
			ipcRenderer.send(request.replyChannel, result);
		});
		ipcRenderer.on('vscode:triggerReporterStatus', async (event, arg) => {
			const extensionId = arg.extensionId;
			const extension = await this.extensionService.getExtension(extensionId);
			if (extension) {
				const activationEvents = this._activationEventReader.readActivationEvents(extension);
				for (const activationEvent of activationEvents) {
					if (activationEvent === 'onIssueReporterOpened') {
						const eventName = `onIssueReporterOpened:${ExtensionIdentifier.toKey(extension.identifier)}`;
						try {
							await this.extensionService.activateById(extension.identifier, { startup: false, extensionId: extension.identifier, activationEvent: eventName });
						} catch (e) {
							this.logService.error(`Error activating extension ${extensionId}: ${e}`);
						}
						break;
					}
				}
			}
			const result = [this._providers.has(extensionId.toLowerCase()), this._handlers.has(extensionId.toLowerCase())];
			ipcRenderer.send('vscode:triggerReporterStatusResponse', result);
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
					hasIssueDataProviders: this._providers.has(extension.identifier.id.toLowerCase()),
					displayName: manifest.displayName,
					id: extension.identifier.id,
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
		return this.issueMainService.openReporter(issueReporterData);
	}

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

	registerIssueDataProvider(extensionId: string, handler: IIssueDataProvider): IDisposable {
		this._providers.set(extensionId.toLowerCase(), handler);
		return {
			dispose: () => this._providers.delete(extensionId)
		};
	}

	private async getIssueData(extensionId: string, token: CancellationToken): Promise<string> {
		const provider = this._providers.get(extensionId);
		if (!provider) {
			throw new Error(`No issue uri request provider registered for extension '${extensionId}'`);
		}
		return provider.provideIssueExtensionData(token);
	}

	private async getIssueTemplate(extensionId: string, token: CancellationToken): Promise<string> {
		const provider = this._providers.get(extensionId);
		if (!provider) {
			throw new Error(`No issue uri request provider registered for extension '${extensionId}'`);
		}
		return provider.provideIssueExtensionTemplate(token);
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
