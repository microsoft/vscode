/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/processExplorer.css';
import '../../../base/browser/ui/codicons/codiconStyles.js'; // make sure codicon css is loaded
import { localize } from '../../../nls.js';
import { $, append } from '../../../base/browser/dom.js';
import { createStyleSheet } from '../../../base/browser/domStylesheets.js';
import { IListVirtualDelegate } from '../../../base/browser/ui/list/list.js';
import { DataTree } from '../../../base/browser/ui/tree/dataTree.js';
import { IDataSource, ITreeNode, ITreeRenderer } from '../../../base/browser/ui/tree/tree.js';
import { RunOnceScheduler } from '../../../base/common/async.js';
import { ProcessItem } from '../../../base/common/processes.js';
import { IContextMenuItem } from '../../../base/parts/contextmenu/common/contextmenu.js';
import { popup } from '../../../base/parts/contextmenu/electron-sandbox/contextmenu.js';
import { ipcRenderer } from '../../../base/parts/sandbox/electron-sandbox/globals.js';
import { IRemoteDiagnosticError, isRemoteDiagnosticError } from '../../../platform/diagnostics/common/diagnostics.js';
import { ByteSize } from '../../../platform/files/common/files.js';
import { ElectronIPCMainProcessService } from '../../../platform/ipc/electron-sandbox/mainProcessService.js';
import { ProcessExplorerData, ProcessExplorerStyles, ProcessExplorerWindowConfiguration } from '../../../platform/process/common/process.js';
import { INativeHostService } from '../../../platform/native/common/native.js';
import { NativeHostService } from '../../../platform/native/common/nativeHostService.js';
import { getIconsStyleSheet } from '../../../platform/theme/browser/iconsStyleSheet.js';
import { applyZoom, zoomIn, zoomOut } from '../../../platform/window/electron-sandbox/window.js';
import { StandardKeyboardEvent } from '../../../base/browser/keyboardEvent.js';
import { KeyCode } from '../../../base/common/keyCodes.js';
import { mainWindow } from '../../../base/browser/window.js';

const DEBUG_FLAGS_PATTERN = /\s--inspect(?:-brk|port)?=(?<port>\d+)?/;
const DEBUG_PORT_PATTERN = /\s--inspect-port=(?<port>\d+)/;

class ProcessListDelegate implements IListVirtualDelegate<MachineProcessInformation | ProcessItem | IRemoteDiagnosticError> {
	getHeight(element: MachineProcessInformation | ProcessItem | IRemoteDiagnosticError) {
		return 22;
	}

	getTemplateId(element: ProcessInformation | MachineProcessInformation | ProcessItem | IRemoteDiagnosticError) {
		if (isProcessItem(element)) {
			return 'process';
		}

		if (isMachineProcessInformation(element)) {
			return 'machine';
		}

		if (isRemoteDiagnosticError(element)) {
			return 'error';
		}

		if (isProcessInformation(element)) {
			return 'header';
		}

		return '';
	}
}

interface IProcessItemTemplateData extends IProcessRowTemplateData {
	readonly CPU: HTMLElement;
	readonly memory: HTMLElement;
	readonly PID: HTMLElement;
}

interface IProcessRowTemplateData {
	readonly name: HTMLElement;
}

class ProcessTreeDataSource implements IDataSource<ProcessTree, ProcessInformation | MachineProcessInformation | ProcessItem | IRemoteDiagnosticError> {
	hasChildren(element: ProcessTree | ProcessInformation | MachineProcessInformation | ProcessItem | IRemoteDiagnosticError): boolean {
		if (isRemoteDiagnosticError(element)) {
			return false;
		}

		if (isProcessItem(element)) {
			return !!element.children?.length;
		} else {
			return true;
		}
	}

	getChildren(element: ProcessTree | ProcessInformation | MachineProcessInformation | ProcessItem | IRemoteDiagnosticError) {
		if (isProcessItem(element)) {
			return element.children ? element.children : [];
		}

		if (isRemoteDiagnosticError(element)) {
			return [];
		}

		if (isProcessInformation(element)) {
			// If there are multiple process roots, return these, otherwise go directly to the root process
			if (element.processRoots.length > 1) {
				return element.processRoots;
			} else {
				return [element.processRoots[0].rootProcess];
			}
		}

		if (isMachineProcessInformation(element)) {
			return [element.rootProcess];
		}

		return [element.processes];
	}
}

class ProcessHeaderTreeRenderer implements ITreeRenderer<ProcessInformation, void, IProcessItemTemplateData> {
	templateId: string = 'header';

	renderTemplate(container: HTMLElement): IProcessItemTemplateData {
		const row = append(container, $('.row'));
		const name = append(row, $('.nameLabel'));
		const CPU = append(row, $('.cpu'));
		const memory = append(row, $('.memory'));
		const PID = append(row, $('.pid'));
		return { name, CPU, memory, PID };
	}

	renderElement(node: ITreeNode<ProcessInformation, void>, index: number, templateData: IProcessItemTemplateData, height: number | undefined): void {
		templateData.name.textContent = localize('name', "Process Name");
		templateData.CPU.textContent = localize('cpu', "CPU (%)");
		templateData.PID.textContent = localize('pid', "PID");
		templateData.memory.textContent = localize('memory', "Memory (MB)");

	}

	disposeTemplate(templateData: any): void {
		// Nothing to do
	}
}

class MachineRenderer implements ITreeRenderer<MachineProcessInformation, void, IProcessRowTemplateData> {
	templateId: string = 'machine';
	renderTemplate(container: HTMLElement): IProcessRowTemplateData {
		const data = Object.create(null);
		const row = append(container, $('.row'));
		data.name = append(row, $('.nameLabel'));
		return data;
	}
	renderElement(node: ITreeNode<MachineProcessInformation, void>, index: number, templateData: IProcessRowTemplateData, height: number | undefined): void {
		templateData.name.textContent = node.element.name;
	}
	disposeTemplate(templateData: IProcessRowTemplateData): void {
		// Nothing to do
	}
}

class ErrorRenderer implements ITreeRenderer<IRemoteDiagnosticError, void, IProcessRowTemplateData> {
	templateId: string = 'error';
	renderTemplate(container: HTMLElement): IProcessRowTemplateData {
		const data = Object.create(null);
		const row = append(container, $('.row'));
		data.name = append(row, $('.nameLabel'));
		return data;
	}
	renderElement(node: ITreeNode<IRemoteDiagnosticError, void>, index: number, templateData: IProcessRowTemplateData, height: number | undefined): void {
		templateData.name.textContent = node.element.errorMessage;
	}
	disposeTemplate(templateData: IProcessRowTemplateData): void {
		// Nothing to do
	}
}


class ProcessRenderer implements ITreeRenderer<ProcessItem, void, IProcessItemTemplateData> {
	constructor(private platform: string, private totalMem: number, private mapPidToName: Map<number, string>) { }

	templateId: string = 'process';
	renderTemplate(container: HTMLElement): IProcessItemTemplateData {
		const row = append(container, $('.row'));

		const name = append(row, $('.nameLabel'));
		const CPU = append(row, $('.cpu'));
		const memory = append(row, $('.memory'));
		const PID = append(row, $('.pid'));

		return { name, CPU, PID, memory };
	}
	renderElement(node: ITreeNode<ProcessItem, void>, index: number, templateData: IProcessItemTemplateData, height: number | undefined): void {
		const { element } = node;

		const pid = element.pid.toFixed(0);

		let name = element.name;
		if (this.mapPidToName.has(element.pid)) {
			name = this.mapPidToName.get(element.pid)!;
		}

		templateData.name.textContent = name;
		templateData.name.title = element.cmd;

		templateData.CPU.textContent = element.load.toFixed(0);
		templateData.PID.textContent = pid;
		templateData.PID.parentElement!.id = `pid-${pid}`;

		const memory = this.platform === 'win32' ? element.mem : (this.totalMem * (element.mem / 100));
		templateData.memory.textContent = (memory / ByteSize.MB).toFixed(0);
	}

	disposeTemplate(templateData: IProcessItemTemplateData): void {
		// Nothing to do
	}
}

interface MachineProcessInformation {
	name: string;
	rootProcess: ProcessItem | IRemoteDiagnosticError;
}

interface ProcessInformation {
	processRoots: MachineProcessInformation[];
}

interface ProcessTree {
	processes: ProcessInformation;
}

function isMachineProcessInformation(item: any): item is MachineProcessInformation {
	return !!item.name && !!item.rootProcess;
}

function isProcessInformation(item: any): item is ProcessInformation {
	return !!item.processRoots;
}

function isProcessItem(item: any): item is ProcessItem {
	return !!item.pid;
}

class ProcessExplorer {
	private lastRequestTime: number;

	private mapPidToName = new Map<number, string>();

	private nativeHostService: INativeHostService;

	private tree: DataTree<any, ProcessTree | MachineProcessInformation | ProcessItem | ProcessInformation | IRemoteDiagnosticError, any> | undefined;

	constructor(windowId: number, private data: ProcessExplorerData) {
		const mainProcessService = new ElectronIPCMainProcessService(windowId);
		this.nativeHostService = new NativeHostService(windowId, mainProcessService) as INativeHostService;

		this.applyStyles(data.styles);
		this.setEventHandlers(data);

		ipcRenderer.on('vscode:pidToNameResponse', (event: unknown, pidToNames: [number, string][]) => {
			this.mapPidToName.clear();

			for (const [pid, name] of pidToNames) {
				this.mapPidToName.set(pid, name);
			}
		});

		ipcRenderer.on('vscode:listProcessesResponse', async (event: unknown, processRoots: MachineProcessInformation[]) => {
			processRoots.forEach((info, index) => {
				if (isProcessItem(info.rootProcess)) {
					info.rootProcess.name = index === 0 ? `${this.data.applicationName} main` : 'remote agent';
				}
			});

			if (!this.tree) {
				await this.createProcessTree(processRoots);
			} else {
				this.tree.setInput({ processes: { processRoots } });
				this.tree.layout(mainWindow.innerHeight, mainWindow.innerWidth);
			}

			this.requestProcessList(0);
		});

		this.lastRequestTime = Date.now();
		ipcRenderer.send('vscode:pidToNameRequest');
		ipcRenderer.send('vscode:listProcesses');
	}

	private setEventHandlers(data: ProcessExplorerData): void {
		mainWindow.document.onkeydown = (e: KeyboardEvent) => {
			const cmdOrCtrlKey = data.platform === 'darwin' ? e.metaKey : e.ctrlKey;

			// Cmd/Ctrl + w closes issue window
			if (cmdOrCtrlKey && e.keyCode === 87) {
				e.stopPropagation();
				e.preventDefault();

				ipcRenderer.send('vscode:closeProcessExplorer');
			}

			// Cmd/Ctrl + zooms in
			if (cmdOrCtrlKey && e.keyCode === 187) {
				zoomIn(mainWindow);
			}

			// Cmd/Ctrl - zooms out
			if (cmdOrCtrlKey && e.keyCode === 189) {
				zoomOut(mainWindow);
			}
		};
	}

	private async createProcessTree(processRoots: MachineProcessInformation[]): Promise<void> {
		const container = mainWindow.document.getElementById('process-list');
		if (!container) {
			return;
		}

		const { totalmem } = await this.nativeHostService.getOSStatistics();

		const renderers = [
			new ProcessRenderer(this.data.platform, totalmem, this.mapPidToName),
			new ProcessHeaderTreeRenderer(),
			new MachineRenderer(),
			new ErrorRenderer()
		];

		this.tree = new DataTree('processExplorer',
			container,
			new ProcessListDelegate(),
			renderers,
			new ProcessTreeDataSource(),
			{
				identityProvider: {
					getId: (element: ProcessTree | ProcessItem | MachineProcessInformation | ProcessInformation | IRemoteDiagnosticError) => {
						if (isProcessItem(element)) {
							return element.pid.toString();
						}

						if (isRemoteDiagnosticError(element)) {
							return element.hostName;
						}

						if (isProcessInformation(element)) {
							return 'processes';
						}

						if (isMachineProcessInformation(element)) {
							return element.name;
						}

						return 'header';
					}
				}
			});

		this.tree.setInput({ processes: { processRoots } });
		this.tree.layout(mainWindow.innerHeight, mainWindow.innerWidth);
		this.tree.onKeyDown(e => {
			const event = new StandardKeyboardEvent(e);
			if (event.keyCode === KeyCode.KeyE && event.altKey) {
				const selectionPids = this.getSelectedPids();
				void Promise.all(selectionPids.map((pid) => this.nativeHostService.killProcess(pid, 'SIGTERM'))).then(() => this.tree?.refresh());
			}
		});
		this.tree.onContextMenu(e => {
			if (isProcessItem(e.element)) {
				this.showContextMenu(e.element, true);
			}
		});

		container.style.height = `${mainWindow.innerHeight}px`;

		mainWindow.addEventListener('resize', () => {
			container.style.height = `${mainWindow.innerHeight}px`;
			this.tree?.layout(mainWindow.innerHeight, mainWindow.innerWidth);
		});
	}

	private isDebuggable(cmd: string): boolean {
		const matches = DEBUG_FLAGS_PATTERN.exec(cmd);
		return (matches && matches.groups!.port !== '0') || cmd.indexOf('node ') >= 0 || cmd.indexOf('node.exe') >= 0;
	}

	private attachTo(item: ProcessItem) {
		const config: any = {
			type: 'node',
			request: 'attach',
			name: `process ${item.pid}`
		};

		let matches = DEBUG_FLAGS_PATTERN.exec(item.cmd);
		if (matches) {
			config.port = Number(matches.groups!.port);
		} else {
			// no port -> try to attach via pid (send SIGUSR1)
			config.processId = String(item.pid);
		}

		// a debug-port=n or inspect-port=n overrides the port
		matches = DEBUG_PORT_PATTERN.exec(item.cmd);
		if (matches) {
			// override port
			config.port = Number(matches.groups!.port);
		}

		ipcRenderer.send('vscode:workbenchCommand', { id: 'debug.startFromConfig', from: 'processExplorer', args: [config] });
	}

	private applyStyles(styles: ProcessExplorerStyles): void {
		const styleElement = createStyleSheet();
		const content: string[] = [];

		if (styles.listFocusBackground) {
			content.push(`.monaco-list:focus .monaco-list-row.focused { background-color: ${styles.listFocusBackground}; }`);
			content.push(`.monaco-list:focus .monaco-list-row.focused:hover { background-color: ${styles.listFocusBackground}; }`);
		}

		if (styles.listFocusForeground) {
			content.push(`.monaco-list:focus .monaco-list-row.focused { color: ${styles.listFocusForeground}; }`);
		}

		if (styles.listActiveSelectionBackground) {
			content.push(`.monaco-list:focus .monaco-list-row.selected { background-color: ${styles.listActiveSelectionBackground}; }`);
			content.push(`.monaco-list:focus .monaco-list-row.selected:hover { background-color: ${styles.listActiveSelectionBackground}; }`);
		}

		if (styles.listActiveSelectionForeground) {
			content.push(`.monaco-list:focus .monaco-list-row.selected { color: ${styles.listActiveSelectionForeground}; }`);
		}

		if (styles.listHoverBackground) {
			content.push(`.monaco-list-row:hover:not(.selected):not(.focused) { background-color: ${styles.listHoverBackground}; }`);
		}

		if (styles.listHoverForeground) {
			content.push(`.monaco-list-row:hover:not(.selected):not(.focused) { color: ${styles.listHoverForeground}; }`);
		}

		if (styles.listFocusOutline) {
			content.push(`.monaco-list:focus .monaco-list-row.focused { outline: 1px solid ${styles.listFocusOutline}; outline-offset: -1px; }`);
		}

		if (styles.listHoverOutline) {
			content.push(`.monaco-list-row:hover { outline: 1px dashed ${styles.listHoverOutline}; outline-offset: -1px; }`);
		}

		// Scrollbars
		if (styles.scrollbarShadowColor) {
			content.push(`
				.monaco-scrollable-element > .shadow.top {
					box-shadow: ${styles.scrollbarShadowColor} 0 6px 6px -6px inset;
				}

				.monaco-scrollable-element > .shadow.left {
					box-shadow: ${styles.scrollbarShadowColor} 6px 0 6px -6px inset;
				}

				.monaco-scrollable-element > .shadow.top.left {
					box-shadow: ${styles.scrollbarShadowColor} 6px 6px 6px -6px inset;
				}
			`);
		}

		if (styles.scrollbarSliderBackgroundColor) {
			content.push(`
				.monaco-scrollable-element > .scrollbar > .slider {
					background: ${styles.scrollbarSliderBackgroundColor};
				}
			`);
		}

		if (styles.scrollbarSliderHoverBackgroundColor) {
			content.push(`
				.monaco-scrollable-element > .scrollbar > .slider:hover {
					background: ${styles.scrollbarSliderHoverBackgroundColor};
				}
			`);
		}

		if (styles.scrollbarSliderActiveBackgroundColor) {
			content.push(`
				.monaco-scrollable-element > .scrollbar > .slider.active {
					background: ${styles.scrollbarSliderActiveBackgroundColor};
				}
			`);
		}

		styleElement.textContent = content.join('\n');

		if (styles.color) {
			mainWindow.document.body.style.color = styles.color;
		}
	}

	private showContextMenu(item: ProcessItem, isLocal: boolean) {
		const items: IContextMenuItem[] = [];
		const pid = Number(item.pid);

		if (isLocal) {
			items.push({
				accelerator: 'Alt+E',
				label: localize('killProcess', "Kill Process"),
				click: () => {
					this.nativeHostService.killProcess(pid, 'SIGTERM');
				}
			});

			items.push({
				label: localize('forceKillProcess', "Force Kill Process"),
				click: () => {
					this.nativeHostService.killProcess(pid, 'SIGKILL');
				}
			});

			items.push({
				type: 'separator'
			});
		}

		items.push({
			label: localize('copy', "Copy"),
			click: () => {
				// Collect the selected pids
				const selectionPids = this.getSelectedPids();
				// If the selection does not contain the right clicked item, copy the right clicked
				// item only.
				if (!selectionPids?.includes(pid)) {
					selectionPids.length = 0;
					selectionPids.push(pid);
				}
				const rows = selectionPids?.map(e => mainWindow.document.getElementById(`pid-${e}`)).filter(e => !!e) as HTMLElement[];
				if (rows) {
					const text = rows.map(e => e.innerText).filter(e => !!e) as string[];
					this.nativeHostService.writeClipboardText(text.join('\n'));
				}
			}
		});

		items.push({
			label: localize('copyAll', "Copy All"),
			click: () => {
				const processList = mainWindow.document.getElementById('process-list');
				if (processList) {
					this.nativeHostService.writeClipboardText(processList.innerText);
				}
			}
		});

		if (item && isLocal && this.isDebuggable(item.cmd)) {
			items.push({
				type: 'separator'
			});

			items.push({
				label: localize('debug', "Debug"),
				click: () => {
					this.attachTo(item);
				}
			});
		}

		popup(items);
	}

	private requestProcessList(totalWaitTime: number): void {
		setTimeout(() => {
			const nextRequestTime = Date.now();
			const waited = totalWaitTime + nextRequestTime - this.lastRequestTime;
			this.lastRequestTime = nextRequestTime;

			// Wait at least a second between requests.
			if (waited > 1000) {
				ipcRenderer.send('vscode:pidToNameRequest');
				ipcRenderer.send('vscode:listProcesses');
			} else {
				this.requestProcessList(waited);
			}
		}, 200);
	}

	private getSelectedPids() {
		return this.tree?.getSelection()?.map(e => {
			if (!e || !('pid' in e)) {
				return undefined;
			}
			return e.pid;
		}).filter(e => !!e) as number[];
	}
}

function createCodiconStyleSheet() {
	const codiconStyleSheet = createStyleSheet();
	codiconStyleSheet.id = 'codiconStyles';

	const iconsStyleSheet = getIconsStyleSheet(undefined);
	function updateAll() {
		codiconStyleSheet.textContent = iconsStyleSheet.getCSS();
	}

	const delayer = new RunOnceScheduler(updateAll, 0);
	iconsStyleSheet.onDidChange(() => delayer.schedule());
	delayer.schedule();
}

export interface IProcessExplorerMain {
	startup(configuration: ProcessExplorerWindowConfiguration): void;
}

export function startup(configuration: ProcessExplorerWindowConfiguration): void {
	const platformClass = configuration.data.platform === 'win32' ? 'windows' : configuration.data.platform === 'linux' ? 'linux' : 'mac';
	mainWindow.document.body.classList.add(platformClass); // used by our fonts
	createCodiconStyleSheet();
	applyZoom(configuration.data.zoomLevel, mainWindow);

	new ProcessExplorer(configuration.windowId, configuration.data);
}
