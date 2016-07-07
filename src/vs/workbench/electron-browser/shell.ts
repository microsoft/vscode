/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./media/shell';

import * as nls from 'vs/nls';
import {TPromise} from 'vs/base/common/winjs.base';
import * as platform from 'vs/base/common/platform';
import {Dimension, Builder, $} from 'vs/base/browser/builder';
import dom = require('vs/base/browser/dom');
import aria = require('vs/base/browser/ui/aria/aria');
import {dispose, IDisposable, Disposables} from 'vs/base/common/lifecycle';
import errors = require('vs/base/common/errors');
import {ContextViewService} from 'vs/platform/contextview/browser/contextViewService';
import timer = require('vs/base/common/timer');
import {Workbench} from 'vs/workbench/electron-browser/workbench';
import {Storage, inMemoryLocalStorageInstance} from 'vs/workbench/common/storage';
import {ITelemetryService, NullTelemetryService} from 'vs/platform/telemetry/common/telemetry';
import {ITelemetryAppenderChannel, TelemetryAppenderClient} from 'vs/platform/telemetry/common/telemetryIpc';
import {TelemetryService, ITelemetryServiceConfig} from  'vs/platform/telemetry/common/telemetryService';
import {IdleMonitor, UserStatus} from  'vs/platform/telemetry/browser/idleMonitor';
import ErrorTelemetry from 'vs/platform/telemetry/browser/errorTelemetry';
import {resolveWorkbenchCommonProperties} from 'vs/platform/telemetry/node/workbenchCommonProperties';
import {ElectronIntegration} from 'vs/workbench/electron-browser/integration';
import {Update} from 'vs/workbench/electron-browser/update';
import {WorkspaceStats} from 'vs/workbench/services/telemetry/common/workspaceStats';
import {IWindowService, WindowService} from 'vs/workbench/services/window/electron-browser/windowService';
import {MessageService} from 'vs/workbench/services/message/electron-browser/messageService';
import {RequestService} from 'vs/workbench/services/request/node/requestService';
import {IConfigurationService} from 'vs/platform/configuration/common/configuration';
import {FileService} from 'vs/workbench/services/files/electron-browser/fileService';
import {SearchService} from 'vs/workbench/services/search/node/searchService';
import {LifecycleService} from 'vs/workbench/services/lifecycle/electron-browser/lifecycleService';
import {MainThreadService} from 'vs/workbench/services/thread/electron-browser/threadService';
import {MarkerService} from 'vs/platform/markers/common/markerService';
import {IModelService} from 'vs/editor/common/services/modelService';
import {ModelServiceImpl} from 'vs/editor/common/services/modelServiceImpl';
import {ICompatWorkerService} from 'vs/editor/common/services/compatWorkerService';
import {MainThreadCompatWorkerService} from 'vs/editor/common/services/compatWorkerServiceMain';
import {CodeEditorServiceImpl} from 'vs/editor/browser/services/codeEditorServiceImpl';
import {ICodeEditorService} from 'vs/editor/common/services/codeEditorService';
import {EditorWorkerServiceImpl} from 'vs/editor/common/services/editorWorkerServiceImpl';
import {IEditorWorkerService} from 'vs/editor/common/services/editorWorkerService';
import {MainProcessExtensionService} from 'vs/workbench/api/node/mainThreadExtensionService';
import {IOptions} from 'vs/workbench/common/options';
import {IStorageService} from 'vs/platform/storage/common/storage';
import {ServiceCollection} from 'vs/platform/instantiation/common/serviceCollection';
import {InstantiationService} from 'vs/platform/instantiation/common/instantiationService';
import {IContextViewService} from 'vs/platform/contextview/browser/contextView';
import {IEventService} from 'vs/platform/event/common/event';
import {IFileService} from 'vs/platform/files/common/files';
import {ILifecycleService} from 'vs/platform/lifecycle/common/lifecycle';
import {IMarkerService} from 'vs/platform/markers/common/markers';
import {IMessageService, Severity} from 'vs/platform/message/common/message';
import {IRequestService} from 'vs/platform/request/common/request';
import {ISearchService} from 'vs/platform/search/common/search';
import {IThreadService} from 'vs/workbench/services/thread/common/threadService';
import {ICommandService} from 'vs/platform/commands/common/commands';
import {CommandService} from 'vs/platform/commands/common/commandService';
import {IWorkspaceContextService, IConfiguration, IWorkspace} from 'vs/platform/workspace/common/workspace';
import {IExtensionService} from 'vs/platform/extensions/common/extensions';
import {MainThreadModeServiceImpl} from 'vs/editor/common/services/modeServiceImpl';
import {IModeService} from 'vs/editor/common/services/modeService';
import {IUntitledEditorService, UntitledEditorService} from 'vs/workbench/services/untitled/common/untitledEditorService';
import {CrashReporter} from 'vs/workbench/electron-browser/crashReporter';
import {IThemeService} from 'vs/workbench/services/themes/common/themeService';
import {ThemeService} from 'vs/workbench/services/themes/electron-browser/themeService';
import {getDelayedChannel} from 'vs/base/parts/ipc/common/ipc';
import {connect} from 'vs/base/parts/ipc/node/ipc.net';
import {IExtensionManagementChannel, ExtensionManagementChannelClient} from 'vs/platform/extensionManagement/common/extensionManagementIpc';
import {IExtensionManagementService} from 'vs/platform/extensionManagement/common/extensionManagement';
import {ReloadWindowAction} from 'vs/workbench/electron-browser/actions';

// self registering services
import 'vs/platform/opener/electron-browser/opener.contribution';

/**
 * Services that we require for the Shell
 */
export interface ICoreServices {
	contextService: IWorkspaceContextService;
	eventService: IEventService;
	configurationService: IConfigurationService;
}

/**
 * The workbench shell contains the workbench with a rich header containing navigation and the activity bar.
 * With the Shell being the top level element in the page, it is also responsible for driving the layouting.
 */
export class WorkbenchShell {
	private storageService: IStorageService;
	private messageService: MessageService;
	private eventService: IEventService;
	private contextViewService: ContextViewService;
	private windowService: IWindowService;
	private threadService: MainThreadService;
	private configurationService: IConfigurationService;
	private themeService: ThemeService;
	private contextService: IWorkspaceContextService;
	private telemetryService: ITelemetryService;

	private container: HTMLElement;
	private toUnbind: IDisposable[];
	private previousErrorValue: string;
	private previousErrorTime: number;
	private content: HTMLElement;
	private contentsContainer: Builder;

	private configuration: IConfiguration;
	private workspace: IWorkspace;
	private options: IOptions;
	private workbench: Workbench;

	constructor(container: HTMLElement, workspace: IWorkspace, services: ICoreServices, configuration: IConfiguration, options: IOptions) {
		this.container = container;

		this.workspace = workspace;
		this.configuration = configuration;
		this.options = options;

		this.contextService = services.contextService;
		this.eventService = services.eventService;
		this.configurationService = services.configurationService;

		this.toUnbind = [];
		this.previousErrorTime = 0;
	}

	private createContents(parent: Builder): Builder {

		// ARIA
		aria.setARIAContainer(document.body);

		// Workbench Container
		let workbenchContainer = $(parent).div();

		// Instantiation service with services
		let [instantiationService, serviceCollection] = this.initServiceCollection();

		//crash reporting
		if (!!this.configuration.env.crashReporter) {
			let crashReporter = instantiationService.createInstance(CrashReporter, this.configuration.env.version, this.configuration.env.commitHash);
			crashReporter.start(this.configuration.env.crashReporter);
		}

		// Workbench
		this.workbench = instantiationService.createInstance(Workbench, workbenchContainer.getHTMLElement(), this.workspace, this.configuration, this.options, serviceCollection);
		this.workbench.startup({
			onWorkbenchStarted: (customKeybindingsCount) => {
				this.onWorkbenchStarted(customKeybindingsCount);
			}
		});

		// Electron integration
		this.workbench.getInstantiationService().createInstance(ElectronIntegration).integrate(this.container);

		// Update
		this.workbench.getInstantiationService().createInstance(Update);

		// Handle case where workbench is not starting up properly
		let timeoutHandle = setTimeout(() => {
			console.warn('Workbench did not finish loading in 10 seconds, that might be a problem that should be reported.');
		}, 10000);

		this.workbench.joinCreation().then(() => {
			clearTimeout(timeoutHandle);
		});

		return workbenchContainer;
	}

	private onWorkbenchStarted(customKeybindingsCount: number): void {

		// Log to telemetry service
		let windowSize = {
			innerHeight: window.innerHeight,
			innerWidth: window.innerWidth,
			outerHeight: window.outerHeight,
			outerWidth: window.outerWidth
		};

		this.telemetryService.publicLog('workspaceLoad',
			{
				userAgent: navigator.userAgent,
				windowSize: windowSize,
				emptyWorkbench: !this.contextService.getWorkspace(),
				customKeybindingsCount,
				theme: this.themeService.getTheme(),
				language: platform.language
			});

		let workspaceStats: WorkspaceStats = <WorkspaceStats>this.workbench.getInstantiationService().createInstance(WorkspaceStats);
		workspaceStats.reportWorkspaceTags();

		if ((platform.isLinux || platform.isMacintosh) && process.getuid() === 0) {
			this.messageService.show(Severity.Warning, nls.localize('runningAsRoot', "It is recommended not to run Code as 'root'."));
		}
	}

	private initServiceCollection(): [InstantiationService, ServiceCollection] {
		const sharedProcess = connect(process.env['VSCODE_SHARED_IPC_HOOK']);
		sharedProcess.done(service => {
			service.onClose(() => {
				this.messageService.show(Severity.Error, {
					message: nls.localize('sharedProcessCrashed', "The shared process terminated unexpectedly. Please reload the window to recover."),
					actions: [instantiationService.createInstance(ReloadWindowAction, ReloadWindowAction.ID, ReloadWindowAction.LABEL)]
				});
			});
		}, errors.onUnexpectedError);

		const serviceCollection = new ServiceCollection();
		serviceCollection.set(IEventService, this.eventService);
		serviceCollection.set(IWorkspaceContextService, this.contextService);
		serviceCollection.set(IConfigurationService, this.configurationService);

		const instantiationService = new InstantiationService(serviceCollection, true);
		const disposables = new Disposables();

		this.windowService = instantiationService.createInstance(WindowService);
		serviceCollection.set(IWindowService, this.windowService);

		// Storage
		let disableWorkspaceStorage = this.configuration.env.extensionTestsPath || (!this.workspace && !this.configuration.env.extensionDevelopmentPath); // without workspace or in any extension test, we use inMemory storage unless we develop an extension where we want to preserve state
		this.storageService = instantiationService.createInstance(Storage, window.localStorage, disableWorkspaceStorage ? inMemoryLocalStorageInstance : window.localStorage);
		serviceCollection.set(IStorageService, this.storageService);

		// Telemetry
		if (this.configuration.env.isBuilt && !this.configuration.env.extensionDevelopmentPath && !!this.configuration.env.enableTelemetry) {
			const channel = getDelayedChannel<ITelemetryAppenderChannel>(sharedProcess.then(c => c.getChannel('telemetryAppender')));
			const commit = this.contextService.getConfiguration().env.commitHash;
			const version = this.contextService.getConfiguration().env.version;

			const config: ITelemetryServiceConfig = {
				appender: new TelemetryAppenderClient(channel),
				commonProperties: resolveWorkbenchCommonProperties(this.storageService, commit, version),
				piiPaths: [this.configuration.env.appRoot, this.configuration.env.userExtensionsHome]
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
			this.telemetryService = NullTelemetryService;
		}

		serviceCollection.set(ITelemetryService, this.telemetryService);

		this.messageService = instantiationService.createInstance(MessageService);
		serviceCollection.set(IMessageService, this.messageService);

		let fileService = disposables.add(instantiationService.createInstance(FileService));
		serviceCollection.set(IFileService, fileService);

		let lifecycleService = instantiationService.createInstance(LifecycleService);
		this.toUnbind.push(lifecycleService.onShutdown(() => disposables.dispose()));
		serviceCollection.set(ILifecycleService, lifecycleService);

		this.threadService = instantiationService.createInstance(MainThreadService);
		serviceCollection.set(IThreadService, this.threadService);

		let extensionService = instantiationService.createInstance(MainProcessExtensionService);
		serviceCollection.set(IExtensionService, extensionService);

		serviceCollection.set(ICommandService, new CommandService(instantiationService, extensionService));

		this.contextViewService = instantiationService.createInstance(ContextViewService, this.container);
		serviceCollection.set(IContextViewService, this.contextViewService);

		let requestService = disposables.add(instantiationService.createInstance(RequestService));
		serviceCollection.set(IRequestService, requestService);

		let markerService = instantiationService.createInstance(MarkerService);
		serviceCollection.set(IMarkerService, markerService);

		let modeService = instantiationService.createInstance(MainThreadModeServiceImpl);
		serviceCollection.set(IModeService, modeService);

		let modelService = instantiationService.createInstance(ModelServiceImpl);
		serviceCollection.set(IModelService, modelService);

		let compatWorkerService = instantiationService.createInstance(MainThreadCompatWorkerService);
		serviceCollection.set(ICompatWorkerService, compatWorkerService);

		let editorWorkerService = instantiationService.createInstance(EditorWorkerServiceImpl);
		serviceCollection.set(IEditorWorkerService, editorWorkerService);

		let untitledEditorService = instantiationService.createInstance(UntitledEditorService);
		serviceCollection.set(IUntitledEditorService, untitledEditorService);

		this.themeService = instantiationService.createInstance(ThemeService);
		serviceCollection.set(IThemeService, this.themeService);

		let searchService = instantiationService.createInstance(SearchService);
		serviceCollection.set(ISearchService, searchService);

		let codeEditorService = instantiationService.createInstance(CodeEditorServiceImpl);
		serviceCollection.set(ICodeEditorService, codeEditorService);

		const extensionManagementChannel = getDelayedChannel<IExtensionManagementChannel>(sharedProcess.then(c => c.getChannel('extensions')));
		const extensionManagementChannelClient = instantiationService.createInstance(ExtensionManagementChannelClient, extensionManagementChannel);
		serviceCollection.set(IExtensionManagementService, extensionManagementChannelClient);

		return [instantiationService, serviceCollection];
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
		let timers = (<any>window).MonacoEnvironment.timers;
		if (timers) {
			let events: timer.IExistingTimerEvent[] = [];

			// Program
			if (timers.beforeProgram) {
				events.push({
					startTime: timers.beforeProgram,
					stopTime: timers.afterProgram,
					topic: 'Startup',
					name: 'Program Start',
					description: 'Time it takes to pass control to VSCodes main method'
				});
			}

			// Window
			if (timers.vscodeStart) {
				events.push({
					startTime: timers.vscodeStart,
					stopTime: timers.beforeLoad,
					topic: 'Startup',
					name: 'VSCode Startup',
					description: 'Time it takes to create a window and startup VSCode'
				});
			}

			// Load
			events.push({
				startTime: timers.beforeLoad,
				stopTime: timers.afterLoad,
				topic: 'Startup',
				name: 'Load Modules',
				description: 'Time it takes to load VSCodes main modules'
			});

			// Ready
			events.push({
				startTime: timers.beforeReady,
				stopTime: timers.afterReady,
				topic: 'Startup',
				name: 'Event DOMContentLoaded',
				description: 'Time it takes for the DOM to emit DOMContentLoaded event'
			});

			// Write to Timer
			timer.getTimeKeeper().setInitialCollectedEvents(events, timers.start);
		}
	}

	public onUnexpectedError(error: any): void {
		let errorMsg = errors.toErrorMessage(error, true);
		if (!errorMsg) {
			return;
		}

		let now = Date.now();
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

	public layout(): void {
		let clArea = $(this.container).getClientArea();

		let contentsSize = new Dimension(clArea.width, clArea.height);
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