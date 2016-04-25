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
import {escapeRegExpCharacters} from 'vs/base/common/strings';
import dom = require('vs/base/browser/dom');
import aria = require('vs/base/browser/ui/aria/aria');
import {dispose, IDisposable} from 'vs/base/common/lifecycle';
import errors = require('vs/base/common/errors');
import {ContextViewService} from 'vs/platform/contextview/browser/contextViewService';
import {ContextMenuService} from 'vs/workbench/services/contextview/electron-browser/contextmenuService';
import timer = require('vs/base/common/timer');
import {Workbench} from 'vs/workbench/browser/workbench';
import {Storage, inMemoryLocalStorageInstance} from 'vs/workbench/common/storage';
import {ITelemetryService, NullTelemetryService} from 'vs/platform/telemetry/common/telemetry';
import {ElectronTelemetryService} from  'vs/platform/telemetry/electron-browser/electronTelemetryService';
import {ElectronIntegration} from 'vs/workbench/electron-browser/integration';
import {Update} from 'vs/workbench/electron-browser/update';
import {WorkspaceStats} from 'vs/platform/telemetry/common/workspaceStats';
import {IWindowService, WindowService} from 'vs/workbench/services/window/electron-browser/windowService';
import {MessageService} from 'vs/workbench/services/message/electron-browser/messageService';
import {RequestService} from 'vs/workbench/services/request/node/requestService';
import {IConfigurationService} from 'vs/platform/configuration/common/configuration';
import {FileService} from 'vs/workbench/services/files/electron-browser/fileService';
import {SearchService} from 'vs/workbench/services/search/node/searchService';
import {LifecycleService} from 'vs/workbench/services/lifecycle/electron-browser/lifecycleService';
import {WorkbenchKeybindingService} from 'vs/workbench/services/keybinding/electron-browser/keybindingService';
import {MainThreadService} from 'vs/workbench/services/thread/electron-browser/threadService';
import {MainProcessMarkerService} from 'vs/platform/markers/common/markerService';
import {IActionsService} from 'vs/platform/actions/common/actions';
import ActionsService from 'vs/platform/actions/common/actionsService';
import {IModelService} from 'vs/editor/common/services/modelService';
import {ModelServiceImpl} from 'vs/editor/common/services/modelServiceImpl';
import {CodeEditorServiceImpl} from 'vs/editor/browser/services/codeEditorServiceImpl';
import {ICodeEditorService} from 'vs/editor/common/services/codeEditorService';
import {EditorWorkerServiceImpl} from 'vs/editor/common/services/editorWorkerServiceImpl';
import {IEditorWorkerService} from 'vs/editor/common/services/editorWorkerService';
import {MainProcessExtensionService} from 'vs/platform/extensions/common/nativeExtensionService';
import {IOptions} from 'vs/workbench/common/options';
import {IStorageService} from 'vs/platform/storage/common/storage';
import {ServiceCollection} from 'vs/platform/instantiation/common/serviceCollection';
import {InstantiationService} from 'vs/platform/instantiation/common/instantiationService';
import {IContextViewService, IContextMenuService} from 'vs/platform/contextview/browser/contextView';
import {IEventService} from 'vs/platform/event/common/event';
import {IFileService} from 'vs/platform/files/common/files';
import {IKeybindingService, IKeybindingContextKey} from 'vs/platform/keybinding/common/keybindingService';
import {ILifecycleService} from 'vs/platform/lifecycle/common/lifecycle';
import {IMarkerService} from 'vs/platform/markers/common/markers';
import {IMessageService, Severity} from 'vs/platform/message/common/message';
import {IRequestService} from 'vs/platform/request/common/request';
import {ISearchService} from 'vs/platform/search/common/search';
import {IThreadService} from 'vs/platform/thread/common/thread';
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
import {IExtensionsChannel, ExtensionsChannelClient} from 'vs/workbench/parts/extensions/common/extensionsIpc';
import {IExtensionsService} from 'vs/workbench/parts/extensions/common/extensions';
import {ReloadWindowAction} from 'vs/workbench/electron-browser/actions';

// self registering service
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
 * The Monaco Workbench Shell contains the Monaco workbench with a rich header containing navigation and the activity bar.
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
	private keybindingService: WorkbenchKeybindingService;

	private container: HTMLElement;
	private toUnbind: IDisposable[];
	private previousErrorValue: string;
	private previousErrorTime: number;
	private content: HTMLElement;
	private contentsContainer: Builder;
	private currentTheme: string;

	private configuration: IConfiguration;
	private workspace: IWorkspace;
	private options: IOptions;
	private workbench: Workbench;

	private messagesShowingContextKey: IKeybindingContextKey<boolean>;

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

		const sharedProcessClientPromise = connect(process.env['VSCODE_SHARED_IPC_HOOK']);

		sharedProcessClientPromise.done(service => {
			service.onClose(() => {
				this.messageService.show(Severity.Error, {
					message: nls.localize('sharedProcessCrashed', "The shared process terminated unexpectedly. Please reload the window to recover."),
					actions: [instantiationService.createInstance(ReloadWindowAction, ReloadWindowAction.ID, ReloadWindowAction.LABEL)]
				});
			});
		}, errors.onUnexpectedError);

		const extensionsChannelPromise = sharedProcessClientPromise
			.then(client => client.getChannel<IExtensionsChannel>('extensions'));

		const channel = getDelayedChannel<IExtensionsChannel>(extensionsChannelPromise);
		const extensionsService = new ExtensionsChannelClient(channel);

		serviceCollection.set(IExtensionsService, extensionsService);

		// Workbench
		this.workbench = instantiationService.createInstance(Workbench, workbenchContainer.getHTMLElement(), this.workspace, this.configuration, this.options, serviceCollection);
		this.workbench.startup({
			onWorkbenchStarted: () => {
				this.onWorkbenchStarted();
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

	private onWorkbenchStarted(): void {

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
				customKeybindingsCount: this.keybindingService.customKeybindingsCount(),
				theme: this.currentTheme
			});

		let workspaceStats: WorkspaceStats = <WorkspaceStats>this.workbench.getInstantiationService().createInstance(WorkspaceStats);
		workspaceStats.reportWorkspaceTags();

		if ((platform.isLinux || platform.isMacintosh) && process.getuid() === 0) {
			this.messageService.show(Severity.Warning, nls.localize('runningAsRoot', "It is recommended not to run Code as 'root'."));
		}
	}

	private initServiceCollection(): [InstantiationService, ServiceCollection] {
		let serviceCollection = new ServiceCollection();
		let instantiationService = new InstantiationService(serviceCollection, true);

		this.windowService = new WindowService();

		let disableWorkspaceStorage = this.configuration.env.extensionTestsPath || (!this.workspace && !this.configuration.env.extensionDevelopmentPath); // without workspace or in any extension test, we use inMemory storage unless we develop an extension where we want to preserve state
		this.storageService = new Storage(this.contextService, window.localStorage, disableWorkspaceStorage ? inMemoryLocalStorageInstance : window.localStorage);

		if (this.configuration.env.isBuilt && !this.configuration.env.extensionDevelopmentPath && !!this.configuration.env.enableTelemetry) {
			this.telemetryService = new ElectronTelemetryService(this.configurationService, this.storageService, {
				cleanupPatterns: [
					[new RegExp(escapeRegExpCharacters(this.configuration.env.appRoot), 'gi'), ''],
					[new RegExp(escapeRegExpCharacters(this.configuration.env.userExtensionsHome), 'gi'), '']
				],
				version: this.configuration.env.version,
				commitHash: this.configuration.env.commitHash
			});
		} else {
			this.telemetryService = NullTelemetryService;
		}

		this.messageService = new MessageService(this.contextService, this.windowService, this.telemetryService);

		let fileService = new FileService(
			this.configurationService,
			this.eventService,
			this.contextService,
			this.messageService
		);

		let lifecycleService = new LifecycleService(this.messageService, this.windowService);
		this.toUnbind.push(lifecycleService.onShutdown(() => fileService.dispose()));

		this.threadService = new MainThreadService(this.contextService, this.messageService, this.windowService, lifecycleService);

		let extensionService = new MainProcessExtensionService(this.contextService, this.threadService, this.messageService, this.telemetryService);

		this.keybindingService = new WorkbenchKeybindingService(this.configurationService, this.contextService, this.eventService, this.telemetryService, this.messageService, extensionService, <any>window);
		this.messagesShowingContextKey = this.keybindingService.createKey('globalMessageVisible', false);
		this.toUnbind.push(this.messageService.onMessagesShowing(() => this.messagesShowingContextKey.set(true)));
		this.toUnbind.push(this.messageService.onMessagesCleared(() => this.messagesShowingContextKey.reset()));

		this.contextViewService = new ContextViewService(this.container, this.telemetryService, this.messageService);

		let requestService = new RequestService(
			this.contextService,
			this.configurationService,
			this.telemetryService
		);
		this.toUnbind.push(lifecycleService.onShutdown(() => requestService.dispose()));

		let markerService = new MainProcessMarkerService(this.threadService);

		let modeService = new MainThreadModeServiceImpl(this.threadService, extensionService, this.configurationService);
		let modelService = new ModelServiceImpl(this.threadService, markerService, modeService, this.configurationService, this.messageService);
		let editorWorkerService = new EditorWorkerServiceImpl(modelService);

		let untitledEditorService = instantiationService.createInstance(UntitledEditorService);
		this.themeService = new ThemeService(extensionService, this.windowService, this.storageService);

		serviceCollection.set(ITelemetryService, this.telemetryService);
		serviceCollection.set(IEventService, this.eventService);
		serviceCollection.set(IRequestService, requestService);
		serviceCollection.set(IWorkspaceContextService, this.contextService);
		serviceCollection.set(IContextViewService, this.contextViewService);
		serviceCollection.set(IContextMenuService, new ContextMenuService(this.messageService, this.telemetryService, this.keybindingService));
		serviceCollection.set(IMessageService, this.messageService);
		serviceCollection.set(IStorageService, this.storageService);
		serviceCollection.set(ILifecycleService, lifecycleService);
		serviceCollection.set(IThreadService, this.threadService);
		serviceCollection.set(IExtensionService, extensionService);
		serviceCollection.set(IModeService, modeService);
		serviceCollection.set(IFileService, fileService);
		serviceCollection.set(IUntitledEditorService, untitledEditorService);
		serviceCollection.set(ISearchService, new SearchService(modelService, untitledEditorService, this.contextService, this.configurationService));
		serviceCollection.set(IWindowService, this.windowService);
		serviceCollection.set(IConfigurationService, this.configurationService);
		serviceCollection.set(IKeybindingService, this.keybindingService);
		serviceCollection.set(IMarkerService, markerService);
		serviceCollection.set(IModelService, modelService);
		serviceCollection.set(ICodeEditorService, new CodeEditorServiceImpl());
		serviceCollection.set(IEditorWorkerService, editorWorkerService);
		serviceCollection.set(IThemeService, this.themeService);
		serviceCollection.set(IActionsService, new ActionsService(extensionService, this.keybindingService));

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
		let timers = (<any>window).GlobalEnvironment.timers;
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

		let now = new Date().getTime();
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
		this.storageService.dispose();

		// Listeners
		this.toUnbind = dispose(this.toUnbind);

		// Container
		$(this.container).empty();
	}
}