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
import { dispose, IDisposable, Disposables } from 'vs/base/common/lifecycle';
import errors = require('vs/base/common/errors');
import { toErrorMessage } from 'vs/base/common/errorMessage';
import product from 'vs/platform/product';
import pkg from 'vs/platform/package';
import { ContextViewService } from 'vs/platform/contextview/browser/contextViewService';
import timer = require('vs/base/common/timer');
import { IStartupFingerprint, IMemoryInfo } from 'vs/workbench/electron-browser/common';
import { Workbench } from 'vs/workbench/electron-browser/workbench';
import { StorageService, inMemoryLocalStorageInstance } from 'vs/workbench/services/storage/common/storageService';
import { ITelemetryService, NullTelemetryService, configurationTelemetry, loadExperiments } from 'vs/platform/telemetry/common/telemetry';
import { ITelemetryAppenderChannel, TelemetryAppenderClient } from 'vs/platform/telemetry/common/telemetryIpc';
import { TelemetryService, ITelemetryServiceConfig } from 'vs/platform/telemetry/common/telemetryService';
import { IdleMonitor, UserStatus } from 'vs/platform/telemetry/browser/idleMonitor';
import ErrorTelemetry from 'vs/platform/telemetry/browser/errorTelemetry';
import { resolveWorkbenchCommonProperties } from 'vs/platform/telemetry/node/workbenchCommonProperties';
import { ElectronIntegration } from 'vs/workbench/electron-browser/integration';
import { WorkspaceStats } from 'vs/workbench/services/telemetry/common/workspaceStats';
import { IWindowIPCService, WindowIPCService } from 'vs/workbench/services/window/electron-browser/windowService';
import { IWindowsService, IWindowService } from 'vs/platform/windows/common/windows';
import { WindowsChannelClient } from 'vs/platform/windows/common/windowsIpc';
import { WindowService } from 'vs/platform/windows/electron-browser/windowService';
import { MessageService } from 'vs/workbench/services/message/electron-browser/messageService';
import { IRequestService } from 'vs/platform/request/node/request';
import { RequestService } from 'vs/platform/request/node/requestService';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { SearchService } from 'vs/workbench/services/search/node/searchService';
import { LifecycleService } from 'vs/workbench/services/lifecycle/electron-browser/lifecycleService';
import { MainThreadService } from 'vs/workbench/services/thread/electron-browser/threadService';
import { MarkerService } from 'vs/platform/markers/common/markerService';
import { IModelService } from 'vs/editor/common/services/modelService';
import { ModelServiceImpl } from 'vs/editor/common/services/modelServiceImpl';
import { CodeEditorServiceImpl } from 'vs/editor/browser/services/codeEditorServiceImpl';
import { ICodeEditorService } from 'vs/editor/common/services/codeEditorService';
import { IntegrityServiceImpl } from 'vs/platform/integrity/node/integrityServiceImpl';
import { IIntegrityService } from 'vs/platform/integrity/common/integrity';
import { EditorWorkerServiceImpl } from 'vs/editor/common/services/editorWorkerServiceImpl';
import { IEditorWorkerService } from 'vs/editor/common/services/editorWorkerService';
import { MainProcessExtensionService } from 'vs/workbench/api/node/mainThreadExtensionService';
import { IOptions } from 'vs/workbench/common/options';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ServiceCollection } from 'vs/platform/instantiation/common/serviceCollection';
import { InstantiationService } from 'vs/platform/instantiation/common/instantiationService';
import { IContextViewService } from 'vs/platform/contextview/browser/contextView';
import { IEventService } from 'vs/platform/event/common/event';
import { ILifecycleService } from 'vs/platform/lifecycle/common/lifecycle';
import { IMarkerService } from 'vs/platform/markers/common/markers';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IMessageService, IChoiceService, Severity } from 'vs/platform/message/common/message';
import { ChoiceChannel } from 'vs/platform/message/common/messageIpc';
import { ISearchService } from 'vs/platform/search/common/search';
import { IThreadService } from 'vs/workbench/services/thread/common/threadService';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { CommandService } from 'vs/platform/commands/common/commandService';
import { IWorkspaceContextService, IWorkspace } from 'vs/platform/workspace/common/workspace';
import { IExtensionService } from 'vs/platform/extensions/common/extensions';
import { MainThreadModeServiceImpl } from 'vs/editor/common/services/modeServiceImpl';
import { IModeService } from 'vs/editor/common/services/modeService';
import { IUntitledEditorService, UntitledEditorService } from 'vs/workbench/services/untitled/common/untitledEditorService';
import { CrashReporter } from 'vs/workbench/electron-browser/crashReporter';
import { IThemeService } from 'vs/workbench/services/themes/common/themeService';
import { ThemeService } from 'vs/workbench/services/themes/electron-browser/themeService';
import { getDelayedChannel } from 'vs/base/parts/ipc/common/ipc';
import { connect as connectNet } from 'vs/base/parts/ipc/node/ipc.net';
import { Client as ElectronIPCClient } from 'vs/base/parts/ipc/electron-browser/ipc.electron-browser';
import { IExtensionManagementChannel, ExtensionManagementChannelClient } from 'vs/platform/extensionManagement/common/extensionManagementIpc';
import { IExtensionManagementService, IExtensionEnablementService } from 'vs/platform/extensionManagement/common/extensionManagement';
import { ExtensionEnablementService } from 'vs/platform/extensionManagement/common/extensionEnablementService';
import { UpdateChannelClient } from 'vs/platform/update/common/updateIpc';
import { IUpdateService } from 'vs/platform/update/common/update';
import { URLChannelClient } from 'vs/platform/url/common/urlIpc';
import { IURLService } from 'vs/platform/url/common/url';
import { ReloadWindowAction } from 'vs/workbench/electron-browser/actions';
import { ExtensionHostProcessWorker } from 'vs/workbench/electron-browser/extensionHost';
import { remote } from 'electron';
import * as os from 'os';

// self registering services
import 'vs/platform/opener/browser/opener.contribution';

/**
 * Services that we require for the Shell
 */
export interface ICoreServices {
	contextService: IWorkspaceContextService;
	eventService: IEventService;
	configurationService: IConfigurationService;
	environmentService: IEnvironmentService;
}

const timers = (<any>window).MonacoEnvironment.timers;

/**
 * The workbench shell contains the workbench with a rich header containing navigation and the activity bar.
 * With the Shell being the top level element in the page, it is also responsible for driving the layouting.
 */
export class WorkbenchShell {
	private storageService: IStorageService;
	private messageService: MessageService;
	private eventService: IEventService;
	private environmentService: IEnvironmentService;
	private contextViewService: ContextViewService;
	private threadService: MainThreadService;
	private configurationService: IConfigurationService;
	private themeService: ThemeService;
	private contextService: IWorkspaceContextService;
	private telemetryService: ITelemetryService;
	private extensionService: MainProcessExtensionService;

	private container: HTMLElement;
	private toUnbind: IDisposable[];
	private previousErrorValue: string;
	private previousErrorTime: number;
	private content: HTMLElement;
	private contentsContainer: Builder;

	private workspace: IWorkspace;
	private options: IOptions;
	private workbench: Workbench;

	constructor(container: HTMLElement, workspace: IWorkspace, services: ICoreServices, options: IOptions) {
		this.container = container;

		this.workspace = workspace;
		this.options = options;

		this.contextService = services.contextService;
		this.eventService = services.eventService;
		this.configurationService = services.configurationService;
		this.environmentService = services.environmentService;

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

		//crash reporting
		if (!!product.crashReporter) {
			instantiationService.createInstance(CrashReporter, product.crashReporter);
		}

		// Workbench
		this.workbench = instantiationService.createInstance(Workbench, parent.getHTMLElement(), workbenchContainer.getHTMLElement(), this.workspace, this.options, serviceCollection);
		this.workbench.startup({
			onWorkbenchStarted: (customKeybindingsCount, restoreViewletDuration, restoreEditorsDuration) => {
				this.onWorkbenchStarted(customKeybindingsCount, restoreViewletDuration, restoreEditorsDuration);
			}
		});

		// Electron integration
		this.workbench.getInstantiationService().createInstance(ElectronIntegration).integrate(this.container);

		// Handle case where workbench is not starting up properly
		const timeoutHandle = setTimeout(() => {
			console.warn('Workbench did not finish loading in 10 seconds, that might be a problem that should be reported.');
		}, 10000);

		this.workbench.joinCreation().then(() => {
			clearTimeout(timeoutHandle);
		});

		return workbenchContainer;
	}

	private onWorkbenchStarted(customKeybindingsCount: number, restoreViewletDuration: number, restoreEditorsDuration: number): void {

		// Log to timer
		timer.start(timer.Topic.STARTUP, '[renderer] overall workbench load', timers.perfBeforeWorkbenchOpen, 'Workbench has opened after this event with viewlet and editor restored').stop();

		// Telemetry: workspace info
		const { filesToOpen, filesToCreate, filesToDiff } = this.options;
		this.telemetryService.publicLog('workspaceLoad', {
			userAgent: navigator.userAgent,
			windowSize: { innerHeight: window.innerHeight, innerWidth: window.innerWidth, outerHeight: window.outerHeight, outerWidth: window.outerWidth },
			emptyWorkbench: !this.contextService.getWorkspace(),
			'workbench.filesToOpen': filesToOpen && filesToOpen.length || undefined,
			'workbench.filesToCreate': filesToCreate && filesToCreate.length || undefined,
			'workbench.filesToDiff': filesToDiff && filesToDiff.length || undefined,
			customKeybindingsCount,
			theme: this.themeService.getColorTheme(),
			language: platform.language,
			experiments: this.telemetryService.getExperiments()
		});

		// Telemetry: performance info
		const workbenchStarted = Date.now();
		timers.workbenchStarted = new Date(workbenchStarted);
		this.extensionService.onReady().done(() => {
			const now = Date.now();
			const initialStartup = !!timers.isInitialStartup;
			const start = initialStartup ? timers.perfStartTime : timers.perfWindowLoadTime;
			let totalmem: number;
			let freemem: number;
			let cpus: { count: number; speed: number; model: string; };
			let platform: string;
			let release: string;
			let loadavg: number[];
			let meminfo: IMemoryInfo;

			try {
				totalmem = os.totalmem();
				freemem = os.freemem();
				platform = os.platform();
				release = os.release();
				loadavg = os.loadavg();
				meminfo = process.getProcessMemoryInfo();

				const rawCpus = os.cpus();
				if (rawCpus && rawCpus.length > 0) {
					cpus = { count: rawCpus.length, speed: rawCpus[0].speed, model: rawCpus[0].model };
				}
			} catch (error) {
				console.error(error); // be on the safe side with these hardware method calls
			}

			const startupTimeEvent: IStartupFingerprint = {
				version: 1,
				ellapsed: Math.round(workbenchStarted - start),
				timers: {
					ellapsedExtensions: Math.round(timers.perfAfterExtensionLoad - timers.perfBeforeExtensionLoad),
					ellapsedExtensionsReady: Math.round(timers.perfAfterExtensionLoad - start),
					ellapsedRequire: Math.round(timers.perfAfterLoadWorkbenchMain - timers.perfBeforeLoadWorkbenchMain),
					ellapsedViewletRestore: Math.round(restoreViewletDuration),
					ellapsedEditorRestore: Math.round(restoreEditorsDuration),
					ellapsedWorkbench: Math.round(workbenchStarted - timers.perfBeforeWorkbenchOpen),
					ellapsedWindowLoadToRequire: Math.round(timers.perfBeforeLoadWorkbenchMain - timers.perfWindowLoadTime),
					ellapsedTimersToTimersComputed: Date.now() - now
				},
				platform,
				release,
				totalmem,
				freemem,
				meminfo,
				cpus,
				loadavg,
				initialStartup,
				hasAccessibilitySupport: !!timers.hasAccessibilitySupport,
				emptyWorkbench: !this.contextService.getWorkspace()
			};

			if (initialStartup) {
				startupTimeEvent.timers.ellapsedWindowLoad = Math.round(timers.perfWindowLoadTime - timers.perfStartTime);
			}

			this.telemetryService.publicLog('startupTime', startupTimeEvent);
			timers.fingerprint = startupTimeEvent;
		});

		// Telemetry: workspace tags
		const workspaceStats: WorkspaceStats = <WorkspaceStats>this.workbench.getInstantiationService().createInstance(WorkspaceStats);
		workspaceStats.reportWorkspaceTags(this.options);

		if ((platform.isLinux || platform.isMacintosh) && process.getuid() === 0) {
			this.messageService.show(Severity.Warning, nls.localize('runningAsRoot', "It is recommended not to run Code as 'root'."));
		}
	}

	private initServiceCollection(container: HTMLElement): [IInstantiationService, ServiceCollection] {
		const disposables = new Disposables();

		const mainProcessClient = new ElectronIPCClient(String(`window${remote.getCurrentWindow().id}`));
		disposables.add(mainProcessClient);

		const serviceCollection = new ServiceCollection();
		serviceCollection.set(IEventService, this.eventService);
		serviceCollection.set(IWorkspaceContextService, this.contextService);
		serviceCollection.set(IConfigurationService, this.configurationService);
		serviceCollection.set(IEnvironmentService, this.environmentService);

		const instantiationServiceImpl = new InstantiationService(serviceCollection, true);
		const instantiationService = instantiationServiceImpl as IInstantiationService;

		// TODO@joao remove this
		const windowIPCService = instantiationService.createInstance<IWindowIPCService>(WindowIPCService);
		serviceCollection.set(IWindowIPCService, windowIPCService);

		const windowsChannel = mainProcessClient.getChannel('windows');
		const windowsChannelClient = new WindowsChannelClient(windowsChannel);
		serviceCollection.set(IWindowsService, windowsChannelClient);

		const windowService = new WindowService(windowIPCService.getWindowId(), windowsChannelClient);
		serviceCollection.set(IWindowService, windowService);

		const sharedProcess = connectNet(this.environmentService.sharedIPCHandle, `window:${windowIPCService.getWindowId()}`);
		sharedProcess.done(client => {

			client.registerChannel('choice', new ChoiceChannel(this.messageService));

			client.onClose(() => {
				this.messageService.show(Severity.Error, {
					message: nls.localize('sharedProcessCrashed', "The shared process terminated unexpectedly. Please reload the window to recover."),
					actions: [instantiationService.createInstance(ReloadWindowAction, ReloadWindowAction.ID, ReloadWindowAction.LABEL)]
				});
			});
		}, errors.onUnexpectedError);

		// Storage Sevice
		const disableWorkspaceStorage = this.environmentService.extensionTestsPath || (!this.workspace && !this.environmentService.isExtensionDevelopment); // without workspace or in any extension test, we use inMemory storage unless we develop an extension where we want to preserve state
		this.storageService = instantiationService.createInstance(StorageService, window.localStorage, disableWorkspaceStorage ? inMemoryLocalStorageInstance : window.localStorage);
		serviceCollection.set(IStorageService, this.storageService);

		// Telemetry
		if (this.environmentService.isBuilt && !this.environmentService.isExtensionDevelopment && !!product.enableTelemetry) {
			const channel = getDelayedChannel<ITelemetryAppenderChannel>(sharedProcess.then(c => c.getChannel('telemetryAppender')));
			const commit = product.commit;
			const version = pkg.version;

			const config: ITelemetryServiceConfig = {
				appender: new TelemetryAppenderClient(channel),
				commonProperties: resolveWorkbenchCommonProperties(this.storageService, commit, version),
				piiPaths: [this.environmentService.appRoot, this.environmentService.extensionsPath],
				experiments: loadExperiments(this.contextService, this.storageService, this.configurationService)
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

			disposables.add(telemetryService, errorTelemetry, listener, idleMonitor);
		} else {
			NullTelemetryService._experiments = loadExperiments(this.contextService, this.storageService, this.configurationService);
			this.telemetryService = NullTelemetryService;
		}

		serviceCollection.set(ITelemetryService, this.telemetryService);
		disposables.add(configurationTelemetry(this.telemetryService, this.configurationService));

		this.messageService = instantiationService.createInstance(MessageService, container);
		serviceCollection.set(IMessageService, this.messageService);
		serviceCollection.set(IChoiceService, this.messageService);

		const lifecycleService = instantiationService.createInstance(LifecycleService);
		this.toUnbind.push(lifecycleService.onShutdown(reason => disposables.dispose()));
		serviceCollection.set(ILifecycleService, lifecycleService);

		const extensionManagementChannel = getDelayedChannel<IExtensionManagementChannel>(sharedProcess.then(c => c.getChannel('extensions')));
		const extensionManagementChannelClient = new ExtensionManagementChannelClient(extensionManagementChannel);
		serviceCollection.set(IExtensionManagementService, extensionManagementChannelClient);

		const extensionEnablementService = instantiationService.createInstance(ExtensionEnablementService);
		serviceCollection.set(IExtensionEnablementService, extensionEnablementService);
		disposables.add(extensionEnablementService);

		const extensionHostProcessWorker = instantiationService.createInstance(ExtensionHostProcessWorker);
		this.threadService = instantiationService.createInstance(MainThreadService, extensionHostProcessWorker.messagingProtocol);
		serviceCollection.set(IThreadService, this.threadService);

		const extensionTimer = timer.start(timer.Topic.STARTUP, '[renderer] create extension host => extensions onReady()');
		timers.perfBeforeExtensionLoad = new Date();
		this.extensionService = instantiationService.createInstance(MainProcessExtensionService);
		serviceCollection.set(IExtensionService, this.extensionService);
		extensionHostProcessWorker.start(this.extensionService);
		this.extensionService.onReady().done(() => {
			extensionTimer.stop();
			timers.perfAfterExtensionLoad = new Date();
		});

		serviceCollection.set(ICommandService, new CommandService(instantiationService, this.extensionService));

		this.contextViewService = instantiationService.createInstance(ContextViewService, this.container);
		serviceCollection.set(IContextViewService, this.contextViewService);

		const requestService = instantiationService.createInstance(RequestService);
		serviceCollection.set(IRequestService, requestService);

		const markerService = instantiationService.createInstance(MarkerService);
		serviceCollection.set(IMarkerService, markerService);

		const modeService = instantiationService.createInstance(MainThreadModeServiceImpl);
		serviceCollection.set(IModeService, modeService);

		const modelService = instantiationService.createInstance(ModelServiceImpl);
		serviceCollection.set(IModelService, modelService);

		const editorWorkerService = instantiationService.createInstance(EditorWorkerServiceImpl);
		serviceCollection.set(IEditorWorkerService, editorWorkerService);

		const untitledEditorService = instantiationService.createInstance(UntitledEditorService);
		serviceCollection.set(IUntitledEditorService, untitledEditorService);

		this.themeService = instantiationService.createInstance(ThemeService);
		serviceCollection.set(IThemeService, this.themeService);

		const searchService = instantiationService.createInstance(SearchService);
		serviceCollection.set(ISearchService, searchService);

		const codeEditorService = instantiationServiceImpl.createInstance(CodeEditorServiceImpl);
		serviceCollection.set(ICodeEditorService, codeEditorService);

		const integrityService = instantiationService.createInstance(IntegrityServiceImpl);
		serviceCollection.set(IIntegrityService, integrityService);

		const updateChannel = mainProcessClient.getChannel('update');
		const updateChannelClient = new UpdateChannelClient(updateChannel);
		serviceCollection.set(IUpdateService, updateChannelClient);

		const urlChannel = mainProcessClient.getChannel('url');
		const urlChannelClient = new URLChannelClient(urlChannel, windowIPCService.getWindowId());
		serviceCollection.set(IURLService, urlChannelClient);

		return [instantiationServiceImpl, serviceCollection];
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

		// Handle Load Performance Timers
		this.writeTimers();

		// Create Contents
		this.contentsContainer = this.createContents($(this.content));

		// Layout
		this.layout();

		// Listeners
		this.registerListeners();

		// Enable theme support
		this.themeService.initialize(this.container).then(null, error => {
			errors.onUnexpectedError(error);
		});
	}

	private registerListeners(): void {

		// Resize
		$(window).on(dom.EventType.RESIZE, () => this.layout(), this.toUnbind);
	}

	private writeTimers(): void {
		const events: timer.IExistingTimerEvent[] = [];

		// Window
		if (timers.isInitialStartup && timers.perfStartTime) {
			events.push({
				startTime: timers.perfStartTime,
				stopTime: timers.perfBeforeLoadWorkbenchMain,
				topic: 'Startup',
				name: '[main] initial start => begin to require(workbench.main.js)',
				description: 'Time spend in main process until we load JavaScript of the workbench'
			});
		}

		// Load
		events.push({
			startTime: timers.perfBeforeLoadWorkbenchMain,
			stopTime: timers.perfAfterLoadWorkbenchMain,
			topic: 'Startup',
			name: '[renderer] require(workbench.main.js)',
			description: 'Time it takes to load VSCodes main modules'
		});

		// Ready
		events.push({
			startTime: timers.perfBeforeDOMContentLoaded,
			stopTime: timers.perfAfterDOMContentLoaded,
			topic: 'Startup',
			name: '[renderer] event DOMContentLoaded',
			description: 'Time it takes for the DOM to emit DOMContentLoaded event'
		});

		// Write to Timer
		timer.getTimeKeeper().setInitialCollectedEvents(events, timers.start);
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