/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./media/actions';

import URI from 'vs/base/common/uri';
import * as collections from 'vs/base/common/collections';
import { TPromise } from 'vs/base/common/winjs.base';
import { Action } from 'vs/base/common/actions';
import { IWindowService, IWindowsService, MenuBarVisibility } from 'vs/platform/windows/common/windows';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import nls = require('vs/nls');
import product from 'vs/platform/node/product';
import pkg from 'vs/platform/node/package';
import errors = require('vs/base/common/errors');
import { IMessageService, Severity } from 'vs/platform/message/common/message';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IConfigurationEditingService, ConfigurationTarget } from 'vs/workbench/services/configuration/common/configurationEditing';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IExtensionManagementService, LocalExtensionType, ILocalExtension } from 'vs/platform/extensionManagement/common/extensionManagement';
import { IWorkspaceConfigurationService } from 'vs/workbench/services/configuration/common/configuration';
import paths = require('vs/base/common/paths');
import { isMacintosh, isLinux } from 'vs/base/common/platform';
import { IQuickOpenService, IFilePickOpenEntry, ISeparator, IPickOpenAction, IPickOpenItem } from 'vs/platform/quickOpen/common/quickOpen';
import { KeyMod } from 'vs/base/common/keyCodes';
import * as browser from 'vs/base/browser/browser';
import { IIntegrityService } from 'vs/platform/integrity/common/integrity';
import { IEntryRunContext } from 'vs/base/parts/quickopen/common/quickOpen';
import { ITimerService, IStartupMetrics } from 'vs/workbench/services/timer/common/timerService';
import { IEditorGroupService } from 'vs/workbench/services/group/common/groupService';
import { IPanelService } from 'vs/workbench/services/panel/common/panelService';
import { IPartService, Parts, Position as SidebarPosition } from 'vs/workbench/services/part/common/partService';
import { IViewletService } from 'vs/workbench/services/viewlet/browser/viewlet';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import * as os from 'os';
import { webFrame } from 'electron';
import { getPathLabel } from 'vs/base/common/labels';
import { IViewlet } from 'vs/workbench/common/viewlet';
import { IPanel } from 'vs/workbench/common/panel';
import { IWorkspaceIdentifier, getWorkspaceLabel, ISingleFolderWorkspaceIdentifier, isSingleFolderWorkspaceIdentifier } from 'vs/platform/workspaces/common/workspaces';
import { FileKind } from 'vs/platform/files/common/files';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IExtensionService } from 'vs/platform/extensions/common/extensions';

// --- actions

export class CloseEditorAction extends Action {

	public static ID = 'workbench.action.closeActiveEditor';
	public static LABEL = nls.localize('closeActiveEditor', "Close Editor");

	constructor(
		id: string,
		label: string,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService
	) {
		super(id, label);
	}

	public run(): TPromise<void> {
		const activeEditor = this.editorService.getActiveEditor();
		if (activeEditor) {
			return this.editorService.closeEditor(activeEditor.position, activeEditor.input);
		}

		return TPromise.as(null);
	}
}

export class CloseCurrentWindowAction extends Action {

	public static ID = 'workbench.action.closeWindow';
	public static LABEL = nls.localize('closeWindow', "Close Window");

	constructor(id: string, label: string, @IWindowService private windowService: IWindowService) {
		super(id, label);
	}

	public run(): TPromise<boolean> {
		this.windowService.closeWindow();

		return TPromise.as(true);
	}
}

export class CloseWorkspaceAction extends Action {

	static ID = 'workbench.action.closeFolder';
	static LABEL = nls.localize('closeWorkspace', "Close Workspace");

	constructor(
		id: string,
		label: string,
		@IWorkspaceContextService private contextService: IWorkspaceContextService,
		@IMessageService private messageService: IMessageService,
		@IWindowService private windowService: IWindowService
	) {
		super(id, label);
	}

	run(): TPromise<void> {
		if (!this.contextService.hasWorkspace()) {
			this.messageService.show(Severity.Info, nls.localize('noWorkspaceOpened', "There is currently no workspace opened in this instance to close."));

			return TPromise.as(null);
		}

		return this.windowService.closeWorkspace();
	}
}

export class NewWindowAction extends Action {

	static ID = 'workbench.action.newWindow';
	static LABEL = nls.localize('newWindow', "New Window");

	constructor(
		id: string,
		label: string,
		@IWindowsService private windowsService: IWindowsService
	) {
		super(id, label);
	}

	run(): TPromise<void> {
		return this.windowsService.openNewWindow();
	}
}

export class ToggleFullScreenAction extends Action {

	static ID = 'workbench.action.toggleFullScreen';
	static LABEL = nls.localize('toggleFullScreen', "Toggle Full Screen");

	constructor(id: string, label: string, @IWindowService private windowService: IWindowService) {
		super(id, label);
	}

	run(): TPromise<void> {
		return this.windowService.toggleFullScreen();
	}
}

export class ToggleMenuBarAction extends Action {

	static ID = 'workbench.action.toggleMenuBar';
	static LABEL = nls.localize('toggleMenuBar', "Toggle Menu Bar");

	private static menuBarVisibilityKey = 'window.menuBarVisibility';

	constructor(
		id: string,
		label: string,
		@IMessageService private messageService: IMessageService,
		@IConfigurationService private configurationService: IConfigurationService,
		@IConfigurationEditingService private configurationEditingService: IConfigurationEditingService
	) {
		super(id, label);
	}

	public run(): TPromise<void> {
		let currentVisibilityValue = this.configurationService.lookup<MenuBarVisibility>(ToggleMenuBarAction.menuBarVisibilityKey).value;
		if (typeof currentVisibilityValue !== 'string') {
			currentVisibilityValue = 'default';
		}

		let newVisibilityValue: string;
		if (currentVisibilityValue === 'visible' || currentVisibilityValue === 'default') {
			newVisibilityValue = 'toggle';
		} else {
			newVisibilityValue = 'default';
		}

		this.configurationEditingService.writeConfiguration(ConfigurationTarget.USER, { key: ToggleMenuBarAction.menuBarVisibilityKey, value: newVisibilityValue });

		return TPromise.as(null);
	}
}

export class ToggleDevToolsAction extends Action {

	static ID = 'workbench.action.toggleDevTools';
	static LABEL = nls.localize('toggleDevTools', "Toggle Developer Tools");

	constructor(id: string, label: string, @IWindowService private windowsService: IWindowService) {
		super(id, label);
	}

	public run(): TPromise<void> {
		return this.windowsService.toggleDevTools();
	}
}

export abstract class BaseZoomAction extends Action {
	private static SETTING_KEY = 'window.zoomLevel';

	constructor(
		id: string,
		label: string,
		@IWorkspaceConfigurationService private configurationService: IWorkspaceConfigurationService,
		@IConfigurationEditingService private configurationEditingService: IConfigurationEditingService
	) {
		super(id, label);
	}

	protected setConfiguredZoomLevel(level: number): void {
		let target = ConfigurationTarget.USER;
		if (typeof this.configurationService.lookup(BaseZoomAction.SETTING_KEY).workspace === 'number') {
			target = ConfigurationTarget.WORKSPACE;
		}

		level = Math.round(level); // when reaching smallest zoom, prevent fractional zoom levels

		const applyZoom = () => {
			webFrame.setZoomLevel(level);
			browser.setZoomFactor(webFrame.getZoomFactor());
			// See https://github.com/Microsoft/vscode/issues/26151
			// Cannot be trusted because the webFrame might take some time
			// until it really applies the new zoom level
			browser.setZoomLevel(webFrame.getZoomLevel(), /*isTrusted*/false);
		};

		this.configurationEditingService.writeConfiguration(target, { key: BaseZoomAction.SETTING_KEY, value: level }, { donotNotifyError: true }).done(() => applyZoom(), error => applyZoom());
	}
}

export class ZoomInAction extends BaseZoomAction {

	public static ID = 'workbench.action.zoomIn';
	public static LABEL = nls.localize('zoomIn', "Zoom In");

	constructor(
		id: string,
		label: string,
		@IWorkspaceConfigurationService configurationService: IWorkspaceConfigurationService,
		@IConfigurationEditingService configurationEditingService: IConfigurationEditingService
	) {
		super(id, label, configurationService, configurationEditingService);
	}

	public run(): TPromise<boolean> {
		this.setConfiguredZoomLevel(webFrame.getZoomLevel() + 1);

		return TPromise.as(true);
	}
}

export class ZoomOutAction extends BaseZoomAction {

	public static ID = 'workbench.action.zoomOut';
	public static LABEL = nls.localize('zoomOut', "Zoom Out");

	constructor(
		id: string,
		label: string,
		@IWorkspaceConfigurationService configurationService: IWorkspaceConfigurationService,
		@IConfigurationEditingService configurationEditingService: IConfigurationEditingService
	) {
		super(id, label, configurationService, configurationEditingService);
	}

	public run(): TPromise<boolean> {
		this.setConfiguredZoomLevel(webFrame.getZoomLevel() - 1);

		return TPromise.as(true);
	}
}

export class ZoomResetAction extends BaseZoomAction {

	public static ID = 'workbench.action.zoomReset';
	public static LABEL = nls.localize('zoomReset', "Reset Zoom");

	constructor(
		id: string,
		label: string,
		@IWorkspaceConfigurationService configurationService: IWorkspaceConfigurationService,
		@IConfigurationEditingService configurationEditingService: IConfigurationEditingService
	) {
		super(id, label, configurationService, configurationEditingService);
	}

	public run(): TPromise<boolean> {
		this.setConfiguredZoomLevel(0);

		return TPromise.as(true);
	}
}

/* Copied from loader.ts */
enum LoaderEventType {
	LoaderAvailable = 1,

	BeginLoadingScript = 10,
	EndLoadingScriptOK = 11,
	EndLoadingScriptError = 12,

	BeginInvokeFactory = 21,
	EndInvokeFactory = 22,

	NodeBeginEvaluatingScript = 31,
	NodeEndEvaluatingScript = 32,

	NodeBeginNativeRequire = 33,
	NodeEndNativeRequire = 34
}

interface ILoaderEvent {
	type: LoaderEventType;
	timestamp: number;
	detail: string;
}

export class ShowStartupPerformance extends Action {

	public static ID = 'workbench.action.appPerf';
	public static LABEL = nls.localize('appPerf', "Startup Performance");

	constructor(
		id: string,
		label: string,
		@IWindowService private windowService: IWindowService,
		@ITimerService private timerService: ITimerService,
		@IEnvironmentService private environmentService: IEnvironmentService,
		@IExtensionService private extensionService: IExtensionService
	) {
		super(id, label);
	}

	public run(): TPromise<boolean> {

		// Show dev tools
		this.windowService.openDevTools();

		// Print to console
		setTimeout(() => {
			(<any>console).group('Startup Performance Measurement');
			const metrics: IStartupMetrics = this.timerService.startupMetrics;
			console.log(`OS: ${metrics.platform} (${metrics.release})`);
			console.log(`CPUs: ${metrics.cpus.model} (${metrics.cpus.count} x ${metrics.cpus.speed})`);
			console.log(`Memory (System): ${(metrics.totalmem / (1024 * 1024 * 1024)).toFixed(2)}GB (${(metrics.freemem / (1024 * 1024 * 1024)).toFixed(2)}GB free)`);
			console.log(`Memory (Process): ${(metrics.meminfo.workingSetSize / 1024).toFixed(2)}MB working set (${(metrics.meminfo.peakWorkingSetSize / 1024).toFixed(2)}MB peak, ${(metrics.meminfo.privateBytes / 1024).toFixed(2)}MB private, ${(metrics.meminfo.sharedBytes / 1024).toFixed(2)}MB shared)`);
			console.log(`VM (likelyhood): ${metrics.isVMLikelyhood}%`);
			console.log(`Initial Startup: ${metrics.initialStartup}`);
			console.log(`Screen Reader Active: ${metrics.hasAccessibilitySupport}`);
			console.log(`Empty Workspace: ${metrics.emptyWorkbench}`);

			let nodeModuleLoadTime: number;
			let nodeModuleLoadDetails: any[];
			if (this.environmentService.performance) {
				const nodeModuleTimes = this.analyzeNodeModulesLoadTimes();
				nodeModuleLoadTime = nodeModuleTimes.duration;
				nodeModuleLoadDetails = nodeModuleTimes.table;
			}

			(<any>console).table(this.getStartupMetricsTable(nodeModuleLoadTime));

			if (this.environmentService.performance) {
				const data = this.analyzeLoaderStats();
				for (let type in data) {
					(<any>console).groupCollapsed(`Loader: ${type}`);
					(<any>console).table(data[type]);
					(<any>console).groupEnd();
				}
			}

			(<any>console).groupEnd();

			(<any>console).group('Extension Activation Stats');
			(<any>console).table(this.extensionService.getExtensionsActivationTimes());
			(<any>console).groupEnd();
		}, 1000);

		return TPromise.as(true);
	}

	private getStartupMetricsTable(nodeModuleLoadTime?: number): any[] {
		const table: any[] = [];
		const metrics: IStartupMetrics = this.timerService.startupMetrics;

		if (metrics.initialStartup) {
			table.push({ Topic: '[main] start => app.isReady', 'Took (ms)': metrics.timers.ellapsedAppReady });
			table.push({ Topic: '[main] app.isReady => window.loadUrl()', 'Took (ms)': metrics.timers.ellapsedWindowLoad });
		}

		table.push({ Topic: '[renderer] window.loadUrl() => begin to require(workbench.main.js)', 'Took (ms)': metrics.timers.ellapsedWindowLoadToRequire });
		table.push({ Topic: '[renderer] require(workbench.main.js)', 'Took (ms)': metrics.timers.ellapsedRequire });

		if (nodeModuleLoadTime) {
			table.push({ Topic: '[renderer] -> of which require() node_modules', 'Took (ms)': nodeModuleLoadTime });
		}

		table.push({ Topic: '[renderer] create extension host => extensions onReady()', 'Took (ms)': metrics.timers.ellapsedExtensions });
		table.push({ Topic: '[renderer] restore viewlet', 'Took (ms)': metrics.timers.ellapsedViewletRestore });
		table.push({ Topic: '[renderer] restore editor view state', 'Took (ms)': metrics.timers.ellapsedEditorRestore });
		table.push({ Topic: '[renderer] overall workbench load', 'Took (ms)': metrics.timers.ellapsedWorkbench });
		table.push({ Topic: '------------------------------------------------------' });
		table.push({ Topic: '[main, renderer] start => extensions ready', 'Took (ms)': metrics.timers.ellapsedExtensionsReady });
		table.push({ Topic: '[main, renderer] start => workbench ready', 'Took (ms)': metrics.ellapsed });

		return table;
	}

	private analyzeNodeModulesLoadTimes(): { table: any[], duration: number } {
		const stats = <ILoaderEvent[]>(<any>require).getStats();
		const result = [];

		let total = 0;

		for (let i = 0, len = stats.length; i < len; i++) {
			if (stats[i].type === LoaderEventType.NodeEndNativeRequire) {
				if (stats[i - 1].type === LoaderEventType.NodeBeginNativeRequire && stats[i - 1].detail === stats[i].detail) {
					const entry: any = {};
					const dur = (stats[i].timestamp - stats[i - 1].timestamp);
					entry['Event'] = 'nodeRequire ' + stats[i].detail;
					entry['Took (ms)'] = dur.toFixed(2);
					total += dur;
					entry['Start (ms)'] = '**' + stats[i - 1].timestamp.toFixed(2);
					entry['End (ms)'] = '**' + stats[i - 1].timestamp.toFixed(2);
					result.push(entry);
				}
			}
		}

		if (total > 0) {
			result.push({ Event: '------------------------------------------------------' });

			const entry: any = {};
			entry['Event'] = '[renderer] total require() node_modules';
			entry['Took (ms)'] = total.toFixed(2);
			entry['Start (ms)'] = '**';
			entry['End (ms)'] = '**';
			result.push(entry);
		}

		return { table: result, duration: Math.round(total) };
	}

	private analyzeLoaderStats(): { [type: string]: any[] } {
		const stats = <ILoaderEvent[]>(<any>require).getStats().slice(0).sort((a, b) => {
			if (a.detail < b.detail) {
				return -1;
			} else if (a.detail > b.detail) {
				return 1;
			} else if (a.type < b.type) {
				return -1;
			} else if (a.type > b.type) {
				return 1;
			} else {
				return 0;
			}
		});

		class Tick {

			public readonly duration: number;
			public readonly detail: string;

			constructor(public readonly start: ILoaderEvent, public readonly end: ILoaderEvent) {
				console.assert(start.detail === end.detail);

				this.duration = this.end.timestamp - this.start.timestamp;
				this.detail = start.detail;
			}

			toTableObject() {
				return {
					['Path']: this.start.detail,
					['Took (ms)']: this.duration.toFixed(2),
					// ['Start (ms)']: this.start.timestamp,
					// ['End (ms)']: this.end.timestamp
				};
			}

			static compareUsingStartTimestamp(a: Tick, b: Tick): number {
				if (a.start.timestamp < b.start.timestamp) {
					return -1;
				} else if (a.start.timestamp > b.start.timestamp) {
					return 1;
				} else {
					return 0;
				}
			}
		}

		const ticks: { [type: number]: Tick[] } = {
			[LoaderEventType.BeginLoadingScript]: [],
			[LoaderEventType.BeginInvokeFactory]: [],
			[LoaderEventType.NodeBeginEvaluatingScript]: [],
			[LoaderEventType.NodeBeginNativeRequire]: [],
		};

		for (let i = 1; i < stats.length - 1; i++) {
			const stat = stats[i];
			const nextStat = stats[i + 1];

			if (nextStat.type - stat.type > 2) {
				//bad?!
				break;
			}

			i += 1;
			ticks[stat.type].push(new Tick(stat, nextStat));
		}

		ticks[LoaderEventType.BeginInvokeFactory].sort(Tick.compareUsingStartTimestamp);
		ticks[LoaderEventType.BeginInvokeFactory].sort(Tick.compareUsingStartTimestamp);
		ticks[LoaderEventType.NodeBeginEvaluatingScript].sort(Tick.compareUsingStartTimestamp);
		ticks[LoaderEventType.NodeBeginNativeRequire].sort(Tick.compareUsingStartTimestamp);

		const ret = {
			'Load Script': ticks[LoaderEventType.BeginLoadingScript].map(t => t.toTableObject()),
			'(Node) Load Script': ticks[LoaderEventType.NodeBeginNativeRequire].map(t => t.toTableObject()),
			'Eval Script': ticks[LoaderEventType.BeginInvokeFactory].map(t => t.toTableObject()),
			'(Node) Eval Script': ticks[LoaderEventType.NodeBeginEvaluatingScript].map(t => t.toTableObject()),
		};

		function total(ticks: Tick[]): number {
			let sum = 0;
			for (const tick of ticks) {
				sum += tick.duration;
			}
			return sum;
		}

		// totals
		ret['Load Script'].push({
			['Path']: 'TOTAL TIME',
			['Took (ms)']: total(ticks[LoaderEventType.BeginLoadingScript]).toFixed(2)
		});
		ret['Eval Script'].push({
			['Path']: 'TOTAL TIME',
			['Took (ms)']: total(ticks[LoaderEventType.BeginInvokeFactory]).toFixed(2)
		});
		ret['(Node) Load Script'].push({
			['Path']: 'TOTAL TIME',
			['Took (ms)']: total(ticks[LoaderEventType.NodeBeginNativeRequire]).toFixed(2)
		});
		ret['(Node) Eval Script'].push({
			['Path']: 'TOTAL TIME',
			['Took (ms)']: total(ticks[LoaderEventType.NodeBeginEvaluatingScript]).toFixed(2)
		});

		return ret;
	}
}

export class ReloadWindowAction extends Action {

	static ID = 'workbench.action.reloadWindow';
	static LABEL = nls.localize('reloadWindow', "Reload Window");

	constructor(
		id: string,
		label: string,
		@IWindowService private windowService: IWindowService
	) {
		super(id, label);
	}

	run(): TPromise<boolean> {
		return this.windowService.reloadWindow().then(() => true);
	}
}

export abstract class BaseSwitchWindow extends Action {
	private closeWindowAction: CloseWindowAction;

	constructor(
		id: string,
		label: string,
		private windowsService: IWindowsService,
		private windowService: IWindowService,
		private quickOpenService: IQuickOpenService,
		private keybindingService: IKeybindingService,
		private instantiationService: IInstantiationService
	) {
		super(id, label);

		this.closeWindowAction = this.instantiationService.createInstance(CloseWindowAction);
	}

	protected abstract isQuickNavigate(): boolean;

	public run(): TPromise<void> {
		const currentWindowId = this.windowService.getCurrentWindowId();

		return this.windowsService.getWindows().then(windows => {
			const placeHolder = nls.localize('switchWindowPlaceHolder', "Select a window to switch to");
			const picks = windows.map(win => ({
				payload: win.id,
				resource: win.filename ? URI.file(win.filename) : win.folderPath ? URI.file(win.folderPath) : win.workspace ? URI.file(win.workspace.configPath) : void 0,
				fileKind: win.filename ? FileKind.FILE : win.workspace ? FileKind.ROOT_FOLDER : win.folderPath ? FileKind.FOLDER : FileKind.FILE,
				label: win.title,
				description: (currentWindowId === win.id) ? nls.localize('current', "Current Window") : void 0,
				run: () => {
					setTimeout(() => {
						// Bug: somehow when not running this code in a timeout, it is not possible to use this picker
						// with quick navigate keys (not able to trigger quick navigate once running it once).
						this.windowsService.showWindow(win.id).done(null, errors.onUnexpectedError);
					});
				},
				action: (!this.isQuickNavigate() && currentWindowId !== win.id) ? this.closeWindowAction : void 0
			} as IFilePickOpenEntry));

			this.quickOpenService.pick(picks, {
				contextKey: 'inWindowsPicker',
				autoFocus: { autoFocusFirstEntry: true },
				placeHolder,
				quickNavigateConfiguration: this.isQuickNavigate() ? { keybindings: this.keybindingService.lookupKeybindings(this.id) } : void 0
			});
		});
	}

	public dispose(): void {
		super.dispose();

		this.closeWindowAction.dispose();
	}
}

class CloseWindowAction extends Action implements IPickOpenAction {

	public static ID = 'workbench.action.closeWindow';
	public static LABEL = nls.localize('close', "Close Window");

	constructor(
		@IWindowsService private windowsService: IWindowsService
	) {
		super(CloseWindowAction.ID, CloseWindowAction.LABEL);

		this.class = 'action-remove-from-recently-opened';
	}

	public run(item: IPickOpenItem): TPromise<boolean> {
		return this.windowsService.closeWindow(item.getPayload()).then(() => {
			item.remove();

			return true;
		});
	}
}

export class SwitchWindow extends BaseSwitchWindow {

	static ID = 'workbench.action.switchWindow';
	static LABEL = nls.localize('switchWindow', "Switch Window...");

	constructor(
		id: string,
		label: string,
		@IWindowsService windowsService: IWindowsService,
		@IWindowService windowService: IWindowService,
		@IQuickOpenService quickOpenService: IQuickOpenService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IInstantiationService instantiationService: IInstantiationService
	) {
		super(id, label, windowsService, windowService, quickOpenService, keybindingService, instantiationService);
	}

	protected isQuickNavigate(): boolean {
		return false;
	}
}

export class QuickSwitchWindow extends BaseSwitchWindow {

	static ID = 'workbench.action.quickSwitchWindow';
	static LABEL = nls.localize('quickSwitchWindow', "Quick Switch Window...");

	constructor(
		id: string,
		label: string,
		@IWindowsService windowsService: IWindowsService,
		@IWindowService windowService: IWindowService,
		@IQuickOpenService quickOpenService: IQuickOpenService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IInstantiationService instantiationService: IInstantiationService
	) {
		super(id, label, windowsService, windowService, quickOpenService, keybindingService, instantiationService);
	}

	protected isQuickNavigate(): boolean {
		return true;
	}
}

export const inRecentFilesPickerContextKey = 'inRecentFilesPicker';

export abstract class BaseOpenRecentAction extends Action {
	private removeAction: RemoveFromRecentlyOpened;

	constructor(
		id: string,
		label: string,
		private windowsService: IWindowsService,
		private windowService: IWindowService,
		private quickOpenService: IQuickOpenService,
		private contextService: IWorkspaceContextService,
		private environmentService: IEnvironmentService,
		private keybindingService: IKeybindingService,
		instantiationService: IInstantiationService
	) {
		super(id, label);

		this.removeAction = instantiationService.createInstance(RemoveFromRecentlyOpened);
	}

	protected abstract isQuickNavigate(): boolean;

	public run(): TPromise<void> {
		return this.windowService.getRecentlyOpened()
			.then(({ workspaces, files }) => this.openRecent(workspaces, files));
	}

	private openRecent(recentWorkspaces: (IWorkspaceIdentifier | ISingleFolderWorkspaceIdentifier)[], recentFiles: string[]): void {

		function toPick(workspace: IWorkspaceIdentifier | ISingleFolderWorkspaceIdentifier, separator: ISeparator, fileKind: FileKind, environmentService: IEnvironmentService, removeAction?: RemoveFromRecentlyOpened): IFilePickOpenEntry {
			let path: string;
			let label: string;
			let description: string;
			if (isSingleFolderWorkspaceIdentifier(workspace)) {
				path = workspace;
				label = paths.basename(path);
				description = getPathLabel(paths.dirname(path), null, environmentService);
			} else {
				path = workspace.configPath;
				label = getWorkspaceLabel(workspace, environmentService);
				description = getPathLabel(paths.dirname(workspace.configPath), null, environmentService);
			}

			return {
				resource: URI.file(path),
				fileKind,
				label,
				description,
				separator,
				run: context => {
					setTimeout(() => {
						// Bug: somehow when not running this code in a timeout, it is not possible to use this picker
						// with quick navigate keys (not able to trigger quick navigate once running it once).
						runPick(path, fileKind === FileKind.FILE, context);
					});
				},
				action: removeAction
			};
		}

		const runPick = (path: string, isFile: boolean, context: IEntryRunContext) => {
			const forceNewWindow = context.keymods.indexOf(KeyMod.CtrlCmd) >= 0;
			this.windowsService.openWindow([path], { forceNewWindow, forceOpenWorkspaceAsFile: isFile });
		};

		const workspacePicks: IFilePickOpenEntry[] = recentWorkspaces.map((workspace, index) => toPick(workspace, index === 0 ? { label: nls.localize('workspaces', "workspaces") } : void 0, isSingleFolderWorkspaceIdentifier(workspace) ? FileKind.FOLDER : FileKind.ROOT_FOLDER, this.environmentService, !this.isQuickNavigate() ? this.removeAction : void 0));
		const filePicks: IFilePickOpenEntry[] = recentFiles.map((p, index) => toPick(p, index === 0 ? { label: nls.localize('files', "files"), border: true } : void 0, FileKind.FILE, this.environmentService, !this.isQuickNavigate() ? this.removeAction : void 0));

		let isCurrentWorkspaceInList: boolean;
		if (!this.contextService.hasWorkspace()) {
			isCurrentWorkspaceInList = false; // we never show empty workspaces
		} else if (this.contextService.hasFolderWorkspace()) {
			isCurrentWorkspaceInList = true; // we always show folder workspaces
		} else {
			const firstWorkspace = recentWorkspaces[0];
			if (firstWorkspace && !isSingleFolderWorkspaceIdentifier(firstWorkspace)) {
				isCurrentWorkspaceInList = firstWorkspace.id === this.contextService.getWorkspace().id;
			} else {
				isCurrentWorkspaceInList = false; // this is an untitled workspace thereby
			}
		}

		this.quickOpenService.pick([...workspacePicks, ...filePicks], {
			contextKey: inRecentFilesPickerContextKey,
			autoFocus: { autoFocusFirstEntry: !isCurrentWorkspaceInList, autoFocusSecondEntry: isCurrentWorkspaceInList },
			placeHolder: isMacintosh ? nls.localize('openRecentPlaceHolderMac', "Select to open (hold Cmd-key to open in new window)") : nls.localize('openRecentPlaceHolder', "Select to open (hold Ctrl-key to open in new window)"),
			matchOnDescription: true,
			quickNavigateConfiguration: this.isQuickNavigate() ? { keybindings: this.keybindingService.lookupKeybindings(this.id) } : void 0
		}).done(null, errors.onUnexpectedError);
	}

	public dispose(): void {
		super.dispose();

		this.removeAction.dispose();
	}
}

class RemoveFromRecentlyOpened extends Action implements IPickOpenAction {

	public static ID = 'workbench.action.removeFromRecentlyOpened';
	public static LABEL = nls.localize('remove', "Remove from Recently Opened");

	constructor(
		@IWindowsService private windowsService: IWindowsService
	) {
		super(RemoveFromRecentlyOpened.ID, RemoveFromRecentlyOpened.LABEL);

		this.class = 'action-remove-from-recently-opened';
	}

	public run(item: IPickOpenItem): TPromise<boolean> {
		return this.windowsService.removeFromRecentlyOpened([item.getResource().fsPath]).then(() => {
			item.remove();

			return true;
		});
	}
}

export class OpenRecentAction extends BaseOpenRecentAction {

	public static ID = 'workbench.action.openRecent';
	public static LABEL = nls.localize('openRecent', "Open Recent...");

	constructor(
		id: string,
		label: string,
		@IWindowsService windowsService: IWindowsService,
		@IWindowService windowService: IWindowService,
		@IQuickOpenService quickOpenService: IQuickOpenService,
		@IWorkspaceContextService contextService: IWorkspaceContextService,
		@IEnvironmentService environmentService: IEnvironmentService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IInstantiationService instantiationService: IInstantiationService
	) {
		super(id, label, windowsService, windowService, quickOpenService, contextService, environmentService, keybindingService, instantiationService);
	}

	protected isQuickNavigate(): boolean {
		return false;
	}
}

export class QuickOpenRecentAction extends BaseOpenRecentAction {

	public static ID = 'workbench.action.quickOpenRecent';
	public static LABEL = nls.localize('quickOpenRecent', "Quick Open Recent...");

	constructor(
		id: string,
		label: string,
		@IWindowsService windowsService: IWindowsService,
		@IWindowService windowService: IWindowService,
		@IQuickOpenService quickOpenService: IQuickOpenService,
		@IWorkspaceContextService contextService: IWorkspaceContextService,
		@IEnvironmentService environmentService: IEnvironmentService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IInstantiationService instantiationService: IInstantiationService
	) {
		super(id, label, windowsService, windowService, quickOpenService, contextService, environmentService, keybindingService, instantiationService);
	}

	protected isQuickNavigate(): boolean {
		return true;
	}
}

export class CloseMessagesAction extends Action {

	public static ID = 'workbench.action.closeMessages';
	public static LABEL = nls.localize('closeMessages', "Close Notification Messages");

	constructor(
		id: string,
		label: string,
		@IMessageService private messageService: IMessageService,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService
	) {
		super(id, label);
	}

	public run(): TPromise<boolean> {

		// Close any Message if visible
		this.messageService.hideAll();

		// Restore focus if we got an editor
		const editor = this.editorService.getActiveEditor();
		if (editor) {
			editor.focus();
		}

		return TPromise.as(true);
	}
}

export class ReportIssueAction extends Action {

	public static ID = 'workbench.action.reportIssues';
	public static LABEL = nls.localize('reportIssues', "Report Issues");

	constructor(
		id: string,
		label: string,
		@IIntegrityService private integrityService: IIntegrityService,
		@IExtensionManagementService private extensionManagementService: IExtensionManagementService,
		@IEnvironmentService private environmentService: IEnvironmentService
	) {
		super(id, label);
	}

	private _optimisticIsPure(): TPromise<boolean> {
		let isPure = true;
		let integrityPromise = this.integrityService.isPure().then(res => {
			isPure = res.isPure;
		});

		return TPromise.any([TPromise.timeout(100), integrityPromise]).then(() => {
			return isPure;
		});
	}

	public run(): TPromise<boolean> {
		return this._optimisticIsPure().then(isPure => {
			return this.extensionManagementService.getInstalled(LocalExtensionType.User).then(extensions => {
				const issueUrl = this.generateNewIssueUrl(product.reportIssueUrl, pkg.name, pkg.version, product.commit, product.date, isPure, extensions, this.environmentService.disableExtensions);

				window.open(issueUrl);

				return TPromise.as(true);
			});
		});
	}

	private generateNewIssueUrl(baseUrl: string, name: string, version: string, commit: string, date: string, isPure: boolean, extensions: ILocalExtension[], areExtensionsDisabled: boolean): string {
		// Avoid backticks, these can trigger XSS detectors. (https://github.com/Microsoft/vscode/issues/13098)
		const osVersion = `${os.type()} ${os.arch()} ${os.release()}`;
		const queryStringPrefix = baseUrl.indexOf('?') === -1 ? '?' : '&';
		const body = encodeURIComponent(
			`- VSCode Version: ${name} ${version}${isPure ? '' : ' **[Unsupported]**'} (${product.commit || 'Commit unknown'}, ${product.date || 'Date unknown'})
- OS Version: ${osVersion}
- Extensions: ${areExtensionsDisabled ? 'Extensions are disabled' : this.generateExtensionTable(extensions)}
---

Steps to Reproduce:

1.
2.` + (extensions.length ? `

<!-- Launch with \`code --disable-extensions\` to check. -->
Reproduces without extensions: Yes/No` : '')
		);

		return `${baseUrl}${queryStringPrefix}body=${body}`;
	}

	private generateExtensionTable(extensions: ILocalExtension[]): string {
		const { nonThemes, themes } = collections.groupBy(extensions, ext => {
			const manifestKeys = ext.manifest.contributes ? Object.keys(ext.manifest.contributes) : [];
			const onlyTheme = !ext.manifest.activationEvents && manifestKeys.length === 1 && manifestKeys[0] === 'themes';
			return onlyTheme ? 'themes' : 'nonThemes';
		});

		const themeExclusionStr = (themes && themes.length) ? `\n(${themes.length} theme extensions excluded)` : '';
		extensions = nonThemes || [];

		if (!extensions.length) {
			return 'none' + themeExclusionStr;
		}

		let tableHeader = `Extension|Author (truncated)|Version
---|---|---`;
		const table = extensions.map(e => {
			return `${e.manifest.name}|${e.manifest.publisher.substr(0, 3)}|${e.manifest.version}`;
		}).join('\n');

		const extensionTable = `

${tableHeader}
${table}
${themeExclusionStr}

`;

		// 2000 chars is browsers de-facto limit for URLs, 400 chars are allowed for other string parts of the issue URL
		// http://stackoverflow.com/questions/417142/what-is-the-maximum-length-of-a-url-in-different-browsers
		if (encodeURIComponent(extensionTable).length > 1600) {
			return 'the listing length exceeds browsers\' URL characters limit';
		}

		return extensionTable;
	}
}

export class ReportPerformanceIssueAction extends Action {

	public static ID = 'workbench.action.reportPerformanceIssue';
	public static LABEL = nls.localize('reportPerformanceIssue', "Report Performance Issue");

	constructor(
		id: string,
		label: string,
		@IIntegrityService private integrityService: IIntegrityService,
		@IEnvironmentService private environmentService: IEnvironmentService,
		@ITimerService private timerService: ITimerService
	) {
		super(id, label);
	}

	public run(appendix?: string): TPromise<boolean> {
		return this.integrityService.isPure().then(res => {
			const issueUrl = this.generatePerformanceIssueUrl(product.reportIssueUrl, pkg.name, pkg.version, product.commit, product.date, res.isPure, appendix);

			window.open(issueUrl);

			return TPromise.as(true);
		});
	}

	private generatePerformanceIssueUrl(baseUrl: string, name: string, version: string, commit: string, date: string, isPure: boolean, appendix?: string): string {

		if (!appendix) {
			appendix = `Additional Steps to Reproduce (if any):

1.
2.`;
		}

		let nodeModuleLoadTime: number;
		if (this.environmentService.performance) {
			nodeModuleLoadTime = this.computeNodeModulesLoadTime();
		}

		const metrics: IStartupMetrics = this.timerService.startupMetrics;

		const osVersion = `${os.type()} ${os.arch()} ${os.release()}`;
		const queryStringPrefix = baseUrl.indexOf('?') === -1 ? '?' : '&';
		const body = encodeURIComponent(
			`- VSCode Version: <code>${name} ${version}${isPure ? '' : ' **[Unsupported]**'} (${product.commit || 'Commit unknown'}, ${product.date || 'Date unknown'})</code>
- OS Version: <code>${osVersion}</code>
- CPUs: <code>${metrics.cpus.model} (${metrics.cpus.count} x ${metrics.cpus.speed})</code>
- Memory (System): <code>${(metrics.totalmem / (1024 * 1024 * 1024)).toFixed(2)}GB (${(metrics.freemem / (1024 * 1024 * 1024)).toFixed(2)}GB free)</code>
- Memory (Process): <code>${(metrics.meminfo.workingSetSize / 1024).toFixed(2)}MB working set (${(metrics.meminfo.peakWorkingSetSize / 1024).toFixed(2)}MB peak, ${(metrics.meminfo.privateBytes / 1024).toFixed(2)}MB private, ${(metrics.meminfo.sharedBytes / 1024).toFixed(2)}MB shared)</code>
- Load (avg): <code>${metrics.loadavg.map(l => Math.round(l)).join(', ')}</code>
- VM: <code>${metrics.isVMLikelyhood}%</code>
- Initial Startup: <code>${metrics.initialStartup ? 'yes' : 'no'}</code>
- Screen Reader: <code>${metrics.hasAccessibilitySupport ? 'yes' : 'no'}</code>
- Empty Workspace: <code>${metrics.emptyWorkbench ? 'yes' : 'no'}</code>
- Timings:

${this.generatePerformanceTable(nodeModuleLoadTime)}

---

${appendix}`
		);

		return `${baseUrl}${queryStringPrefix}body=${body}`;
	}

	private computeNodeModulesLoadTime(): number {
		const stats = <ILoaderEvent[]>(<any>require).getStats();
		let total = 0;

		for (let i = 0, len = stats.length; i < len; i++) {
			if (stats[i].type === LoaderEventType.NodeEndNativeRequire) {
				if (stats[i - 1].type === LoaderEventType.NodeBeginNativeRequire && stats[i - 1].detail === stats[i].detail) {
					const dur = (stats[i].timestamp - stats[i - 1].timestamp);
					total += dur;
				}
			}
		}

		return Math.round(total);
	}

	private generatePerformanceTable(nodeModuleLoadTime?: number): string {
		let tableHeader = `|Component|Task|Time (ms)|
|---|---|---|`;

		const table = this.getStartupMetricsTable(nodeModuleLoadTime).map(e => {
			return `|${e.component}|${e.task}|${e.time}|`;
		}).join('\n');

		return `${tableHeader}\n${table}`;
	}

	private getStartupMetricsTable(nodeModuleLoadTime?: number): { component: string, task: string; time: number; }[] {
		const table: any[] = [];
		const metrics: IStartupMetrics = this.timerService.startupMetrics;

		if (metrics.initialStartup) {
			table.push({ component: 'main', task: 'start => app.isReady', time: metrics.timers.ellapsedAppReady });
			table.push({ component: 'main', task: 'app.isReady => window.loadUrl()', time: metrics.timers.ellapsedWindowLoad });
		}

		table.push({ component: 'renderer', task: 'window.loadUrl() => begin to require(workbench.main.js)', time: metrics.timers.ellapsedWindowLoadToRequire });
		table.push({ component: 'renderer', task: 'require(workbench.main.js)', time: metrics.timers.ellapsedRequire });

		if (nodeModuleLoadTime) {
			table.push({ component: 'renderer', task: '-> of which require() node_modules', time: nodeModuleLoadTime });
		}

		table.push({ component: 'renderer', task: 'create extension host => extensions onReady()', time: metrics.timers.ellapsedExtensions });
		table.push({ component: 'renderer', task: 'restore viewlet', time: metrics.timers.ellapsedViewletRestore });
		table.push({ component: 'renderer', task: 'restore editor view state', time: metrics.timers.ellapsedEditorRestore });
		table.push({ component: 'renderer', task: 'overall workbench load', time: metrics.timers.ellapsedWorkbench });
		table.push({ component: 'main + renderer', task: 'start => extensions ready', time: metrics.timers.ellapsedExtensionsReady });
		table.push({ component: 'main + renderer', task: 'start => workbench ready', time: metrics.ellapsed });

		return table;
	}
}

export class KeybindingsReferenceAction extends Action {

	public static ID = 'workbench.action.keybindingsReference';
	public static LABEL = nls.localize('keybindingsReference', "Keyboard Shortcuts Reference");

	private static URL = isLinux ? product.keyboardShortcutsUrlLinux : isMacintosh ? product.keyboardShortcutsUrlMac : product.keyboardShortcutsUrlWin;
	public static AVAILABLE = !!KeybindingsReferenceAction.URL;

	constructor(
		id: string,
		label: string
	) {
		super(id, label);
	}

	public run(): TPromise<void> {
		window.open(KeybindingsReferenceAction.URL);
		return null;
	}
}

export class OpenDocumentationUrlAction extends Action {

	public static ID = 'workbench.action.openDocumentationUrl';
	public static LABEL = nls.localize('openDocumentationUrl', "Documentation");

	private static URL = product.documentationUrl;
	public static AVAILABLE = !!OpenDocumentationUrlAction.URL;

	constructor(
		id: string,
		label: string
	) {
		super(id, label);
	}

	public run(): TPromise<void> {
		window.open(OpenDocumentationUrlAction.URL);
		return null;
	}
}

export class OpenIntroductoryVideosUrlAction extends Action {

	public static ID = 'workbench.action.openIntroductoryVideosUrl';
	public static LABEL = nls.localize('openIntroductoryVideosUrl', "Introductory Videos");

	private static URL = product.introductoryVideosUrl;
	public static AVAILABLE = !!OpenIntroductoryVideosUrlAction.URL;

	constructor(
		id: string,
		label: string
	) {
		super(id, label);
	}

	public run(): TPromise<void> {
		window.open(OpenIntroductoryVideosUrlAction.URL);
		return null;
	}
}

export class OpenTipsAndTricksUrlAction extends Action {

	public static ID = 'workbench.action.openTipsAndTricksUrl';
	public static LABEL = nls.localize('openTipsAndTricksUrl', "Tips and Tricks");

	private static URL = product.tipsAndTricksUrl;
	public static AVAILABLE = !!OpenTipsAndTricksUrlAction.URL;

	constructor(
		id: string,
		label: string
	) {
		super(id, label);
	}

	public run(): TPromise<void> {
		window.open(OpenTipsAndTricksUrlAction.URL);
		return null;
	}
}

export class ToggleSharedProcessAction extends Action {

	static ID = 'workbench.action.toggleSharedProcess';
	static LABEL = nls.localize('toggleSharedProcess', "Toggle Shared Process");

	constructor(id: string, label: string, @IWindowsService private windowsService: IWindowsService) {
		super(id, label);
	}

	run(): TPromise<void> {
		return this.windowsService.toggleSharedProcess();
	}
}

enum Direction {
	Next,
	Previous,
}

export abstract class BaseNavigationAction extends Action {

	constructor(
		id: string,
		label: string,
		@IEditorGroupService protected groupService: IEditorGroupService,
		@IPanelService protected panelService: IPanelService,
		@IPartService protected partService: IPartService,
		@IViewletService protected viewletService: IViewletService
	) {
		super(id, label);
	}

	public run(): TPromise<any> {
		const isEditorFocus = this.partService.hasFocus(Parts.EDITOR_PART);
		const isPanelFocus = this.partService.hasFocus(Parts.PANEL_PART);
		const isSidebarFocus = this.partService.hasFocus(Parts.SIDEBAR_PART);

		const isEditorGroupVertical = this.groupService.getGroupOrientation() === 'vertical';
		const isSidebarPositionLeft = this.partService.getSideBarPosition() === SidebarPosition.LEFT;

		if (isEditorFocus) {
			return this.navigateOnEditorFocus(isEditorGroupVertical, isSidebarPositionLeft);
		}

		if (isPanelFocus) {
			return this.navigateOnPanelFocus(isEditorGroupVertical, isSidebarPositionLeft);
		}

		if (isSidebarFocus) {
			return this.navigateOnSidebarFocus(isEditorGroupVertical, isSidebarPositionLeft);
		}

		return TPromise.as(false);
	}

	protected navigateOnEditorFocus(isEditorGroupVertical: boolean, isSidebarPositionLeft: boolean): TPromise<boolean | IViewlet | IPanel> {
		return TPromise.as(true);
	}

	protected navigateOnPanelFocus(isEditorGroupVertical: boolean, isSidebarPositionLeft: boolean): TPromise<boolean | IPanel> {
		return TPromise.as(true);
	}

	protected navigateOnSidebarFocus(isEditorGroupVertical: boolean, isSidebarPositionLeft: boolean): TPromise<boolean | IViewlet> {
		return TPromise.as(true);
	}

	protected navigateToPanel(): TPromise<IPanel | boolean> {
		if (!this.partService.isVisible(Parts.PANEL_PART)) {
			return TPromise.as(false);
		}

		const activePanelId = this.panelService.getActivePanel().getId();

		return this.panelService.openPanel(activePanelId, true);
	}

	protected navigateToSidebar(): TPromise<IViewlet | boolean> {
		if (!this.partService.isVisible(Parts.SIDEBAR_PART)) {
			return TPromise.as(false);
		}

		const activeViewletId = this.viewletService.getActiveViewlet().getId();

		return this.viewletService.openViewlet(activeViewletId, true);
	}

	protected navigateAcrossEditorGroup(direction): TPromise<boolean> {
		const model = this.groupService.getStacksModel();
		const currentPosition = model.positionOfGroup(model.activeGroup);
		const nextPosition = direction === Direction.Next ? currentPosition + 1 : currentPosition - 1;

		if (nextPosition < 0 || nextPosition > model.groups.length - 1) {
			return TPromise.as(false);
		}

		this.groupService.focusGroup(nextPosition);

		return TPromise.as(true);
	}

	protected navigateToLastActiveGroup(): TPromise<boolean> {
		const model = this.groupService.getStacksModel();
		const lastActiveGroup = model.activeGroup;
		this.groupService.focusGroup(lastActiveGroup);

		return TPromise.as(true);
	}

	protected navigateToFirstEditorGroup(): TPromise<boolean> {
		this.groupService.focusGroup(0);

		return TPromise.as(true);
	}

	protected navigateToLastEditorGroup(): TPromise<boolean> {
		const model = this.groupService.getStacksModel();
		const lastEditorGroupPosition = model.groups.length - 1;
		this.groupService.focusGroup(lastEditorGroupPosition);

		return TPromise.as(true);
	}
}

export class NavigateLeftAction extends BaseNavigationAction {

	public static ID = 'workbench.action.navigateLeft';
	public static LABEL = nls.localize('navigateLeft', "Navigate to the View on the Left");

	constructor(
		id: string,
		label: string,
		@IEditorGroupService groupService: IEditorGroupService,
		@IPanelService panelService: IPanelService,
		@IPartService partService: IPartService,
		@IViewletService viewletService: IViewletService
	) {
		super(id, label, groupService, panelService, partService, viewletService);
	}

	protected navigateOnEditorFocus(isEditorGroupVertical, isSidebarPositionLeft): TPromise<boolean | IViewlet> {
		if (!isEditorGroupVertical) {
			if (isSidebarPositionLeft) {
				return this.navigateToSidebar();
			}
			return TPromise.as(false);
		}
		return this.navigateAcrossEditorGroup(Direction.Previous)
			.then(didNavigate => {
				if (!didNavigate && isSidebarPositionLeft) {
					return this.navigateToSidebar();
				}
				return TPromise.as(true);
			});
	}

	protected navigateOnPanelFocus(isEditorGroupVertical, isSidebarPositionLeft): TPromise<boolean | IViewlet> {
		if (isSidebarPositionLeft) {
			return this.navigateToSidebar();
		}

		return TPromise.as(false);
	}

	protected navigateOnSidebarFocus(isEditorGroupVertical, isSidebarPositionLeft): TPromise<boolean> {
		if (isSidebarPositionLeft) {
			return TPromise.as(false);
		}

		if (isEditorGroupVertical) {
			return this.navigateToLastEditorGroup();
		}

		return this.navigateToLastActiveGroup();
	}
}

export class NavigateRightAction extends BaseNavigationAction {

	public static ID = 'workbench.action.navigateRight';
	public static LABEL = nls.localize('navigateRight', "Navigate to the View on the Right");

	constructor(
		id: string,
		label: string,
		@IEditorGroupService groupService: IEditorGroupService,
		@IPanelService panelService: IPanelService,
		@IPartService partService: IPartService,
		@IViewletService viewletService: IViewletService
	) {
		super(id, label, groupService, panelService, partService, viewletService);
	}

	protected navigateOnEditorFocus(isEditorGroupVertical, isSidebarPositionLeft): TPromise<boolean | IViewlet> {
		if (!isEditorGroupVertical) {
			if (!isSidebarPositionLeft) {
				return this.navigateToSidebar();
			}
			return TPromise.as(false);
		}

		return this.navigateAcrossEditorGroup(Direction.Next)
			.then(didNavigate => {
				if (!didNavigate && !isSidebarPositionLeft) {
					return this.navigateToSidebar();
				}
				return TPromise.as(true);
			});
	}

	protected navigateOnPanelFocus(isEditorGroupVertical, isSidebarPositionLeft): TPromise<boolean | IViewlet> {
		if (!isSidebarPositionLeft) {
			return this.navigateToSidebar();
		}

		return TPromise.as(false);
	}

	protected navigateOnSidebarFocus(isEditorGroupVertical, isSidebarPositionLeft): TPromise<boolean> {
		if (!isSidebarPositionLeft) {
			return TPromise.as(false);
		}

		if (isEditorGroupVertical) {
			return this.navigateToFirstEditorGroup();
		}

		return this.navigateToLastActiveGroup();
	}
}

export class NavigateUpAction extends BaseNavigationAction {

	public static ID = 'workbench.action.navigateUp';
	public static LABEL = nls.localize('navigateUp', "Navigate to the View Above");

	constructor(
		id: string,
		label: string,
		@IEditorGroupService groupService: IEditorGroupService,
		@IPanelService panelService: IPanelService,
		@IPartService partService: IPartService,
		@IViewletService viewletService: IViewletService
	) {
		super(id, label, groupService, panelService, partService, viewletService);
	}

	protected navigateOnEditorFocus(isEditorGroupVertical, isSidebarPositionLeft): TPromise<boolean> {
		if (isEditorGroupVertical) {
			return TPromise.as(false);
		}
		return this.navigateAcrossEditorGroup(Direction.Previous);
	}

	protected navigateOnPanelFocus(isEditorGroupVertical, isSidebarPositionLeft): TPromise<boolean> {
		if (isEditorGroupVertical) {
			return this.navigateToLastActiveGroup();
		}
		return this.navigateToLastEditorGroup();
	}
}

export class NavigateDownAction extends BaseNavigationAction {

	public static ID = 'workbench.action.navigateDown';
	public static LABEL = nls.localize('navigateDown', "Navigate to the View Below");

	constructor(
		id: string,
		label: string,
		@IEditorGroupService groupService: IEditorGroupService,
		@IPanelService panelService: IPanelService,
		@IPartService partService: IPartService,
		@IViewletService viewletService: IViewletService
	) {
		super(id, label, groupService, panelService, partService, viewletService);
	}

	protected navigateOnEditorFocus(isEditorGroupVertical, isSidebarPositionLeft): TPromise<boolean | IPanel> {
		if (isEditorGroupVertical) {
			return this.navigateToPanel();
		}

		return this.navigateAcrossEditorGroup(Direction.Next)
			.then(didNavigate => {
				if (didNavigate) {
					return TPromise.as(true);
				}
				return this.navigateToPanel();
			});
	}
}

// Resize focused view actions
export abstract class BaseResizeViewAction extends Action {

	// This is a media-size percentage
	protected static RESIZE_INCREMENT = 6.5;

	constructor(
		id: string,
		label: string,
		@IPartService protected partService: IPartService
	) {
		super(id, label);
	}

	protected resizePart(sizeChange: number): void {
		const isEditorFocus = this.partService.hasFocus(Parts.EDITOR_PART);
		const isSidebarFocus = this.partService.hasFocus(Parts.SIDEBAR_PART);
		const isPanelFocus = this.partService.hasFocus(Parts.PANEL_PART);

		let part: Parts;
		if (isSidebarFocus) {
			part = Parts.SIDEBAR_PART;
		} else if (isPanelFocus) {
			part = Parts.PANEL_PART;
		} else if (isEditorFocus) {
			part = Parts.EDITOR_PART;
		}

		if (part) {
			this.partService.resizePart(part, sizeChange);
		}
	}
}

export class IncreaseViewSizeAction extends BaseResizeViewAction {

	public static ID = 'workbench.action.increaseViewSize';
	public static LABEL = nls.localize('increaseViewSize', "Increase Current View Size");

	constructor(
		id: string,
		label: string,
		@IPartService partService: IPartService
	) {
		super(id, label, partService);
	}

	public run(): TPromise<boolean> {
		this.resizePart(BaseResizeViewAction.RESIZE_INCREMENT);
		return TPromise.as(true);
	}
}

export class DecreaseViewSizeAction extends BaseResizeViewAction {

	public static ID = 'workbench.action.decreaseViewSize';
	public static LABEL = nls.localize('decreaseViewSize', "Decrease Current View Size");

	constructor(
		id: string,
		label: string,
		@IPartService partService: IPartService

	) {
		super(id, label, partService);
	}

	public run(): TPromise<boolean> {
		this.resizePart(-BaseResizeViewAction.RESIZE_INCREMENT);
		return TPromise.as(true);
	}
}