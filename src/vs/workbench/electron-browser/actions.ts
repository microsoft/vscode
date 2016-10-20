/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import URI from 'vs/base/common/uri';
import { TPromise } from 'vs/base/common/winjs.base';
import timer = require('vs/base/common/timer');
import { Action } from 'vs/base/common/actions';
import { IWindowService } from 'vs/workbench/services/window/electron-browser/windowService';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { EditorInput } from 'vs/workbench/common/editor';
import { DiffEditorInput } from 'vs/workbench/common/editor/diffEditorInput';
import nls = require('vs/nls');
import product from 'vs/platform/product';
import pkg from 'vs/platform/package';
import errors = require('vs/base/common/errors');
import { IMessageService, Severity } from 'vs/platform/message/common/message';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { IPartService } from 'vs/workbench/services/part/common/partService';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IConfigurationEditingService, ConfigurationTarget } from 'vs/workbench/services/configuration/common/configurationEditing';
import { IExtensionManagementService, LocalExtensionType, ILocalExtension } from 'vs/platform/extensionManagement/common/extensionManagement';
import { IWorkspaceConfigurationService } from 'vs/workbench/services/configuration/common/configuration';
import { CommandsRegistry } from 'vs/platform/commands/common/commands';
import paths = require('vs/base/common/paths');
import { isMacintosh } from 'vs/base/common/platform';
import { IQuickOpenService, IPickOpenEntry, IFilePickOpenEntry, ISeparator } from 'vs/workbench/services/quickopen/common/quickOpenService';
import { KeyMod } from 'vs/base/common/keyCodes';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import * as browser from 'vs/base/browser/browser';
import { IIntegrityService } from 'vs/platform/integrity/common/integrity';

import * as os from 'os';
import { ipcRenderer as ipc, webFrame, remote, shell } from 'electron';

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
		const activeEditor = this.editorService.getActiveEditor();
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

export class SwitchWindow extends Action {

	public static ID = 'workbench.action.switchWindow';
	public static LABEL = nls.localize('switchWindow', "Switch Window");

	constructor(
		id: string,
		label: string,
		@IWindowService private windowService: IWindowService,
		@IQuickOpenService private quickOpenService: IQuickOpenService
	) {
		super(id, label);
	}

	public run(): TPromise<boolean> {
		const id = this.windowService.getWindowId();
		ipc.send('vscode:switchWindow', id);
		ipc.once('vscode:switchWindow', (event, workspaces) => {
			const picks: IPickOpenEntry[] = workspaces.map(w => {
				return {
					label: w.title,
					description: (id === w.id) ? nls.localize('current', "Current Window") : void 0,
					run: () => {
						ipc.send('vscode:showWindow', w.id);
					}
				};
			});
			this.quickOpenService.pick(picks, { placeHolder: nls.localize('switchWindowPlaceHolder', "Select a window") });
		});

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

export abstract class BaseZoomAction extends Action {
	private static SETTING_KEY = 'window.zoomLevel';

	constructor(
		id: string,
		label: string,
		@IMessageService private messageService: IMessageService,
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

		const applyZoom = () => {
			webFrame.setZoomLevel(level);
			browser.setZoomLevel(level); // Ensure others can listen to zoom level changes
		};

		this.configurationEditingService.writeConfiguration(target, { key: BaseZoomAction.SETTING_KEY, value: level }).done(() => applyZoom(), error => applyZoom());
	}
}

export class ZoomInAction extends BaseZoomAction {

	public static ID = 'workbench.action.zoomIn';
	public static LABEL = nls.localize('zoomIn', "Zoom In");

	constructor(
		id: string,
		label: string,
		@IMessageService messageService: IMessageService,
		@IWorkspaceConfigurationService configurationService: IWorkspaceConfigurationService,
		@IConfigurationEditingService configurationEditingService: IConfigurationEditingService
	) {
		super(id, label, messageService, configurationService, configurationEditingService);
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
		@IMessageService messageService: IMessageService,
		@IWorkspaceConfigurationService configurationService: IWorkspaceConfigurationService,
		@IConfigurationEditingService configurationEditingService: IConfigurationEditingService
	) {
		super(id, label, messageService, configurationService, configurationEditingService);
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
		@IMessageService messageService: IMessageService,
		@IWorkspaceConfigurationService configurationService: IWorkspaceConfigurationService,
		@IConfigurationEditingService configurationEditingService: IConfigurationEditingService
	) {
		super(id, label, messageService, configurationService, configurationEditingService);
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
		@IEnvironmentService environmentService: IEnvironmentService
	) {
		super(id, label);

		this.enabled = environmentService.performance;
	}

	private _analyzeLoaderTimes(): any[] {
		const stats = <ILoaderEvent[]>(<any>require).getStats();
		const result = [];

		let total = 0;

		for (let i = 0, len = stats.length; i < len; i++) {
			if (stats[i].type === LoaderEventType.NodeEndNativeRequire) {
				if (stats[i - 1].type === LoaderEventType.NodeBeginNativeRequire && stats[i - 1].detail === stats[i].detail) {
					const entry: any = {};
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
			const entry: any = {};
			entry['Event'] = '===nodeRequire TOTAL';
			entry['Took (ms)'] = total;
			entry['Start (ms)'] = '**';
			entry['End (ms)'] = '**';
			result.push(entry);
		}

		return result;
	}

	public run(): TPromise<boolean> {
		const table: any[] = [];
		table.push(...this._analyzeLoaderTimes());

		const start = Math.round(remote.getGlobal('vscodeStart'));
		const windowShowTime = Math.round(remote.getGlobal('windowShow'));

		let lastEvent: timer.ITimerEvent;
		const events = timer.getTimeKeeper().getCollectedEvents();
		events.forEach((e) => {
			if (e.topic === 'Startup') {
				lastEvent = e;
				const entry: any = {};

				entry['Event'] = e.name;
				entry['Took (ms)'] = e.stopTime.getTime() - e.startTime.getTime();
				entry['Start (ms)'] = Math.max(e.startTime.getTime() - start, 0);
				entry['End (ms)'] = e.stopTime.getTime() - start;

				table.push(entry);
			}
		});

		table.push({ Event: '---------------------------' });

		const windowShowEvent: any = {};
		windowShowEvent['Event'] = 'Show Window at';
		windowShowEvent['Start (ms)'] = windowShowTime - start;
		table.push(windowShowEvent);

		const sum: any = {};
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

	constructor(
		id: string,
		label: string,
		@IWindowService private windowService: IWindowService,
		@IPartService private partService: IPartService
	) {
		super(id, label);
	}

	public run(): TPromise<boolean> {
		this.partService.setRestoreSidebar(); // we want the same sidebar after a reload restored
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
		@IWindowService private windowService: IWindowService,
		@IQuickOpenService private quickOpenService: IQuickOpenService,
		@IWorkspaceContextService private contextService: IWorkspaceContextService
	) {
		super(id, label);
	}

	public run(): TPromise<boolean> {
		ipc.send('vscode:openRecent', this.windowService.getWindowId());

		return new TPromise<boolean>((c, e, p) => {
			ipc.once('vscode:openRecent', (event, files: string[], folders: string[]) => {
				this.openRecent(files, folders);

				c(true);
			});
		});
	}

	private openRecent(recentFiles: string[], recentFolders: string[]): void {
		function toPick(path: string, separator: ISeparator, isFolder: boolean): IFilePickOpenEntry {
			return {
				resource: URI.file(path),
				isFolder,
				label: paths.basename(path),
				description: paths.dirname(path),
				separator,
				run: (context) => runPick(path, context)
			};
		}

		function runPick(path: string, context): void {
			const newWindow = context.keymods.indexOf(KeyMod.CtrlCmd) >= 0;

			ipc.send('vscode:windowOpen', [path], newWindow);
		}

		const folderPicks: IFilePickOpenEntry[] = recentFolders.map((p, index) => toPick(p, index === 0 ? { label: nls.localize('folders', "folders") } : void 0, true));
		const filePicks: IFilePickOpenEntry[] = recentFiles.map((p, index) => toPick(p, index === 0 ? { label: nls.localize('files', "files"), border: true } : void 0, false));

		const hasWorkspace = !!this.contextService.getWorkspace();

		this.quickOpenService.pick(folderPicks.concat(...filePicks), {
			autoFocus: { autoFocusFirstEntry: !hasWorkspace, autoFocusSecondEntry: hasWorkspace },
			placeHolder: isMacintosh ? nls.localize('openRecentPlaceHolderMac', "Select a path (hold Cmd-key to open in new window)") : nls.localize('openRecentPlaceHolder', "Select a path to open (hold Ctrl-key to open in new window)"),
			matchOnDescription: true
		}).done(null, errors.onUnexpectedError);
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
		@IMessageService private messageService: IMessageService,
		@IIntegrityService private integrityService: IIntegrityService,
		@IExtensionManagementService private extensionManagementService: IExtensionManagementService,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService
	) {
		super(id, label);
	}

	public run(): TPromise<boolean> {
		return this.integrityService.isPure().then(res => {
			return this.extensionManagementService.getInstalled(LocalExtensionType.User).then(extensions => {
				const issueUrl = this.generateNewIssueUrl(product.reportIssueUrl, pkg.name, pkg.version, product.commit, product.date, res.isPure, extensions);

				shell.openExternal(issueUrl);

				return TPromise.as(true);
			});
		});
	}

	private generateNewIssueUrl(baseUrl: string, name: string, version: string, commit: string, date: string, isPure: boolean, extensions: ILocalExtension[]): string {
		// Avoid backticks, these can trigger XSS detectors. (https://github.com/Microsoft/vscode/issues/13098)
		const osVersion = `${os.type()} ${os.arch()} ${os.release()}`;
		const queryStringPrefix = baseUrl.indexOf('?') === -1 ? '?' : '&';
		const body = encodeURIComponent(
			`- VSCode Version: ${name} ${version}${isPure ? '' : ' **[Unsupported]**'} (${product.commit || 'Commit unknown'}, ${product.date || 'Date unknown'})
- OS Version: ${osVersion}
- Extensions:

${this.generateExtensionTable(extensions)}

---

Steps to Reproduce:

1.
2.`
		);

		return `${baseUrl}${queryStringPrefix}body=${body}`;
	}

	private generateExtensionTable(extensions: ILocalExtension[]): string {
		let tableHeader = `|Extension|Author|Version|
|---|---|---|`;
		const table = extensions.map(e => {
			return `|${e.manifest.name}|${e.manifest.publisher}|${e.manifest.version}|`;
		}).join('\n');

		return tableHeader + '\n' + table;
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

		const diff = new DiffEditorInput(label, void 0, <EditorInput>left, <EditorInput>right);
		return editorService.openEditor(diff);
	}).then(() => {
		return void 0;
	});
});

CommandsRegistry.registerCommand('_workbench.open', function (accessor: ServicesAccessor, args: [URI, number]) {
	const editorService = accessor.get(IWorkbenchEditorService);
	const [resource, column] = args;

	return editorService.openEditor({ resource }, column).then(() => {
		return void 0;
	});
});
