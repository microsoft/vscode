/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vs/base/common/lifecycle';
import product from 'vs/platform/node/product';
import { SyncDescriptor } from 'vs/platform/instantiation/common/descriptors';
import pkg from 'vs/platform/node/package';
import { Workbench } from 'vs/workbench/electron-browser/workbench';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { NullTelemetryService, configurationTelemetry, combinedAppender, LogAppender } from 'vs/platform/telemetry/common/telemetryUtils';
import { TelemetryAppenderClient } from 'vs/platform/telemetry/node/telemetryIpc';
import { TelemetryService, ITelemetryServiceConfig } from 'vs/platform/telemetry/common/telemetryService';
import ErrorTelemetry from 'vs/platform/telemetry/browser/errorTelemetry';
import { ElectronWindow } from 'vs/workbench/electron-browser/window';
import { resolveWorkbenchCommonProperties } from 'vs/platform/telemetry/node/workbenchCommonProperties';
import { IWindowsService, IWindowService, IWindowConfiguration } from 'vs/platform/windows/common/windows';
import { WindowService } from 'vs/platform/windows/electron-browser/windowService';
import { IRequestService } from 'vs/platform/request/node/request';
import { RequestService } from 'vs/platform/request/electron-browser/requestService';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { SearchService } from 'vs/workbench/services/search/node/searchService';
import { LifecycleService } from 'vs/platform/lifecycle/electron-browser/lifecycleService';
import { MarkerService } from 'vs/platform/markers/common/markerService';
import { IModelService } from 'vs/editor/common/services/modelService';
import { ModelServiceImpl } from 'vs/editor/common/services/modelServiceImpl';
import { CodeEditorService } from 'vs/workbench/services/editor/browser/codeEditorService';
import { ICodeEditorService } from 'vs/editor/browser/services/codeEditorService';
import { IntegrityServiceImpl } from 'vs/workbench/services/integrity/node/integrityServiceImpl';
import { IIntegrityService } from 'vs/workbench/services/integrity/common/integrity';
import { EditorWorkerServiceImpl } from 'vs/editor/common/services/editorWorkerServiceImpl';
import { IEditorWorkerService } from 'vs/editor/common/services/editorWorkerService';
import { ExtensionService } from 'vs/workbench/services/extensions/electron-browser/extensionService';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ServiceCollection } from 'vs/platform/instantiation/common/serviceCollection';
import { InstantiationService } from 'vs/platform/instantiation/node/instantiationService';
import { ILifecycleService, WillShutdownEvent } from 'vs/platform/lifecycle/common/lifecycle';
import { IMarkerService } from 'vs/platform/markers/common/markers';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { ISearchService, ISearchHistoryService } from 'vs/workbench/services/search/common/search';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { CommandService } from 'vs/workbench/services/commands/common/commandService';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';
import { WorkbenchModeServiceImpl } from 'vs/workbench/services/mode/common/workbenchModeService';
import { IModeService } from 'vs/editor/common/services/modeService';
import { IUntitledEditorService, UntitledEditorService } from 'vs/workbench/services/untitled/common/untitledEditorService';
import { getDelayedChannel, IPCClient } from 'vs/base/parts/ipc/node/ipc';
import { connect as connectNet } from 'vs/base/parts/ipc/node/ipc.net';
import { ExtensionManagementChannelClient } from 'vs/platform/extensionManagement/node/extensionManagementIpc';
import { IExtensionManagementService, IExtensionEnablementService, IExtensionManagementServerService, IExtensionGalleryService } from 'vs/platform/extensionManagement/common/extensionManagement';
import { ExtensionEnablementService } from 'vs/platform/extensionManagement/common/extensionEnablementService';
import { IWorkbenchThemeService } from 'vs/workbench/services/themes/common/workbenchThemeService';
import { WorkbenchThemeService } from 'vs/workbench/services/themes/electron-browser/workbenchThemeService';
import { ITextResourceConfigurationService, ITextResourcePropertiesService } from 'vs/editor/common/services/resourceConfiguration';
import { TextResourceConfigurationService } from 'vs/editor/common/services/resourceConfigurationImpl';
import { TextMateService } from 'vs/workbench/services/textMate/electron-browser/TMSyntax';
import { ITextMateService } from 'vs/workbench/services/textMate/electron-browser/textMateService';
import { IBroadcastService, BroadcastService } from 'vs/workbench/services/broadcast/electron-browser/broadcastService';
import { HashService } from 'vs/workbench/services/hash/node/hashService';
import { IHashService } from 'vs/workbench/services/hash/common/hashService';
import { ILogService } from 'vs/platform/log/common/log';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { Event, Emitter } from 'vs/base/common/event';
import { LocalizationsChannelClient } from 'vs/platform/localizations/node/localizationsIpc';
import { ILocalizationsService } from 'vs/platform/localizations/common/localizations';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { NotificationService } from 'vs/workbench/services/notification/common/notificationService';
import { IDialogService } from 'vs/platform/dialogs/common/dialogs';
import { DialogService } from 'vs/workbench/services/dialogs/electron-browser/dialogService';
import { DialogChannel } from 'vs/platform/dialogs/node/dialogIpc';
import { IRemoteAgentService } from 'vs/workbench/services/remote/node/remoteAgentService';
import { RemoteAgentService } from 'vs/workbench/services/remote/electron-browser/remoteAgentServiceImpl';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { OpenerService } from 'vs/editor/browser/services/openerService';
import { SearchHistoryService } from 'vs/workbench/services/search/common/searchHistoryService';
import { ExtensionManagementServerService } from 'vs/workbench/services/extensions/node/extensionManagementServerService';
import { ExtensionGalleryService } from 'vs/platform/extensionManagement/node/extensionGalleryService';
import { LogLevelSetterChannel } from 'vs/platform/log/node/logIpc';
import { ILabelService } from 'vs/platform/label/common/label';
import { IDownloadService } from 'vs/platform/download/common/download';
import { DownloadService } from 'vs/platform/download/node/downloadService';
import { DownloadServiceChannel } from 'vs/platform/download/node/downloadIpc';
import { TextResourcePropertiesService } from 'vs/workbench/services/textfile/electron-browser/textResourcePropertiesService';
import { MultiExtensionManagementService } from 'vs/workbench/services/extensionManagement/node/multiExtensionManagement';
import { IRemoteAuthorityResolverService } from 'vs/platform/remote/common/remoteAuthorityResolver';
import { RemoteAuthorityResolverService } from 'vs/platform/remote/electron-browser/remoteAuthorityResolverService';
import { IMarkerDecorationsService } from 'vs/editor/common/services/markersDecorationService';
import { MarkerDecorationsService } from 'vs/editor/common/services/markerDecorationsServiceImpl';
import { LabelService } from 'vs/workbench/services/label/common/labelService';

/**
 * Services that we require for the Shell
 */
export interface ICoreServices {
	contextService: IWorkspaceContextService;
	configurationService: IConfigurationService;
	environmentService: IEnvironmentService;
	logService: ILogService;
	storageService: IStorageService;
}

/**
 * The workbench shell contains the workbench with a rich header containing navigation and the activity bar.
 * With the Shell being the top level element in the page, it is also responsible for driving the layouting.
 */
export class Shell extends Disposable {

	private readonly _onWillShutdown = this._register(new Emitter<WillShutdownEvent>());
	get onWillShutdown(): Event<WillShutdownEvent> { return this._onWillShutdown.event; }

	private storageService: IStorageService;
	private environmentService: IEnvironmentService;
	private logService: ILogService;
	private configurationService: IConfigurationService;
	private contextService: IWorkspaceContextService;
	private telemetryService: ITelemetryService;
	private broadcastService: IBroadcastService;
	private themeService: WorkbenchThemeService;
	private lifecycleService: LifecycleService;
	private notificationService: INotificationService;

	private container: HTMLElement;
	private mainProcessClient: IPCClient;
	private mainProcessServices: ServiceCollection;

	private configuration: IWindowConfiguration;

	constructor(
		container: HTMLElement,
		coreServices: ICoreServices,
		mainProcessServices: ServiceCollection,
		mainProcessClient: IPCClient,
		configuration: IWindowConfiguration
	) {
		super();

		this.container = container;
		this.mainProcessClient = this._register(mainProcessClient);

		this.configuration = configuration;

		this.contextService = coreServices.contextService;
		this.configurationService = coreServices.configurationService;
		this.environmentService = coreServices.environmentService;
		this.logService = coreServices.logService;
		this.storageService = coreServices.storageService;

		this.mainProcessServices = mainProcessServices;
	}

	open(): void {

		// Instantiation service with services
		const [instantiationService, serviceCollection] = this.initServiceCollection();

		// Workbench
		const workbench = this._register(instantiationService.createInstance(
			Workbench,
			this.container,
			this.configuration,
			serviceCollection,
			this.lifecycleService,
			this.mainProcessClient
		));
		workbench.startup();

		// Window
		workbench.getInstantiationService().createInstance(ElectronWindow);
	}

	private initServiceCollection(): [IInstantiationService, ServiceCollection] {
		const serviceCollection = new ServiceCollection();
		serviceCollection.set(IWorkspaceContextService, this.contextService);
		serviceCollection.set(IConfigurationService, this.configurationService);
		serviceCollection.set(IEnvironmentService, this.environmentService);
		serviceCollection.set(ILabelService, new SyncDescriptor(LabelService, undefined, true));
		serviceCollection.set(ILogService, this._register(this.logService));
		serviceCollection.set(IStorageService, this.storageService);

		this.mainProcessServices.forEach((serviceIdentifier, serviceInstance) => {
			serviceCollection.set(serviceIdentifier, serviceInstance);
		});

		const instantiationService: IInstantiationService = new InstantiationService(serviceCollection, true);

		this.notificationService = new NotificationService();
		serviceCollection.set(INotificationService, this.notificationService);

		this.broadcastService = instantiationService.createInstance(BroadcastService, this.configuration.windowId);
		serviceCollection.set(IBroadcastService, this.broadcastService);

		serviceCollection.set(IWindowService, new SyncDescriptor(WindowService, [this.configuration.windowId, this.configuration]));

		const sharedProcess = (<IWindowsService>serviceCollection.get(IWindowsService)).whenSharedProcessReady()
			.then(() => connectNet(this.environmentService.sharedIPCHandle, `window:${this.configuration.windowId}`))
			.then(client => {
				client.registerChannel('dialog', instantiationService.createInstance(DialogChannel));

				return client;
			});

		// Hash
		serviceCollection.set(IHashService, new SyncDescriptor(HashService, undefined, true));

		// Telemetry
		if (!this.environmentService.isExtensionDevelopment && !this.environmentService.args['disable-telemetry'] && !!product.enableTelemetry) {
			const channel = getDelayedChannel(sharedProcess.then(c => c.getChannel('telemetryAppender')));
			const config: ITelemetryServiceConfig = {
				appender: combinedAppender(new TelemetryAppenderClient(channel), new LogAppender(this.logService)),
				commonProperties: resolveWorkbenchCommonProperties(this.storageService, product.commit, pkg.version, this.configuration.machineId, this.environmentService.installSourcePath),
				piiPaths: [this.environmentService.appRoot, this.environmentService.extensionsPath]
			};

			this.telemetryService = this._register(instantiationService.createInstance(TelemetryService, config));
			this._register(new ErrorTelemetry(this.telemetryService));
		} else {
			this.telemetryService = NullTelemetryService;
		}

		serviceCollection.set(ITelemetryService, this.telemetryService);
		this._register(configurationTelemetry(this.telemetryService, this.configurationService));

		serviceCollection.set(IDialogService, instantiationService.createInstance(DialogService));

		const lifecycleService = instantiationService.createInstance(LifecycleService);
		this._register(lifecycleService.onWillShutdown(event => this._onWillShutdown.fire(event)));
		this._register(lifecycleService.onShutdown(() => this.dispose()));
		serviceCollection.set(ILifecycleService, lifecycleService);
		this.lifecycleService = lifecycleService;

		serviceCollection.set(IRequestService, new SyncDescriptor(RequestService, undefined, true));
		serviceCollection.set(IDownloadService, new SyncDescriptor(DownloadService, undefined, true));
		serviceCollection.set(IExtensionGalleryService, new SyncDescriptor(ExtensionGalleryService, undefined, true));

		const remoteAuthorityResolverService = new RemoteAuthorityResolverService();
		serviceCollection.set(IRemoteAuthorityResolverService, remoteAuthorityResolverService);

		const remoteAgentService = new RemoteAgentService(this.configuration, this.notificationService, this.environmentService, remoteAuthorityResolverService);
		serviceCollection.set(IRemoteAgentService, remoteAgentService);

		const remoteAgentConnection = remoteAgentService.getConnection();
		if (remoteAgentConnection) {
			remoteAgentConnection.registerChannel('dialog', instantiationService.createInstance(DialogChannel));
			remoteAgentConnection.registerChannel('download', new DownloadServiceChannel());
			remoteAgentConnection.registerChannel('loglevel', new LogLevelSetterChannel(this.logService));
		}

		const extensionManagementChannel = getDelayedChannel(sharedProcess.then(c => c.getChannel('extensions')));
		const extensionManagementChannelClient = new ExtensionManagementChannelClient(extensionManagementChannel);
		serviceCollection.set(IExtensionManagementServerService, new SyncDescriptor(ExtensionManagementServerService, [extensionManagementChannelClient]));
		serviceCollection.set(IExtensionManagementService, new SyncDescriptor(MultiExtensionManagementService));

		const extensionEnablementService = this._register(instantiationService.createInstance(ExtensionEnablementService));
		serviceCollection.set(IExtensionEnablementService, extensionEnablementService);

		serviceCollection.set(IExtensionService, instantiationService.createInstance(ExtensionService));

		this.themeService = instantiationService.createInstance(WorkbenchThemeService, document.body);
		serviceCollection.set(IWorkbenchThemeService, this.themeService);

		serviceCollection.set(ICommandService, new SyncDescriptor(CommandService, undefined, true));

		serviceCollection.set(IMarkerService, new SyncDescriptor(MarkerService, undefined, true));

		serviceCollection.set(IModeService, new SyncDescriptor(WorkbenchModeServiceImpl));

		serviceCollection.set(ITextResourceConfigurationService, new SyncDescriptor(TextResourceConfigurationService));

		serviceCollection.set(ITextResourcePropertiesService, new SyncDescriptor(TextResourcePropertiesService));

		serviceCollection.set(IModelService, new SyncDescriptor(ModelServiceImpl, undefined, true));

		serviceCollection.set(IMarkerDecorationsService, new SyncDescriptor(MarkerDecorationsService));

		serviceCollection.set(IEditorWorkerService, new SyncDescriptor(EditorWorkerServiceImpl));

		serviceCollection.set(IUntitledEditorService, new SyncDescriptor(UntitledEditorService, undefined, true));

		serviceCollection.set(ITextMateService, new SyncDescriptor(TextMateService));

		serviceCollection.set(ISearchService, new SyncDescriptor(SearchService));

		serviceCollection.set(ISearchHistoryService, new SyncDescriptor(SearchHistoryService));

		serviceCollection.set(ICodeEditorService, new SyncDescriptor(CodeEditorService));

		serviceCollection.set(IOpenerService, new SyncDescriptor(OpenerService, undefined, true));

		serviceCollection.set(IIntegrityService, new SyncDescriptor(IntegrityServiceImpl));

		const localizationsChannel = getDelayedChannel(sharedProcess.then(c => c.getChannel('localizations')));
		serviceCollection.set(ILocalizationsService, new SyncDescriptor(LocalizationsChannelClient, [localizationsChannel]));

		return [instantiationService, serviceCollection];
	}
}
