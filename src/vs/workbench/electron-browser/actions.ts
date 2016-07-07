/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import URI from 'vs/base/common/uri';
import {TPromise} from 'vs/base/common/winjs.base';
import timer = require('vs/base/common/timer');
import paths = require('vs/base/common/paths');
import {Action} from 'vs/base/common/actions';
import {IWindowService} from 'vs/workbench/services/window/electron-browser/windowService';
import {IWorkbenchEditorService} from 'vs/workbench/services/editor/common/editorService';
import {EditorInput} from 'vs/workbench/common/editor';
import {isMacintosh} from 'vs/base/common/platform';
import {DiffEditorInput} from 'vs/workbench/common/editor/diffEditorInput';
import nls = require('vs/nls');
import {IMessageService, Severity} from 'vs/platform/message/common/message';
import {IWindowConfiguration} from 'vs/workbench/electron-browser/window';
import {IWorkspaceContextService} from 'vs/platform/workspace/common/workspace';
import {IQuickOpenService, IPickOpenEntry} from 'vs/workbench/services/quickopen/common/quickOpenService';
import {KeyMod} from 'vs/base/common/keyCodes';
import {IConfigurationService} from 'vs/platform/configuration/common/configuration';
import {CommandsRegistry} from 'vs/platform/commands/common/commands';
import {ServicesAccessor} from 'vs/platform/instantiation/common/instantiation';
import * as browser from 'vs/base/browser/browser';

import {ipcRenderer as ipc, webFrame, remote} from 'electron';

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

	public run(): TPromise<any> {
		let activeEditor = this.editorService.getActiveEditor();
		if (activeEditor) {
			return this.editorService.closeEditor(activeEditor.position, activeEditor.input);
		}

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
	public static LABEL = nls.localize('zoomIn', "Zoom In");

	constructor(id: string, label: string) {
		super(id, label);
	}

	public run(): TPromise<boolean> {
		webFrame.setZoomLevel(webFrame.getZoomLevel() + 1);
		browser.setZoomLevel(webFrame.getZoomLevel()); // Ensure others can listen to zoom level changes

		return TPromise.as(true);
	}
}

export class ZoomOutAction extends Action {

	public static ID = 'workbench.action.zoomOut';
	public static LABEL = nls.localize('zoomOut', "Zoom Out");

	constructor(
		id: string,
		label: string
	) {
		super(id, label);
	}

	public run(): TPromise<boolean> {
		webFrame.setZoomLevel(webFrame.getZoomLevel() - 1);
		browser.setZoomLevel(webFrame.getZoomLevel()); // Ensure others can listen to zoom level changes

		return TPromise.as(true);
	}
}

export class ZoomResetAction extends Action {

	public static ID = 'workbench.action.zoomReset';
	public static LABEL = nls.localize('zoomReset', "Reset Zoom");

	constructor(
		id: string,
		label: string,
		@IConfigurationService private configurationService: IConfigurationService
	) {
		super(id, label);
	}

	public run(): TPromise<boolean> {
		const level = this.getConfiguredZoomLevel();
		webFrame.setZoomLevel(level);
		browser.setZoomLevel(webFrame.getZoomLevel()); // Ensure others can listen to zoom level changes

		return TPromise.as(true);
	}

	private getConfiguredZoomLevel(): number {
		const windowConfig = this.configurationService.getConfiguration<IWindowConfiguration>();
		if (windowConfig.window && typeof windowConfig.window.zoomLevel === 'number') {
			return windowConfig.window.zoomLevel;
		}

		return 0; // default
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
		const recentFolders = this.contextService.getConfiguration().env.recentFolders;
		const recentFiles = this.contextService.getConfiguration().env.recentFiles;

		let folderPicks: IPickOpenEntry[] = recentFolders.map((p, index) => {
			return {
				label: paths.basename(p),
				description: paths.dirname(p),
				path: p,
				separator: index === 0 ? { label: nls.localize('folders', "folders") } : void 0,
				run: (context) => this.runPick(p, context)
			};
		});

		let filePicks: IPickOpenEntry[] = recentFiles.map((p, index) => {
			return {
				label: paths.basename(p),
				description: paths.dirname(p),
				path: p,
				separator: index === 0 ? { label: nls.localize('files', "files"), border: true } : void 0,
				run: (context) => this.runPick(p, context)
			};
		});

		const hasWorkspace = !!this.contextService.getWorkspace();

		return this.quickOpenService.pick(folderPicks.concat(...filePicks), {
			autoFocus: { autoFocusFirstEntry: !hasWorkspace, autoFocusSecondEntry: hasWorkspace },
			placeHolder: isMacintosh ? nls.localize('openRecentPlaceHolderMac', "Select a path (hold Cmd-key to open in new window)") : nls.localize('openRecentPlaceHolder', "Select a path to open (hold Ctrl-key to open in new window)"),
			matchOnDescription: true
		}).then(p => true);
	}

	private runPick(path, context): void {
		let newWindow = context.keymods.indexOf(KeyMod.CtrlCmd) >= 0;

		ipc.send('vscode:windowOpen', [path], newWindow);
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

// --- commands

CommandsRegistry.registerCommand('_workbench.ipc', function (accessor: ServicesAccessor, ipcMessage: string, ipcArgs: any[]) {
	if (ipcMessage && Array.isArray(ipcArgs)) {
		ipc.send(ipcMessage, ...ipcArgs);
	} else {
		ipc.send(ipcMessage);
	}
});

CommandsRegistry.registerCommand('_workbench.diff', function (accessor: ServicesAccessor, args: [URI, URI, string]) {

	const editorService = accessor.get(IWorkbenchEditorService);
	let [left, right, label] = args;

	if (!label) {
		label = nls.localize('diffLeftRightLabel', "{0} ⟷ {1}", left.toString(true), right.toString(true));
	}

	return TPromise.join([editorService.createInput({ resource: left }), editorService.createInput({ resource: right })]).then(inputs => {
		const [left, right] = inputs;

		const diff = new DiffEditorInput(label, undefined, <EditorInput>left, <EditorInput>right);
		return editorService.openEditor(diff);
	}).then(() => {
		return void 0;
	});
});

CommandsRegistry.registerCommand('_workbench.open', function (accessor: ServicesAccessor, args: [URI, number]) {

	const editorService = accessor.get(IWorkbenchEditorService);
	let [resource, column] = args;

	return editorService.openEditor({ resource }, column).then(() => {
		return void 0;
	});
});