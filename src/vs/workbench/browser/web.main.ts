/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { mark } from 'vs/base/common/performance';
import { domContentLoaded, addDisposableListener, EventType, addClass, EventHelper } from 'vs/base/browser/dom';
import { ServiceCollection } from 'vs/platform/instantiation/common/serviceCollection';
import { ILogService, ConsoleLogService, MultiplexLogService } from 'vs/platform/log/common/log';
import { ConsoleLogInAutomationService } from 'vs/platform/log/browser/log';
import { Disposable } from 'vs/base/common/lifecycle';
import { BrowserWorkbenchEnvironmentService } from 'vs/workbench/services/environment/browser/environmentService';
import { Workbench } from 'vs/workbench/browser/workbench';
import { RemoteFileSystemProvider } from 'vs/workbench/services/remote/common/remoteAgentFileSystemChannel';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';
import { IProductService } from 'vs/platform/product/common/productService';
import product from 'vs/platform/product/common/product';
import { RemoteAgentService } from 'vs/workbench/services/remote/browser/remoteAgentServiceImpl';
import { RemoteAuthorityResolverService } from 'vs/platform/remote/browser/remoteAuthorityResolverService';
import { IRemoteAuthorityResolverService } from 'vs/platform/remote/common/remoteAuthorityResolver';
import { IRemoteAgentService } from 'vs/workbench/services/remote/common/remoteAgentService';
import { IFileService } from 'vs/platform/files/common/files';
import { FileService } from 'vs/platform/files/common/fileService';
import { Schemas } from 'vs/base/common/network';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { onUnexpectedError } from 'vs/base/common/errors';
import * as browser from 'vs/base/browser/browser';
import * as platform from 'vs/base/common/platform';
import { URI } from 'vs/base/common/uri';
import { IWorkspaceInitializationPayload } from 'vs/platform/workspaces/common/workspaces';
import { WorkspaceService } from 'vs/workbench/services/configuration/browser/configurationService';
import { ConfigurationCache } from 'vs/workbench/services/configuration/browser/configurationCache';
import { ISignService } from 'vs/platform/sign/common/sign';
import { SignService } from 'vs/platform/sign/browser/signService';
import { IWorkbenchConstructionOptions, IWorkspace, IWorkbench } from 'vs/workbench/workbench.web.api';
import { FileUserDataProvider } from 'vs/workbench/services/userData/common/fileUserDataProvider';
import { BACKUPS } from 'vs/platform/environment/common/environment';
import { joinPath } from 'vs/base/common/resources';
import { BrowserStorageService } from 'vs/platform/storage/browser/storageService';
import { IStorageService, StorageScope } from 'vs/platform/storage/common/storage';
import { getThemeTypeSelector, DARK, HIGH_CONTRAST, LIGHT } from 'vs/platform/theme/common/themeService';
import { registerWindowDriver } from 'vs/platform/driver/browser/driver';
import { BufferLogService } from 'vs/platform/log/common/bufferLog';
import { FileLogService } from 'vs/platform/log/common/fileLogService';
import { toLocalISOString } from 'vs/base/common/date';
import { IndexedDBLogProvider } from 'vs/workbench/services/log/browser/indexedDBLogProvider';
import { InMemoryLogProvider } from 'vs/workbench/services/log/common/inMemoryLogProvider';
import { isWorkspaceToOpen, isFolderToOpen } from 'vs/platform/windows/common/windows';
import { getWorkspaceIdentifier } from 'vs/workbench/services/workspaces/browser/workspaces';
import { coalesce } from 'vs/base/common/arrays';
import { InMemoryFileSystemProvider } from 'vs/platform/files/common/inMemoryFilesystemProvider';
import { WebResourceIdentityService, IResourceIdentityService } from 'vs/platform/resource/common/resourceIdentityService';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { firstSessionDateStorageKey } from 'vs/platform/telemetry/common/telemetry';

interface PanelActivityState {
	id: string;
	name?: string;
	pinned: boolean;
	order: number;
	visible: boolean;
}

interface SideBarActivityState {
	id: string;
	pinned: boolean;
	order: number;
	visible: boolean;
}


class BrowserMain extends Disposable {

	constructor(
		private readonly domElement: HTMLElement,
		private readonly configuration: IWorkbenchConstructionOptions
	) {
		super();
	}

	async open(): Promise<IWorkbench> {
		const services = await this.initServices();

		await domContentLoaded();
		mark('willStartWorkbench');

		// Base Theme
		this.restoreBaseTheme();

		// Create Workbench
		const workbench = new Workbench(
			this.domElement,
			services.serviceCollection,
			services.logService
		);

		// Listeners
		this.registerListeners(workbench, services.storageService);

		this.applyDefaultLayout(services.storageService);

		// Driver
		if (this.configuration.driver) {
			(async () => this._register(await registerWindowDriver()))();
		}

		// Startup
		const instantiationService = workbench.startup();

		// Return API Facade
		return instantiationService.invokeFunction(accessor => {
			const commandService = accessor.get(ICommandService);

			return {
				commands: {
					executeCommand: (command, ...args) => commandService.executeCommand(command, ...args)
				}
			};
		});
	}

	private applyDefaultLayout(storageService: BrowserStorageService) {
		const { defaultLayout } = this.configuration;
		if (!defaultLayout) {
			return;
		}

		const firstRun = storageService.get(firstSessionDateStorageKey, StorageScope.GLOBAL);
		if (firstRun !== undefined) {
			return;
		}

		const { sidebar } = defaultLayout;
		if (sidebar) {
			if (sidebar.visible !== undefined) {
				if (sidebar.visible) {
					storageService.remove('workbench.sidebar.hidden', StorageScope.WORKSPACE);
				} else {
					storageService.store('workbench.sidebar.hidden', true, StorageScope.WORKSPACE);
				}
			}

			if (sidebar.containers !== undefined) {
				const sidebarState: SideBarActivityState[] = [];

				let order = -1;
				for (const container of sidebar.containers.sort((a, b) => (a.order ?? 1) - (b.order ?? 1))) {
					let viewletId;
					switch (container.id) {
						case 'explorer':
							viewletId = 'workbench.view.explorer';
							break;
						case 'run':
							viewletId = 'workbench.view.debug';
							break;
						case 'scm':
							viewletId = 'workbench.view.scm';
							break;
						case 'search':
							viewletId = 'workbench.view.search';
							break;
						case 'extensions':
							viewletId = 'workbench.view.extensions';
							break;
						case 'remote':
							viewletId = 'workbench.view.remote';
							break;
						default:
							viewletId = `workbench.view.extension.${container.id}`;
					}

					if (container.active) {
						storageService.store('workbench.sidebar.activeviewletid', viewletId, StorageScope.WORKSPACE);
					}

					if (container.order !== undefined || (container.active === undefined && container.visible !== undefined)) {
						order = container.order ?? (order + 1);
						const state: SideBarActivityState = {
							id: viewletId,
							order: order,
							pinned: (container.active || container.visible) ?? true,
							visible: (container.active || container.visible) ?? true
						};

						sidebarState.push(state);
					}

					if (container.views !== undefined) {
						const viewsState: { id: string, isHidden?: boolean, order?: number }[] = [];
						const viewsWorkspaceState: { [id: string]: { collapsed: boolean, isHidden?: boolean, size?: number } } = {};

						for (const view of container.views) {
							if (view.order !== undefined || view.visible !== undefined) {
								viewsState.push({
									id: view.id,
									isHidden: view.visible === undefined ? undefined : !view.visible,
									order: view.order === undefined ? undefined : view.order
								});
							}

							if (view.collapsed !== undefined) {
								viewsWorkspaceState[view.id] = {
									collapsed: view.collapsed,
									isHidden: view.visible === undefined ? undefined : !view.visible,
								};
							}
						}

						storageService.store(`${viewletId}.state.hidden`, JSON.stringify(viewsState), StorageScope.GLOBAL);
						storageService.store(`${viewletId}.state`, JSON.stringify(viewsWorkspaceState), StorageScope.WORKSPACE);
					}
				}

				if (sidebarState.length) {
					storageService.store('workbench.activity.pinnedViewlets2', JSON.stringify(sidebarState), StorageScope.GLOBAL);
				}
			}
		}

		const { panel } = defaultLayout;
		if (panel) {
			if (panel.visible !== undefined) {
				if (panel.visible) {
					storageService.store('workbench.panel.hidden', false, StorageScope.WORKSPACE);
				} else {
					storageService.remove('workbench.panel.hidden', StorageScope.WORKSPACE);
				}
			}

			if (panel.containers !== undefined) {
				const panelState: PanelActivityState[] = [];

				let order = -1;
				for (const container of panel.containers.sort((a, b) => (a.order ?? 1) - (b.order ?? 1))) {
					let name;
					let panelId = container.id;
					switch (panelId) {
						case 'terminal':
							name = 'Terminal';
							panelId = 'workbench.panel.terminal';
							break;
						case 'debug':
							name = 'Debug Console';
							panelId = 'workbench.panel.repl';
							break;
						case 'problems':
							name = 'Problems';
							panelId = 'workbench.panel.markers';
							break;
						case 'output':
							name = 'Output';
							panelId = 'workbench.panel.output';
							break;
						case 'comments':
							name = 'Comments';
							panelId = 'workbench.panel.comments';
							break;
						case 'refactor':
							name = 'Refactor Preview';
							panelId = 'refactorPreview';
						default:
							continue;
					}

					if (container.active) {
						storageService.store('workbench.panelpart.activepanelid', panelId, StorageScope.WORKSPACE);
					}

					if (container.order !== undefined || (container.active === undefined && container.visible !== undefined)) {
						order = container.order ?? (order + 1);
						const state: PanelActivityState = {
							id: panelId,
							name: name,
							order: order,
							pinned: (container.active || container.visible) ?? true,
							visible: (container.active || container.visible) ?? true
						};

						panelState.push(state);
					}
				}

				if (panelState.length) {
					storageService.store('workbench.panel.pinnedPanels', JSON.stringify(panelState), StorageScope.GLOBAL);
				}
			}
		}
	}

	private registerListeners(workbench: Workbench, storageService: BrowserStorageService): void {

		// Layout
		const viewport = platform.isIOS && (<any>window).visualViewport ? (<any>window).visualViewport /** Visual viewport */ : window /** Layout viewport */;
		this._register(addDisposableListener(viewport, EventType.RESIZE, () => workbench.layout()));

		// Prevent the back/forward gestures in macOS
		this._register(addDisposableListener(this.domElement, EventType.WHEEL, e => e.preventDefault(), { passive: false }));

		// Prevent native context menus in web
		this._register(addDisposableListener(this.domElement, EventType.CONTEXT_MENU, e => EventHelper.stop(e, true)));

		// Prevent default navigation on drop
		this._register(addDisposableListener(this.domElement, EventType.DROP, e => EventHelper.stop(e, true)));

		// Workbench Lifecycle
		this._register(workbench.onBeforeShutdown(event => {
			if (storageService.hasPendingUpdate) {
				console.warn('Unload prevented: pending storage update');
				event.veto(true); // prevent data loss from pending storage update
			}
		}));
		this._register(workbench.onWillShutdown(() => {
			storageService.close();
			this.saveBaseTheme();
		}));
		this._register(workbench.onShutdown(() => this.dispose()));

		// Fullscreen
		[EventType.FULLSCREEN_CHANGE, EventType.WK_FULLSCREEN_CHANGE].forEach(event => {
			this._register(addDisposableListener(document, event, () => {
				if (document.fullscreenElement || (<any>document).webkitFullscreenElement || (<any>document).webkitIsFullScreen) {
					browser.setFullscreen(true);
				} else {
					browser.setFullscreen(false);
				}
			}));
		});
	}

	private restoreBaseTheme(): void {
		addClass(this.domElement, window.localStorage.getItem('vscode.baseTheme') || getThemeTypeSelector(LIGHT) /* Fallback to a light theme by default on web */);
	}

	private saveBaseTheme(): void {
		const classes = this.domElement.className;
		const baseThemes = [DARK, LIGHT, HIGH_CONTRAST].map(baseTheme => getThemeTypeSelector(baseTheme));
		for (const baseTheme of baseThemes) {
			if (classes.indexOf(baseTheme) >= 0) {
				window.localStorage.setItem('vscode.baseTheme', baseTheme);
				break;
			}
		}
	}

	private async initServices(): Promise<{ serviceCollection: ServiceCollection, logService: ILogService, storageService: BrowserStorageService }> {
		const serviceCollection = new ServiceCollection();

		// !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
		// NOTE: DO NOT ADD ANY OTHER SERVICE INTO THE COLLECTION HERE.
		// CONTRIBUTE IT VIA WORKBENCH.WEB.MAIN.TS AND registerSingleton().
		// !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!

		// Log
		const logsPath = URI.file(toLocalISOString(new Date()).replace(/-|:|\.\d+Z$/g, '')).with({ scheme: 'vscode-log' });
		const logService = new BufferLogService(this.configuration.logLevel);
		serviceCollection.set(ILogService, logService);

		// Resource Identity
		const resourceIdentityService = this._register(new WebResourceIdentityService());
		serviceCollection.set(IResourceIdentityService, resourceIdentityService);

		const payload = await this.resolveWorkspaceInitializationPayload(resourceIdentityService);

		// Environment
		const environmentService = new BrowserWorkbenchEnvironmentService({ workspaceId: payload.id, logsPath, ...this.configuration });
		serviceCollection.set(IWorkbenchEnvironmentService, environmentService);

		// Product
		const productService = {
			_serviceBrand: undefined,
			...product
		};
		serviceCollection.set(IProductService, productService);

		// Remote
		const remoteAuthorityResolverService = new RemoteAuthorityResolverService(this.configuration.resourceUriProvider);
		serviceCollection.set(IRemoteAuthorityResolverService, remoteAuthorityResolverService);

		// Signing
		const signService = new SignService(environmentService.options.connectionToken || this.getCookieValue('vscode-tkn'));
		serviceCollection.set(ISignService, signService);

		// Remote Agent
		const remoteAgentService = this._register(new RemoteAgentService(this.configuration.webSocketFactory, environmentService, productService, remoteAuthorityResolverService, signService, logService));
		serviceCollection.set(IRemoteAgentService, remoteAgentService);

		// Files
		const fileService = this._register(new FileService(logService));
		serviceCollection.set(IFileService, fileService);
		this.registerFileSystemProviders(environmentService, fileService, remoteAgentService, logService, logsPath);

		// Long running services (workspace, config, storage)
		const services = await Promise.all([
			this.createWorkspaceService(payload, environmentService, fileService, remoteAgentService, logService).then(service => {

				// Workspace
				serviceCollection.set(IWorkspaceContextService, service);

				// Configuration
				serviceCollection.set(IConfigurationService, service);

				return service;
			}),

			this.createStorageService(payload, environmentService, fileService, logService).then(service => {

				// Storage
				serviceCollection.set(IStorageService, service);

				return service;
			})
		]);

		return { serviceCollection, logService, storageService: services[1] };
	}

	private registerFileSystemProviders(environmentService: IWorkbenchEnvironmentService, fileService: IFileService, remoteAgentService: IRemoteAgentService, logService: BufferLogService, logsPath: URI): void {

		// Logger
		(async () => {
			if (browser.isEdge) {
				fileService.registerProvider(logsPath.scheme, new InMemoryLogProvider(logsPath.scheme));
			} else {
				try {
					const indexedDBLogProvider = new IndexedDBLogProvider(logsPath.scheme);
					await indexedDBLogProvider.database;

					fileService.registerProvider(logsPath.scheme, indexedDBLogProvider);
				} catch (error) {
					logService.info('Error while creating indexedDB log provider. Falling back to in-memory log provider.');
					logService.error(error);

					fileService.registerProvider(logsPath.scheme, new InMemoryLogProvider(logsPath.scheme));
				}
			}

			logService.logger = new MultiplexLogService(coalesce([
				new ConsoleLogService(logService.getLevel()),
				new FileLogService('window', environmentService.logFile, logService.getLevel(), fileService),
				// Extension development test CLI: forward everything to test runner
				environmentService.isExtensionDevelopment && !!environmentService.extensionTestsLocationURI ? new ConsoleLogInAutomationService(logService.getLevel()) : undefined
			]));
		})();

		const connection = remoteAgentService.getConnection();
		if (connection) {

			// Remote file system
			const remoteFileSystemProvider = this._register(new RemoteFileSystemProvider(remoteAgentService));
			fileService.registerProvider(Schemas.vscodeRemote, remoteFileSystemProvider);

			if (!this.configuration.userDataProvider) {
				const remoteUserDataUri = this.getRemoteUserDataUri();
				if (remoteUserDataUri) {
					this.configuration.userDataProvider = this._register(new FileUserDataProvider(remoteUserDataUri, joinPath(remoteUserDataUri, BACKUPS), remoteFileSystemProvider, environmentService));
				}
			}
		}

		// User data
		if (!this.configuration.userDataProvider) {
			this.configuration.userDataProvider = this._register(new InMemoryFileSystemProvider());
		}
		fileService.registerProvider(Schemas.userData, this.configuration.userDataProvider);
	}

	private async createStorageService(payload: IWorkspaceInitializationPayload, environmentService: IWorkbenchEnvironmentService, fileService: IFileService, logService: ILogService): Promise<BrowserStorageService> {
		const storageService = new BrowserStorageService(environmentService, fileService);

		try {
			await storageService.initialize(payload);

			return storageService;
		} catch (error) {
			onUnexpectedError(error);
			logService.error(error);

			return storageService;
		}
	}

	private async createWorkspaceService(payload: IWorkspaceInitializationPayload, environmentService: IWorkbenchEnvironmentService, fileService: FileService, remoteAgentService: IRemoteAgentService, logService: ILogService): Promise<WorkspaceService> {
		const workspaceService = new WorkspaceService({ remoteAuthority: this.configuration.remoteAuthority, configurationCache: new ConfigurationCache() }, environmentService, fileService, remoteAgentService);

		try {
			await workspaceService.initialize(payload);

			return workspaceService;
		} catch (error) {
			onUnexpectedError(error);
			logService.error(error);

			return workspaceService;
		}
	}

	private async resolveWorkspaceInitializationPayload(resourceIdentityService: IResourceIdentityService): Promise<IWorkspaceInitializationPayload> {
		let workspace: IWorkspace | undefined = undefined;
		if (this.configuration.workspaceProvider) {
			workspace = this.configuration.workspaceProvider.workspace;
		}

		// Multi-root workspace
		if (workspace && isWorkspaceToOpen(workspace)) {
			return getWorkspaceIdentifier(workspace.workspaceUri);
		}

		// Single-folder workspace
		if (workspace && isFolderToOpen(workspace)) {
			const id = await resourceIdentityService.resolveResourceIdentity(workspace.folderUri);
			return { id, folder: workspace.folderUri };
		}

		return { id: 'empty-window' };
	}

	private getRemoteUserDataUri(): URI | undefined {
		const element = document.getElementById('vscode-remote-user-data-uri');
		if (element) {
			const remoteUserDataPath = element.getAttribute('data-settings');
			if (remoteUserDataPath) {
				return joinPath(URI.revive(JSON.parse(remoteUserDataPath)), 'User');
			}
		}

		return undefined;
	}

	private getCookieValue(name: string): string | undefined {
		const match = document.cookie.match('(^|[^;]+)\\s*' + name + '\\s*=\\s*([^;]+)'); // See https://stackoverflow.com/a/25490531

		return match ? match.pop() : undefined;
	}
}

export function main(domElement: HTMLElement, options: IWorkbenchConstructionOptions): Promise<IWorkbench> {
	const workbench = new BrowserMain(domElement, options);

	return workbench.open();
}
