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
import { stopProfiling } from 'vs/base/node/profiler';
import product from 'vs/platform/node/product';
import { SyncDescriptor } from 'vs/platform/instantiation/common/descriptors';
import pkg from 'vs/platform/node/package';
import { ContextViewService } from 'vs/platform/contextview/browser/contextViewService';
import { Workbench, IWorkbenchStartedInfo } from 'vs/workbench/electron-browser/workbench';
import { StorageService, inMemoryLocalStorageInstance } from 'vs/platform/storage/common/storageService';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { NullTelemetryService, configurationTelemetry, loadExperiments, lifecycleTelemetry } from 'vs/platform/telemetry/common/telemetryUtils';
import { ITelemetryAppenderChannel, TelemetryAppenderClient } from 'vs/platform/telemetry/common/telemetryIpc';
import { TelemetryService, ITelemetryServiceConfig } from 'vs/platform/telemetry/common/telemetryService';
import { IdleMonitor, UserStatus } from 'vs/platform/telemetry/browser/idleMonitor';
import ErrorTelemetry from 'vs/platform/telemetry/browser/errorTelemetry';
import { ElectronWindow } from 'vs/workbench/electron-browser/window';
import { resolveWorkbenchCommonProperties, getOrCreateMachineId } from 'vs/platform/telemetry/node/workbenchCommonProperties';
import { machineIdIpcChannel } from 'vs/platform/telemetry/node/commonProperties';
import { WorkspaceStats } from 'vs/workbench/services/telemetry/common/workspaceStats';
import { IWindowIPCService, WindowIPCService } from 'vs/workbench/services/window/electron-browser/windowService';
import { IWindowsService, IWindowService } from 'vs/platform/windows/common/windows';
import { WindowsChannelClient } from 'vs/platform/windows/common/windowsIpc';
import { WindowService } from 'vs/platform/windows/electron-browser/windowService';
import { MessageService } from 'vs/workbench/services/message/electron-browser/messageService';
import { IRequestService } from 'vs/platform/request/node/request';
import { RequestService } from 'vs/platform/request/electron-browser/requestService';
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
import { ILifecycleService } from 'vs/platform/lifecycle/common/lifecycle';
import { IMarkerService } from 'vs/platform/markers/common/markers';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IMessageService, IChoiceService, Severity } from 'vs/platform/message/common/message';
import { ChoiceChannel } from 'vs/platform/message/common/messageIpc';
import { ISearchService } from 'vs/platform/search/common/search';
import { IThreadService } from 'vs/workbench/services/thread/common/threadService';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { CommandService } from 'vs/platform/commands/common/commandService';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { IExtensionService } from 'vs/platform/extensions/common/extensions';
import { WorkbenchModeServiceImpl } from 'vs/workbench/services/mode/common/workbenchModeService';
import { IModeService } from 'vs/editor/common/services/modeService';
import { IUntitledEditorService, UntitledEditorService } from 'vs/workbench/services/untitled/common/untitledEditorService';
import { CrashReporter } from 'vs/workbench/electron-browser/crashReporter';
import { NodeCachedDataManager } from 'vs/workbench/electron-browser/nodeCachedDataManager';
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
import { IBackupService } from 'vs/platform/backup/common/backup';
import { BackupChannelClient } from 'vs/platform/backup/common/backupIpc';
import { ReportPerformanceIssueAction } from 'vs/workbench/electron-browser/actions';
import { ExtensionHostProcessWorker } from 'vs/workbench/electron-browser/extensionHost';
import { ITimerService } from 'vs/workbench/services/timer/common/timerService';
import { remote, ipcRenderer as ipc } from 'electron';
import { ITextMateService } from 'vs/editor/node/textMate/textMateService';
import { MainProcessTextMateSyntax } from 'vs/editor/electron-browser/textMate/TMSyntax';
import { BareFontInfo } from 'vs/editor/common/config/fontInfo';
import { restoreFontInfo, readFontInfo, saveFontInfo } from 'vs/editor/browser/config/configuration';
import * as browser from 'vs/base/browser/browser';
import SCMPreview from 'vs/workbench/parts/scm/browser/scmPreview';
import { readdir } from 'vs/base/node/pfs';
import { join } from 'path';
import 'vs/platform/opener/browser/opener.contribution';
import { IWorkbenchThemeService } from 'vs/workbench/services/themes/common/workbenchThemeService';
import { WorkbenchThemeService } from 'vs/workbench/services/themes/electron-browser/workbenchThemeService';
import { registerThemingParticipant, ITheme, ICssStyleCollector } from 'vs/platform/theme/common/themeService';
import { foreground, focus } from 'vs/platform/theme/common/colorRegistry';

/**
 * Services that we require for the Shell
 */
export interface ICoreServices {
	contextService: IWorkspaceContextService;
	configurationService: IConfigurationService;
	environmentService: IEnvironmentService;
	timerService: ITimerService;
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
	private threadService: MainThreadService;
	private configurationService: IConfigurationService;
	private contextService: IWorkspaceContextService;
	private telemetryService: ITelemetryService;
	private extensionService: MainProcessExtensionService;
	private windowsService: IWindowsService;
	private windowIPCService: IWindowIPCService;
	private timerService: ITimerService;
	private themeService: WorkbenchThemeService;

	private container: HTMLElement;
	private toUnbind: IDisposable[];
	private previousErrorValue: string;
	private previousErrorTime: number;
	private content: HTMLElement;
	private contentsContainer: Builder;

	private options: IOptions;
	private workbench: Workbench;

	constructor(container: HTMLElement, services: ICoreServices, options: IOptions) {
		this.container = container;

		this.options = options;

		this.contextService = services.contextService;
		this.configurationService = services.configurationService;
		this.environmentService = services.environmentService;
		this.timerService = services.timerService;

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
		this.workbench = instantiationService.createInstance(Workbench, parent.getHTMLElement(), workbenchContainer.getHTMLElement(), this.options, serviceCollection);
		this.workbench.startup({
			onWorkbenchStarted: (info: IWorkbenchStartedInfo) => {

				// run workbench started logic
				this.onWorkbenchStarted(info);

				// start cached data manager
				instantiationService.createInstance(NodeCachedDataManager);
			}
		});

		// Window
		const activeWindow = this.workbench.getInstantiationService().createInstance(ElectronWindow, currentWindow, this.container);
		this.windowIPCService.registerWindow(activeWindow);

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
		const { filesToOpen, filesToCreate, filesToDiff } = this.options;
		this.telemetryService.publicLog('workspaceLoad', {
			userAgent: navigator.userAgent,
			windowSize: { innerHeight: window.innerHeight, innerWidth: window.innerWidth, outerHeight: window.outerHeight, outerWidth: window.outerWidth },
			emptyWorkbench: !this.contextService.hasWorkspace(),
			'workbench.filesToOpen': filesToOpen && filesToOpen.length || undefined,
			'workbench.filesToCreate': filesToCreate && filesToCreate.length || undefined,
			'workbench.filesToDiff': filesToDiff && filesToDiff.length || undefined,
			customKeybindingsCount: info.customKeybindingsCount,
			theme: this.themeService.getColorTheme().id,
			language: platform.language,
			experiments: this.telemetryService.getExperiments(),
			pinnedViewlets: info.pinnedViewlets
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
		workspaceStats.reportWorkspaceTags(this.options);
		workspaceStats.reportCloudStats();

		if ((platform.isLinux || platform.isMacintosh) && process.getuid() === 0) {
			this.messageService.show(Severity.Warning, nls.localize('runningAsRoot', "It is recommended not to run Code as 'root'."));
		}

		// Profiler: startup cpu profile
		const { profileStartup } = this.environmentService;
		if (profileStartup) {

			stopProfiling(profileStartup.dir, profileStartup.prefix).then(() => {

				readdir(profileStartup.dir).then(files => {
					return files.filter(value => value.indexOf(profileStartup.prefix) === 0);
				}).then(files => {

					const profileFiles = files.reduce((prev, cur) => `${prev}${join(profileStartup.dir, cur)}\n`, '\n');

					const primaryButton = this.messageService.confirm({
						type: 'info',
						message: nls.localize('prof.message', "Successfully created profiles."),
						detail: nls.localize('prof.detail', "Please create an issue and manually attach the following files:\n{0}", profileFiles),
						primaryButton: nls.localize('prof.restartAndFileIssue', "Create Issue and Restart"),
						secondaryButton: nls.localize('prof.restart', "Restart")
					});

					let createIssue = TPromise.as(undefined);
					if (primaryButton) {
						const action = this.workbench.getInstantiationService().createInstance(ReportPerformanceIssueAction, ReportPerformanceIssueAction.ID, ReportPerformanceIssueAction.LABEL);

						createIssue = action.run(`:warning: Make sure to **attach** these files: :warning:\n${files.map(file => `-\`${join(profileStartup.dir, file)}\``).join('\n')}`).then(() => {
							return this.windowsService.showItemInFolder(profileFiles[0]);
						});
					}
					createIssue.then(() => this.windowsService.relaunch({ removeArgs: ['--prof-startup'] }));
				});

			}, err => console.error(err));
		}
	}

	private initServiceCollection(container: HTMLElement): [IInstantiationService, ServiceCollection] {
		const disposables = new Disposables();

		const serviceCollection = new ServiceCollection();
		serviceCollection.set(IWorkspaceContextService, this.contextService);
		serviceCollection.set(IConfigurationService, this.configurationService);
		serviceCollection.set(IEnvironmentService, this.environmentService);
		serviceCollection.set(ITimerService, this.timerService);

		const instantiationService: IInstantiationService = new InstantiationService(serviceCollection, true);

		// TODO@joao remove this
		this.windowIPCService = instantiationService.createInstance<IWindowIPCService>(WindowIPCService);
		serviceCollection.set(IWindowIPCService, this.windowIPCService);

		const mainProcessClient = new ElectronIPCClient(String(`window${currentWindow.id}`));
		disposables.add(mainProcessClient);

		const windowsChannel = mainProcessClient.getChannel('windows');
		this.windowsService = new WindowsChannelClient(windowsChannel);
		serviceCollection.set(IWindowsService, this.windowsService);

		serviceCollection.set(IWindowService, new SyncDescriptor(WindowService, this.windowIPCService.getWindowId()));

		const sharedProcess = this.windowsService.whenSharedProcessReady()
			.then(() => connectNet(this.environmentService.sharedIPCHandle, `window:${this.windowIPCService.getWindowId()}`));

		sharedProcess
			.done(client => client.registerChannel('choice', instantiationService.createInstance(ChoiceChannel)));

		// Storage Sevice
		const disableWorkspaceStorage = this.environmentService.extensionTestsPath || (!this.contextService.hasWorkspace() && !this.environmentService.isExtensionDevelopment); // without workspace or in any extension test, we use inMemory storage unless we develop an extension where we want to preserve state
		this.storageService = instantiationService.createInstance(StorageService, window.localStorage, disableWorkspaceStorage ? inMemoryLocalStorageInstance : window.localStorage);
		serviceCollection.set(IStorageService, this.storageService);

		// Warm up font cache information before building up too many dom elements
		restoreFontInfo(this.storageService);
		readFontInfo(BareFontInfo.createFromRawSettings(this.configurationService.getConfiguration('editor'), browser.getZoomLevel()));

		// Telemetry
		this.sendMachineIdToMain(this.storageService);
		if (this.environmentService.isBuilt && !this.environmentService.isExtensionDevelopment && !!product.enableTelemetry) {
			const channel = getDelayedChannel<ITelemetryAppenderChannel>(sharedProcess.then(c => c.getChannel('telemetryAppender')));
			const commit = product.commit;
			const version = pkg.version;

			const config: ITelemetryServiceConfig = {
				appender: new TelemetryAppenderClient(channel),
				commonProperties: resolveWorkbenchCommonProperties(this.storageService, commit, version),
				piiPaths: [this.environmentService.appRoot, this.environmentService.extensionsPath],
				experiments: instantiationService.invokeFunction(loadExperiments)
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
			NullTelemetryService._experiments = instantiationService.invokeFunction(loadExperiments);
			this.telemetryService = NullTelemetryService;
		}

		serviceCollection.set(ITelemetryService, this.telemetryService);
		disposables.add(configurationTelemetry(this.telemetryService, this.configurationService));

		this.messageService = instantiationService.createInstance(MessageService, container);
		serviceCollection.set(IMessageService, this.messageService);
		serviceCollection.set(IChoiceService, this.messageService);

		const lifecycleService = instantiationService.createInstance(LifecycleService);
		this.toUnbind.push(lifecycleService.onShutdown(reason => disposables.dispose()));
		this.toUnbind.push(lifecycleService.onShutdown(reason => saveFontInfo(this.storageService)));
		serviceCollection.set(ILifecycleService, lifecycleService);
		disposables.add(lifecycleTelemetry(this.telemetryService, lifecycleService));

		const extensionManagementChannel = getDelayedChannel<IExtensionManagementChannel>(sharedProcess.then(c => c.getChannel('extensions')));
		serviceCollection.set(IExtensionManagementService, new SyncDescriptor(ExtensionManagementChannelClient, extensionManagementChannel));

		const extensionEnablementService = instantiationService.createInstance(ExtensionEnablementService);
		serviceCollection.set(IExtensionEnablementService, extensionEnablementService);
		disposables.add(extensionEnablementService);

		const extensionHostProcessWorker = instantiationService.createInstance(ExtensionHostProcessWorker);
		this.threadService = instantiationService.createInstance(MainThreadService, extensionHostProcessWorker.messagingProtocol);
		serviceCollection.set(IThreadService, this.threadService);

		this.timerService.beforeExtensionLoad = Date.now();

		// TODO@Joao: remove
		const disabledExtensions = SCMPreview.enabled ? [] : ['vscode.git'];
		this.extensionService = instantiationService.createInstance(MainProcessExtensionService, disabledExtensions);
		serviceCollection.set(IExtensionService, this.extensionService);
		extensionHostProcessWorker.start(this.extensionService);
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

		serviceCollection.set(IEditorWorkerService, new SyncDescriptor(EditorWorkerServiceImpl));

		serviceCollection.set(IUntitledEditorService, new SyncDescriptor(UntitledEditorService));

		serviceCollection.set(ITextMateService, new SyncDescriptor(MainProcessTextMateSyntax));

		serviceCollection.set(ISearchService, new SyncDescriptor(SearchService));

		serviceCollection.set(ICodeEditorService, new SyncDescriptor(CodeEditorServiceImpl));

		serviceCollection.set(IIntegrityService, new SyncDescriptor(IntegrityServiceImpl));

		const updateChannel = mainProcessClient.getChannel('update');
		serviceCollection.set(IUpdateService, new SyncDescriptor(UpdateChannelClient, updateChannel));

		const urlChannel = mainProcessClient.getChannel('url');
		serviceCollection.set(IURLService, new SyncDescriptor(URLChannelClient, urlChannel, this.windowIPCService.getWindowId()));

		const backupChannel = mainProcessClient.getChannel('backup');
		serviceCollection.set(IBackupService, new SyncDescriptor(BackupChannelClient, backupChannel));

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
	const windowForeground = theme.getColor(foreground);
	if (windowForeground) {
		collector.addRule(`.monaco-shell { color: ${windowForeground}; }`);
	}

	const focusOutline = theme.getColor(focus);
	if (focusOutline) {
		collector.addRule(`
			.monaco-shell [tabindex="0"]:focus,
			.monaco-shell .synthetic-focus,
			.monaco-shell select:focus,
			.monaco-shell .monaco-tree.focused.no-focused-item:focus:before,
			.monaco-shell input[type="button"]:focus,
			.monaco-shell input[type="text"]:focus,
			.monaco-shell textarea:focus,
			.monaco-shell input[type="search"]:focus,
			.monaco-shell input[type="checkbox"]:focus {
				outline-color: ${focusOutline};
			}
		`);
	}
});
