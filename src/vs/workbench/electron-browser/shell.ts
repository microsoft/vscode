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

import {Promise,TPromise} from 'vs/base/common/winjs.base';
import {Dimension, Builder, $} from 'vs/base/browser/builder';
import objects = require('vs/base/common/objects');
import env = require('vs/base/common/flags');
import dom = require('vs/base/browser/dom');
import Event, { Emitter } from 'vs/base/common/event';
import { IDisposable } from 'vs/base/common/lifecycle';
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
import {IWindowService, WindowService} from 'vs/workbench/services/window/electron-browser/windowService';
import {MessageService} from 'vs/workbench/services/message/electron-browser/messageService';
import {RequestService} from 'vs/workbench/services/request/node/requestService';
import {IConfigurationService} from 'vs/platform/configuration/common/configuration';
import {MigrationConfigurationService} from 'vs/workbench/services/configuration/common/configurationService';
import {FileService} from 'vs/workbench/services/files/electron-browser/fileService';
import {SearchService} from 'vs/workbench/services/search/node/searchService';
import {LifecycleService} from 'vs/workbench/services/lifecycle/electron-browser/lifecycleService';
import PluginWorkbenchKeybindingService from 'vs/workbench/services/keybinding/browser/pluginKeybindingService';
import {MainThreadService} from 'vs/workbench/services/thread/electron-browser/threadService';
import {MarkerService} from 'vs/platform/markers/common/markerService';
import {IActionsService} from 'vs/platform/actions/common/actions';
import ActionsService from 'vs/platform/actions/common/actionsService';
import {IModelService} from 'vs/editor/common/services/modelService';
import {ModelServiceImpl} from 'vs/editor/common/services/modelServiceImpl';
import {CodeEditorServiceImpl} from 'vs/editor/browser/services/codeEditorServiceImpl';
import {ICodeEditorService} from 'vs/editor/common/services/codeEditorService';
import {MainProcessVSCodeAPIHelper} from 'vs/workbench/api/browser/pluginHost.api.impl';
import {MainProcessPluginService} from 'vs/platform/plugins/common/nativePluginService';
import {MainThreadDocuments} from 'vs/workbench/api/common/pluginHostDocuments';
import {MainProcessTextMateSyntax} from 'vs/editor/node/textMate/TMSyntax';
import {MainProcessTextMateSnippet} from 'vs/editor/node/textMate/TMSnippets';
import {LanguageConfigurationFileHandler} from 'vs/editor/node/languageConfiguration';
import {MainThreadFileSystemEventService} from 'vs/workbench/api/common/pluginHostFileSystemEventService';
import {MainThreadQuickOpen} from 'vs/workbench/api/browser/pluginHostQuickOpen';
import {MainThreadStatusBar} from 'vs/workbench/api/browser/pluginHostStatusBar';
import {MainThreadCommands} from 'vs/workbench/api/common/pluginHostCommands';
import {RemoteTelemetryServiceHelper} from 'vs/platform/telemetry/common/abstractRemoteTelemetryService';
import {MainThreadDiagnostics} from 'vs/workbench/api/common/pluginHostDiagnostics';
import {MainThreadOutputService} from 'vs/workbench/api/browser/extHostOutputService';
import {MainThreadMessageService} from 'vs/workbench/api/common/pluginHostMessageService';
import {MainThreadLanguages} from 'vs/workbench/api/common/extHostLanguages';
import {MainThreadEditors} from 'vs/workbench/api/common/pluginHostEditors';
import {MainThreadWorkspace} from 'vs/workbench/api/browser/pluginHostWorkspace';
import {MainThreadConfiguration} from 'vs/workbench/api/common/pluginHostConfiguration';
import {LanguageFeatures} from 'vs/workbench/api/common/languageFeatures';
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
import {IMarkerService, IMarkerData} from 'vs/platform/markers/common/markers';
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
 * This ugly beast is needed because at the point when we need shared services
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
		}, <TService> {});
}

/**
 * The Monaco Workbench Shell contains the Monaco workbench with a rich header containing navigation and the activity bar.
 * With the Shell being the top level element in the page, it is also responsible for driving the layouting.
 */
export class WorkbenchShell {
	private storageServiceInstance: IStorageService;
	private messageServiceInstance: IMessageService;
	private contextViewServiceInstance: ContextViewService;
	private windowServiceInstance: IWindowService;
	private threadServiceInstance: MainThreadService;
	private themeService: IThemeService;

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

	private initInstantiationService(): IInstantiationService {
		let eventServiceInstance = new EventService();

		let contextServiceInstance = new WorkspaceContextService(eventServiceInstance, this.workspace, this.configuration, this.options);
		contextServiceInstance.getConfiguration().additionalWorkerServices = [
			{ serviceId: 'requestService', moduleName: 'vs/workbench/services/request/common/requestService', ctorName: 'WorkerRequestService' }
		];

		this.windowServiceInstance = new WindowService();
		this.storageServiceInstance = new Storage(contextServiceInstance);

		// no telemetry in a window for plugin development!
		let enableTelemetry = this.configuration.env.isBuilt && !this.configuration.env.pluginDevelopmentPath ? !!this.configuration.env.enableTelemetry : false;
		let telemetryServiceInstance = new ElectronTelemetryService(this.storageServiceInstance, { enableTelemetry: enableTelemetry, version: this.configuration.env.version, commitHash: this.configuration.env.commitHash });

		let keybindingServiceInstance = new PluginWorkbenchKeybindingService(contextServiceInstance, eventServiceInstance, telemetryServiceInstance, <any>window);

		this.messageServiceInstance = new MessageService(contextServiceInstance, this.windowServiceInstance, telemetryServiceInstance, keybindingServiceInstance);
		keybindingServiceInstance.setMessageService(this.messageServiceInstance);

		let configServiceInstance = new MigrationConfigurationService(
			contextServiceInstance,
			eventServiceInstance,
			this.messageServiceInstance
		);

		let fileServiceInstance = new FileService(
			configServiceInstance,
			eventServiceInstance,
			contextServiceInstance
		);

		this.contextViewServiceInstance = new ContextViewService(this.container, telemetryServiceInstance, this.messageServiceInstance);

		let lifecycleServiceInstance = new LifecycleService(this.messageServiceInstance, this.windowServiceInstance);
		lifecycleServiceInstance.onShutdown.add(() => fileServiceInstance.dispose());

		this.threadServiceInstance = new MainThreadService(contextServiceInstance, this.messageServiceInstance, this.windowServiceInstance);
		lifecycleServiceInstance.onShutdown.add(() => this.threadServiceInstance.dispose());

		let requestServiceInstance = new RequestService(
			contextServiceInstance,
			configServiceInstance,
			telemetryServiceInstance
		);
		this.threadServiceInstance.registerInstance(requestServiceInstance);
		lifecycleServiceInstance.onShutdown.add(() => requestServiceInstance.dispose());

		let markerServiceInstance = new MarkerService(this.threadServiceInstance);

		let pluginService = new MainProcessPluginService(contextServiceInstance, this.threadServiceInstance, this.messageServiceInstance, telemetryServiceInstance);
		keybindingServiceInstance.setPluginService(pluginService);

		let modelServiceInstance = new ModelServiceImpl(this.threadServiceInstance, markerServiceInstance);
		let modeService = new MainThreadModeServiceImpl(this.threadServiceInstance, pluginService, modelServiceInstance);

		let untitledEditorService = new UntitledEditorService();
		this.themeService = new ThemeService(pluginService);

		let result = createInstantiationService();
		result.addSingleton(ITelemetryService, telemetryServiceInstance);
		result.addSingleton(IEventService, eventServiceInstance);
		result.addSingleton(IRequestService, requestServiceInstance);
		result.addSingleton(IWorkspaceContextService, contextServiceInstance);
		result.addSingleton(IContextViewService, this.contextViewServiceInstance);
		result.addSingleton(IContextMenuService, new ContextMenuService(this.messageServiceInstance, telemetryServiceInstance));
		result.addSingleton(IMessageService, this.messageServiceInstance);
		result.addSingleton(IStorageService, this.storageServiceInstance);
		result.addSingleton(ILifecycleService, lifecycleServiceInstance);
		result.addSingleton(IThreadService, this.threadServiceInstance);
		result.addSingleton(IPluginService, pluginService);
		result.addSingleton(IModeService, modeService);
		result.addSingleton(IFileService, fileServiceInstance);
		result.addSingleton(IUntitledEditorService, untitledEditorService);
		result.addSingleton(ISearchService, new SearchService(modelServiceInstance, untitledEditorService, contextServiceInstance, configServiceInstance));
		result.addSingleton(IWindowService, this.windowServiceInstance);
		result.addSingleton(IConfigurationService, configServiceInstance);
		result.addSingleton(IKeybindingService, keybindingServiceInstance);
		result.addSingleton(IMarkerService, markerServiceInstance);
		result.addSingleton(IModelService, modelServiceInstance);
		result.addSingleton(ICodeEditorService, new CodeEditorServiceImpl());
		result.addSingleton(IThemeService, this.themeService);
		result.addSingleton(IActionsService, new ActionsService(pluginService, keybindingServiceInstance));


		return result;
	}

	// TODO@Alex, TODO@Joh move this out of here?
	private initPluginSystem(): void {
		this.threadServiceInstance.getRemotable(MainProcessVSCodeAPIHelper);
		this.threadServiceInstance.getRemotable(MainThreadDocuments);
		this.threadServiceInstance.getRemotable(RemoteTelemetryServiceHelper);
		this.workbench.getInstantiationService().createInstance(MainProcessTextMateSyntax);
		this.workbench.getInstantiationService().createInstance(MainProcessTextMateSnippet);
		this.workbench.getInstantiationService().createInstance(LanguageConfigurationFileHandler);
		this.threadServiceInstance.getRemotable(MainThreadConfiguration);
		this.threadServiceInstance.getRemotable(MainThreadQuickOpen);
		this.threadServiceInstance.getRemotable(MainThreadStatusBar);
		this.workbench.getInstantiationService().createInstance(MainThreadFileSystemEventService);
		this.threadServiceInstance.getRemotable(MainThreadCommands);
		this.threadServiceInstance.getRemotable(MainThreadOutputService);
		this.threadServiceInstance.getRemotable(MainThreadDiagnostics);
		this.threadServiceInstance.getRemotable(MainThreadMessageService);
		this.threadServiceInstance.getRemotable(MainThreadLanguages);
		this.threadServiceInstance.getRemotable(MainThreadWorkspace);
		this.threadServiceInstance.getRemotable(MainThreadEditors);
		this.threadServiceInstance.getRemotable(MainThreadStorage);
		LanguageFeatures.createMainThreadInstances(this.threadServiceInstance);
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
		let themeId = this.storageServiceInstance.get(Preferences.THEME, StorageScope.GLOBAL, null);
		if (!themeId) {
			themeId = themes.toId(themes.BaseTheme.VS_DARK);
			this.storageServiceInstance.store(Preferences.THEME, themeId, StorageScope.GLOBAL);
		}

		this.setTheme(themeId, false);

		this.toUnbind.push(this.storageServiceInstance.addListener(StorageEventType.STORAGE, (e: StorageEvent) => {
			if (e.key === Preferences.THEME) {
				this.setTheme(e.newValue);
			}
		}));
	}

	private setTheme(themeId: string, layout = true): void {
		if (!themeId) {
			return;
		}
		var applyTheme = () => {
			if (this.currentTheme) {
				$(this.container).removeClass(this.currentTheme);
			}
			this.currentTheme = themeId;
			$(this.container).addClass(this.currentTheme);

			if (layout) {
				this.layout();
			}
		}

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
		if (error.friendlyMessage && this.messageServiceInstance) {
			this.messageServiceInstance.show(Severity.Error, error.friendlyMessage);
		}
	}

	public layout(): void {
		let clArea = $(this.container).getClientArea();

		let contentsSize = new Dimension(clArea.width, clArea.height);
		this.contentsContainer.size(contentsSize.width, contentsSize.height);

		this.contextViewServiceInstance.layout();
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

		this.contextViewServiceInstance.dispose();
		this.storageServiceInstance.dispose();

		// Listeners
		while (this.toUnbind.length) {
			this.toUnbind.pop()();
		}

		// Container
		$(this.container).empty();
	}
}