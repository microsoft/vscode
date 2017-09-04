/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./media/shell';

import * as nls from 'vs/nls';
import { TPromise } from 'vs/base/common/winjs.base';
import * as platform from 'vs/base/common/platform';
import { Dimension, Builder, $ } from 'vs/base/browser/builder';
import dom = require('vs/base/browser/dom');
import aria = require('vs/base/browser/ui/aria/aria');
import { dispose, IDisposable } from 'vs/base/common/lifecycle';
import errors = require('vs/base/common/errors');
import { toErrorMessage } from 'vs/base/common/errorMessage';
import product from 'vs/platform/node/product';
import { SyncDescriptor } from 'vs/platform/instantiation/common/descriptors';
import pkg from 'vs/platform/node/package';
import { ContextViewService } from 'vs/platform/contextview/browser/contextViewService';
import { Workbench, IWorkbenchStartedInfo } from 'vs/workbench/electron-browser/workbench';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { NullTelemetryService, configurationTelemetry, lifecycleTelemetry } from 'vs/platform/telemetry/common/telemetryUtils';
import { IExperimentService, ExperimentService } from 'vs/platform/telemetry/common/experiments';
import { ITelemetryAppenderChannel, TelemetryAppenderClient } from 'vs/platform/telemetry/common/telemetryIpc';
import { TelemetryService, ITelemetryServiceConfig } from 'vs/platform/telemetry/common/telemetryService';
import { IdleMonitor, UserStatus } from 'vs/platform/telemetry/browser/idleMonitor';
import ErrorTelemetry from 'vs/platform/telemetry/browser/errorTelemetry';
import { ElectronWindow } from 'vs/workbench/electron-browser/window';
import { resolveWorkbenchCommonProperties, getOrCreateMachineId } from 'vs/platform/telemetry/node/workbenchCommonProperties';
import { machineIdIpcChannel } from 'vs/platform/telemetry/node/commonProperties';
import { WorkspaceStats } from 'vs/workbench/services/telemetry/common/workspaceStats';
import { IWindowsService, IWindowService, IWindowConfiguration } from 'vs/platform/windows/common/windows';
import { WindowService } from 'vs/platform/windows/electron-browser/windowService';
import { MessageService } from 'vs/workbench/services/message/electron-browser/messageService';
import { IRequestService } from 'vs/platform/request/node/request';
import { RequestService } from 'vs/platform/request/electron-browser/requestService';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { SearchService } from 'vs/workbench/services/search/node/searchService';
import { LifecycleService } from 'vs/workbench/services/lifecycle/electron-browser/lifecycleService';
import { MarkerService } from 'vs/platform/markers/common/markerService';
import { IModelService } from 'vs/editor/common/services/modelService';
import { ModelServiceImpl } from 'vs/editor/common/services/modelServiceImpl';
import { CodeEditorServiceImpl } from 'vs/editor/browser/services/codeEditorServiceImpl';
import { ICodeEditorService } from 'vs/editor/common/services/codeEditorService';
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
import { ILifecycleService, LifecyclePhase } from 'vs/platform/lifecycle/common/lifecycle';
import { IMarkerService } from 'vs/platform/markers/common/markers';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IMessageService, IChoiceService, Severity } from 'vs/platform/message/common/message';
import { ChoiceChannel } from 'vs/platform/message/common/messageIpc';
import { ISearchService } from 'vs/platform/search/common/search';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { CommandService } from 'vs/platform/commands/common/commandService';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { IExtensionService } from 'vs/platform/extensions/common/extensions';
import { WorkbenchModeServiceImpl } from 'vs/workbench/services/mode/common/workbenchModeService';
import { IModeService } from 'vs/editor/common/services/modeService';
import { IUntitledEditorService, UntitledEditorService } from 'vs/workbench/services/untitled/common/untitledEditorService';
import { ICrashReporterService, NullCrashReporterService } from 'vs/workbench/services/crashReporter/common/crashReporterService';
import { CrashReporterService } from 'vs/workbench/services/crashReporter/electron-browser/crashReporterService';
import { NodeCachedDataManager } from 'vs/workbench/electron-browser/nodeCachedDataManager';
import { getDelayedChannel } from 'vs/base/parts/ipc/common/ipc';
import { connect as connectNet } from 'vs/base/parts/ipc/node/ipc.net';
import { IExtensionManagementChannel, ExtensionManagementChannelClient } from 'vs/platform/extensionManagement/common/extensionManagementIpc';
import { IExtensionManagementService, IExtensionEnablementService } from 'vs/platform/extensionManagement/common/extensionManagement';
import { ExtensionEnablementService } from 'vs/platform/extensionManagement/common/extensionEnablementService';
import { ITimerService } from 'vs/workbench/services/timer/common/timerService';
import { remote, ipcRenderer as ipc } from 'electron';
import { BareFontInfo } from 'vs/editor/common/config/fontInfo';
import { restoreFontInfo, readFontInfo, saveFontInfo } from 'vs/editor/browser/config/configuration';
import * as browser from 'vs/base/browser/browser';
import 'vs/platform/opener/browser/opener.contribution';
import { IWorkbenchThemeService } from 'vs/workbench/services/themes/common/workbenchThemeService';
import { WorkbenchThemeService } from 'vs/workbench/services/themes/electron-browser/workbenchThemeService';
import { ITextResourceConfigurationService } from 'vs/editor/common/services/resourceConfiguration';
import { TextResourceConfigurationService } from 'vs/editor/common/services/resourceConfigurationImpl';
import { registerThemingParticipant, ITheme, ICssStyleCollector } from 'vs/platform/theme/common/themeService';
import { foreground, selectionBackground, focusBorder, scrollbarShadow, scrollbarSliderActiveBackground, scrollbarSliderBackground, scrollbarSliderHoverBackground, listHighlightForeground, inputPlaceholderForeground } from 'vs/platform/theme/common/colorRegistry';
import { TextMateService } from 'vs/workbench/services/textMate/electron-browser/TMSyntax';
import { ITextMateService } from 'vs/workbench/services/textMate/electron-browser/textMateService';
import { IBroadcastService, BroadcastService } from 'vs/platform/broadcast/electron-browser/broadcastService';

/**
 * Services that we require for the Shell
 */
export interface ICoreServices {
	contextService: IWorkspaceContextService;
	configurationService: IConfigurationService;
	environmentService: IEnvironmentService;
	timerService: ITimerService;
	storageService: IStorageService;
}

const currentWindow = remote.getCurrentWindow();

/**
 * The workbench shell contains the workbench with a rich header containing navigation and the activity bar.
 * With the Shell being the top level element in the page, it is also responsible for driving the layouting.
 */
export class WorkbenchShell {
	private storageService: IStorageService;
	private messageService: MessageService;
	private environmentService: IEnvironmentService;
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

	private container: HTMLElement;
	private toUnbind: IDisposable[];
	private previousErrorValue: string;
	private previousErrorTime: number;
	private content: HTMLElement;
	private contentsContainer: Builder;

	private configuration: IWindowConfiguration;
	private workbench: Workbench;

	constructor(container: HTMLElement, coreServices: ICoreServices, mainProcessServices: ServiceCollection, configuration: IWindowConfiguration) {
		this.container = container;

		this.configuration = configuration;

		this.contextService = coreServices.contextService;
		this.configurationService = coreServices.configurationService;
		this.environmentService = coreServices.environmentService;
		this.timerService = coreServices.timerService;
		this.storageService = coreServices.storageService;

		this.mainProcessServices = mainProcessServices;

		this.toUnbind = [];
		this.previousErrorTime = 0;
	}

	private createContents(parent: Builder): Builder {

		// ARIA
		aria.setARIAContainer(document.body);

		// Workbench Container
		const workbenchContainer = $(parent).div();

		// Instantiation service with services
		const [instantiationService, serviceCollection] = this.initServiceCollection(parent.getHTMLElement());

		// Workbench
		this.workbench = instantiationService.createInstance(Workbench, parent.getHTMLElement(), workbenchContainer.getHTMLElement(), this.configuration, serviceCollection);
		this.workbench.startup({
			onWorkbenchStarted: (info: IWorkbenchStartedInfo) => {

				// run workbench started logic
				this.onWorkbenchStarted(info);

				// start cached data manager
				instantiationService.createInstance(NodeCachedDataManager);

				// Set lifecycle phase to `Runnning` so that other contributions
				// can now do something
				this.lifecycleService.phase = LifecyclePhase.Running;
			}
		});

		// Window
		this.workbench.getInstantiationService().createInstance(ElectronWindow, this.container);

		// Handle case where workbench is not starting up properly
		const timeoutHandle = setTimeout(() => {
			console.warn('Workbench did not finish loading in 10 seconds, that might be a problem that should be reported.');
		}, 10000);

		this.workbench.joinCreation().then(() => {
			clearTimeout(timeoutHandle);
		});

		return workbenchContainer;
	}

	private onWorkbenchStarted(info: IWorkbenchStartedInfo): void {

		// Telemetry: workspace info
		const { filesToOpen, filesToCreate, filesToDiff } = this.configuration;
		this.telemetryService.publicLog('workspaceLoad', {
			userAgent: navigator.userAgent,
			windowSize: { innerHeight: window.innerHeight, innerWidth: window.innerWidth, outerHeight: window.outerHeight, outerWidth: window.outerWidth },
			emptyWorkbench: !this.contextService.hasWorkspace(),
			'workbench.filesToOpen': filesToOpen && filesToOpen.length || void 0,
			'workbench.filesToCreate': filesToCreate && filesToCreate.length || void 0,
			'workbench.filesToDiff': filesToDiff && filesToDiff.length || void 0,
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
		this.timerService.workbenchStarted = Date.now();
		this.timerService.restoreEditorsDuration = info.restoreEditorsDuration;
		this.timerService.restoreViewletDuration = info.restoreViewletDuration;
		this.extensionService.onReady().done(() => {
			this.telemetryService.publicLog('startupTime', this.timerService.startupMetrics);
		});

		// Telemetry: workspace tags
		const workspaceStats: WorkspaceStats = <WorkspaceStats>this.workbench.getInstantiationService().createInstance(WorkspaceStats);
		workspaceStats.reportWorkspaceTags(this.configuration);
		workspaceStats.reportCloudStats();

		if ((platform.isLinux || platform.isMacintosh) && process.getuid() === 0) {
			this.messageService.show(Severity.Warning, nls.localize('runningAsRoot', "It is recommended not to run Code as 'root'."));
		}
	}

	private initServiceCollection(container: HTMLElement): [IInstantiationService, ServiceCollection] {
		const disposables: IDisposable[] = [];

		const serviceCollection = new ServiceCollection();
		serviceCollection.set(IWorkspaceContextService, this.contextService);
		serviceCollection.set(IConfigurationService, this.configurationService);
		serviceCollection.set(IEnvironmentService, this.environmentService);
		serviceCollection.set(ITimerService, this.timerService);
		serviceCollection.set(IStorageService, this.storageService);
		this.mainProcessServices.forEach((serviceIdentifier, serviceInstance) => {
			serviceCollection.set(serviceIdentifier, serviceInstance);
		});

		const instantiationService: IInstantiationService = new InstantiationService(serviceCollection, true);

		this.broadcastService = new BroadcastService(currentWindow.id);
		serviceCollection.set(IBroadcastService, this.broadcastService);

		serviceCollection.set(IWindowService, new SyncDescriptor(WindowService, currentWindow.id));

		const sharedProcess = (<IWindowsService>serviceCollection.get(IWindowsService)).whenSharedProcessReady()
			.then(() => connectNet(this.environmentService.sharedIPCHandle, `window:${currentWindow.id}`));

		sharedProcess
			.done(client => client.registerChannel('choice', instantiationService.createInstance(ChoiceChannel)));

		// Warm up font cache information before building up too many dom elements
		restoreFontInfo(this.storageService);
		readFontInfo(BareFontInfo.createFromRawSettings(this.configurationService.getConfiguration('editor'), browser.getZoomLevel()));

		// Experiments
		this.experimentService = instantiationService.createInstance(ExperimentService);
		serviceCollection.set(IExperimentService, this.experimentService);

		// Telemetry
		this.sendMachineIdToMain(this.storageService);
		if (this.environmentService.isBuilt && !this.environmentService.isExtensionDevelopment && !!product.enableTelemetry) {
			const channel = getDelayedChannel<ITelemetryAppenderChannel>(sharedProcess.then(c => c.getChannel('telemetryAppender')));
			const commit = product.commit;
			const version = pkg.version;

			const config: ITelemetryServiceConfig = {
				appender: new TelemetryAppenderClient(channel),
				commonProperties: resolveWorkbenchCommonProperties(this.storageService, commit, version),
				piiPaths: [this.environmentService.appRoot, this.environmentService.extensionsPath]
			};

			const telemetryService = instantiationService.createInstance(TelemetryService, config);
			this.telemetryService = telemetryService;

			const errorTelemetry = new ErrorTelemetry(telemetryService);
			const idleMonitor = new IdleMonitor(2 * 60 * 1000); // 2 minutes

			const listener = idleMonitor.onStatusChange(status =>
				this.telemetryService.publicLog(status === UserStatus.Active
					? TelemetryService.IDLE_STOP_EVENT_NAME
					: TelemetryService.IDLE_START_EVENT_NAME
				));

			disposables.push(telemetryService, errorTelemetry, listener, idleMonitor);
		} else {
			this.telemetryService = NullTelemetryService;
		}

		serviceCollection.set(ITelemetryService, this.telemetryService);
		disposables.push(configurationTelemetry(this.telemetryService, this.configurationService));

		let crashReporterService = NullCrashReporterService;
		if (product.crashReporter && product.hockeyApp) {
			crashReporterService = instantiationService.createInstance(CrashReporterService);
		}
		serviceCollection.set(ICrashReporterService, crashReporterService);

		this.messageService = instantiationService.createInstance(MessageService, container);
		serviceCollection.set(IMessageService, this.messageService);
		serviceCollection.set(IChoiceService, this.messageService);

		const lifecycleService = instantiationService.createInstance(LifecycleService);
		this.toUnbind.push(lifecycleService.onShutdown(reason => dispose(disposables)));
		this.toUnbind.push(lifecycleService.onShutdown(reason => saveFontInfo(this.storageService)));
		serviceCollection.set(ILifecycleService, lifecycleService);
		disposables.push(lifecycleTelemetry(this.telemetryService, lifecycleService));
		this.lifecycleService = lifecycleService;

		const extensionManagementChannel = getDelayedChannel<IExtensionManagementChannel>(sharedProcess.then(c => c.getChannel('extensions')));
		serviceCollection.set(IExtensionManagementService, new SyncDescriptor(ExtensionManagementChannelClient, extensionManagementChannel));

		const extensionEnablementService = instantiationService.createInstance(ExtensionEnablementService);
		serviceCollection.set(IExtensionEnablementService, extensionEnablementService);
		disposables.push(extensionEnablementService);

		this.extensionService = instantiationService.createInstance(ExtensionService);
		serviceCollection.set(IExtensionService, this.extensionService);

		this.timerService.beforeExtensionLoad = Date.now();
		this.extensionService.onReady().done(() => {
			this.timerService.afterExtensionLoad = Date.now();
		});

		this.themeService = instantiationService.createInstance(WorkbenchThemeService, document.body);
		serviceCollection.set(IWorkbenchThemeService, this.themeService);

		serviceCollection.set(ICommandService, new SyncDescriptor(CommandService));

		this.contextViewService = instantiationService.createInstance(ContextViewService, this.container);
		serviceCollection.set(IContextViewService, this.contextViewService);

		serviceCollection.set(IRequestService, new SyncDescriptor(RequestService));

		serviceCollection.set(IMarkerService, new SyncDescriptor(MarkerService));

		serviceCollection.set(IModeService, new SyncDescriptor(WorkbenchModeServiceImpl));

		serviceCollection.set(IModelService, new SyncDescriptor(ModelServiceImpl));

		serviceCollection.set(ITextResourceConfigurationService, new SyncDescriptor(TextResourceConfigurationService));

		serviceCollection.set(IEditorWorkerService, new SyncDescriptor(EditorWorkerServiceImpl));

		serviceCollection.set(IUntitledEditorService, new SyncDescriptor(UntitledEditorService));

		serviceCollection.set(ITextMateService, new SyncDescriptor(TextMateService));

		serviceCollection.set(ISearchService, new SyncDescriptor(SearchService));

		serviceCollection.set(ICodeEditorService, new SyncDescriptor(CodeEditorServiceImpl));

		serviceCollection.set(IIntegrityService, new SyncDescriptor(IntegrityServiceImpl));

		return [instantiationService, serviceCollection];
	}

	private sendMachineIdToMain(storageService: IStorageService) {
		getOrCreateMachineId(storageService).then(machineId => {
			ipc.send(machineIdIpcChannel, machineId);
		}).then(null, errors.onUnexpectedError);
	}

	public open(): void {

		// Listen on unexpected errors
		errors.setUnexpectedErrorHandler((error: any) => {
			this.onUnexpectedError(error);
		});

		// Shell Class for CSS Scoping
		$(this.container).addClass('monaco-shell');

		// Controls
		this.content = $('.monaco-shell-content').appendTo(this.container).getHTMLElement();

		// Create Contents
		this.contentsContainer = this.createContents($(this.content));

		// Layout
		this.layout();

		// Listeners
		this.registerListeners();
	}

	private registerListeners(): void {

		// Resize
		$(window).on(dom.EventType.RESIZE, () => this.layout(), this.toUnbind);
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

		// Log to console
		console.error(errorMsg);

		// Show to user if friendly message provided
		if (error && error.friendlyMessage && this.messageService) {
			this.messageService.show(Severity.Error, error.friendlyMessage);
		}
	}

	private layout(): void {
		const clArea = $(this.container).getClientArea();

		const contentsSize = new Dimension(clArea.width, clArea.height);
		this.contentsContainer.size(contentsSize.width, contentsSize.height);

		this.contextViewService.layout();
		this.workbench.layout();
	}

	public joinCreation(): TPromise<boolean> {
		return this.workbench.joinCreation();
	}

	public dispose(): void {

		// Workbench
		if (this.workbench) {
			this.workbench.dispose();
		}

		this.contextViewService.dispose();

		// Listeners
		this.toUnbind = dispose(this.toUnbind);

		// Container
		$(this.container).empty();
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
	let workbenchBackground: string;
	switch (theme.type) {
		case 'dark':
			workbenchBackground = '#252526';
			break;
		case 'light':
			workbenchBackground = '#F3F3F3';
			break;
		default:
			workbenchBackground = '#000000';
	}
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
});
