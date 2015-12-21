/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./media/shell';

import 'vs/css!vs/editor/css/vs-theme';
import 'vs/css!vs/editor/css/vs-dark-theme';
import 'vs/css!vs/editor/css/hc-black-theme';
import 'vs/css!vs/workbench/browser/media/vs-theme';
import 'vs/css!vs/workbench/browser/media/vs-dark-theme';
import 'vs/css!vs/workbench/browser/media/hc-black-theme';

import {Promise, TPromise} from 'vs/base/common/winjs.base';
import {Dimension, Builder, $} from 'vs/base/browser/builder';
import objects = require('vs/base/common/objects');
import dom = require('vs/base/browser/dom');
import {Emitter} from 'vs/base/common/event';
import {IDisposable} from 'vs/base/common/lifecycle';
import errors = require('vs/base/common/errors');
import {ContextViewService} from 'vs/platform/contextview/browser/contextViewService';
import {ContextMenuService} from 'vs/workbench/services/contextview/electron-browser/contextmenuService';
import {Preferences} from 'vs/workbench/common/constants';
import timer = require('vs/base/common/timer');
import {Workbench} from 'vs/workbench/browser/workbench';
import {Storage} from 'vs/workbench/browser/storage';
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
import PluginWorkbenchKeybindingService from 'vs/workbench/services/keybinding/electron-browser/pluginKeybindingService';
import {MainThreadService} from 'vs/workbench/services/thread/electron-browser/threadService';
import {MarkerService} from 'vs/platform/markers/common/markerService';
import {IActionsService} from 'vs/platform/actions/common/actions';
import ActionsService from 'vs/platform/actions/common/actionsService';
import {IModelService} from 'vs/editor/common/services/modelService';
import {ModelServiceImpl} from 'vs/editor/common/services/modelServiceImpl';
import {CodeEditorServiceImpl} from 'vs/editor/browser/services/codeEditorServiceImpl';
import {ICodeEditorService} from 'vs/editor/common/services/codeEditorService';
import {MainProcessVSCodeAPIHelper} from 'vs/workbench/api/browser/extHost.api.impl';
import {MainProcessPluginService} from 'vs/platform/plugins/common/nativePluginService';
import {MainThreadDocuments} from 'vs/workbench/api/common/extHostDocuments';
import {MainProcessTextMateSyntax} from 'vs/editor/node/textMate/TMSyntax';
import {MainProcessTextMateSnippet} from 'vs/editor/node/textMate/TMSnippets';
import {JSONValidationExtensionPoint} from 'vs/platform/jsonschemas/common/jsonValidationExtensionPoint';
import {LanguageConfigurationFileHandler} from 'vs/editor/node/languageConfiguration';
import {MainThreadFileSystemEventService} from 'vs/workbench/api/common/extHostFileSystemEventService';
import {MainThreadQuickOpen} from 'vs/workbench/api/browser/extHostQuickOpen';
import {MainThreadStatusBar} from 'vs/workbench/api/common/extHostStatusBar';
import {MainThreadCommands} from 'vs/workbench/api/common/extHostCommands';
import {RemoteTelemetryServiceHelper} from 'vs/platform/telemetry/common/abstractRemoteTelemetryService';
import {MainThreadDiagnostics} from 'vs/workbench/api/common/extHostDiagnostics';
import {MainThreadOutputService} from 'vs/workbench/api/common/extHostOutputService';
import {MainThreadMessageService} from 'vs/workbench/api/common/extHostMessageService';
import {MainThreadLanguages} from 'vs/workbench/api/common/extHostLanguages';
import {MainThreadEditors} from 'vs/workbench/api/common/extHostEditors';
import {MainThreadWorkspace} from 'vs/workbench/api/common/extHostWorkspace';
import {MainThreadConfiguration} from 'vs/workbench/api/common/extHostConfiguration';
import {MainThreadLanguageFeatures} from 'vs/workbench/api/common/extHostLanguageFeatures';
import {EventService} from 'vs/platform/event/common/eventService';
import {IOptions} from 'vs/workbench/common/options';
import themes = require('vs/platform/theme/common/themes');
import {WorkspaceContextService} from 'vs/workbench/services/workspace/common/contextService';
import {IStorageService, StorageScope, StorageEvent, StorageEventType} from 'vs/platform/storage/common/storage';
import {MainThreadStorage} from 'vs/platform/storage/common/remotable.storage';
import {IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import {create as createInstantiationService } from 'vs/platform/instantiation/common/instantiationService';
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
import {IPluginService} from 'vs/platform/plugins/common/plugins';
import {MainThreadModeServiceImpl} from 'vs/editor/common/services/modeServiceImpl';
import {IModeService} from 'vs/editor/common/services/modeService';
import {IUntitledEditorService, UntitledEditorService} from 'vs/workbench/services/untitled/browser/untitledEditorService';
import {CrashReporter} from 'vs/workbench/electron-browser/crashReporter';
import {IThemeService, ThemeService} from 'vs/workbench/services/themes/node/themeService';
import { IServiceCtor, isServiceEvent } from 'vs/base/common/service';
import { connect, Client } from 'vs/base/node/service.net';
import { IExtensionsService } from 'vs/workbench/parts/extensions/common/extensions';
import { ExtensionsService } from 'vs/workbench/parts/extensions/node/extensionsService';

/**
 * This ugly code is needed because at the point when we need shared services
 * in the instantiation service, the connection to the shared process is not yet
 * completed. This create a delayed service wrapper that waits on that connection
 * and then relays all requests to the shared services.
 *
 * TODO@Joao remove
 */
export function getDelayedService<TService>(clientPromise: TPromise<Client>, serviceName: string, serviceCtor: IServiceCtor<TService>): TService {
	let _servicePromise: TPromise<TService>;
	let servicePromise = () => {
		if (!_servicePromise) {
			_servicePromise = clientPromise.then(client => client.getService(serviceName, serviceCtor));
		}
		return _servicePromise;
	};

	return Object.keys(serviceCtor.prototype)
		.filter(key => key !== 'constructor')
		.reduce((result, key) => {
			if (isServiceEvent(serviceCtor.prototype[key])) {
				let promise: Promise;
				let disposable: IDisposable;

				const emitter = new Emitter<any>({
					onFirstListenerAdd: () => {
						promise = servicePromise().then(service => {
							disposable = service[key](e => emitter.fire(e));
						});
					},
					onLastListenerRemove: () => {
						if (disposable) {
							disposable.dispose();
							disposable = null;
						}
						promise.cancel();
						promise = null;
					}
				});

				return objects.assign(result, { [key]: emitter.event });
			}

			return objects.assign(result, {
				[key]: (...args) => {
					return servicePromise().then(service => service[key](...args));
				}
			});
		}, <TService>{});
}

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
	private keybindingService: PluginWorkbenchKeybindingService;

	private container: HTMLElement;
	private toUnbind: { (): void; }[];
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

		// Workbench Container
		let workbenchContainer = $(parent).div();

		// Instantiation service with services
		let service = this.initInstantiationService();

		//crash reporting
		if (!!this.configuration.env.crashReporter) {
			let crashReporter = service.createInstance(CrashReporter, this.configuration.env.version, this.configuration.env.commitHash);
			crashReporter.start(this.configuration.env.crashReporter);
		}

		const sharedProcessClientPromise = connect(process.env['VSCODE_SHARED_IPC_HOOK']);
		sharedProcessClientPromise.done(null, errors.onUnexpectedError);
		service.addSingleton(IExtensionsService, getDelayedService<IExtensionsService>(sharedProcessClientPromise, 'ExtensionService', ExtensionsService));

		// Workbench
		this.workbench = new Workbench(workbenchContainer.getHTMLElement(), this.workspace, this.configuration, this.options, service);
		this.workbench.startup({
			onServicesCreated: () => {
				this.initPluginSystem();
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
				autoSaveEnabled: this.contextService.isAutoSaveEnabled && this.contextService.isAutoSaveEnabled(),
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
		this.contextService.getConfiguration().additionalWorkerServices = [
			{ serviceId: 'requestService', moduleName: 'vs/workbench/services/request/common/requestService', ctorName: 'WorkerRequestService' }
		];

		this.windowService = new WindowService();
		this.storageService = new Storage(this.contextService);

		// no telemetry in a window for plugin development!
		let enableTelemetry = this.configuration.env.isBuilt && !this.configuration.env.pluginDevelopmentPath ? !!this.configuration.env.enableTelemetry : false;
		this.telemetryService = new ElectronTelemetryService(this.storageService, { enableTelemetry: enableTelemetry, version: this.configuration.env.version, commitHash: this.configuration.env.commitHash });

		this.keybindingService = new PluginWorkbenchKeybindingService(this.contextService, eventService, this.telemetryService, <any>window);

		this.messageService = new MessageService(this.contextService, this.windowService, this.telemetryService, this.keybindingService);
		this.keybindingService.setMessageService(this.messageService);

		let configService = new ConfigurationService(
			this.contextService,
			eventService
		);

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
		this.threadService.registerInstance(requestService);
		lifecycleService.onShutdown(() => requestService.dispose());

		let markerService = new MarkerService(this.threadService);

		let pluginService = new MainProcessPluginService(this.contextService, this.threadService, this.messageService, this.telemetryService);
		this.keybindingService.setPluginService(pluginService);

		let modelService = new ModelServiceImpl(this.threadService, markerService);
		let modeService = new MainThreadModeServiceImpl(this.threadService, pluginService, modelService);

		let untitledEditorService = new UntitledEditorService();
		this.themeService = new ThemeService(pluginService);

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
		result.addSingleton(IPluginService, pluginService);
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
		result.addSingleton(IThemeService, this.themeService);
		result.addSingleton(IActionsService, new ActionsService(pluginService, this.keybindingService));


		return result;
	}

	// TODO@Alex, TODO@Joh move this out of here?
	private initPluginSystem(): void {
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
			themeId = themes.toId(themes.BaseTheme.VS_DARK);
			this.storageService.store(Preferences.THEME, themeId, StorageScope.GLOBAL);
		}

		this.setTheme(themeId, false);

		this.toUnbind.push(this.storageService.addListener(StorageEventType.STORAGE, (e: StorageEvent) => {
			if (e.key === Preferences.THEME) {
				this.setTheme(e.newValue);
			}
		}));
	}

	private setTheme(themeId: string, layout = true): void {
		if (!themeId) {
			return;
		}
		let applyTheme = () => {
			if (this.currentTheme) {
				$(this.container).removeClass(this.currentTheme);
			}
			this.currentTheme = themeId;
			$(this.container).addClass(this.currentTheme);

			if (layout) {
				this.layout();
			}
		};

		if (!themes.getSyntaxThemeId(themeId)) {
			applyTheme();
		} else {
			this.themeService.getTheme(themeId).then(theme => {
				if (theme) {
					this.themeService.loadThemeCSS(themeId);
					applyTheme();

				}
			}, error => {
				errors.onUnexpectedError(error);
			});
		}
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
		if (error.friendlyMessage && this.messageService) {
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
		while (this.toUnbind.length) {
			this.toUnbind.pop()();
		}

		// Container
		$(this.container).empty();
	}
}