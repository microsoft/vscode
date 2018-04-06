/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./media/shell';

import * as platform from 'vs/base/common/platform';
import * as perf from 'vs/base/common/performance';
import * as aria from 'vs/base/browser/ui/aria/aria';
import { dispose, IDisposable } from 'vs/base/common/lifecycle';
import * as errors from 'vs/base/common/errors';
import { toErrorMessage } from 'vs/base/common/errorMessage';
import product from 'vs/platform/node/product';
import { SyncDescriptor } from 'vs/platform/instantiation/common/descriptors';
import pkg from 'vs/platform/node/package';
import { ContextViewService } from 'vs/platform/contextview/browser/contextViewService';
import { Workbench, IWorkbenchStartedInfo } from 'vs/workbench/electron-browser/workbench';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { NullTelemetryService, configurationTelemetry } from 'vs/platform/telemetry/common/telemetryUtils';
import { IExperimentService, ExperimentService } from 'vs/platform/telemetry/common/experiments';
import { ITelemetryAppenderChannel, TelemetryAppenderClient } from 'vs/platform/telemetry/common/telemetryIpc';
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
import { CodeEditorServiceImpl } from 'vs/editor/browser/services/codeEditorServiceImpl';
import { ICodeEditorService } from 'vs/editor/browser/services/codeEditorService';
import { IntegrityServiceImpl } from 'vs/platform/integrity/node/integrityServiceImpl';
import { IIntegrityService } from 'vs/platform/integrity/common/integrity';
import { EditorWorkerServiceImpl } from 'vs/editor/common/services/editorWorkerServiceImpl';
import { IEditorWorkerService } from 'vs/editor/common/services/editorWorkerService';
import { ExtensionService } from 'vs/workbench/services/extensions/electron-browser/extensionService';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ServiceCollection } from 'vs/platform/instantiation/common/serviceCollection';
import { InstantiationService } from 'vs/platform/instantiation/common/instantiationService';
import { IContextViewService } from 'vs/platform/contextview/browser/contextView';
import { ILifecycleService, LifecyclePhase, ShutdownReason, StartupKind } from 'vs/platform/lifecycle/common/lifecycle';
import { IMarkerService } from 'vs/platform/markers/common/markers';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { ISearchService } from 'vs/platform/search/common/search';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { CommandService } from 'vs/workbench/services/commands/common/commandService';
import { IWorkspaceContextService, WorkbenchState } from 'vs/platform/workspace/common/workspace';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';
import { WorkbenchModeServiceImpl } from 'vs/workbench/services/mode/common/workbenchModeService';
import { IModeService } from 'vs/editor/common/services/modeService';
import { IUntitledEditorService, UntitledEditorService } from 'vs/workbench/services/untitled/common/untitledEditorService';
import { ICrashReporterService, NullCrashReporterService, CrashReporterService } from 'vs/workbench/services/crashReporter/electron-browser/crashReporterService';
import { getDelayedChannel } from 'vs/base/parts/ipc/common/ipc';
import { connect as connectNet } from 'vs/base/parts/ipc/node/ipc.net';
import { IExtensionManagementChannel, ExtensionManagementChannelClient } from 'vs/platform/extensionManagement/common/extensionManagementIpc';
import { IExtensionManagementService, IExtensionEnablementService } from 'vs/platform/extensionManagement/common/extensionManagement';
import { ExtensionEnablementService } from 'vs/platform/extensionManagement/common/extensionEnablementService';
import { ITimerService } from 'vs/workbench/services/timer/common/timerService';
import { BareFontInfo } from 'vs/editor/common/config/fontInfo';
import { restoreFontInfo, readFontInfo, saveFontInfo } from 'vs/editor/browser/config/configuration';
import * as browser from 'vs/base/browser/browser';
import 'vs/platform/opener/browser/opener.contribution';
import { IWorkbenchThemeService } from 'vs/workbench/services/themes/common/workbenchThemeService';
import { WorkbenchThemeService } from 'vs/workbench/services/themes/electron-browser/workbenchThemeService';
import { ITextResourceConfigurationService } from 'vs/editor/common/services/resourceConfiguration';
import { TextResourceConfigurationService } from 'vs/editor/common/services/resourceConfigurationImpl';
import { registerThemingParticipant, ITheme, ICssStyleCollector, HIGH_CONTRAST } from 'vs/platform/theme/common/themeService';
import { foreground, selectionBackground, focusBorder, scrollbarShadow, scrollbarSliderActiveBackground, scrollbarSliderBackground, scrollbarSliderHoverBackground, listHighlightForeground, inputPlaceholderForeground } from 'vs/platform/theme/common/colorRegistry';
import { TextMateService } from 'vs/workbench/services/textMate/electron-browser/TMSyntax';
import { ITextMateService } from 'vs/workbench/services/textMate/electron-browser/textMateService';
import { IBroadcastService, BroadcastService } from 'vs/platform/broadcast/electron-browser/broadcastService';
import { HashService } from 'vs/workbench/services/hash/node/hashService';
import { IHashService } from 'vs/workbench/services/hash/common/hashService';
import { ILogService } from 'vs/platform/log/common/log';
import { WORKBENCH_BACKGROUND } from 'vs/workbench/common/theme';
import { stat } from 'fs';
import { join } from 'path';
import { ILocalizationsChannel, LocalizationsChannelClient } from 'vs/platform/localizations/common/localizationsIpc';
import { ILocalizationsService } from 'vs/platform/localizations/common/localizations';
import { IWorkbenchIssueService } from 'vs/workbench/services/issue/common/issue';
import { WorkbenchIssueService } from 'vs/workbench/services/issue/electron-browser/workbenchIssueService';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { NotificationService } from 'vs/workbench/services/notification/common/notificationService';
import { IDialogService } from 'vs/platform/dialogs/common/dialogs';
import { DialogService } from 'vs/workbench/services/dialogs/electron-browser/dialogService';
import { DialogChannel } from 'vs/platform/dialogs/common/dialogIpc';
import { EventType, addDisposableListener, addClass, getClientArea } from 'vs/base/browser/dom';

/**
 * Services that we require for the Shell
 */
export interface ICoreServices {
	contextService: IWorkspaceContextService;
	configurationService: IConfigurationService;
	environmentService: IEnvironmentService;
	logService: ILogService;
	timerService: ITimerService;
	storageService: IStorageService;
}

/**
 * The workbench shell contains the workbench with a rich header containing navigation and the activity bar.
 * With the Shell being the top level element in the page, it is also responsible for driving the layouting.
 */
export class WorkbenchShell {
	private storageService: IStorageService;
	private environmentService: IEnvironmentService;
	private logService: ILogService;
	private contextViewService: ContextViewService;
	private configurationService: IConfigurationService;
	private contextService: IWorkspaceContextService;
	private telemetryService: ITelemetryService;
	private experimentService: IExperimentService;
	private extensionService: ExtensionService;
	private broadcastService: IBroadcastService;
	private timerService: ITimerService;
	private themeService: WorkbenchThemeService;
	private lifecycleService: LifecycleService;
	private mainProcessServices: ServiceCollection;
	private notificationService: INotificationService;

	private container: HTMLElement;
	private toUnbind: IDisposable[];
	private previousErrorValue: string;
	private previousErrorTime: number;
	private content: HTMLElement;
	private contentsContainer: HTMLElement;

	private configuration: IWindowConfiguration;
	private workbench: Workbench;

	constructor(container: HTMLElement, coreServices: ICoreServices, mainProcessServices: ServiceCollection, configuration: IWindowConfiguration) {
		this.container = container;

		this.configuration = configuration;

		this.contextService = coreServices.contextService;
		this.configurationService = coreServices.configurationService;
		this.environmentService = coreServices.environmentService;
		this.logService = coreServices.logService;
		this.timerService = coreServices.timerService;
		this.storageService = coreServices.storageService;

		this.mainProcessServices = mainProcessServices;

		this.toUnbind = [];
		this.previousErrorTime = 0;
	}

	private createContents(parent: HTMLElement): HTMLElement {

		// ARIA
		aria.setARIAContainer(document.body);

		// Workbench Container
		const workbenchContainer = document.createElement('div');
		parent.appendChild(workbenchContainer);

		// Instantiation service with services
		const [instantiationService, serviceCollection] = this.initServiceCollection(parent);

		// Workbench
		this.workbench = this.createWorkbench(instantiationService, serviceCollection, parent, workbenchContainer);

		// Window
		this.workbench.getInstantiationService().createInstance(ElectronWindow, this.container);

		// Handle case where workbench is not starting up properly
		const timeoutHandle = setTimeout(() => {
			this.logService.warn('Workbench did not finish loading in 10 seconds, that might be a problem that should be reported.');
		}, 10000);

		this.lifecycleService.when(LifecyclePhase.Running).then(() => {
			clearTimeout(timeoutHandle);
		});

		return workbenchContainer;
	}

	private createWorkbench(instantiationService: IInstantiationService, serviceCollection: ServiceCollection, parent: HTMLElement, workbenchContainer: HTMLElement): Workbench {
		try {
			const workbench = instantiationService.createInstance(Workbench, parent, workbenchContainer, this.configuration, serviceCollection, this.lifecycleService);

			// Set lifecycle phase to `Restoring`
			this.lifecycleService.phase = LifecyclePhase.Restoring;

			// Startup Workbench
			workbench.startup().done(startupInfos => {

				// Set lifecycle phase to `Runnning` so that other contributions can now do something
				this.lifecycleService.phase = LifecyclePhase.Running;

				// Startup Telemetry
				this.logStartupTelemetry(startupInfos);

				// Set lifecycle phase to `Runnning For A Bit` after a short delay
				let eventuallPhaseTimeoutHandle = setTimeout(() => {
					eventuallPhaseTimeoutHandle = void 0;
					this.lifecycleService.phase = LifecyclePhase.Eventually;
				}, 3000);
				this.toUnbind.push({
					dispose: () => {
						if (eventuallPhaseTimeoutHandle) {
							clearTimeout(eventuallPhaseTimeoutHandle);
						}
					}
				});

				// localStorage metrics (TODO@Ben remove me later)
				if (!this.environmentService.extensionTestsPath && this.contextService.getWorkbenchState() === WorkbenchState.FOLDER) {
					this.logLocalStorageMetrics();
				}
			});

			return workbench;
		} catch (error) {

			// Log it
			this.logService.error(toErrorMessage(error, true));

			// Rethrow
			throw error;
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
				"experiments": { "${inline}": [ "${IExperiments}" ] },
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
			experiments: this.experimentService.getExperiments(),
			pinnedViewlets: info.pinnedViewlets,
			restoredViewlet: info.restoredViewlet,
			restoredEditors: info.restoredEditors.length,
			startupKind: this.lifecycleService.startupKind
		});

		// Telemetry: startup metrics
		perf.mark('didStartWorkbench');
		this.extensionService.whenInstalledExtensionsRegistered().done(() => {
			/* __GDPR__
				"startupTime" : {
					"${include}": [
						"${IStartupMetrics}"
					]
				}
			*/
			this.telemetryService.publicLog('startupTime', this.timerService.startupMetrics);
		});
	}

	private logLocalStorageMetrics(): void {
		if (this.lifecycleService.startupKind === StartupKind.ReloadedWindow || this.lifecycleService.startupKind === StartupKind.ReopenedWindow) {
			return; // avoid logging localStorage metrics for reload/reopen, we prefer cold startup numbers
		}

		perf.mark('willReadLocalStorage');
		const readyToSend = this.storageService.getBoolean('localStorageMetricsReadyToSend3');
		perf.mark('didReadLocalStorage');

		if (!readyToSend) {
			this.storageService.store('localStorageMetricsReadyToSend3', true);
			return; // avoid logging localStorage metrics directly after the update, we prefer cold startup numbers
		}

		if (!this.storageService.getBoolean('localStorageMetricsSent3')) {
			perf.mark('willWriteLocalStorage');
			this.storageService.store('localStorageMetricsSent3', true);
			perf.mark('didWriteLocalStorage');

			perf.mark('willStatLocalStorage');
			stat(join(this.environmentService.userDataPath, 'Local Storage', 'file__0.localstorage'), (error, stat) => {
				perf.mark('didStatLocalStorage');

				/* __GDPR__
					"localStorageTimers2" : {
						"statTime" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
						"accessTime" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
						"firstReadTime" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
						"subsequentReadTime" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
						"writeTime" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
						"keys" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
						"size": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true }
					}
				*/
				this.telemetryService.publicLog('localStorageTimers2', {
					'statTime': perf.getDuration('willStatLocalStorage', 'didStatLocalStorage'),
					'accessTime': perf.getDuration('willAccessLocalStorage', 'didAccessLocalStorage'),
					'firstReadTime': perf.getDuration('willReadWorkspaceIdentifier', 'didReadWorkspaceIdentifier'),
					'subsequentReadTime': perf.getDuration('willReadLocalStorage', 'didReadLocalStorage'),
					'writeTime': perf.getDuration('willWriteLocalStorage', 'didWriteLocalStorage'),
					'keys': window.localStorage.length,
					'size': stat ? stat.size : -1
				});
			});
		}
	}

	private initServiceCollection(container: HTMLElement): [IInstantiationService, ServiceCollection] {
		const serviceCollection = new ServiceCollection();
		serviceCollection.set(IWorkspaceContextService, this.contextService);
		serviceCollection.set(IConfigurationService, this.configurationService);
		serviceCollection.set(IEnvironmentService, this.environmentService);
		serviceCollection.set(ILogService, this.logService);
		this.toUnbind.push(this.logService);

		serviceCollection.set(ITimerService, this.timerService);
		serviceCollection.set(IStorageService, this.storageService);
		this.mainProcessServices.forEach((serviceIdentifier, serviceInstance) => {
			serviceCollection.set(serviceIdentifier, serviceInstance);
		});

		const instantiationService: IInstantiationService = new InstantiationService(serviceCollection, true);

		this.notificationService = new NotificationService();
		serviceCollection.set(INotificationService, this.notificationService);

		this.broadcastService = instantiationService.createInstance(BroadcastService, this.configuration.windowId);
		serviceCollection.set(IBroadcastService, this.broadcastService);

		serviceCollection.set(IWindowService, new SyncDescriptor(WindowService, this.configuration.windowId, this.configuration));

		const sharedProcess = (<IWindowsService>serviceCollection.get(IWindowsService)).whenSharedProcessReady()
			.then(() => connectNet(this.environmentService.sharedIPCHandle, `window:${this.configuration.windowId}`));

		sharedProcess
			.done(client => client.registerChannel('dialog', instantiationService.createInstance(DialogChannel)));

		// Warm up font cache information before building up too many dom elements
		restoreFontInfo(this.storageService);
		readFontInfo(BareFontInfo.createFromRawSettings(this.configurationService.getValue('editor'), browser.getZoomLevel()));

		// Hash
		serviceCollection.set(IHashService, new SyncDescriptor(HashService));

		// Experiments
		this.experimentService = instantiationService.createInstance(ExperimentService);
		serviceCollection.set(IExperimentService, this.experimentService);

		// Telemetry
		if (this.environmentService.isBuilt && !this.environmentService.isExtensionDevelopment && !this.environmentService.args['disable-telemetry'] && !!product.enableTelemetry) {
			const channel = getDelayedChannel<ITelemetryAppenderChannel>(sharedProcess.then(c => c.getChannel('telemetryAppender')));
			const commit = product.commit;
			const version = pkg.version;

			const config: ITelemetryServiceConfig = {
				appender: new TelemetryAppenderClient(channel),
				commonProperties: resolveWorkbenchCommonProperties(this.storageService, commit, version, this.configuration.machineId, this.environmentService.installSourcePath),
				piiPaths: [this.environmentService.appRoot, this.environmentService.extensionsPath]
			};

			const telemetryService = instantiationService.createInstance(TelemetryService, config);
			this.telemetryService = telemetryService;

			const errorTelemetry = new ErrorTelemetry(telemetryService);

			this.toUnbind.push(telemetryService, errorTelemetry);
		} else {
			this.telemetryService = NullTelemetryService;
		}

		serviceCollection.set(ITelemetryService, this.telemetryService);
		this.toUnbind.push(configurationTelemetry(this.telemetryService, this.configurationService));

		let crashReporterService = NullCrashReporterService;
		if (!this.environmentService.disableCrashReporter && product.crashReporter && product.hockeyApp) {
			crashReporterService = instantiationService.createInstance(CrashReporterService);
		}
		serviceCollection.set(ICrashReporterService, crashReporterService);

		serviceCollection.set(IDialogService, instantiationService.createInstance(DialogService));

		const lifecycleService = instantiationService.createInstance(LifecycleService);
		this.toUnbind.push(lifecycleService.onShutdown(reason => this.dispose(reason)));
		serviceCollection.set(ILifecycleService, lifecycleService);
		this.lifecycleService = lifecycleService;

		const extensionManagementChannel = getDelayedChannel<IExtensionManagementChannel>(sharedProcess.then(c => c.getChannel('extensions')));
		serviceCollection.set(IExtensionManagementService, new SyncDescriptor(ExtensionManagementChannelClient, extensionManagementChannel));

		const extensionEnablementService = instantiationService.createInstance(ExtensionEnablementService);
		serviceCollection.set(IExtensionEnablementService, extensionEnablementService);
		this.toUnbind.push(extensionEnablementService);

		serviceCollection.set(IRequestService, new SyncDescriptor(RequestService));

		this.extensionService = instantiationService.createInstance(ExtensionService);
		serviceCollection.set(IExtensionService, this.extensionService);

		perf.mark('willLoadExtensions');
		this.extensionService.whenInstalledExtensionsRegistered().done(() => {
			perf.mark('didLoadExtensions');
		});

		this.themeService = instantiationService.createInstance(WorkbenchThemeService, document.body);
		serviceCollection.set(IWorkbenchThemeService, this.themeService);

		serviceCollection.set(ICommandService, new SyncDescriptor(CommandService));

		this.contextViewService = instantiationService.createInstance(ContextViewService, this.container);
		serviceCollection.set(IContextViewService, this.contextViewService);

		serviceCollection.set(IMarkerService, new SyncDescriptor(MarkerService));

		serviceCollection.set(IModeService, new SyncDescriptor(WorkbenchModeServiceImpl));

		serviceCollection.set(IModelService, new SyncDescriptor(ModelServiceImpl));

		serviceCollection.set(ITextResourceConfigurationService, new SyncDescriptor(TextResourceConfigurationService));

		serviceCollection.set(IEditorWorkerService, new SyncDescriptor(EditorWorkerServiceImpl));

		serviceCollection.set(IUntitledEditorService, new SyncDescriptor(UntitledEditorService));

		serviceCollection.set(ITextMateService, new SyncDescriptor(TextMateService));

		serviceCollection.set(ISearchService, new SyncDescriptor(SearchService));

		serviceCollection.set(IWorkbenchIssueService, new SyncDescriptor(WorkbenchIssueService));

		serviceCollection.set(ICodeEditorService, new SyncDescriptor(CodeEditorServiceImpl));

		serviceCollection.set(IIntegrityService, new SyncDescriptor(IntegrityServiceImpl));

		const localizationsChannel = getDelayedChannel<ILocalizationsChannel>(sharedProcess.then(c => c.getChannel('localizations')));
		serviceCollection.set(ILocalizationsService, new SyncDescriptor(LocalizationsChannelClient, localizationsChannel));

		return [instantiationService, serviceCollection];
	}

	public open(): void {

		// Listen on unexpected errors
		errors.setUnexpectedErrorHandler((error: any) => {
			this.onUnexpectedError(error);
		});

		// Shell Class for CSS Scoping
		addClass(this.container, 'monaco-shell');

		// Controls
		this.content = document.createElement('div');
		addClass(this.content, 'monaco-shell-content');
		this.container.appendChild(this.content);

		// Create Contents
		this.contentsContainer = this.createContents(this.content);

		// Layout
		this.layout();

		// Listeners
		this.registerListeners();
	}

	private registerListeners(): void {

		// Resize
		this.toUnbind.push(addDisposableListener(window, EventType.RESIZE, () => this.layout()));
	}

	public onUnexpectedError(error: any): void {
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
		const clientArea = getClientArea(this.container);

		this.contentsContainer.style.width = `${clientArea.width}px`;
		this.contentsContainer.style.height = `${clientArea.height}px`;

		this.contextViewService.layout();
		this.workbench.layout();
	}

	public dispose(reason = ShutdownReason.QUIT): void {

		// Dispose bindings
		this.toUnbind = dispose(this.toUnbind);

		// Keep font info for next startup around
		saveFontInfo(this.storageService);

		// Dispose Workbench
		if (this.workbench) {
			this.workbench.dispose(reason);
		}
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
