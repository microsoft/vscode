/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
/* eslint-disable local/code-import-patterns */
/* eslint-disable local/code-layering */
import { getZoomLevel } from 'vs/base/browser/browser';
import { safeInnerHtml } from 'vs/base/browser/dom';
import { mainWindow } from 'vs/base/browser/window';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import BaseHtml from 'vs/code/browser/issue/issueReporterPage';
import { IssueWebReporter } from 'vs/code/browser/issue/issueReporterService';
import 'vs/css!./media/issueReporter';
import { IMenuService, MenuId } from 'vs/platform/actions/common/actions';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { PerformanceInfo, SystemInfo } from 'vs/platform/diagnostics/common/diagnostics';
import { ExtensionIdentifier, ExtensionIdentifierSet } from 'vs/platform/extensions/common/extensions';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IIssueMainService, IssueReporterData, IssueReporterWindowConfiguration, ProcessExplorerData } from 'vs/platform/issue/common/issue';
import product from 'vs/platform/product/common/product';
import { IAuthenticationService } from 'vs/workbench/services/authentication/common/authentication';
import { AuxiliaryWindow, IAuxiliaryWindowService } from 'vs/workbench/services/auxiliaryWindow/browser/auxiliaryWindowService';
// import { startup } from 'vs/code/browser/issue/issueReporterMain';
// import { startup } from 'vs/code/browser/issue/issueReporterMain';
// import { INativeHostService } from 'vs/platform/native/common/native';

// const processExplorerWindowState = 'issue.processExplorerWindowState';

// interface IBrowserWindowOptions {
// 	backgroundColor: string | undefined;
// 	title: string;
// 	zoomLevel: number;
// 	alwaysOnTop: boolean;
// }

// type IStrictWindowState = Required<Pick<IWindowState, 'x' | 'y' | 'width' | 'height'>>;

export class IssueMainService implements IIssueMainService {

	readonly _serviceBrand: undefined;

	// private static readonly DEFAULT_BACKGROUND_COLOR = '#1E1E1E';

	private issueReporterWindow: Window | null = null;
	private extensionIdentifierSet: ExtensionIdentifierSet = new ExtensionIdentifierSet();
	private returnedIssueReporterData: IssueReporterData | undefined;
	// private issueReporterParentWindow: BrowserWindow | null = null;

	// private processExplorerWindow: BrowserWindow | null = null;
	// private processExplorerParentWindow: BrowserWindow | null = null;

	// constructor(
	// 	private userEnv: IProcessEnvironment,

	// 	@IExtensionResourceLoaderService private readonly extensionResourceLoaderService: IExtensionResourceLoaderService,
	// 	@IExtensionGalleryService extensionGalleryService: IExtensionGalleryService,
	// 	@ILogService private readonly logService: ILogService
	// ) {
	// 	this.issueReporterWindow?.onDidLayout(() => {
	// 	});
	// }
	constructor(
		// private userEnv: IProcessEnvironment,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IAuxiliaryWindowService private readonly auxiliaryWindowService: IAuxiliaryWindowService,
		@IMenuService private readonly menuService: IMenuService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IAuthenticationService private readonly authenticationService: IAuthenticationService,
		// @IStorageService private readonly storageService: IStorageService,
		// @IFileService private readonly fileService: IFileService,
		// @IUserDataSyncStoreService private readonly userDataSyncStoreService: IUserDataSyncStoreService,
		// @IUserDataSyncStoreManagementService private readonly userDataSyncStoreManagementService: IUserDataSyncStoreManagementService,
		// @IInstantiationService private readonly instantiationService: IInstantiationService,
		// @IUserDataSyncLogService private readonly logService: IUserDataSyncLogService,
		// @ITelemetryService private readonly telemetryService: ITelemetryService,
		// @IStorageService private readonly storageService: IStorageService,
		// @IUserDataSyncEnablementService private readonly userDataSyncEnablementService: IUserDataSyncEnablementService,
		// @IUserDataProfilesService private readonly userDataProfilesService: IUserDataProfilesService,
		// @IUserDataSyncResourceProviderService private readonly userDataSyncResourceProviderService: IUserDataSyncResourceProviderService,
		// @IUserDataSyncLocalStoreService private readonly userDataSyncLocalStoreService: IUserDataSyncLocalStoreService,
	) {

		window.addEventListener('message', async (event) => {
			// const extensionId = arg.extensionId;

			if (event.data && event.data.replyChannel === 'vscode:triggerReporterMenu') {
				// creates menu from contributed
				const menu = this.menuService.createMenu(MenuId.IssueReporter, this.contextKeyService);

				// render menu and dispose
				const actions = menu.getActions({ renderShortTitle: true }).flatMap(entry => entry[1]);
				for (const action of actions) {
					try {
						if (action.item && 'source' in action.item && action.item.source?.id === event.data.extensionId) {
							this.extensionIdentifierSet.add(event.data.extensionId);
							await action.run();
						}
					} catch (error) {
						console.error(error);
					}
				}

				menu.dispose();
			}
		});

	}

	async openReporter(data: IssueReporterData): Promise<void> {
		if (data.extensionId && this.extensionIdentifierSet.has(data.extensionId)) {
			this.returnedIssueReporterData = data;
			// Reply to the postMessage
			// const replyChannel = `vscode:triggerReporterMenu`;
			// this.issueReporterWindow?.addEventListener('message', (event) => {
			// 	if (event.data && event.data.replyChannel === replyChannel && event.origin === 'window.location.origin') {
			const replyChannel = `vscode:triggerReporterMenuResponse`;
			window.postMessage({ data, replyChannel }, '*');
			// }

			this.extensionIdentifierSet.delete(new ExtensionIdentifier(data.extensionId));
		}

		// const theme = this.themeService.getColorTheme();
		// const experiments = await this.experimentService.getCurrentExperiments();
		if (this.issueReporterWindow) {
			this.issueReporterWindow.focus();
			return;

		}

		// let githubAccessToken = '';
		// try {
		// 	const githubSessions = await this.authenticationService.getSessions('github');
		// 	const potentialSessions = githubSessions.filter(session => session.scopes.includes('repo'));
		// 	githubAccessToken = potentialSessions[0]?.accessToken;
		// } catch (e) {
		// 	// Ignore
		// }

		// air on the side of caution and have false be the default
		const isUnsupported = false;
		try {
			// isUnsupported = !(await this.integrityService.isPure()).isPure;
		} catch (e) {
			// Ignore
		}

		// const issueReporterData: IssueReporterData = Object.assign({
		// 	// styles: getIssueReporterStyles(theme),
		// 	zoomLevel: getZoomLevel(mainWindow),
		// 	enabledExtensions: data.enabledExtensions,
		// 	// experiments: experiments?.join('\n'),
		// 	// restrictedMode: !this.workspaceTrustManagementService.isWorkspaceTrusted(),
		// 	isUnsupported,
		// 	githubAccessToken
		// }, data);

		const disposables = new DisposableStore();

		// Auxiliary Window
		const auxiliaryWindow = disposables.add(await this.auxiliaryWindowService.open());

		this.issueReporterWindow = auxiliaryWindow.window;


		// Editor Part
		const editorPartContainer = document.createElement('div');
		editorPartContainer.classList.add('part', 'editor');
		editorPartContainer.setAttribute('role', 'main');
		editorPartContainer.style.position = 'relative';

		const configuration: IssueReporterWindowConfiguration = {
			windowId: 0,
			appRoot: '',
			userEnv: {},
			product: product,
			disableExtensions: false,
			data: data,
			os: {
				type: '',
				arch: '',
				release: '',
			},
		};

		if (auxiliaryWindow) {
			// auxiliaryWindow.window.location.href = FileAccess.asBrowserUri(`vs/code/electron-sandbox/issue/issueReporter.html`).toString(true);
			await auxiliaryWindow.whenStylesHaveLoaded;
			// const platformClass = isWindows ? 'windows' : isLinux ? 'linux' : 'mac';
			// auxiliaryWindow.window.document.body.classList.add(platformClass); // used by our fonts
			safeInnerHtml(auxiliaryWindow.window.document.body, BaseHtml());
			const issueReporter = this.instantiationService.createInstance(IssueWebReporter, configuration.disableExtensions, configuration.data, configuration.os, configuration.product, auxiliaryWindow.window);
			// const issueReporter = new IssueReporter(configuration.disableExtensions, configuration.data, configuration.os, configuration.windowId, configuration.appRoot, {}, configuration.product, auxiliaryWindow.window, this);
			issueReporter.render();
		} else {
			console.error('Failed to open auxiliary window');
		}


		// handle closing issue reporter
		this.issueReporterWindow?.addEventListener('beforeunload', () => {
			// Handle window closing here
			auxiliaryWindow.window.close();
			this.issueReporterWindow = null;
		});
	}

	async openProcessExplorer(data: ProcessExplorerData): Promise<void> {

	}

	stopTracing(): Promise<void> {
		throw new Error('Method not implemented.');
	}
	getSystemStatus(): Promise<string> {
		throw new Error('Method not implemented.');
	}
	$getSystemInfo(): Promise<SystemInfo> {
		throw new Error('Method not implemented.');
	}
	$getPerformanceInfo(): Promise<PerformanceInfo> {
		throw new Error('Method not implemented.');
	}
	$reloadWithExtensionsDisabled(): Promise<void> {
		throw new Error('Method not implemented.');
	}
	$showConfirmCloseDialog(): Promise<void> {
		throw new Error('Method not implemented.');
	}
	$showClipboardDialog(): Promise<boolean> {
		throw new Error('Method not implemented.');
	}
	$getIssueReporterUri(extensionId: string): Promise<URI> {
		throw new Error('Method not implemented.');
	}
	$getIssueReporterData(extensionId: string): Promise<string> {
		throw new Error('Method not implemented.');
	}
	$getIssueReporterTemplate(extensionId: string): Promise<string> {
		throw new Error('Method not implemented.');
	}
	$getReporterStatus(extensionId: string, extensionName: string): Promise<boolean[]> {
		throw new Error('Method not implemented.');
	}

	async $sendReporterMenu2(extensionId: string, extensionName: string): Promise<IssueReporterData | undefined> {
		// const extensionId = arg.extensionId;

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

		menu.dispose();

		if (this.returnedIssueReporterData) {
			const data = this.returnedIssueReporterData;
			this.returnedIssueReporterData = undefined;
			return Promise.resolve(data);
		}

		return undefined;
	}


	async $sendReporterMenu(extensionId: string, extensionName: string): Promise<IssueReporterData | undefined> {
		// const window = this.issueReporterWindow!;

		const replyChannel = `vscode:triggerReporterMenu`;
		window.postMessage({ replyChannel, extensionId, extensionName }, '*');

		const result = await new Promise((resolve, reject) => {
			const timeout = setTimeout(() => {
				window.removeEventListener('message', listener);
				reject(new Error('Timeout exceeded'));
			}, 5000); // Set the timeout value in milliseconds (e.g., 5000 for 5 seconds)

			const listener = (event: MessageEvent) => {
				const replyChannel2 = `vscode:triggerReporterMenuResponse`;
				if (event.data && event.data.replyChannel === replyChannel2) {
					clearTimeout(timeout);
					window.removeEventListener('message', listener);
					resolve(event.data.data);
				}
			};
			window.addEventListener('message', listener);
		});

		return result as IssueReporterData | undefined;
	}

	async $closeReporter(): Promise<void> {
		this.issueReporterWindow?.close();
	}
}
