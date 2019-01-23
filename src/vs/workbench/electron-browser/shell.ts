/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/shell';

import * as platform from 'vs/base/common/platform';
import * as perf from 'vs/base/common/performance';
import * as aria from 'vs/base/browser/ui/aria/aria';
import { Disposable } from 'vs/base/common/lifecycle';
import * as errors from 'vs/base/common/errors';
import { toErrorMessage } from 'vs/base/common/errorMessage';
import product from 'vs/platform/node/product';
import { SyncDescriptor } from 'vs/platform/instantiation/common/descriptors';
import pkg from 'vs/platform/node/package';
import { Workbench, IWorkbenchStartedInfo } from 'vs/workbench/electron-browser/workbench';
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
import { CodeEditorService } from 'vs/workbench/services/codeEditor/browser/codeEditorService';
import { ICodeEditorService } from 'vs/editor/browser/services/codeEditorService';
import { IntegrityServiceImpl } from 'vs/platform/integrity/node/integrityServiceImpl';
import { IIntegrityService } from 'vs/platform/integrity/common/integrity';
import { EditorWorkerServiceImpl } from 'vs/editor/common/services/editorWorkerServiceImpl';
import { IEditorWorkerService } from 'vs/editor/common/services/editorWorkerService';
import { ExtensionService } from 'vs/workbench/services/extensions/electron-browser/extensionService';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ServiceCollection } from 'vs/platform/instantiation/common/serviceCollection';
import { InstantiationService } from 'vs/platform/instantiation/node/instantiationService';
import { ILifecycleService, LifecyclePhase, WillShutdownEvent } from 'vs/platform/lifecycle/common/lifecycle';
import { IMarkerService } from 'vs/platform/markers/common/markers';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { ISearchService, ISearchHistoryService } from 'vs/platform/search/common/search';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { CommandService } from 'vs/workbench/services/commands/common/commandService';
import { IWorkspaceContextService, WorkbenchState } from 'vs/platform/workspace/common/workspace';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';
import { WorkbenchModeServiceImpl } from 'vs/workbench/services/mode/common/workbenchModeService';
import { IModeService } from 'vs/editor/common/services/modeService';
import { IUntitledEditorService, UntitledEditorService } from 'vs/workbench/services/untitled/common/untitledEditorService';
import { ICrashReporterService, NullCrashReporterService, CrashReporterService } from 'vs/workbench/services/crashReporter/electron-browser/crashReporterService';
import { getDelayedChannel, IPCClient } from 'vs/base/parts/ipc/node/ipc';
import { connect as connectNet } from 'vs/base/parts/ipc/node/ipc.net';
import { ExtensionManagementChannelClient } from 'vs/platform/extensionManagement/node/extensionManagementIpc';
import { IExtensionManagementService, IExtensionEnablementService, IExtensionManagementServerService, IExtensionGalleryService } from 'vs/platform/extensionManagement/common/extensionManagement';
import { ExtensionEnablementService } from 'vs/platform/extensionManagement/common/extensionEnablementService';
import { BareFontInfo } from 'vs/editor/common/config/fontInfo';
import { restoreFontInfo, readFontInfo, saveFontInfo } from 'vs/editor/browser/config/configuration';
import * as browser from 'vs/base/browser/browser';
import { IWorkbenchThemeService } from 'vs/workbench/services/themes/common/workbenchThemeService';
import { WorkbenchThemeService } from 'vs/workbench/services/themes/electron-browser/workbenchThemeService';
import { ITextResourceConfigurationService, ITextResourcePropertiesService } from 'vs/editor/common/services/resourceConfiguration';
import { TextResourceConfigurationService } from 'vs/editor/common/services/resourceConfigurationImpl';
import { registerThemingParticipant, ITheme, ICssStyleCollector, HIGH_CONTRAST } from 'vs/platform/theme/common/themeService';
import { foreground, selectionBackground, focusBorder, scrollbarShadow, scrollbarSliderActiveBackground, scrollbarSliderBackground, scrollbarSliderHoverBackground, listHighlightForeground, inputPlaceholderForeground } from 'vs/platform/theme/common/colorRegistry';
import { TextMateService } from 'vs/workbench/services/textMate/electron-browser/TMSyntax';
import { ITextMateService } from 'vs/workbench/services/textMate/electron-browser/textMateService';
import { IBroadcastService, BroadcastService } from 'vs/platform/broadcast/electron-browser/broadcastService';
import { HashService } from 'vs/workbench/services/hash/node/hashService';
import { IHashService } from 'vs/workbench/services/hash/common/hashService';
import { ILogService } from 'vs/platform/log/common/log';
import { IStorageService, StorageScope } from 'vs/platform/storage/common/storage';
import { StorageService } from 'vs/platform/storage/node/storageService';
import { Event, Emitter } from 'vs/base/common/event';
import { WORKBENCH_BACKGROUND } from 'vs/workbench/common/theme';
import { LocalizationsChannelClient } from 'vs/platform/localizations/node/localizationsIpc';
import { ILocalizationsService } from 'vs/platform/localizations/common/localizations';
import { IWorkbenchIssueService } from 'vs/workbench/services/issue/common/issue';
import { WorkbenchIssueService } from 'vs/workbench/services/issue/electron-browser/workbenchIssueService';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { NotificationService } from 'vs/workbench/services/notification/common/notificationService';
import { IDialogService } from 'vs/platform/dialogs/common/dialogs';
import { DialogService } from 'vs/workbench/services/dialogs/electron-browser/dialogService';
import { DialogChannel } from 'vs/platform/dialogs/node/dialogIpc';
import { EventType, addDisposableListener, scheduleAtNextAnimationFrame, addClasses } from 'vs/base/browser/dom';
import { IRemoteAgentService } from 'vs/workbench/services/remote/node/remoteAgentService';
import { RemoteAgentService } from 'vs/workbench/services/remote/electron-browser/remoteAgentServiceImpl';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { OpenerService } from 'vs/editor/browser/services/openerService';
import { SearchHistoryService } from 'vs/workbench/services/search/node/searchHistoryService';
import { ExtensionManagementServerService } from 'vs/workbench/services/extensions/node/extensionManagementServerService';
import { ExtensionGalleryService } from 'vs/platform/extensionManagement/node/extensionGalleryService';
import { LogLevelSetterChannel } from 'vs/platform/log/node/logIpc';
import { ILabelService } from 'vs/platform/label/common/label';
import { IDownloadService } from 'vs/platform/download/common/download';
import { DownloadService } from 'vs/platform/download/node/downloadService';
import { DownloadServiceChannel } from 'vs/platform/download/node/downloadIpc';
import { TextResourcePropertiesService } from 'vs/workbench/services/textfile/electron-browser/textResourcePropertiesService';
import { MultiExtensionManagementService } from 'vs/platform/extensionManagement/node/multiExtensionManagement';
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
	storageService: StorageService;
}

/**
 * The workbench shell contains the workbench with a rich header containing navigation and the activity bar.
 * With the Shell being the top level element in the page, it is also responsible for driving the layouting.
 */
export class WorkbenchShell extends Disposable {

	private readonly _onWillShutdown = this._register(new Emitter<WillShutdownEvent>());
	get onWillShutdown(): Event<WillShutdownEvent> { return this._onWillShutdown.event; }

	private storageService: StorageService;
	private environmentService: IEnvironmentService;
	private logService: ILogService;
	private configurationService: IConfigurationService;
	private contextService: IWorkspaceContextService;
	private telemetryService: ITelemetryService;
	private broadcastService: IBroadcastService;
	private themeService: WorkbenchThemeService;
	private lifecycleService: LifecycleService;
	private mainProcessServices: ServiceCollection;
	private notificationService: INotificationService;

	private container: HTMLElement;
	private previousErrorValue: string;
	private previousErrorTime: number;

	private configuration: IWindowConfiguration;
	private workbench: Workbench;

	constructor(container: HTMLElement, coreServices: ICoreServices, mainProcessServices: ServiceCollection, private mainProcessClient: IPCClient, configuration: IWindowConfiguration) {
		super();

		this.container = container;

		this.configuration = configuration;

		this.contextService = coreServices.contextService;
		this.configurationService = coreServices.configurationService;
		this.environmentService = coreServices.environmentService;
		this.logService = coreServices.logService;
		this.storageService = coreServices.storageService;

		this.mainProcessServices = mainProcessServices;

		this.previousErrorTime = 0;
	}

	private renderContents(): void {

		// ARIA
		aria.setARIAContainer(document.body);

		// Instantiation service with services
		const [instantiationService, serviceCollection] = this.initServiceCollection(this.container);

		// Warm up font cache information before building up too many dom elements
		restoreFontInfo(this.storageService);
		readFontInfo(BareFontInfo.createFromRawSettings(this.configurationService.getValue('editor'), browser.getZoomLevel()));
		this._register(this.storageService.onWillSaveState(() => {
			saveFontInfo(this.storageService); // Keep font info for next startup around
		}));

		// Workbench
		this.workbench = this.createWorkbench(instantiationService, serviceCollection, this.container);

		// Window
		this.workbench.getInstantiationService().createInstance(ElectronWindow);

		// Handle case where workbench is not starting up properly
		const timeoutHandle = setTimeout(() => {
			this.logService.warn('Workbench did not finish loading in 10 seconds, that might be a problem that should be reported.');
		}, 10000);

		this.lifecycleService.when(LifecyclePhase.Restored).then(() => {
			clearTimeout(timeoutHandle);
		});
	}

	private createWorkbench(instantiationService: IInstantiationService, serviceCollection: ServiceCollection, container: HTMLElement): Workbench {

		function handleStartupError(logService: ILogService, error: Error): void {

			// Log it
			logService.error(toErrorMessage(error, true));

			// Rethrow
			throw error;
		}

		try {
			const workbench = instantiationService.createInstance(Workbench, container, this.configuration, serviceCollection, this.lifecycleService, this.mainProcessClient);

			// Startup Workbench
			workbench.startup().then(startupInfos => {

				// Startup Telemetry
				this.logStartupTelemetry(startupInfos);

				// Storage Telemetry (TODO@Ben remove me later, including storage errors)
				if (!this.environmentService.extensionTestsPath) {
					this.logStorageTelemetry();
				}
			}, error => handleStartupError(this.logService, error));

			return workbench;
		} catch (error) {
			handleStartupError(this.logService, error);

			return undefined;
		}
	}

	private logStartupTelemetry(info: IWorkbenchStartedInfo): void {
		const { filesToOpen, filesToCreate, filesToDiff } = this.configuration;
		/* __GDPR__
			"workspaceLoad" : {
				"userAgent" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
				"windowSize.innerHeight": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
				"windowSize.innerWidth": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
				"windowSize.outerHeight": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
				"windowSize.outerWidth": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
				"emptyWorkbench": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
				"workbench.filesToOpen": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
				"workbench.filesToCreate": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
				"workbench.filesToDiff": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
				"customKeybindingsCount": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
				"theme": { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
				"language": { "classification": "SystemMetaData", "purpose": "BusinessInsight" },
				"pinnedViewlets": { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
				"restoredViewlet": { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
				"restoredEditors": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
				"pinnedViewlets": { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
				"startupKind": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true }
			}
		*/
		this.telemetryService.publicLog('workspaceLoad', {
			userAgent: navigator.userAgent,
			windowSize: { innerHeight: window.innerHeight, innerWidth: window.innerWidth, outerHeight: window.outerHeight, outerWidth: window.outerWidth },
			emptyWorkbench: this.contextService.getWorkbenchState() === WorkbenchState.EMPTY,
			'workbench.filesToOpen': filesToOpen && filesToOpen.length || 0,
			'workbench.filesToCreate': filesToCreate && filesToCreate.length || 0,
			'workbench.filesToDiff': filesToDiff && filesToDiff.length || 0,
			customKeybindingsCount: info.customKeybindingsCount,
			theme: this.themeService.getColorTheme().id,
			language: platform.language,
			pinnedViewlets: info.pinnedViewlets,
			restoredViewlet: info.restoredViewlet,
			restoredEditors: info.restoredEditorsCount,
			startupKind: this.lifecycleService.startupKind
		});

		// Telemetry: startup metrics
		perf.mark('didStartWorkbench');
	}

	private logStorageTelemetry(): void {
		const initialStartup = !!this.configuration.isInitialStartup;

		const appReadyDuration = initialStartup ? perf.getDuration('main:started', 'main:appReady') : 0;
		const workbenchReadyDuration = perf.getDuration(initialStartup ? 'main:started' : 'main:loadWindow', 'didStartWorkbench');
		const workspaceStorageRequireDuration = perf.getDuration('willRequireSQLite', 'didRequireSQLite');
		const workspaceStorageSchemaDuration = perf.getDuration('willSetupSQLiteSchema', 'didSetupSQLiteSchema');
		const globalStorageInitDurationMain = perf.getDuration('main:willInitGlobalStorage', 'main:didInitGlobalStorage');
		const globalStorageInitDuratioRenderer = perf.getDuration('willInitGlobalStorage', 'didInitGlobalStorage');
		const workspaceStorageInitDuration = perf.getDuration('willInitWorkspaceStorage', 'didInitWorkspaceStorage');
		const workbenchLoadDuration = perf.getDuration('willLoadWorkbenchMain', 'didLoadWorkbenchMain');

		// Handle errors (avoid duplicates to reduce spam)
		const loggedStorageErrors = new Set<string>();
		this._register(this.storageService.onWorkspaceStorageError(error => {
			const errorStr = `${error}`;

			if (!loggedStorageErrors.has(errorStr)) {
				loggedStorageErrors.add(errorStr);

				/* __GDPR__
					"sqliteStorageError5" : {
						"appReadyTime" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
						"workbenchReadyTime" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
						"workspaceRequireTime" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
						"workspaceSchemaTime" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
						"globalReadTimeMain" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
						"globalReadTimeRenderer" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
						"workspaceReadTime" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
						"workbenchRequireTime" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
						"workspaceKeys" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
						"startupKind": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
						"storageError": { "classification": "SystemMetaData", "purpose": "FeatureInsight" }
					}
				*/

				/* __GDPR__
					"sqliteStorageError<NUMBER>" : {
						"appReadyTime" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
						"workbenchReadyTime" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
						"workspaceRequireTime" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
						"workspaceSchemaTime" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
						"globalReadTimeMain" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
						"globalReadTimeRenderer" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
						"workspaceReadTime" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
						"workbenchRequireTime" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
						"workspaceKeys" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
						"startupKind": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
						"storageError": { "classification": "SystemMetaData", "purpose": "FeatureInsight" }
					}
				*/
				this.telemetryService.publicLog('sqliteStorageError5', {
					'appReadyTime': appReadyDuration,
					'workbenchReadyTime': workbenchReadyDuration,
					'workspaceRequireTime': workspaceStorageRequireDuration,
					'workspaceSchemaTime': workspaceStorageSchemaDuration,
					'globalReadTimeMain': globalStorageInitDurationMain,
					'globalReadTimeRenderer': globalStorageInitDuratioRenderer,
					'workspaceReadTime': workspaceStorageInitDuration,
					'workbenchRequireTime': workbenchLoadDuration,
					'workspaceKeys': this.storageService.getSize(StorageScope.WORKSPACE),
					'startupKind': this.lifecycleService.startupKind,
					'storageError': errorStr
				});
			}
		}));


		if (this.storageService.hasErrors) {
			return; // do not log performance numbers when errors occured
		}

		if (this.environmentService.verbose) {
			return; // do not log when running in verbose mode
		}

		/* __GDPR__
			"sqliteStorageTimers5" : {
				"appReadyTime" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
				"workbenchReadyTime" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
				"workspaceRequireTime" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
				"workspaceSchemaTime" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
				"globalReadTimeMain" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
				"globalReadTimeRenderer" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
				"workspaceReadTime" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
				"workbenchRequireTime" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
				"workspaceKeys" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
				"startupKind": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true }
			}
		*/

		/* __GDPR__
			"sqliteStorageTimers<NUMBER>" : {
				"appReadyTime" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
				"workbenchReadyTime" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
				"workspaceRequireTime" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
				"workspaceSchemaTime" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
				"globalReadTimeMain" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
				"globalReadTimeRenderer" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
				"workspaceReadTime" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
				"workbenchRequireTime" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
				"workspaceKeys" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
				"startupKind": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true }
			}
		*/
		this.telemetryService.publicLog('sqliteStorageTimers5', {
			'appReadyTime': appReadyDuration,
			'workbenchReadyTime': workbenchReadyDuration,
			'workspaceRequireTime': workspaceStorageRequireDuration,
			'workspaceSchemaTime': workspaceStorageSchemaDuration,
			'globalReadTimeMain': globalStorageInitDurationMain,
			'globalReadTimeRenderer': globalStorageInitDuratioRenderer,
			'workspaceReadTime': workspaceStorageInitDuration,
			'workbenchRequireTime': workbenchLoadDuration,
			'workspaceKeys': this.storageService.getSize(StorageScope.WORKSPACE),
			'startupKind': this.lifecycleService.startupKind
		});
	}

	private initServiceCollection(container: HTMLElement): [IInstantiationService, ServiceCollection] {
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
			.then(() => connectNet(this.environmentService.sharedIPCHandle, `window:${this.configuration.windowId}`));

		sharedProcess.then(client => {
			client.registerChannel('dialog', instantiationService.createInstance(DialogChannel));
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

		let crashReporterService = NullCrashReporterService;
		if (!this.environmentService.disableCrashReporter && product.crashReporter && product.hockeyApp) {
			crashReporterService = instantiationService.createInstance(CrashReporterService);
		}
		serviceCollection.set(ICrashReporterService, crashReporterService);

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

		serviceCollection.set(IWorkbenchIssueService, new SyncDescriptor(WorkbenchIssueService));

		serviceCollection.set(ICodeEditorService, new SyncDescriptor(CodeEditorService));

		serviceCollection.set(IOpenerService, new SyncDescriptor(OpenerService, undefined, true));

		serviceCollection.set(IIntegrityService, new SyncDescriptor(IntegrityServiceImpl));

		const localizationsChannel = getDelayedChannel(sharedProcess.then(c => c.getChannel('localizations')));
		serviceCollection.set(ILocalizationsService, new SyncDescriptor(LocalizationsChannelClient, [localizationsChannel]));

		return [instantiationService, serviceCollection];
	}

	open(): void {

		// Listen on unhandled rejection events
		window.addEventListener('unhandledrejection', (event: PromiseRejectionEvent) => {

			// See https://developer.mozilla.org/en-US/docs/Web/API/PromiseRejectionEvent
			errors.onUnexpectedError(event.reason);

			// Prevent the printing of this event to the console
			event.preventDefault();
		});

		// Listen on unexpected errors
		errors.setUnexpectedErrorHandler((error: any) => {
			this.onUnexpectedError(error);
		});

		// Shell Class for CSS Scoping
		addClasses(this.container, 'monaco-shell', platform.isWindows ? 'windows' : platform.isLinux ? 'linux' : 'mac');

		// Create Contents
		this.renderContents();

		// Layout
		this.layout();

		// Listeners
		this.registerListeners();

		// Set lifecycle phase to `Ready`
		this.lifecycleService.phase = LifecyclePhase.Ready;
	}

	private registerListeners(): void {
		this._register(addDisposableListener(window, EventType.RESIZE, e => this.onWindowResize(e, true)));
	}

	private onWindowResize(e: any, retry: boolean): void {
		if (e.target === window) {
			if (window.document && window.document.body && window.document.body.clientWidth === 0) {
				// TODO@Ben this is an electron issue on macOS when simple fullscreen is enabled
				// where for some reason the window clientWidth is reported as 0 when switching
				// between simple fullscreen and normal screen. In that case we schedule the layout
				// call at the next animation frame once, in the hope that the dimensions are
				// proper then.
				if (retry) {
					scheduleAtNextAnimationFrame(() => this.onWindowResize(e, false));
				}
				return;
			}

			this.layout();
		}
	}

	onUnexpectedError(error: any): void {
		const errorMsg = toErrorMessage(error, true);
		if (!errorMsg) {
			return;
		}

		const now = Date.now();
		if (errorMsg === this.previousErrorValue && now - this.previousErrorTime <= 1000) {
			return; // Return if error message identical to previous and shorter than 1 second
		}

		this.previousErrorTime = now;
		this.previousErrorValue = errorMsg;

		// Log it
		this.logService.error(errorMsg);

		// Show to user if friendly message provided
		if (error && error.friendlyMessage && this.notificationService) {
			this.notificationService.error(error.friendlyMessage);
		}
	}

	private layout(): void {
		this.workbench.layout();
	}

	dispose(): void {
		super.dispose();

		// Dispose Workbench
		if (this.workbench) {
			this.workbench.dispose();
		}

		this.mainProcessClient.dispose();
	}
}

registerThemingParticipant((theme: ITheme, collector: ICssStyleCollector) => {

	// Foreground
	const windowForeground = theme.getColor(foreground);
	if (windowForeground) {
		collector.addRule(`.monaco-shell { color: ${windowForeground}; }`);
	}

	// Selection
	const windowSelectionBackground = theme.getColor(selectionBackground);
	if (windowSelectionBackground) {
		collector.addRule(`.monaco-shell ::selection { background-color: ${windowSelectionBackground}; }`);
	}

	// Input placeholder
	const placeholderForeground = theme.getColor(inputPlaceholderForeground);
	if (placeholderForeground) {
		collector.addRule(`.monaco-shell input::-webkit-input-placeholder { color: ${placeholderForeground}; }`);
		collector.addRule(`.monaco-shell textarea::-webkit-input-placeholder { color: ${placeholderForeground}; }`);
	}

	// List highlight
	const listHighlightForegroundColor = theme.getColor(listHighlightForeground);
	if (listHighlightForegroundColor) {
		collector.addRule(`
			.monaco-shell .monaco-tree .monaco-tree-row .monaco-highlighted-label .highlight,
			.monaco-shell .monaco-list .monaco-list-row .monaco-highlighted-label .highlight {
				color: ${listHighlightForegroundColor};
			}
		`);
	}

	// We need to set the workbench background color so that on Windows we get subpixel-antialiasing.
	const workbenchBackground = WORKBENCH_BACKGROUND(theme);
	collector.addRule(`.monaco-workbench { background-color: ${workbenchBackground}; }`);

	// Scrollbars
	const scrollbarShadowColor = theme.getColor(scrollbarShadow);
	if (scrollbarShadowColor) {
		collector.addRule(`
			.monaco-shell .monaco-scrollable-element > .shadow.top {
				box-shadow: ${scrollbarShadowColor} 0 6px 6px -6px inset;
			}

			.monaco-shell .monaco-scrollable-element > .shadow.left {
				box-shadow: ${scrollbarShadowColor} 6px 0 6px -6px inset;
			}

			.monaco-shell .monaco-scrollable-element > .shadow.top.left {
				box-shadow: ${scrollbarShadowColor} 6px 6px 6px -6px inset;
			}
		`);
	}

	const scrollbarSliderBackgroundColor = theme.getColor(scrollbarSliderBackground);
	if (scrollbarSliderBackgroundColor) {
		collector.addRule(`
			.monaco-shell .monaco-scrollable-element > .scrollbar > .slider {
				background: ${scrollbarSliderBackgroundColor};
			}
		`);
	}

	const scrollbarSliderHoverBackgroundColor = theme.getColor(scrollbarSliderHoverBackground);
	if (scrollbarSliderHoverBackgroundColor) {
		collector.addRule(`
			.monaco-shell .monaco-scrollable-element > .scrollbar > .slider:hover {
				background: ${scrollbarSliderHoverBackgroundColor};
			}
		`);
	}

	const scrollbarSliderActiveBackgroundColor = theme.getColor(scrollbarSliderActiveBackground);
	if (scrollbarSliderActiveBackgroundColor) {
		collector.addRule(`
			.monaco-shell .monaco-scrollable-element > .scrollbar > .slider.active {
				background: ${scrollbarSliderActiveBackgroundColor};
			}
		`);
	}

	// Focus outline
	const focusOutline = theme.getColor(focusBorder);
	if (focusOutline) {
		collector.addRule(`
		.monaco-shell [tabindex="0"]:focus,
		.monaco-shell .synthetic-focus,
		.monaco-shell select:focus,
		.monaco-shell .monaco-tree.focused.no-focused-item:focus:before,
		.monaco-shell .monaco-list:not(.element-focused):focus:before,
		.monaco-shell input[type="button"]:focus,
		.monaco-shell input[type="text"]:focus,
		.monaco-shell button:focus,
		.monaco-shell textarea:focus,
		.monaco-shell input[type="search"]:focus,
		.monaco-shell input[type="checkbox"]:focus {
			outline-color: ${focusOutline};
		}
		`);
	}

	// High Contrast theme overwrites for outline
	if (theme.type === HIGH_CONTRAST) {
		collector.addRule(`
		.monaco-shell.hc-black [tabindex="0"]:focus,
		.monaco-shell.hc-black .synthetic-focus,
		.monaco-shell.hc-black select:focus,
		.monaco-shell.hc-black input[type="button"]:focus,
		.monaco-shell.hc-black input[type="text"]:focus,
		.monaco-shell.hc-black textarea:focus,
		.monaco-shell.hc-black input[type="checkbox"]:focus {
			outline-style: solid;
			outline-width: 1px;
		}

		.monaco-shell.hc-black .monaco-tree.focused.no-focused-item:focus:before {
			outline-width: 1px;
			outline-offset: -2px;
		}

		.monaco-shell.hc-black .synthetic-focus input {
			background: transparent; /* Search input focus fix when in high contrast */
		}
		`);
	}
});
