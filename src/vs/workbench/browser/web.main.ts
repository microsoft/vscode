/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { mark } from 'vs/base/common/performance';
import { domContentLoaded, addDisposableListener, EventType } from 'vs/base/browser/dom';
import { ServiceCollection } from 'vs/platform/instantiation/common/serviceCollection';
import { ILogService } from 'vs/platform/log/common/log';
import { Disposable } from 'vs/base/common/lifecycle';
import { SimpleLogService, SimpleProductService, SimpleWorkbenchEnvironmentService } from 'vs/workbench/browser/web.simpleservices';
import { Workbench } from 'vs/workbench/browser/workbench';
import { IChannel } from 'vs/base/parts/ipc/common/ipc';
import { REMOTE_FILE_SYSTEM_CHANNEL_NAME, RemoteExtensionsFileSystemProvider } from 'vs/platform/remote/common/remoteAgentFileSystemChannel';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';
import { IProductService } from 'vs/platform/product/common/product';
import { RemoteAgentService } from 'vs/workbench/services/remote/browser/remoteAgentServiceImpl';
import { RemoteAuthorityResolverService } from 'vs/platform/remote/browser/remoteAuthorityResolverService';
import { IRemoteAuthorityResolverService } from 'vs/platform/remote/common/remoteAuthorityResolver';
import { IRemoteAgentService } from 'vs/workbench/services/remote/common/remoteAgentService';
import { IFileService } from 'vs/platform/files/common/files';
import { FileService } from 'vs/workbench/services/files/common/fileService';
import { Schemas } from 'vs/base/common/network';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { onUnexpectedError } from 'vs/base/common/errors';
import { URI } from 'vs/base/common/uri';
import { IWorkspaceInitializationPayload } from 'vs/platform/workspaces/common/workspaces';
import { WorkspaceService } from 'vs/workbench/services/configuration/browser/configurationService';
import { ConfigurationCache } from 'vs/workbench/services/configuration/browser/configurationCache';
import { ConfigurationFileService } from 'vs/workbench/services/configuration/common/configuration';
import { WebResources } from 'vs/workbench/browser/web.resources';
import { ISignService } from 'vs/platform/sign/common/sign';
import { SignService } from 'vs/platform/sign/browser/signService';
import { hash } from 'vs/base/common/hash';
import { joinPath } from 'vs/base/common/resources';
import { IWorkbenchConstructionOptions } from 'vs/workbench/workbench.web.api';

interface IWindowConfiguration {
	remoteAuthority: string;

	userDataUri: URI;

	webviewEndpoint?: string;

	folderUri?: URI;
	workspaceUri?: URI;
}

class CodeRendererMain extends Disposable {

	private workbench: Workbench;

	constructor(
		private readonly domElement: HTMLElement,
		private readonly configuration: IWindowConfiguration
	) {
		super();
	}

	async open(): Promise<void> {
		const services = await this.initServices();

		await domContentLoaded();
		mark('willStartWorkbench');

		// Create Workbench
		this.workbench = new Workbench(
			this.domElement,
			services.serviceCollection,
			services.logService
		);

		// Layout
		this._register(addDisposableListener(window, EventType.RESIZE, () => this.workbench.layout()));

		// Resource Loading
		this._register(new WebResources(<IFileService>services.serviceCollection.get(IFileService)));

		// Workbench Lifecycle
		this._register(this.workbench.onShutdown(() => this.dispose()));

		// Startup
		this.workbench.startup();
	}

	private async initServices(): Promise<{ serviceCollection: ServiceCollection, logService: ILogService }> {
		const serviceCollection = new ServiceCollection();

		// !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
		// NOTE: DO NOT ADD ANY OTHER SERVICE INTO THE COLLECTION HERE.
		// CONTRIBUTE IT VIA WORKBENCH.MAIN.TS AND registerSingleton().
		// !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!

		// Log
		const logService = new SimpleLogService();
		serviceCollection.set(ILogService, logService);

		// Environment
		const environmentService = this.createEnvironmentService();
		serviceCollection.set(IWorkbenchEnvironmentService, environmentService);

		// Product
		const productService = new SimpleProductService();
		serviceCollection.set(IProductService, productService);

		// Remote
		const remoteAuthorityResolverService = new RemoteAuthorityResolverService();
		serviceCollection.set(IRemoteAuthorityResolverService, remoteAuthorityResolverService);

		// Sign
		const signService = new SignService();
		serviceCollection.set(ISignService, signService);

		const remoteAgentService = this._register(new RemoteAgentService(environmentService, productService, remoteAuthorityResolverService, signService));
		serviceCollection.set(IRemoteAgentService, remoteAgentService);

		// Files
		const fileService = this._register(new FileService(logService));
		serviceCollection.set(IFileService, fileService);

		const connection = remoteAgentService.getConnection();
		if (connection) {
			const channel = connection.getChannel<IChannel>(REMOTE_FILE_SYSTEM_CHANNEL_NAME);
			const remoteFileSystemProvider = this._register(new RemoteExtensionsFileSystemProvider(channel, remoteAgentService.getEnvironment()));
			fileService.registerProvider(Schemas.vscodeRemote, remoteFileSystemProvider);
		}

		const payload = await this.resolveWorkspaceInitializationPayload();

		await Promise.all([
			this.createWorkspaceService(payload, environmentService, fileService, remoteAgentService, logService).then(service => {

				// Workspace
				serviceCollection.set(IWorkspaceContextService, service);

				// Configuration
				serviceCollection.set(IConfigurationService, service);

				return service;
			}),
		]);

		return { serviceCollection, logService };
	}

	private createEnvironmentService(): IWorkbenchEnvironmentService {
		const environmentService = new SimpleWorkbenchEnvironmentService();
		environmentService.appRoot = '/web/';
		environmentService.args = { _: [] };
		environmentService.appSettingsHome = joinPath(this.configuration.userDataUri, 'User');
		environmentService.settingsResource = joinPath(environmentService.appSettingsHome, 'settings.json');
		environmentService.keybindingsResource = joinPath(environmentService.appSettingsHome, 'keybindings.json');
		environmentService.logsPath = '/web/logs';
		environmentService.debugExtensionHost = {
			port: null,
			break: false
		};
		environmentService.webviewEndpoint = this.configuration.webviewEndpoint;

		return environmentService;
	}

	private async createWorkspaceService(payload: IWorkspaceInitializationPayload, environmentService: IWorkbenchEnvironmentService, fileService: FileService, remoteAgentService: IRemoteAgentService, logService: ILogService): Promise<WorkspaceService> {
		const workspaceService = new WorkspaceService({ userSettingsResource: environmentService.settingsResource, remoteAuthority: this.configuration.remoteAuthority, configurationCache: new ConfigurationCache() }, new ConfigurationFileService(fileService), remoteAgentService);

		try {
			await workspaceService.initialize(payload);

			return workspaceService;
		} catch (error) {
			onUnexpectedError(error);
			logService.error(error);

			return workspaceService;
		}
	}

	private resolveWorkspaceInitializationPayload(): IWorkspaceInitializationPayload {

		// Multi-root workspace
		if (this.configuration.workspaceUri) {
			return { id: hash(this.configuration.workspaceUri.toString()).toString(16), configPath: this.configuration.workspaceUri };
		}

		// Single-folder workspace
		if (this.configuration.folderUri) {
			return { id: hash(this.configuration.folderUri.toString()).toString(16), folder: this.configuration.folderUri };
		}

		return { id: 'empty-window' };
	}
}

export function main(domElement: HTMLElement, options: IWorkbenchConstructionOptions): Promise<void> {
	const renderer = new CodeRendererMain(
		domElement,
		{
			userDataUri: URI.revive(options.userDataUri),
			remoteAuthority: options.remoteAuthority,
			webviewEndpoint: options.webviewEndpoint,
			folderUri: options.folderUri ? URI.revive(options.folderUri) : undefined,
			workspaceUri: options.workspaceUri ? URI.revive(options.workspaceUri) : undefined,
		});

	return renderer.open();
}