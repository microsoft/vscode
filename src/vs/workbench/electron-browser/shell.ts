/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./media/shell';

import 'vs/css!vs/workbench/browser/media/vs-theme';
import 'vs/css!vs/workbench/browser/media/vs-dark-theme';
import 'vs/css!vs/workbench/browser/media/hc-black-theme';

import * as nls from 'vs/nls';
import {TPromise} from 'vs/base/common/winjs.base';
import {Dimension, Builder, $} from 'vs/base/browser/builder';
import objects = require('vs/base/common/objects');
import dom = require('vs/base/browser/dom');
import aria = require('vs/base/browser/ui/aria/aria');
import {disposeAll, IDisposable} from 'vs/base/common/lifecycle';
import errors = require('vs/base/common/errors');
import {ContextViewService} from 'vs/platform/contextview/browser/contextViewService';
import {ContextMenuService} from 'vs/workbench/services/contextview/electron-browser/contextmenuService';
import {Preferences} from 'vs/workbench/common/constants';
import timer = require('vs/base/common/timer');
import {Workbench} from 'vs/workbench/browser/workbench';
import {Storage, inMemoryLocalStorageInstance} from 'vs/workbench/common/storage';
import {ITelemetryService} from 'vs/platform/telemetry/common/telemetry';
import {ElectronTelemetryService} from  'vs/platform/telemetry/electron-browser/electronTelemetryService';
import {ElectronIntegration} from 'vs/workbench/electron-browser/integration';
import {Update} from 'vs/workbench/electron-browser/update';
import {WorkspaceStats} from 'vs/platform/telemetry/common/workspaceStats';
import {IWindowService, WindowService} from 'vs/workbench/services/window/electron-browser/windowService';
import {MessageService} from 'vs/workbench/services/message/electron-browser/messageService';
import {RequestService} from 'vs/workbench/services/request/node/requestService';
import {IConfigurationService} from 'vs/platform/configuration/common/configuration';
import {ConfigurationService} from 'vs/workbench/services/configuration/node/configurationService';
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
import {MainProcessVSCodeAPIHelper} from 'vs/workbench/api/node/extHost.api.impl';
import {MainProcessExtensionService} from 'vs/platform/extensions/common/nativeExtensionService';
import {MainThreadDocuments} from 'vs/workbench/api/node/extHostDocuments';
import {MainProcessTextMateSyntax} from 'vs/editor/node/textMate/TMSyntax';
import {MainProcessTextMateSnippet} from 'vs/editor/node/textMate/TMSnippets';
import {JSONValidationExtensionPoint} from 'vs/platform/jsonschemas/common/jsonValidationExtensionPoint';
import {LanguageConfigurationFileHandler} from 'vs/editor/node/languageConfiguration';
import {MainThreadFileSystemEventService} from 'vs/workbench/api/node/extHostFileSystemEventService';
import {MainThreadQuickOpen} from 'vs/workbench/api/node/extHostQuickOpen';
import {MainThreadStatusBar} from 'vs/workbench/api/node/extHostStatusBar';
import {MainThreadCommands} from 'vs/workbench/api/node/extHostCommands';
import {RemoteTelemetryServiceHelper} from 'vs/platform/telemetry/common/abstractRemoteTelemetryService';
import {MainThreadDiagnostics} from 'vs/workbench/api/node/extHostDiagnostics';
import {MainThreadOutputService} from 'vs/workbench/api/node/extHostOutputService';
import {MainThreadMessageService} from 'vs/workbench/api/node/extHostMessageService';
import {MainThreadLanguages} from 'vs/workbench/api/node/extHostLanguages';
import {MainThreadEditors} from 'vs/workbench/api/node/extHostEditors';
import {MainThreadWorkspace} from 'vs/workbench/api/node/extHostWorkspace';
import {MainThreadConfiguration} from 'vs/workbench/api/node/extHostConfiguration';
import {MainThreadLanguageFeatures} from 'vs/workbench/api/node/extHostLanguageFeatures';
import {EventService} from 'vs/platform/event/common/eventService';
import {IOptions} from 'vs/workbench/common/options';
import {WorkspaceContextService} from 'vs/workbench/services/workspace/common/contextService';
import {IStorageService, StorageScope, StorageEvent, StorageEventType} from 'vs/platform/storage/common/storage';
import {MainThreadStorage} from 'vs/platform/storage/common/remotable.storage';
import {IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import {createInstantiationService as createInstantiationService } from 'vs/platform/instantiation/common/instantiationService';
import {IContextViewService, IContextMenuService} from 'vs/platform/contextview/browser/contextView';
import {IEventService} from 'vs/platform/event/common/event';
import {IFileService} from 'vs/platform/files/common/files';
import {IKeybindingService} from 'vs/platform/keybinding/common/keybindingService';
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
import {IThemeService, DEFAULT_THEME_ID} from 'vs/workbench/services/themes/common/themeService';
import {ThemeService} from 'vs/workbench/services/themes/node/themeService';
import {getService } from 'vs/base/common/service';
import {connect} from 'vs/base/node/service.net';
import {IExtensionsService} from 'vs/workbench/parts/extensions/common/extensions';
import {ExtensionsService} from 'vs/workbench/parts/extensions/node/extensionsService';
import {ReloadWindowAction} from 'vs/workbench/electron-browser/actions';

/**
 * The Monaco Workbench Shell contains the Monaco workbench with a rich header containing navigation and the activity bar.
 * With the Shell being the top level element in the page, it is also responsible for driving the layouting.
 */
export class WorkbenchShell {
	private storageService: IStorageService;
	private messageService: IMessageService;
	private contextViewService: ContextViewService;
	private windowService: IWindowService;
	private threadService: MainThreadService;
	private themeService: IThemeService;
	private contextService: WorkspaceContextService;
	private telemetryService: ElectronTelemetryService;
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

	constructor(container: HTMLElement, workspace: IWorkspace, configuration: IConfiguration, options: IOptions) {
		this.container = container;

		this.workspace = workspace;
		this.configuration = configuration;
		this.options = objects.mixin({}, options);

		this.toUnbind = [];
		this.previousErrorTime = 0;
	}

	private createContents(parent: Builder): Builder {

		// ARIA
		aria.setARIAContainer(document.body);

		// Workbench Container
		let workbenchContainer = $(parent).div();

		// Instantiation service with services
		let instantiationService = this.initInstantiationService();

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

		instantiationService.addSingleton(IExtensionsService, getService<IExtensionsService>(sharedProcessClientPromise, 'ExtensionService', ExtensionsService));

		// Workbench
		this.workbench = new Workbench(workbenchContainer.getHTMLElement(), this.workspace, this.configuration, this.options, instantiationService);
		this.workbench.startup({
			onServicesCreated: () => {
				this.initExtensionSystem();
			},
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
	}

	private initInstantiationService(): IInstantiationService {
		let eventService = new EventService();

		this.contextService = new WorkspaceContextService(eventService, this.workspace, this.configuration, this.options);

		this.windowService = new WindowService();

		let disableWorkspaceStorage = this.configuration.env.extensionTestsPath || (!this.workspace && !this.configuration.env.extensionDevelopmentPath); // without workspace or in any extension test, we use inMemory storage unless we develop an extension where we want to preserve state
		this.storageService = new Storage(this.contextService, window.localStorage, disableWorkspaceStorage ? inMemoryLocalStorageInstance : window.localStorage);

		let configService = new ConfigurationService(
			this.contextService,
			eventService
		);

		// no telemetry in a window for extension development!
		let enableTelemetry = this.configuration.env.isBuilt && !this.configuration.env.extensionDevelopmentPath ? !!this.configuration.env.enableTelemetry : false;
		this.telemetryService = new ElectronTelemetryService(configService, this.storageService, { enableTelemetry: enableTelemetry, version: this.configuration.env.version, commitHash: this.configuration.env.commitHash });

		this.keybindingService = new WorkbenchKeybindingService(configService, this.contextService, eventService, this.telemetryService, <any>window);

		this.messageService = new MessageService(this.contextService, this.windowService, this.telemetryService, this.keybindingService);
		this.keybindingService.setMessageService(this.messageService);

		let fileService = new FileService(
			configService,
			eventService,
			this.contextService
		);

		this.contextViewService = new ContextViewService(this.container, this.telemetryService, this.messageService);

		let lifecycleService = new LifecycleService(this.messageService, this.windowService);
		lifecycleService.onShutdown(() => fileService.dispose());

		this.threadService = new MainThreadService(this.contextService, this.messageService, this.windowService);
		lifecycleService.onShutdown(() => this.threadService.dispose());

		let requestService = new RequestService(
			this.contextService,
			configService,
			this.telemetryService
		);
		lifecycleService.onShutdown(() => requestService.dispose());

		let markerService = new MainProcessMarkerService(this.threadService);

		let extensionService = new MainProcessExtensionService(this.contextService, this.threadService, this.messageService, this.telemetryService);
		this.keybindingService.setExtensionService(extensionService);

		let modeService = new MainThreadModeServiceImpl(this.threadService, extensionService, configService);
		let modelService = new ModelServiceImpl(this.threadService, markerService, modeService, configService, this.messageService);
		let editorWorkerService = new EditorWorkerServiceImpl(modelService);

		let untitledEditorService = new UntitledEditorService();
		this.themeService = new ThemeService(extensionService);

		let result = createInstantiationService();
		result.addSingleton(ITelemetryService, this.telemetryService);
		result.addSingleton(IEventService, eventService);
		result.addSingleton(IRequestService, requestService);
		result.addSingleton(IWorkspaceContextService, this.contextService);
		result.addSingleton(IContextViewService, this.contextViewService);
		result.addSingleton(IContextMenuService, new ContextMenuService(this.messageService, this.telemetryService, this.keybindingService));
		result.addSingleton(IMessageService, this.messageService);
		result.addSingleton(IStorageService, this.storageService);
		result.addSingleton(ILifecycleService, lifecycleService);
		result.addSingleton(IThreadService, this.threadService);
		result.addSingleton(IExtensionService, extensionService);
		result.addSingleton(IModeService, modeService);
		result.addSingleton(IFileService, fileService);
		result.addSingleton(IUntitledEditorService, untitledEditorService);
		result.addSingleton(ISearchService, new SearchService(modelService, untitledEditorService, this.contextService, configService));
		result.addSingleton(IWindowService, this.windowService);
		result.addSingleton(IConfigurationService, configService);
		result.addSingleton(IKeybindingService, this.keybindingService);
		result.addSingleton(IMarkerService, markerService);
		result.addSingleton(IModelService, modelService);
		result.addSingleton(ICodeEditorService, new CodeEditorServiceImpl());
		result.addSingleton(IEditorWorkerService, editorWorkerService);
		result.addSingleton(IThemeService, this.themeService);
		result.addSingleton(IActionsService, new ActionsService(extensionService, this.keybindingService));


		return result;
	}

	// TODO@Alex, TODO@Joh move this out of here?
	private initExtensionSystem(): void {
		this.threadService.getRemotable(MainProcessVSCodeAPIHelper);
		this.threadService.getRemotable(MainThreadDocuments);
		this.threadService.getRemotable(RemoteTelemetryServiceHelper);
		this.workbench.getInstantiationService().createInstance(MainProcessTextMateSyntax);
		this.workbench.getInstantiationService().createInstance(MainProcessTextMateSnippet);
		this.workbench.getInstantiationService().createInstance(JSONValidationExtensionPoint);
		this.workbench.getInstantiationService().createInstance(LanguageConfigurationFileHandler);
		this.threadService.getRemotable(MainThreadConfiguration);
		this.threadService.getRemotable(MainThreadQuickOpen);
		this.threadService.getRemotable(MainThreadStatusBar);
		this.workbench.getInstantiationService().createInstance(MainThreadFileSystemEventService);
		this.threadService.getRemotable(MainThreadCommands);
		this.threadService.getRemotable(MainThreadOutputService);
		this.threadService.getRemotable(MainThreadDiagnostics);
		this.threadService.getRemotable(MainThreadMessageService);
		this.threadService.getRemotable(MainThreadLanguages);
		this.threadService.getRemotable(MainThreadWorkspace);
		this.threadService.getRemotable(MainThreadEditors);
		this.threadService.getRemotable(MainThreadStorage);
		this.threadService.getRemotable(MainThreadLanguageFeatures);
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
		let themeId = this.storageService.get(Preferences.THEME, StorageScope.GLOBAL, null);
		if (!themeId) {
			themeId = DEFAULT_THEME_ID;
			this.storageService.store(Preferences.THEME, themeId, StorageScope.GLOBAL);
		}

		this.setTheme(themeId, false);

		this.toUnbind.push(this.storageService.addListener2(StorageEventType.STORAGE, (e: StorageEvent) => {
			if (e.key === Preferences.THEME) {
				this.setTheme(e.newValue);
			}
		}));
	}

	private setTheme(themeId: string, layout = true): void {
		if (!themeId) {
			return;
		}
		let applyTheme = (themeId: string) => {
			if (this.currentTheme) {
				$(this.container).removeClass(this.currentTheme);
			}
			this.currentTheme = themeId;
			$(this.container).addClass(this.currentTheme);

			if (layout) {
				this.layout();
			}
		};

		this.themeService.loadTheme(themeId).then(theme => {
			let newThemeId = theme ? theme.id : DEFAULT_THEME_ID;

			this.themeService.applyThemeCSS(newThemeId);
			applyTheme(newThemeId);
			if (newThemeId !== themeId) {
				this.storageService.store(Preferences.THEME, newThemeId, StorageScope.GLOBAL);
			}
		}, error => {
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

	public dispose(force?: boolean): void {

		// Workbench
		if (this.workbench) {
			let veto = this.workbench.shutdown(force);

			// If Workbench vetos dispose, return early
			if (veto) {
				return;
			}
		}

		this.contextViewService.dispose();
		this.storageService.dispose();

		// Listeners
		this.toUnbind = disposeAll(this.toUnbind);

		// Container
		$(this.container).empty();
	}
}