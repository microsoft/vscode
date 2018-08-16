/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./media/actions';

import URI from 'vs/base/common/uri';
import { TPromise } from 'vs/base/common/winjs.base';
import { Action } from 'vs/base/common/actions';
import { IWindowService, IWindowsService, MenuBarVisibility } from 'vs/platform/windows/common/windows';
import * as nls from 'vs/nls';
import product from 'vs/platform/node/product';
import pkg from 'vs/platform/node/package';
import * as errors from 'vs/base/common/errors';
import { IWorkspaceContextService, WorkbenchState } from 'vs/platform/workspace/common/workspace';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IConfigurationService, ConfigurationTarget } from 'vs/platform/configuration/common/configuration';
import { IWorkspaceConfigurationService } from 'vs/workbench/services/configuration/common/configuration';
import { isMacintosh, isLinux, language } from 'vs/base/common/platform';
import * as browser from 'vs/base/browser/browser';
import { IIntegrityService } from 'vs/platform/integrity/common/integrity';
import { ITimerService, IStartupMetrics } from 'vs/workbench/services/timer/electron-browser/timerService';
import { IEditorGroupsService, GroupDirection, GroupLocation, IFindGroupScope } from 'vs/workbench/services/group/common/editorGroupsService';
import { IPanelService } from 'vs/workbench/services/panel/common/panelService';
import { IPartService, Parts, Position as PartPosition } from 'vs/workbench/services/part/common/partService';
import { IViewletService } from 'vs/workbench/services/viewlet/browser/viewlet';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import * as os from 'os';
import { webFrame, shell } from 'electron';
import { getBaseLabel } from 'vs/base/common/labels';
import { IViewlet } from 'vs/workbench/common/viewlet';
import { IPanel } from 'vs/workbench/common/panel';
import { IWorkspaceIdentifier, getWorkspaceLabel, ISingleFolderWorkspaceIdentifier, isSingleFolderWorkspaceIdentifier, isWorkspaceIdentifier } from 'vs/platform/workspaces/common/workspaces';
import { FileKind } from 'vs/platform/files/common/files';
import { IExtensionService, ActivationTimes } from 'vs/workbench/services/extensions/common/extensions';
import { getEntries } from 'vs/base/common/performance';
import { IssueType } from 'vs/platform/issue/common/issue';
import { domEvent } from 'vs/base/browser/event';
import { once } from 'vs/base/common/event';
import { IDisposable, toDisposable, dispose } from 'vs/base/common/lifecycle';
import { getDomNodePagePosition, createStyleSheet, createCSSRule } from 'vs/base/browser/dom';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { Context } from 'vs/platform/contextkey/browser/contextKeyService';
import { IWorkbenchIssueService } from 'vs/workbench/services/issue/common/issue';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { IUriLabelService } from 'vs/platform/uriLabel/common/uriLabel';
import { dirname } from 'vs/base/common/resources';
import { IModelService } from 'vs/editor/common/services/modelService';
import { IModeService } from 'vs/editor/common/services/modeService';
import { IQuickInputService, IQuickPickItem, IQuickInputButton, IQuickPickSeparator, IKeyMods } from 'vs/platform/quickinput/common/quickInput';
import { getIconClasses } from 'vs/workbench/browser/labels';
import { timeout } from 'vs/base/common/async';

// --- actions

export class CloseCurrentWindowAction extends Action {

	static readonly ID = 'workbench.action.closeWindow';
	static readonly LABEL = nls.localize('closeWindow', "Close Window");

	constructor(id: string, label: string, @IWindowService private windowService: IWindowService) {
		super(id, label);
	}

	run(): TPromise<boolean> {
		this.windowService.closeWindow();

		return TPromise.as(true);
	}
}

export class CloseWorkspaceAction extends Action {

	static readonly ID = 'workbench.action.closeFolder';
	static LABEL = nls.localize('closeWorkspace', "Close Workspace");

	constructor(
		id: string,
		label: string,
		@IWorkspaceContextService private contextService: IWorkspaceContextService,
		@INotificationService private notificationService: INotificationService,
		@IWindowService private windowService: IWindowService
	) {
		super(id, label);
	}

	run(): TPromise<void> {
		if (this.contextService.getWorkbenchState() === WorkbenchState.EMPTY) {
			this.notificationService.info(nls.localize('noWorkspaceOpened', "There is currently no workspace opened in this instance to close."));

			return TPromise.as(null);
		}

		return this.windowService.closeWorkspace();
	}
}

export class NewWindowAction extends Action {

	static readonly ID = 'workbench.action.newWindow';
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

	static readonly ID = 'workbench.action.toggleFullScreen';
	static LABEL = nls.localize('toggleFullScreen', "Toggle Full Screen");

	constructor(id: string, label: string, @IWindowService private windowService: IWindowService) {
		super(id, label);
	}

	run(): TPromise<void> {
		return this.windowService.toggleFullScreen();
	}
}

export class ToggleMenuBarAction extends Action {

	static readonly ID = 'workbench.action.toggleMenuBar';
	static LABEL = nls.localize('toggleMenuBar', "Toggle Menu Bar");

	private static readonly menuBarVisibilityKey = 'window.menuBarVisibility';

	constructor(
		id: string,
		label: string,
		@IConfigurationService private configurationService: IConfigurationService
	) {
		super(id, label);
	}

	run(): TPromise<void> {
		let currentVisibilityValue = this.configurationService.getValue<MenuBarVisibility>(ToggleMenuBarAction.menuBarVisibilityKey);
		if (typeof currentVisibilityValue !== 'string') {
			currentVisibilityValue = 'default';
		}

		let newVisibilityValue: string;
		if (currentVisibilityValue === 'visible' || currentVisibilityValue === 'default') {
			newVisibilityValue = 'toggle';
		} else {
			newVisibilityValue = 'default';
		}

		this.configurationService.updateValue(ToggleMenuBarAction.menuBarVisibilityKey, newVisibilityValue, ConfigurationTarget.USER);

		return TPromise.as(null);
	}
}

export class ToggleDevToolsAction extends Action {

	static readonly ID = 'workbench.action.toggleDevTools';
	static LABEL = nls.localize('toggleDevTools', "Toggle Developer Tools");

	constructor(id: string, label: string, @IWindowService private windowsService: IWindowService) {
		super(id, label);
	}

	run(): TPromise<void> {
		return this.windowsService.toggleDevTools();
	}
}

export abstract class BaseZoomAction extends Action {
	private static readonly SETTING_KEY = 'window.zoomLevel';

	constructor(
		id: string,
		label: string,
		@IWorkspaceConfigurationService private configurationService: IWorkspaceConfigurationService
	) {
		super(id, label);
	}

	protected setConfiguredZoomLevel(level: number): void {
		level = Math.round(level); // when reaching smallest zoom, prevent fractional zoom levels

		const applyZoom = () => {
			webFrame.setZoomLevel(level);
			browser.setZoomFactor(webFrame.getZoomFactor());
			// See https://github.com/Microsoft/vscode/issues/26151
			// Cannot be trusted because the webFrame might take some time
			// until it really applies the new zoom level
			browser.setZoomLevel(webFrame.getZoomLevel(), /*isTrusted*/false);
		};

		this.configurationService.updateValue(BaseZoomAction.SETTING_KEY, level).done(() => applyZoom());
	}
}

export class ZoomInAction extends BaseZoomAction {

	static readonly ID = 'workbench.action.zoomIn';
	static readonly LABEL = nls.localize('zoomIn', "Zoom In");

	constructor(
		id: string,
		label: string,
		@IWorkspaceConfigurationService configurationService: IWorkspaceConfigurationService
	) {
		super(id, label, configurationService);
	}

	run(): TPromise<boolean> {
		this.setConfiguredZoomLevel(webFrame.getZoomLevel() + 1);

		return TPromise.as(true);
	}
}

export class ZoomOutAction extends BaseZoomAction {

	static readonly ID = 'workbench.action.zoomOut';
	static readonly LABEL = nls.localize('zoomOut', "Zoom Out");

	constructor(
		id: string,
		label: string,
		@IWorkspaceConfigurationService configurationService: IWorkspaceConfigurationService
	) {
		super(id, label, configurationService);
	}

	run(): TPromise<boolean> {
		this.setConfiguredZoomLevel(webFrame.getZoomLevel() - 1);

		return TPromise.as(true);
	}
}

export class ZoomResetAction extends BaseZoomAction {

	static readonly ID = 'workbench.action.zoomReset';
	static readonly LABEL = nls.localize('zoomReset', "Reset Zoom");

	constructor(
		id: string,
		label: string,
		@IWorkspaceConfigurationService configurationService: IWorkspaceConfigurationService
	) {
		super(id, label, configurationService);
	}

	run(): TPromise<boolean> {
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

	static readonly ID = 'workbench.action.appPerf';
	static readonly LABEL = nls.localize('appPerf', "Startup Performance");

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

	run(): TPromise<boolean> {

		// Show dev tools
		this.windowService.openDevTools();

		Promise.all([
			timeout(1000), // needed to print a table
			this.timerService.startupMetrics
		]).then(([, metrics]) => {

			console.group('Startup Performance Measurement');
			console.log(`OS: ${metrics.platform} (${metrics.release})`);
			console.log(`CPUs: ${metrics.cpus.model} (${metrics.cpus.count} x ${metrics.cpus.speed})`);
			console.log(`Memory (System): ${(metrics.totalmem / (1024 * 1024 * 1024)).toFixed(2)}GB (${(metrics.freemem / (1024 * 1024 * 1024)).toFixed(2)}GB free)`);
			console.log(`Memory (Process): ${(metrics.meminfo.workingSetSize / 1024).toFixed(2)}MB working set (${(metrics.meminfo.peakWorkingSetSize / 1024).toFixed(2)}MB peak, ${(metrics.meminfo.privateBytes / 1024).toFixed(2)}MB private, ${(metrics.meminfo.sharedBytes / 1024).toFixed(2)}MB shared)`);
			console.log(`VM (likelyhood): ${metrics.isVMLikelyhood}%`);

			console.log(`Initial Startup: ${metrics.initialStartup}`);
			console.log(`Has ${metrics.windowCount - 1} other windows`);
			console.log(`Screen Reader Active: ${metrics.hasAccessibilitySupport}`);
			console.log(`Empty Workspace: ${metrics.emptyWorkbench}`);

			let nodeModuleLoadTime: number;
			if (this.environmentService.performance) {
				const nodeModuleTimes = this.analyzeNodeModulesLoadTimes();
				nodeModuleLoadTime = nodeModuleTimes.duration;
			}

			console.table(this.getStartupMetricsTable(metrics, nodeModuleLoadTime));

			if (this.environmentService.performance) {
				const data = this.analyzeLoaderStats();
				for (let type in data) {
					console.groupCollapsed(`Loader: ${type}`);
					console.table(data[type]);
					console.groupEnd();
				}
			}

			console.groupEnd();

			console.group('Extension Activation Stats');
			let extensionsActivationTimes: { [id: string]: ActivationTimes; } = {};
			let extensionsStatus = this.extensionService.getExtensionsStatus();
			for (let id in extensionsStatus) {
				const status = extensionsStatus[id];
				if (status.activationTimes) {
					extensionsActivationTimes[id] = status.activationTimes;
				}
			}
			console.table(extensionsActivationTimes);
			console.groupEnd();

			console.group('Raw Startup Timers (CSV)');
			let value = `Name\tStart\n`;
			let entries = getEntries('mark');
			for (const entry of entries) {
				value += `${entry.name}\t${entry.startTime}\n`;
			}
			console.log(value);
			console.groupEnd();
		});

		return TPromise.as(true);
	}

	private getStartupMetricsTable(metrics: IStartupMetrics, nodeModuleLoadTime?: number): any {
		const table = Object.create(null);

		table['start => app.isReady'] = { Process: '[main]', 'Took (ms)': metrics.timers.ellapsedAppReady, Meta: metrics.initialStartup };
		table['nls:start => nls:end'] = { Process: '[main]', 'Took (ms)': metrics.timers.ellapsedNlsGeneration, Meta: metrics.initialStartup };
		table['app.isReady => window.loadUrl()'] = { Process: '[main]', 'Took (ms)': metrics.timers.ellapsedWindowLoad, Meta: metrics.initialStartup };

		table['window.loadUrl() => begin to require(workbench.main.js)'] = { Process: '[main->renderer]', 'Took (ms)': metrics.timers.ellapsedWindowLoadToRequire };
		table['require(workbench.main.js)'] = { Process: '[renderer]', 'Took (ms)': metrics.timers.ellapsedRequire, Meta: metrics.didUseCachedData ? 'did use cached data' : 'did NOT use cached data' };

		if (nodeModuleLoadTime) {
			table['[renderer] -> of which require() node_modules'] = { Process: '[renderer]', 'Took(ms)': nodeModuleLoadTime };
		}

		table['register extensions & spawn extension host'] = { Process: '[renderer]', 'Took (ms)': metrics.timers.ellapsedExtensions };
		table['restore viewlet'] = { Process: '[renderer]', 'Took (ms)': metrics.timers.ellapsedViewletRestore, Meta: metrics.viewletId };
		table['restore editor view state'] = { Process: '[renderer]', 'Took (ms)': metrics.timers.ellapsedEditorRestore, Meta: metrics.editorIds.join(', ') };
		table['overall workbench load'] = { Process: '[renderer]', 'Took (ms)': metrics.timers.ellapsedWorkbench };

		table['workbench ready'] = { Process: '[main, renderer]', 'Took (ms)': metrics.ellapsed };
		table['extensions registered'] = { Process: '[renderer]', 'Took (ms)': metrics.timers.ellapsedExtensionsReady };

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
		const stats = <ILoaderEvent[]>(<any>require).getStats().slice(0).sort((a: ILoaderEvent, b: ILoaderEvent) => {
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

			readonly duration: number;
			readonly detail: string;

			constructor(private readonly start: ILoaderEvent, private readonly end: ILoaderEvent) {
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
			if (ticks[stat.type]) {
				ticks[stat.type].push(new Tick(stat, nextStat));
			}
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

	static readonly ID = 'workbench.action.reloadWindow';
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

export class ReloadWindowWithExtensionsDisabledAction extends Action {

	static readonly ID = 'workbench.action.reloadWindowWithExtensionsDisabled';
	static LABEL = nls.localize('reloadWindowWithExntesionsDisabled', "Reload Window With Extensions Disabled");

	constructor(
		id: string,
		label: string,
		@IWindowService private windowService: IWindowService
	) {
		super(id, label);
	}

	run(): TPromise<boolean> {
		return this.windowService.reloadWindow({ _: [], 'disable-extensions': true }).then(() => true);
	}
}

export abstract class BaseSwitchWindow extends Action {

	private closeWindowAction: IQuickInputButton = {
		iconClass: 'action-remove-from-recently-opened',
		tooltip: nls.localize('close', "Close Window")
	};

	constructor(
		id: string,
		label: string,
		private windowsService: IWindowsService,
		private windowService: IWindowService,
		private quickInputService: IQuickInputService,
		private keybindingService: IKeybindingService,
		private modelService: IModelService,
		private modeService: IModeService,
	) {
		super(id, label);

	}

	protected abstract isQuickNavigate(): boolean;

	run(): TPromise<void> {
		const currentWindowId = this.windowService.getCurrentWindowId();

		return this.windowsService.getWindows().then(windows => {
			const placeHolder = nls.localize('switchWindowPlaceHolder', "Select a window to switch to");
			const picks = windows.map(win => {
				const resource = win.filename ? URI.file(win.filename) : win.folderUri ? win.folderUri : win.workspace ? URI.file(win.workspace.configPath) : void 0;
				const fileKind = win.filename ? FileKind.FILE : win.workspace ? FileKind.ROOT_FOLDER : win.folderUri ? FileKind.FOLDER : FileKind.FILE;
				return {
					payload: win.id,
					label: win.title,
					iconClasses: getIconClasses(this.modelService, this.modeService, resource, fileKind),
					description: (currentWindowId === win.id) ? nls.localize('current', "Current Window") : void 0,
					buttons: (!this.isQuickNavigate() && currentWindowId !== win.id) ? [this.closeWindowAction] : void 0
				} as (IQuickPickItem & { payload: number });
			});

			const autoFocusIndex = (picks.indexOf(picks.filter(pick => pick.payload === currentWindowId)[0]) + 1) % picks.length;

			return this.quickInputService.pick(picks, {
				contextKey: 'inWindowsPicker',
				activeItem: picks[autoFocusIndex],
				placeHolder,
				quickNavigate: this.isQuickNavigate() ? { keybindings: this.keybindingService.lookupKeybindings(this.id) } : void 0,
				onDidTriggerItemButton: context => {
					this.windowsService.closeWindow(context.item.payload).then(() => {
						context.removeItem();
					});
				}
			});
		}).then(pick => {
			if (pick) {
				this.windowsService.showWindow(pick.payload).done(null, errors.onUnexpectedError);
			}
		});
	}
}

export class SwitchWindow extends BaseSwitchWindow {

	static readonly ID = 'workbench.action.switchWindow';
	static LABEL = nls.localize('switchWindow', "Switch Window...");

	constructor(
		id: string,
		label: string,
		@IWindowsService windowsService: IWindowsService,
		@IWindowService windowService: IWindowService,
		@IQuickInputService quickInputService: IQuickInputService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IModelService modelService: IModelService,
		@IModeService modeService: IModeService,
	) {
		super(id, label, windowsService, windowService, quickInputService, keybindingService, modelService, modeService);
	}

	protected isQuickNavigate(): boolean {
		return false;
	}
}

export class QuickSwitchWindow extends BaseSwitchWindow {

	static readonly ID = 'workbench.action.quickSwitchWindow';
	static LABEL = nls.localize('quickSwitchWindow', "Quick Switch Window...");

	constructor(
		id: string,
		label: string,
		@IWindowsService windowsService: IWindowsService,
		@IWindowService windowService: IWindowService,
		@IQuickInputService quickInputService: IQuickInputService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IModelService modelService: IModelService,
		@IModeService modeService: IModeService,
	) {
		super(id, label, windowsService, windowService, quickInputService, keybindingService, modelService, modeService);
	}

	protected isQuickNavigate(): boolean {
		return true;
	}
}

export const inRecentFilesPickerContextKey = 'inRecentFilesPicker';

export abstract class BaseOpenRecentAction extends Action {

	private removeFromRecentlyOpened: IQuickInputButton = {
		iconClass: 'action-remove-from-recently-opened',
		tooltip: nls.localize('remove', "Remove from Recently Opened")
	};

	constructor(
		id: string,
		label: string,
		private windowService: IWindowService,
		private windowsService: IWindowsService,
		private quickInputService: IQuickInputService,
		private contextService: IWorkspaceContextService,
		private environmentService: IEnvironmentService,
		private uriLabelService: IUriLabelService,
		private keybindingService: IKeybindingService,
		private modelService: IModelService,
		private modeService: IModeService,
	) {
		super(id, label);
	}

	protected abstract isQuickNavigate(): boolean;

	run(): TPromise<void> {
		return this.windowService.getRecentlyOpened()
			.then(({ workspaces, files }) => this.openRecent(workspaces, files));
	}

	private openRecent(recentWorkspaces: (IWorkspaceIdentifier | ISingleFolderWorkspaceIdentifier)[], recentFiles: URI[]): void {

		const toPick = (workspace: IWorkspaceIdentifier | ISingleFolderWorkspaceIdentifier | URI, fileKind: FileKind, environmentService: IEnvironmentService, uriLabelService: IUriLabelService, buttons: IQuickInputButton[]) => {
			let resource: URI;
			let label: string;
			let description: string;
			if (isSingleFolderWorkspaceIdentifier(workspace) && fileKind !== FileKind.FILE) {
				resource = workspace;
				label = getWorkspaceLabel(workspace, environmentService, uriLabelService);
				description = uriLabelService.getLabel(dirname(resource));
			} else if (isWorkspaceIdentifier(workspace)) {
				resource = URI.file(workspace.configPath);
				label = getWorkspaceLabel(workspace, environmentService, uriLabelService);
				description = uriLabelService.getLabel(dirname(resource));
			} else {
				resource = workspace;
				label = getBaseLabel(workspace);
				description = uriLabelService.getLabel(dirname(resource));
			}

			return {
				iconClasses: getIconClasses(this.modelService, this.modeService, resource, fileKind),
				label,
				description,
				buttons,
				workspace,
				resource,
				fileKind,
			};
		};

		const runPick = (resource: URI, isFile: boolean, keyMods: IKeyMods) => {
			const forceNewWindow = keyMods.ctrlCmd;
			return this.windowService.openWindow([resource], { forceNewWindow, forceOpenWorkspaceAsFile: isFile });
		};

		const workspacePicks = recentWorkspaces.map(workspace => toPick(workspace, isSingleFolderWorkspaceIdentifier(workspace) ? FileKind.FOLDER : FileKind.ROOT_FOLDER, this.environmentService, this.uriLabelService, !this.isQuickNavigate() ? [this.removeFromRecentlyOpened] : void 0));
		const filePicks = recentFiles.map(p => toPick(p, FileKind.FILE, this.environmentService, this.uriLabelService, !this.isQuickNavigate() ? [this.removeFromRecentlyOpened] : void 0));

		// focus second entry if the first recent workspace is the current workspace
		let autoFocusSecondEntry: boolean = recentWorkspaces[0] && this.contextService.isCurrentWorkspace(recentWorkspaces[0]);

		let keyMods: IKeyMods;
		const workspaceSeparator: IQuickPickSeparator = { type: 'separator', label: nls.localize('workspaces', "workspaces") };
		const fileSeparator: IQuickPickSeparator = { type: 'separator', label: nls.localize('files', "files") };
		const picks = [workspaceSeparator, ...workspacePicks, fileSeparator, ...filePicks];
		this.quickInputService.pick(picks, {
			contextKey: inRecentFilesPickerContextKey,
			activeItem: [...workspacePicks, ...filePicks][autoFocusSecondEntry ? 1 : 0],
			placeHolder: isMacintosh ? nls.localize('openRecentPlaceHolderMac', "Select to open (hold Cmd-key to open in new window)") : nls.localize('openRecentPlaceHolder', "Select to open (hold Ctrl-key to open in new window)"),
			matchOnDescription: true,
			onKeyMods: mods => keyMods = mods,
			quickNavigate: this.isQuickNavigate() ? { keybindings: this.keybindingService.lookupKeybindings(this.id) } : void 0,
			onDidTriggerItemButton: context => {
				this.windowsService.removeFromRecentlyOpened([context.item.workspace]).then(() => {
					context.removeItem();
				}).then(null, errors.onUnexpectedError);
			}
		})
			.then(pick => {
				if (pick) {
					return runPick(pick.resource, pick.fileKind === FileKind.FILE, keyMods);
				}
				return null;
			})
			.done(null, errors.onUnexpectedError);
	}
}

export class OpenRecentAction extends BaseOpenRecentAction {

	static readonly ID = 'workbench.action.openRecent';
	static readonly LABEL = nls.localize('openRecent', "Open Recent...");

	constructor(
		id: string,
		label: string,
		@IWindowService windowService: IWindowService,
		@IWindowsService windowsService: IWindowsService,
		@IQuickInputService quickInputService: IQuickInputService,
		@IWorkspaceContextService contextService: IWorkspaceContextService,
		@IEnvironmentService environmentService: IEnvironmentService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IModelService modelService: IModelService,
		@IModeService modeService: IModeService,
		@IUriLabelService uriLabelService: IUriLabelService
	) {
		super(id, label, windowService, windowsService, quickInputService, contextService, environmentService, uriLabelService, keybindingService, modelService, modeService);
	}

	protected isQuickNavigate(): boolean {
		return false;
	}
}

export class QuickOpenRecentAction extends BaseOpenRecentAction {

	static readonly ID = 'workbench.action.quickOpenRecent';
	static readonly LABEL = nls.localize('quickOpenRecent', "Quick Open Recent...");

	constructor(
		id: string,
		label: string,
		@IWindowService windowService: IWindowService,
		@IWindowsService windowsService: IWindowsService,
		@IQuickInputService quickInputService: IQuickInputService,
		@IWorkspaceContextService contextService: IWorkspaceContextService,
		@IEnvironmentService environmentService: IEnvironmentService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IModelService modelService: IModelService,
		@IModeService modeService: IModeService,
		@IUriLabelService uriLabelService: IUriLabelService
	) {
		super(id, label, windowService, windowsService, quickInputService, contextService, environmentService, uriLabelService, keybindingService, modelService, modeService);
	}

	protected isQuickNavigate(): boolean {
		return true;
	}
}

export class OpenIssueReporterAction extends Action {
	static readonly ID = 'workbench.action.openIssueReporter';
	static readonly LABEL = nls.localize({ key: 'reportIssueInEnglish', comment: ['Translate this to "Report Issue in English" in all languages please!'] }, "Report Issue");

	constructor(
		id: string,
		label: string,
		@IWorkbenchIssueService private issueService: IWorkbenchIssueService
	) {
		super(id, label);
	}

	run(): TPromise<boolean> {
		return this.issueService.openReporter()
			.then(() => true);
	}
}

export class OpenProcessExplorer extends Action {
	static readonly ID = 'workbench.action.openProcessExplorer';
	static readonly LABEL = nls.localize('openProcessExplorer', "Open Process Explorer");

	constructor(
		id: string,
		label: string,
		@IWorkbenchIssueService private issueService: IWorkbenchIssueService
	) {
		super(id, label);
	}

	run(): TPromise<boolean> {
		return this.issueService.openProcessExplorer()
			.then(() => true);
	}
}

export class ReportPerformanceIssueUsingReporterAction extends Action {
	static readonly ID = 'workbench.action.reportPerformanceIssueUsingReporter';
	static readonly LABEL = nls.localize('reportPerformanceIssue', "Report Performance Issue");

	constructor(
		id: string,
		label: string,
		@IWorkbenchIssueService private issueService: IWorkbenchIssueService
	) {
		super(id, label);
	}

	run(): TPromise<boolean> {
		// TODO: Reporter should send timings table as well
		return this.issueService.openReporter({ issueType: IssueType.PerformanceIssue })
			.then(() => true);
	}
}

// NOTE: This is still used when running --prof-startup, which already opens a dialog, so the reporter is not used.
export class ReportPerformanceIssueAction extends Action {

	static readonly ID = 'workbench.action.reportPerformanceIssue';
	static readonly LABEL = nls.localize('reportPerformanceIssue', "Report Performance Issue");

	constructor(
		id: string,
		label: string,
		@IIntegrityService private integrityService: IIntegrityService,
		@IEnvironmentService private environmentService: IEnvironmentService,
		@ITimerService private timerService: ITimerService
	) {
		super(id, label);
	}

	run(appendix?: string): TPromise<boolean> {
		Promise.all([
			this.timerService.startupMetrics,
			this.integrityService.isPure()
		]).then(([metrics, integrity]) => {
			const issueUrl = this.generatePerformanceIssueUrl(metrics, product.reportIssueUrl, pkg.name, pkg.version, product.commit, product.date, integrity.isPure, appendix);

			window.open(issueUrl);
		});

		return TPromise.wrap(true);
	}

	private generatePerformanceIssueUrl(metrics: IStartupMetrics, baseUrl: string, name: string, version: string, commit: string, date: string, isPure: boolean, appendix?: string): string {

		if (!appendix) {
			appendix = `Additional Steps to Reproduce (if any):

1.
2.`;
		}

		let nodeModuleLoadTime: number;
		if (this.environmentService.performance) {
			nodeModuleLoadTime = this.computeNodeModulesLoadTime();
		}


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

${this.generatePerformanceTable(metrics, nodeModuleLoadTime)}

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

	private generatePerformanceTable(metrics: IStartupMetrics, nodeModuleLoadTime?: number): string {
		let tableHeader = `|Component|Task|Time (ms)|
|---|---|---|`;

		const table = this.getStartupMetricsTable(metrics, nodeModuleLoadTime).map(e => {
			return `|${e.component}|${e.task}|${e.time}|`;
		}).join('\n');

		return `${tableHeader}\n${table}`;
	}

	private getStartupMetricsTable(metrics: IStartupMetrics, nodeModuleLoadTime?: number): { component: string, task: string; time: number; }[] {
		const table: any[] = [];

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

	static readonly ID = 'workbench.action.keybindingsReference';
	static readonly LABEL = nls.localize('keybindingsReference', "Keyboard Shortcuts Reference");

	private static readonly URL = isLinux ? product.keyboardShortcutsUrlLinux : isMacintosh ? product.keyboardShortcutsUrlMac : product.keyboardShortcutsUrlWin;
	static readonly AVAILABLE = !!KeybindingsReferenceAction.URL;

	constructor(
		id: string,
		label: string
	) {
		super(id, label);
	}

	run(): TPromise<void> {
		window.open(KeybindingsReferenceAction.URL);
		return null;
	}
}

export class OpenDocumentationUrlAction extends Action {

	static readonly ID = 'workbench.action.openDocumentationUrl';
	static readonly LABEL = nls.localize('openDocumentationUrl', "Documentation");

	private static readonly URL = product.documentationUrl;
	static readonly AVAILABLE = !!OpenDocumentationUrlAction.URL;

	constructor(
		id: string,
		label: string
	) {
		super(id, label);
	}

	run(): TPromise<void> {
		window.open(OpenDocumentationUrlAction.URL);
		return null;
	}
}

export class OpenIntroductoryVideosUrlAction extends Action {

	static readonly ID = 'workbench.action.openIntroductoryVideosUrl';
	static readonly LABEL = nls.localize('openIntroductoryVideosUrl', "Introductory Videos");

	private static readonly URL = product.introductoryVideosUrl;
	static readonly AVAILABLE = !!OpenIntroductoryVideosUrlAction.URL;

	constructor(
		id: string,
		label: string
	) {
		super(id, label);
	}

	run(): TPromise<void> {
		window.open(OpenIntroductoryVideosUrlAction.URL);
		return null;
	}
}

export class OpenTipsAndTricksUrlAction extends Action {

	static readonly ID = 'workbench.action.openTipsAndTricksUrl';
	static readonly LABEL = nls.localize('openTipsAndTricksUrl', "Tips and Tricks");

	private static readonly URL = product.tipsAndTricksUrl;
	static readonly AVAILABLE = !!OpenTipsAndTricksUrlAction.URL;

	constructor(
		id: string,
		label: string
	) {
		super(id, label);
	}

	run(): TPromise<void> {
		window.open(OpenTipsAndTricksUrlAction.URL);
		return null;
	}
}

export class ToggleSharedProcessAction extends Action {

	static readonly ID = 'workbench.action.toggleSharedProcess';
	static LABEL = nls.localize('toggleSharedProcess', "Toggle Shared Process");

	constructor(id: string, label: string, @IWindowsService private windowsService: IWindowsService) {
		super(id, label);
	}

	run(): TPromise<void> {
		return this.windowsService.toggleSharedProcess();
	}
}

export enum Direction {
	Next,
	Previous,
}

export abstract class BaseNavigationAction extends Action {

	constructor(
		id: string,
		label: string,
		@IEditorGroupsService protected editorGroupService: IEditorGroupsService,
		@IPanelService protected panelService: IPanelService,
		@IPartService protected partService: IPartService,
		@IViewletService protected viewletService: IViewletService
	) {
		super(id, label);
	}

	run(): TPromise<any> {
		const isEditorFocus = this.partService.hasFocus(Parts.EDITOR_PART);
		const isPanelFocus = this.partService.hasFocus(Parts.PANEL_PART);
		const isSidebarFocus = this.partService.hasFocus(Parts.SIDEBAR_PART);

		const isSidebarPositionLeft = this.partService.getSideBarPosition() === PartPosition.LEFT;
		const isPanelPositionDown = this.partService.getPanelPosition() === PartPosition.BOTTOM;

		if (isEditorFocus) {
			return this.navigateOnEditorFocus(isSidebarPositionLeft, isPanelPositionDown);
		}

		if (isPanelFocus) {
			return this.navigateOnPanelFocus(isSidebarPositionLeft, isPanelPositionDown);
		}

		if (isSidebarFocus) {
			return this.navigateOnSidebarFocus(isSidebarPositionLeft, isPanelPositionDown);
		}

		return TPromise.as(false);
	}

	protected navigateOnEditorFocus(isSidebarPositionLeft: boolean, isPanelPositionDown: boolean): TPromise<boolean | IViewlet | IPanel> {
		return TPromise.as(true);
	}

	protected navigateOnPanelFocus(isSidebarPositionLeft: boolean, isPanelPositionDown: boolean): TPromise<boolean | IPanel> {
		return TPromise.as(true);
	}

	protected navigateOnSidebarFocus(isSidebarPositionLeft: boolean, isPanelPositionDown: boolean): TPromise<boolean | IViewlet> {
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

	protected navigateAcrossEditorGroup(direction: GroupDirection): TPromise<boolean> {
		return this.doNavigateToEditorGroup({ direction });
	}

	protected navigateToEditorGroup(location: GroupLocation): TPromise<boolean> {
		return this.doNavigateToEditorGroup({ location });
	}

	private doNavigateToEditorGroup(scope: IFindGroupScope): TPromise<boolean> {
		const targetGroup = this.editorGroupService.findGroup(scope, this.editorGroupService.activeGroup);
		if (targetGroup) {
			targetGroup.focus();

			return TPromise.as(true);
		}

		return TPromise.as(false);
	}
}

export class NavigateLeftAction extends BaseNavigationAction {

	static readonly ID = 'workbench.action.navigateLeft';
	static readonly LABEL = nls.localize('navigateLeft', "Navigate to the View on the Left");

	constructor(
		id: string,
		label: string,
		@IEditorGroupsService editorGroupService: IEditorGroupsService,
		@IPanelService panelService: IPanelService,
		@IPartService partService: IPartService,
		@IViewletService viewletService: IViewletService
	) {
		super(id, label, editorGroupService, panelService, partService, viewletService);
	}

	protected navigateOnEditorFocus(isSidebarPositionLeft: boolean, isPanelPositionDown: boolean): TPromise<boolean | IViewlet> {
		return this.navigateAcrossEditorGroup(GroupDirection.LEFT)
			.then(didNavigate => {
				if (didNavigate) {
					return TPromise.as(true);
				}

				if (isSidebarPositionLeft) {
					return this.navigateToSidebar();
				}

				return TPromise.as(false);
			});
	}

	protected navigateOnPanelFocus(isSidebarPositionLeft: boolean, isPanelPositionDown: boolean): TPromise<boolean | IViewlet> {
		if (isPanelPositionDown && isSidebarPositionLeft) {
			return this.navigateToSidebar();
		}

		if (!isPanelPositionDown) {
			return this.navigateToEditorGroup(GroupLocation.LAST);
		}

		return TPromise.as(false);
	}

	protected navigateOnSidebarFocus(isSidebarPositionLeft: boolean, isPanelPositionDown: boolean): TPromise<boolean> {
		if (!isSidebarPositionLeft) {
			return this.navigateToEditorGroup(GroupLocation.LAST);
		}

		return TPromise.as(false);
	}
}

export class NavigateRightAction extends BaseNavigationAction {

	static readonly ID = 'workbench.action.navigateRight';
	static readonly LABEL = nls.localize('navigateRight', "Navigate to the View on the Right");

	constructor(
		id: string,
		label: string,
		@IEditorGroupsService editorGroupService: IEditorGroupsService,
		@IPanelService panelService: IPanelService,
		@IPartService partService: IPartService,
		@IViewletService viewletService: IViewletService
	) {
		super(id, label, editorGroupService, panelService, partService, viewletService);
	}

	protected navigateOnEditorFocus(isSidebarPositionLeft: boolean, isPanelPositionDown: boolean): TPromise<boolean | IViewlet | IPanel> {
		return this.navigateAcrossEditorGroup(GroupDirection.RIGHT)
			.then(didNavigate => {
				if (didNavigate) {
					return TPromise.as(true);
				}

				if (!isPanelPositionDown) {
					return this.navigateToPanel();
				}

				if (!isSidebarPositionLeft) {
					return this.navigateToSidebar();
				}

				return TPromise.as(false);
			});
	}

	protected navigateOnPanelFocus(isSidebarPositionLeft: boolean, isPanelPositionDown: boolean): TPromise<boolean | IViewlet> {
		if (!isSidebarPositionLeft) {
			return this.navigateToSidebar();
		}

		return TPromise.as(false);
	}

	protected navigateOnSidebarFocus(isSidebarPositionLeft: boolean, isPanelPositionDown: boolean): TPromise<boolean> {
		if (isSidebarPositionLeft) {
			return this.navigateToEditorGroup(GroupLocation.FIRST);
		}

		return TPromise.as(false);
	}
}

export class NavigateUpAction extends BaseNavigationAction {

	static readonly ID = 'workbench.action.navigateUp';
	static readonly LABEL = nls.localize('navigateUp', "Navigate to the View Above");

	constructor(
		id: string,
		label: string,
		@IEditorGroupsService editorGroupService: IEditorGroupsService,
		@IPanelService panelService: IPanelService,
		@IPartService partService: IPartService,
		@IViewletService viewletService: IViewletService
	) {
		super(id, label, editorGroupService, panelService, partService, viewletService);
	}

	protected navigateOnEditorFocus(isSidebarPositionLeft: boolean, isPanelPositionDown: boolean): TPromise<boolean> {
		return this.navigateAcrossEditorGroup(GroupDirection.UP);
	}

	protected navigateOnPanelFocus(isSidebarPositionLeft: boolean, isPanelPositionDown: boolean): TPromise<boolean> {
		if (isPanelPositionDown) {
			return this.navigateToEditorGroup(GroupLocation.LAST);
		}

		return TPromise.as(false);
	}
}

export class NavigateDownAction extends BaseNavigationAction {

	static readonly ID = 'workbench.action.navigateDown';
	static readonly LABEL = nls.localize('navigateDown', "Navigate to the View Below");

	constructor(
		id: string,
		label: string,
		@IEditorGroupsService editorGroupService: IEditorGroupsService,
		@IPanelService panelService: IPanelService,
		@IPartService partService: IPartService,
		@IViewletService viewletService: IViewletService
	) {
		super(id, label, editorGroupService, panelService, partService, viewletService);
	}

	protected navigateOnEditorFocus(isSidebarPositionLeft: boolean, isPanelPositionDown: boolean): TPromise<boolean | IPanel> {
		return this.navigateAcrossEditorGroup(GroupDirection.DOWN)
			.then(didNavigate => {
				if (didNavigate) {
					return TPromise.as(true);
				}

				if (isPanelPositionDown) {
					return this.navigateToPanel();
				}

				return TPromise.as(false);
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

	static readonly ID = 'workbench.action.increaseViewSize';
	static readonly LABEL = nls.localize('increaseViewSize', "Increase Current View Size");

	constructor(
		id: string,
		label: string,
		@IPartService partService: IPartService
	) {
		super(id, label, partService);
	}

	run(): TPromise<boolean> {
		this.resizePart(BaseResizeViewAction.RESIZE_INCREMENT);
		return TPromise.as(true);
	}
}

export class DecreaseViewSizeAction extends BaseResizeViewAction {

	static readonly ID = 'workbench.action.decreaseViewSize';
	static readonly LABEL = nls.localize('decreaseViewSize', "Decrease Current View Size");

	constructor(
		id: string,
		label: string,
		@IPartService partService: IPartService

	) {
		super(id, label, partService);
	}

	run(): TPromise<boolean> {
		this.resizePart(-BaseResizeViewAction.RESIZE_INCREMENT);
		return TPromise.as(true);
	}
}

export class NewWindowTab extends Action {

	static readonly ID = 'workbench.action.newWindowTab';
	static readonly LABEL = nls.localize('newTab', "New Window Tab");

	constructor(
		id: string,
		label: string,
		@IWindowsService private windowsService: IWindowsService
	) {
		super(NewWindowTab.ID, NewWindowTab.LABEL);
	}

	run(): TPromise<boolean> {
		return this.windowsService.newWindowTab().then(() => true);
	}
}

export class ShowPreviousWindowTab extends Action {

	static readonly ID = 'workbench.action.showPreviousWindowTab';
	static readonly LABEL = nls.localize('showPreviousTab', "Show Previous Window Tab");

	constructor(
		id: string,
		label: string,
		@IWindowsService private windowsService: IWindowsService
	) {
		super(ShowPreviousWindowTab.ID, ShowPreviousWindowTab.LABEL);
	}

	run(): TPromise<boolean> {
		return this.windowsService.showPreviousWindowTab().then(() => true);
	}
}

export class ShowNextWindowTab extends Action {

	static readonly ID = 'workbench.action.showNextWindowTab';
	static readonly LABEL = nls.localize('showNextWindowTab', "Show Next Window Tab");

	constructor(
		id: string,
		label: string,
		@IWindowsService private windowsService: IWindowsService
	) {
		super(ShowNextWindowTab.ID, ShowNextWindowTab.LABEL);
	}

	run(): TPromise<boolean> {
		return this.windowsService.showNextWindowTab().then(() => true);
	}
}

export class MoveWindowTabToNewWindow extends Action {

	static readonly ID = 'workbench.action.moveWindowTabToNewWindow';
	static readonly LABEL = nls.localize('moveWindowTabToNewWindow', "Move Window Tab to New Window");

	constructor(
		id: string,
		label: string,
		@IWindowsService private windowsService: IWindowsService
	) {
		super(MoveWindowTabToNewWindow.ID, MoveWindowTabToNewWindow.LABEL);
	}

	run(): TPromise<boolean> {
		return this.windowsService.moveWindowTabToNewWindow().then(() => true);
	}
}

export class MergeAllWindowTabs extends Action {

	static readonly ID = 'workbench.action.mergeAllWindowTabs';
	static readonly LABEL = nls.localize('mergeAllWindowTabs', "Merge All Windows");

	constructor(
		id: string,
		label: string,
		@IWindowsService private windowsService: IWindowsService
	) {
		super(MergeAllWindowTabs.ID, MergeAllWindowTabs.LABEL);
	}

	run(): TPromise<boolean> {
		return this.windowsService.mergeAllWindowTabs().then(() => true);
	}
}

export class ToggleWindowTabsBar extends Action {

	static readonly ID = 'workbench.action.toggleWindowTabsBar';
	static readonly LABEL = nls.localize('toggleWindowTabsBar', "Toggle Window Tabs Bar");

	constructor(
		id: string,
		label: string,
		@IWindowsService private windowsService: IWindowsService
	) {
		super(ToggleWindowTabsBar.ID, ToggleWindowTabsBar.LABEL);
	}

	run(): TPromise<boolean> {
		return this.windowsService.toggleWindowTabsBar().then(() => true);
	}
}

export class OpenTwitterUrlAction extends Action {

	static readonly ID = 'workbench.action.openTwitterUrl';
	static LABEL = nls.localize('openTwitterUrl', "Join us on Twitter", product.applicationName);

	constructor(
		id: string,
		label: string
	) {
		super(id, label);
	}

	run(): TPromise<boolean> {
		if (product.twitterUrl) {
			return TPromise.as(shell.openExternal(product.twitterUrl));
		}

		return TPromise.as(false);
	}
}

export class OpenRequestFeatureUrlAction extends Action {

	static readonly ID = 'workbench.action.openRequestFeatureUrl';
	static LABEL = nls.localize('openUserVoiceUrl', "Search Feature Requests");

	constructor(
		id: string,
		label: string
	) {
		super(id, label);
	}

	run(): TPromise<boolean> {
		if (product.requestFeatureUrl) {
			return TPromise.as(shell.openExternal(product.requestFeatureUrl));
		}

		return TPromise.as(false);
	}
}

export class OpenLicenseUrlAction extends Action {

	static readonly ID = 'workbench.action.openLicenseUrl';
	static LABEL = nls.localize('openLicenseUrl', "View License");

	constructor(
		id: string,
		label: string
	) {
		super(id, label);
	}

	run(): TPromise<boolean> {
		if (product.licenseUrl) {
			if (language) {
				const queryArgChar = product.licenseUrl.indexOf('?') > 0 ? '&' : '?';
				return TPromise.as(shell.openExternal(`${product.licenseUrl}${queryArgChar}lang=${language}`));
			} else {
				return TPromise.as(shell.openExternal(product.licenseUrl));
			}
		}

		return TPromise.as(false);
	}
}


export class OpenPrivacyStatementUrlAction extends Action {

	static readonly ID = 'workbench.action.openPrivacyStatementUrl';
	static LABEL = nls.localize('openPrivacyStatement', "Privacy Statement");

	constructor(
		id: string,
		label: string
	) {
		super(id, label);
	}

	run(): TPromise<boolean> {
		if (product.privacyStatementUrl) {
			if (language) {
				const queryArgChar = product.privacyStatementUrl.indexOf('?') > 0 ? '&' : '?';
				return TPromise.as(shell.openExternal(`${product.privacyStatementUrl}${queryArgChar}lang=${language}`));
			} else {
				return TPromise.as(shell.openExternal(product.privacyStatementUrl));
			}
		}


		return TPromise.as(false);
	}
}

export class ShowAboutDialogAction extends Action {

	static readonly ID = 'workbench.action.showAboutDialog';
	static LABEL = nls.localize('about', "About {0}", product.applicationName);

	constructor(
		id: string,
		label: string,
		@IWindowsService private windowsService: IWindowsService
	) {
		super(id, label);
	}

	run(): TPromise<void> {
		return this.windowsService.openAboutDialog();
	}
}

export class InspectContextKeysAction extends Action {

	static readonly ID = 'workbench.action.inspectContextKeys';
	static LABEL = nls.localize('inspect context keys', "Inspect Context Keys");

	constructor(
		id: string,
		label: string,
		@IContextKeyService private contextKeyService: IContextKeyService,
		@IWindowService private windowService: IWindowService,
	) {
		super(id, label);
	}

	run(): TPromise<void> {
		const disposables: IDisposable[] = [];

		const stylesheet = createStyleSheet();
		disposables.push(toDisposable(() => stylesheet.parentNode.removeChild(stylesheet)));
		createCSSRule('*', 'cursor: crosshair !important;', stylesheet);

		const hoverFeedback = document.createElement('div');
		document.body.appendChild(hoverFeedback);
		disposables.push(toDisposable(() => document.body.removeChild(hoverFeedback)));

		hoverFeedback.style.position = 'absolute';
		hoverFeedback.style.pointerEvents = 'none';
		hoverFeedback.style.backgroundColor = 'rgba(255, 0, 0, 0.5)';
		hoverFeedback.style.zIndex = '1000';

		const onMouseMove = domEvent(document.body, 'mousemove', true);
		disposables.push(onMouseMove(e => {
			const target = e.target as HTMLElement;
			const position = getDomNodePagePosition(target);

			hoverFeedback.style.top = `${position.top}px`;
			hoverFeedback.style.left = `${position.left}px`;
			hoverFeedback.style.width = `${position.width}px`;
			hoverFeedback.style.height = `${position.height}px`;
		}));

		const onMouseDown = once(domEvent(document.body, 'mousedown', true));
		onMouseDown(e => { e.preventDefault(); e.stopPropagation(); }, null, disposables);

		const onMouseUp = once(domEvent(document.body, 'mouseup', true));
		onMouseUp(e => {
			e.preventDefault();
			e.stopPropagation();

			const context = this.contextKeyService.getContext(e.target as HTMLElement) as Context;
			console.log(context.collectAllValues());
			this.windowService.openDevTools();

			dispose(disposables);
		}, null, disposables);

		return TPromise.as(null);
	}
}
