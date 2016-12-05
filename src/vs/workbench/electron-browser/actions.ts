/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import URI from 'vs/base/common/uri';
import { TPromise } from 'vs/base/common/winjs.base';
import { Action } from 'vs/base/common/actions';
import { IWindowIPCService } from 'vs/workbench/services/window/electron-browser/windowService';
import { IWindowService, IWindowsService } from 'vs/platform/windows/common/windows';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { EditorInput } from 'vs/workbench/common/editor';
import { DiffEditorInput } from 'vs/workbench/common/editor/diffEditorInput';
import nls = require('vs/nls');
import product from 'vs/platform/product';
import pkg from 'vs/platform/package';
import errors = require('vs/base/common/errors');
import { IMessageService, Severity } from 'vs/platform/message/common/message';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IConfigurationEditingService, ConfigurationTarget } from 'vs/workbench/services/configuration/common/configurationEditing';
import { IExtensionManagementService, LocalExtensionType, ILocalExtension } from 'vs/platform/extensionManagement/common/extensionManagement';
import { IWorkspaceConfigurationService } from 'vs/workbench/services/configuration/common/configuration';
import { CommandsRegistry } from 'vs/platform/commands/common/commands';
import paths = require('vs/base/common/paths');
import { isMacintosh, isLinux } from 'vs/base/common/platform';
import { IQuickOpenService, IFilePickOpenEntry, ISeparator } from 'vs/workbench/services/quickopen/common/quickOpenService';
import { KeyMod } from 'vs/base/common/keyCodes';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import * as browser from 'vs/base/browser/browser';
import { IIntegrityService } from 'vs/platform/integrity/common/integrity';
import { IStartupFingerprint } from 'vs/workbench/electron-browser/common';
import { IEntryRunContext } from 'vs/base/parts/quickopen/common/quickOpen';

import * as os from 'os';
import { webFrame } from 'electron';

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

	constructor(id: string, label: string, @IWindowIPCService private windowService: IWindowIPCService) {
		super(id, label);
	}

	public run(): TPromise<boolean> {
		this.windowService.getWindow().close();

		return TPromise.as(true);
	}
}

export class SwitchWindow extends Action {

	static ID = 'workbench.action.switchWindow';
	static LABEL = nls.localize('switchWindow', "Switch Window");

	constructor(
		id: string,
		label: string,
		@IWindowsService private windowsService: IWindowsService,
		@IWindowService private windowService: IWindowService,
		@IQuickOpenService private quickOpenService: IQuickOpenService
	) {
		super(id, label);
	}

	run(): TPromise<void> {
		const currentWindowId = this.windowService.getCurrentWindowId();

		return this.windowsService.getWindows().then(workspaces => {
			const placeHolder = nls.localize('switchWindowPlaceHolder', "Select a window");
			const picks = workspaces.map(w => ({
				label: w.title,
				description: (currentWindowId === w.id) ? nls.localize('current', "Current Window") : void 0,
				run: () => this.windowsService.showWindow(w.id)
			}));

			this.quickOpenService.pick(picks, { placeHolder });
		});
	}
}

export class CloseFolderAction extends Action {

	static ID = 'workbench.action.closeFolder';
	static LABEL = nls.localize('closeFolder', "Close Folder");

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
		if (!this.contextService.getWorkspace()) {
			this.messageService.show(Severity.Info, nls.localize('noFolderOpened', "There is currently no folder opened in this instance to close."));
			return TPromise.as(null);
		}

		return this.windowService.closeFolder();
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

	constructor(id: string, label: string, @IWindowService private windowService: IWindowService) {
		super(id, label);
	}

	run(): TPromise<void> {
		return this.windowService.toggleMenuBar();
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

const timers = (<any>window).MonacoEnvironment.timers;

export class ShowStartupPerformance extends Action {

	public static ID = 'workbench.action.appPerf';
	public static LABEL = nls.localize('appPerf', "Startup Performance");

	constructor(
		id: string,
		label: string,
		@IWindowService private windowService: IWindowService,
		@IEnvironmentService private environmentService: IEnvironmentService
	) {
		super(id, label);
	}

	public run(): TPromise<boolean> {

		// Show dev tools
		this.windowService.openDevTools();

		// Print to console
		setTimeout(() => {
			(<any>console).group('Startup Performance Measurement');
			const fingerprint: IStartupFingerprint = timers.fingerprint;
			console.log(`OS: ${fingerprint.platform} (${fingerprint.release})`);
			console.log(`CPUs: ${fingerprint.cpus.model} (${fingerprint.cpus.count} x ${fingerprint.cpus.speed})`);
			console.log(`Memory (System): ${(fingerprint.totalmem / (1024 * 1024 * 1024)).toFixed(2)}GB (${(fingerprint.freemem / (1024 * 1024 * 1024)).toFixed(2)}GB free)`);
			console.log(`Memory (Process): ${(fingerprint.meminfo.workingSetSize / 1024).toFixed(2)}MB working set (${(fingerprint.meminfo.peakWorkingSetSize / 1024).toFixed(2)}MB peak, ${(fingerprint.meminfo.privateBytes / 1024).toFixed(2)}MB private, ${(fingerprint.meminfo.sharedBytes / 1024).toFixed(2)}MB shared)`);
			console.log(`Initial Startup: ${fingerprint.initialStartup}`);
			console.log(`Screen Reader Active: ${fingerprint.hasAccessibilitySupport}`);
			console.log(`Empty Workspace: ${fingerprint.emptyWorkbench}`);

			let nodeModuleLoadTime: number;
			let nodeModuleLoadDetails: any[];
			if (this.environmentService.performance) {
				const nodeModuleTimes = this.analyzeNodeModulesLoadTimes();
				nodeModuleLoadTime = nodeModuleTimes.duration;
				nodeModuleLoadDetails = nodeModuleTimes.table;
			}

			(<any>console).table(this.getFingerprintTable(nodeModuleLoadTime));

			if (nodeModuleLoadDetails) {
				(<any>console).groupCollapsed('node_modules Load Details');
				(<any>console).table(nodeModuleLoadDetails);
				(<any>console).groupEnd();
			}
			(<any>console).groupEnd();
		}, 1000);

		return TPromise.as(true);
	}

	private getFingerprintTable(nodeModuleLoadTime?: number): any[] {
		const table: any[] = [];
		const fingerprint: IStartupFingerprint = timers.fingerprint;

		if (fingerprint.initialStartup) {
			table.push({ Topic: '[main] start => window.loadUrl()', 'Took (ms)': fingerprint.timers.ellapsedWindowLoad });
		}

		table.push({ Topic: '[renderer] window.loadUrl() => begin to require(workbench.main.js)', 'Took (ms)': fingerprint.timers.ellapsedWindowLoadToRequire });
		table.push({ Topic: '[renderer] require(workbench.main.js)', 'Took (ms)': fingerprint.timers.ellapsedRequire });

		if (nodeModuleLoadTime) {
			table.push({ Topic: '[renderer] -> of which require() node_modules', 'Took (ms)': nodeModuleLoadTime });
		}

		table.push({ Topic: '[renderer] create extension host => extensions onReady()', 'Took (ms)': fingerprint.timers.ellapsedExtensions });
		table.push({ Topic: '[renderer] restore viewlet', 'Took (ms)': fingerprint.timers.ellapsedViewletRestore });
		table.push({ Topic: '[renderer] restore editor view state', 'Took (ms)': fingerprint.timers.ellapsedEditorRestore });
		table.push({ Topic: '[renderer] overall workbench load', 'Took (ms)': fingerprint.timers.ellapsedWorkbench });
		table.push({ Topic: '------------------------------------------------------' });
		table.push({ Topic: '[main, renderer] start => extensions ready', 'Took (ms)': fingerprint.timers.ellapsedExtensionsReady });
		table.push({ Topic: '[main, renderer] start => workbench ready', 'Took (ms)': fingerprint.ellapsed });

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

export class OpenRecentAction extends Action {

	public static ID = 'workbench.action.openRecent';
	public static LABEL = nls.localize('openRecent', "Open Recent");

	constructor(
		id: string,
		label: string,
		@IWindowsService private windowsService: IWindowsService,
		@IWindowService private windowService: IWindowService,
		@IQuickOpenService private quickOpenService: IQuickOpenService,
		@IWorkspaceContextService private contextService: IWorkspaceContextService
	) {
		super(id, label);
	}

	public run(): TPromise<void> {
		return this.windowService.getRecentlyOpen()
			.then(({ files, folders }) => this.openRecent(files, folders));
	}

	private openRecent(recentFiles: string[], recentFolders: string[]): void {
		function toPick(path: string, separator: ISeparator, isFolder: boolean): IFilePickOpenEntry {
			return {
				resource: URI.file(path),
				isFolder,
				label: paths.basename(path),
				description: paths.dirname(path),
				separator,
				run: context => runPick(path, context)
			};
		}

		const runPick = (path: string, context: IEntryRunContext) => {
			const newWindow = context.keymods.indexOf(KeyMod.CtrlCmd) >= 0;
			this.windowsService.windowOpen([path], newWindow);
		};

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
		@IIntegrityService private integrityService: IIntegrityService,
		@IExtensionManagementService private extensionManagementService: IExtensionManagementService
	) {
		super(id, label);
	}

	public run(): TPromise<boolean> {
		return this.integrityService.isPure().then(res => {
			return this.extensionManagementService.getInstalled(LocalExtensionType.User).then(extensions => {
				const issueUrl = this.generateNewIssueUrl(product.reportIssueUrl, pkg.name, pkg.version, product.commit, product.date, res.isPure, extensions);

				window.open(issueUrl);

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

// --- commands

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
