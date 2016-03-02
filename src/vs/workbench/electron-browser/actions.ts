/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import {TPromise} from 'vs/base/common/winjs.base';
import timer = require('vs/base/common/timer');
import paths = require('vs/base/common/paths');
import {Action} from 'vs/base/common/actions';
import {IWindowService} from 'vs/workbench/services/window/electron-browser/windowService';
import {IWorkbenchEditorService} from 'vs/workbench/services/editor/common/editorService';
import nls = require('vs/nls');
import {IMessageService, Severity} from 'vs/platform/message/common/message';
import {IWindowConfiguration} from 'vs/workbench/electron-browser/window';
import {IWorkspaceContextService} from 'vs/platform/workspace/common/workspace';
import {IQuickOpenService} from 'vs/workbench/services/quickopen/common/quickOpenService';
import {IConfigurationService} from 'vs/platform/configuration/common/configuration';

import {ipcRenderer as ipc, webFrame, remote} from 'electron';

export class CloseEditorAction extends Action {

	public static ID = 'workbench.action.closeActiveEditor';
	public static LABEL = nls.localize('closeActiveEditor', "Close Editor");

	constructor(
		id: string,
		label: string,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService,
		@IWindowService private windowService: IWindowService
	) {
		super(id, label);
	}

	public run(): TPromise<any> {
		let activeEditor = this.editorService.getActiveEditor();
		if (activeEditor) {
			return this.editorService.closeEditor(activeEditor);
		}

		this.windowService.getWindow().close();

		return TPromise.as(false);
	}
}

export class CloseWindowAction extends Action {

	public static ID = 'workbench.action.closeWindow';
	public static LABEL = nls.localize('closeWindow', "Close Window");

	constructor(id: string, label: string, @IWindowService private windowService: IWindowService) {
		super(id, label);
	}

	public run(): TPromise<boolean> {
		this.windowService.getWindow().close();

		return TPromise.as(true);
	}
}

export class CloseFolderAction extends Action {

	public static ID = 'workbench.action.closeFolder';
	public static LABEL = nls.localize('closeFolder', "Close Folder");

	constructor(
		id: string,
		label: string,
		@IWorkspaceContextService private contextService: IWorkspaceContextService,
		@IMessageService private messageService: IMessageService,
		@IWindowService private windowService: IWindowService
	) {
		super(id, label);
	}

	public run(): TPromise<boolean> {
		if (this.contextService.getWorkspace()) {
			ipc.send('vscode:closeFolder', this.windowService.getWindowId()); // handled from browser process
		} else {
			this.messageService.show(Severity.Info, nls.localize('noFolderOpened', "There is currently no folder opened in this instance to close."));
		}

		return TPromise.as(true);
	}
}

export class NewWindowAction extends Action {

	public static ID = 'workbench.action.newWindow';
	public static LABEL = nls.localize('newWindow', "New Window");

	constructor(
		id: string,
		label: string,
		@IWindowService private windowService: IWindowService
	) {
		super(id, label);
	}

	public run(): TPromise<boolean> {
		this.windowService.getWindow().openNew();

		return TPromise.as(true);
	}
}

export class ToggleFullScreenAction extends Action {

	public static ID = 'workbench.action.toggleFullScreen';
	public static LABEL = nls.localize('toggleFullScreen', "Toggle Full Screen");

	constructor(id: string, label: string, @IWindowService private windowService: IWindowService) {
		super(id, label);
	}

	public run(): TPromise<boolean> {
		ipc.send('vscode:toggleFullScreen', this.windowService.getWindowId());

		return TPromise.as(true);
	}
}

export class ToggleMenuBarAction extends Action {

	public static ID = 'workbench.action.toggleMenuBar';
	public static LABEL = nls.localize('toggleMenuBar', "Toggle Menu Bar");

	constructor(id: string, label: string, @IWindowService private windowService: IWindowService) {
		super(id, label);
	}

	public run(): TPromise<boolean> {
		ipc.send('vscode:toggleMenuBar', this.windowService.getWindowId());

		return TPromise.as(true);
	}
}

export class ToggleDevToolsAction extends Action {

	public static ID = 'workbench.action.toggleDevTools';
	public static LABEL = nls.localize('toggleDevTools', "Toggle Developer Tools");

	constructor(id: string, label: string, @IWindowService private windowService: IWindowService) {
		super(id, label);
	}

	public run(): TPromise<boolean> {
		ipc.send('vscode:toggleDevTools', this.windowService.getWindowId());

		return TPromise.as(true);
	}
}

export class ZoomInAction extends Action {

	public static ID = 'workbench.action.zoomIn';
	public static LABEL = nls.localize('zoomIn', "Zoom in");

	constructor(id: string, label: string) {
		super(id, label);
	}

	public run(): TPromise<boolean> {
		webFrame.setZoomLevel(webFrame.getZoomLevel() + 1);

		return TPromise.as(true);
	}
}

export abstract class BaseZoomAction extends Action {

	constructor(
		id: string,
		label: string,
		@IConfigurationService private configurationService: IConfigurationService
	) {
		super(id, label);
	}

	public run(): TPromise<boolean> {
		return TPromise.as(false); // Subclass to implement
	}

	protected loadConfiguredZoomLevel(): TPromise<number> {
		return this.configurationService.loadConfiguration().then((windowConfig: IWindowConfiguration) => {
			if (windowConfig.window && typeof windowConfig.window.zoomLevel === 'number') {
				return windowConfig.window.zoomLevel;
			}

			return 0; // default
		});
	}
}

export class ZoomOutAction extends BaseZoomAction {

	public static ID = 'workbench.action.zoomOut';
	public static LABEL = nls.localize('zoomOut', "Zoom out");

	constructor(
		id: string,
		label: string,
		@IConfigurationService configurationService: IConfigurationService
	) {
		super(id, label, configurationService);
	}

	public run(): TPromise<boolean> {
		return this.loadConfiguredZoomLevel().then(level => {
			let newZoomLevelCandiate = webFrame.getZoomLevel() - 1;
			if (newZoomLevelCandiate < 0 && newZoomLevelCandiate < level) {
				newZoomLevelCandiate = Math.min(level, 0); // do not zoom below configured level or below 0
			}

			webFrame.setZoomLevel(newZoomLevelCandiate);

			return true;
		});
	}
}

export class ZoomResetAction extends BaseZoomAction {

	public static ID = 'workbench.action.zoomReset';
	public static LABEL = nls.localize('zoomReset', "Reset Zoom");

	constructor(
		id: string,
		label: string,
		@IConfigurationService configurationService: IConfigurationService
	) {
		super(id, label, configurationService);
	}

	public run(): TPromise<boolean> {
		return this.loadConfiguredZoomLevel().then(level => {
			webFrame.setZoomLevel(level);

			return true;
		});
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
		@IWorkspaceContextService private contextService: IWorkspaceContextService
	) {
		super(id, label);

		this.enabled = contextService.getConfiguration().env.enablePerformance;
	}

	private _analyzeLoaderTimes(): any[] {
		let stats = <ILoaderEvent[]>(<any>require).getStats();
		let result = [];

		let total = 0;

		for (let i = 0, len = stats.length; i < len; i++) {
			if (stats[i].type === LoaderEventType.NodeEndNativeRequire) {
				if (stats[i - 1].type === LoaderEventType.NodeBeginNativeRequire && stats[i - 1].detail === stats[i].detail) {
					let entry: any = {};
					entry['Event'] = 'nodeRequire ' + stats[i].detail;
					entry['Took (ms)'] = (stats[i].timestamp - stats[i - 1].timestamp);
					total += (stats[i].timestamp - stats[i - 1].timestamp);
					entry['Start (ms)'] = '**' + stats[i - 1].timestamp;
					entry['End (ms)'] = '**' + stats[i - 1].timestamp;
					result.push(entry);
				}
			}
		}

		if (total > 0) {
			let entry: any = {};
			entry['Event'] = '===nodeRequire TOTAL';
			entry['Took (ms)'] = total;
			entry['Start (ms)'] = '**';
			entry['End (ms)'] = '**';
			result.push(entry);
		}

		return result;
	}

	public run(): TPromise<boolean> {
		let table: any[] = [];
		table.push(...this._analyzeLoaderTimes());

		let start = Math.round(remote.getGlobal('programStart') || remote.getGlobal('vscodeStart'));
		let windowShowTime = Math.round(remote.getGlobal('windowShow'));

		let lastEvent: timer.ITimerEvent;
		let events = timer.getTimeKeeper().getCollectedEvents();
		events.forEach((e) => {
			if (e.topic === 'Startup') {
				lastEvent = e;
				let entry: any = {};

				entry['Event'] = e.name;
				entry['Took (ms)'] = e.stopTime.getTime() - e.startTime.getTime();
				entry['Start (ms)'] = Math.max(e.startTime.getTime() - start, 0);
				entry['End (ms)'] = e.stopTime.getTime() - start;

				table.push(entry);
			}
		});

		table.push({ Event: '---------------------------' });

		let windowShowEvent: any = {};
		windowShowEvent['Event'] = 'Show Window at';
		windowShowEvent['Start (ms)'] = windowShowTime - start;
		table.push(windowShowEvent);

		let sum: any = {};
		sum['Event'] = 'Total';
		sum['Took (ms)'] = lastEvent.stopTime.getTime() - start;
		table.push(sum);


		// Show dev tools
		this.windowService.getWindow().openDevTools();

		// Print to console
		setTimeout(() => {
			console.warn('Run the action again if you do not see the numbers!');
			(<any>console).table(table);
		}, 1000);

		return TPromise.as(true);
	}
}

export class ReloadWindowAction extends Action {

	public static ID = 'workbench.action.reloadWindow';
	public static LABEL = nls.localize('reloadWindow', "Reload Window");

	constructor(id: string, label: string, @IWindowService private windowService: IWindowService) {
		super(id, label);
	}

	public run(): TPromise<boolean> {
		this.windowService.getWindow().reload();

		return TPromise.as(true);
	}
}

export class OpenRecentAction extends Action {

	public static ID = 'workbench.action.openRecent';
	public static LABEL = nls.localize('openRecent', "Open Recent");

	constructor(
		id: string,
		label: string,
		@IWorkspaceContextService private contextService: IWorkspaceContextService,
		@IQuickOpenService private quickOpenService: IQuickOpenService
	) {
		super(id, label);
	}

	public run(): TPromise<boolean> {
		let picks = this.contextService.getConfiguration().env.recentPaths.map(p => {
			return {
				label: paths.basename(p),
				description: paths.dirname(p),
				path: p
			};
		});

		const hasWorkspace = !!this.contextService.getWorkspace();

		return this.quickOpenService.pick(picks, {
			autoFocus: { autoFocusFirstEntry: !hasWorkspace, autoFocusSecondEntry: hasWorkspace },
			placeHolder: nls.localize('openRecentPlaceHolder', "Select a path to open"),
			matchOnDescription: true
		}).then(p => {
			if (p) {
				ipc.send('vscode:windowOpen', [p.path]);
			}

			return true;
		});
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