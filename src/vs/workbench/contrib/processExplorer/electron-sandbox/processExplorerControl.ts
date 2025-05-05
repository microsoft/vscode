/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/processExplorer.css';
import { localize } from '../../../../nls.js';
import { ipcRenderer } from '../../../../base/parts/sandbox/electron-sandbox/globals.js';
import { INativeHostService } from '../../../../platform/native/common/native.js';
import { $, append, Dimension } from '../../../../base/browser/dom.js';
import { StandardKeyboardEvent } from '../../../../base/browser/keyboardEvent.js';
import { IIdentityProvider, IListVirtualDelegate } from '../../../../base/browser/ui/list/list.js';
import { IDataSource, ITreeRenderer, ITreeNode } from '../../../../base/browser/ui/tree/tree.js';
import { ProcessItem } from '../../../../base/common/processes.js';
import { IRemoteDiagnosticError, isRemoteDiagnosticError } from '../../../../platform/diagnostics/common/diagnostics.js';
import { ByteSize } from '../../../../platform/files/common/files.js';
import { KeyCode } from '../../../../base/common/keyCodes.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { WorkbenchDataTree } from '../../../../platform/list/browser/listService.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IListAccessibilityProvider } from '../../../../base/browser/ui/list/listWidget.js';
import { platform, PlatformToString } from '../../../../base/common/platform.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { IAction, Separator, toAction } from '../../../../base/common/actions.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';

const DEBUG_FLAGS_PATTERN = /\s--inspect(?:-brk|port)?=(?<port>\d+)?/;
const DEBUG_PORT_PATTERN = /\s--inspect-port=(?<port>\d+)/;

//#region --- process explorer tree

interface IProcessItemTemplateData extends IProcessRowTemplateData {
	readonly CPU: HTMLElement;
	readonly memory: HTMLElement;
	readonly PID: HTMLElement;
}

interface IProcessRowTemplateData {
	readonly name: HTMLElement;
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

function isMachineProcessInformation(item: unknown): item is MachineProcessInformation {
	const candidate = item as MachineProcessInformation | undefined;

	return !!candidate?.name && !!candidate?.rootProcess;
}

function isProcessInformation(item: unknown): item is ProcessInformation {
	const candidate = item as ProcessInformation | undefined;

	return !!candidate?.processRoots;
}

function isProcessItem(item: unknown): item is ProcessItem {
	const candidate = item as ProcessItem | undefined;

	return typeof candidate?.pid === 'number';
}

class ProcessListDelegate implements IListVirtualDelegate<MachineProcessInformation | ProcessItem | IRemoteDiagnosticError> {

	getHeight() {
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

class ProcessTreeDataSource implements IDataSource<ProcessTree, ProcessInformation | MachineProcessInformation | ProcessItem | IRemoteDiagnosticError> {

	hasChildren(element: ProcessTree | ProcessInformation | MachineProcessInformation | ProcessItem | IRemoteDiagnosticError): boolean {
		if (isRemoteDiagnosticError(element)) {
			return false;
		}

		if (isProcessItem(element)) {
			return !!element.children?.length;
		}

		return true;
	}

	getChildren(element: ProcessTree | ProcessInformation | MachineProcessInformation | ProcessItem | IRemoteDiagnosticError) {
		if (isProcessItem(element)) {
			return element.children ? element.children : [];
		}

		if (isRemoteDiagnosticError(element)) {
			return [];
		}

		if (isProcessInformation(element)) {
			if (element.processRoots.length > 1) {
				return element.processRoots; // If there are multiple process roots, return these, otherwise go directly to the root process
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

	readonly templateId: string = 'header';

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

	disposeTemplate(templateData: unknown): void {
		// Nothing to do
	}
}

class MachineRenderer implements ITreeRenderer<MachineProcessInformation, void, IProcessRowTemplateData> {

	readonly templateId: string = 'machine';

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

	readonly templateId: string = 'error';

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

	readonly templateId: string = 'process';

	constructor(private platform: string, private totalMem: number, private mapPidToName: Map<number, string>) { }

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

class ProcessAccessibilityProvider implements IListAccessibilityProvider<MachineProcessInformation | ProcessItem | IRemoteDiagnosticError> {

	getWidgetAriaLabel(): string {
		return localize('processExplorer', "Process Explorer");
	}

	getAriaLabel(element: MachineProcessInformation | ProcessItem | IRemoteDiagnosticError): string | null {
		if (isProcessItem(element)) {
			return element.name;
		}

		if (isMachineProcessInformation(element)) {
			return element.name;
		}

		if (isRemoteDiagnosticError(element)) {
			return element.hostName;
		}

		return null;
	}
}

class ProcessIdentityProvider implements IIdentityProvider<MachineProcessInformation | ProcessItem | IRemoteDiagnosticError> {

	getId(element: IRemoteDiagnosticError | ProcessItem | MachineProcessInformation): { toString(): string } {
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

//#endregion

export class ProcessExplorerControl extends Disposable {

	private lastRequestTime: number;

	private readonly mapPidToName = new Map<number, string>();
	private dimensions: Dimension | undefined = undefined;

	private tree: WorkbenchDataTree<any, ProcessTree | MachineProcessInformation | ProcessItem | ProcessInformation | IRemoteDiagnosticError, any> | undefined;

	constructor(
		container: HTMLElement,
		@INativeHostService private readonly nativeHostService: INativeHostService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IProductService private readonly productService: IProductService,
		@IContextMenuService private readonly contextMenuService: IContextMenuService
	) {
		super();

		ipcRenderer.on('vscode:pidToNameResponse', (event: unknown, pidToNames: [number, string][]) => {
			this.mapPidToName.clear();

			for (const [pid, name] of pidToNames) {
				this.mapPidToName.set(pid, name);
			}
		});

		ipcRenderer.on('vscode:listProcessesResponse', async (event: unknown, processRoots: MachineProcessInformation[]) => {
			processRoots.forEach((info, index) => {
				if (isProcessItem(info.rootProcess)) {
					info.rootProcess.name = index === 0 ? `${this.productService.applicationName} main` : 'remote agent';
				}
			});

			if (!this.tree) {
				await this.createProcessTree(container, processRoots);
			} else {
				this.tree.setInput({ processes: { processRoots } });
				this.layoutTree();
			}

			this.requestProcessList(0);
		});

		this.lastRequestTime = Date.now();
		ipcRenderer.send('vscode:pidToNameRequest');
		ipcRenderer.send('vscode:listProcesses');
	}

	private async createProcessTree(container: HTMLElement, processRoots: MachineProcessInformation[]): Promise<void> {
		container.classList.add('process-explorer');

		const { totalmem } = await this.nativeHostService.getOSStatistics();

		const renderers = [
			new ProcessRenderer(PlatformToString(platform), totalmem, this.mapPidToName),
			new ProcessHeaderTreeRenderer(),
			new MachineRenderer(),
			new ErrorRenderer()
		];

		this.tree = this._register(this.instantiationService.createInstance(
			WorkbenchDataTree<any, ProcessTree | MachineProcessInformation | ProcessItem | ProcessInformation | IRemoteDiagnosticError, any>,
			'processExplorer',
			container,
			new ProcessListDelegate(),
			renderers,
			new ProcessTreeDataSource(),
			{
				accessibilityProvider: new ProcessAccessibilityProvider(),
				identityProvider: new ProcessIdentityProvider()
			}));

		this.tree.setInput({ processes: { processRoots } });
		this.layoutTree();
		this.tree.onKeyDown(e => {
			const event = new StandardKeyboardEvent(e);
			if (event.keyCode === KeyCode.KeyE && event.altKey) {
				const selectionPids = this.getSelectedPids();
				void Promise.all(selectionPids.map((pid) => this.nativeHostService.killProcess(pid, 'SIGTERM'))).then(() => this.tree?.refresh());
			}
		});

		this._register(this.tree.onContextMenu(e => {
			if (!isProcessItem(e.element)) {
				return;
			}

			const item = e.element;

			const actions: IAction[] = [];
			const pid = Number(item.pid);

			actions.push(toAction({
				id: 'killProcess',
				label: localize('killProcess', "Kill Process"),
				run: () => {
					this.nativeHostService.killProcess(pid, 'SIGTERM');
				}
			}));

			actions.push(toAction({
				id: 'forceKillProcess',
				label: localize('forceKillProcess', "Force Kill Process"),
				run: () => {
					this.nativeHostService.killProcess(pid, 'SIGKILL');
				}
			}));

			actions.push(new Separator());

			actions.push(toAction({
				id: 'copy',
				label: localize('copy', "Copy"),
				run: () => {
					// Collect the selected pids
					const selectionPids = this.getSelectedPids();
					// If the selection does not contain the right clicked item, copy the right clicked
					// item only.
					if (!selectionPids?.includes(pid)) {
						selectionPids.length = 0;
						selectionPids.push(pid);
					}
					const rows = selectionPids?.map(e => window.document.getElementById(`pid-${e}`)).filter(e => !!e) as HTMLElement[];
					if (rows) {
						const text = rows.map(e => e.innerText).filter(e => !!e) as string[];
						this.nativeHostService.writeClipboardText(text.join('\n'));
					}
				}
			}));

			actions.push(toAction({
				id: 'copyAll',
				label: localize('copyAll', "Copy All"),
				run: () => {
					const processList = window.document.getElementById('process-list');
					if (processList) {
						this.nativeHostService.writeClipboardText(processList.innerText);
					}
				}
			}));

			if (this.isDebuggable(item.cmd)) {
				actions.push(new Separator());

				actions.push(toAction({
					id: 'debug',
					label: localize('debug', "Debug"),
					run: () => {
						this.attachTo(item);
					}
				}));
			}

			this.contextMenuService.showContextMenu({
				getAnchor: () => e.anchor,
				getActions: () => actions
			});
		}));
	}

	private isDebuggable(cmd: string): boolean {
		const matches = DEBUG_FLAGS_PATTERN.exec(cmd);

		return (matches && matches.groups!.port !== '0') || cmd.indexOf('node ') >= 0 || cmd.indexOf('node.exe') >= 0;
	}

	private attachTo(item: ProcessItem) {
		const config: {
			type: string;
			request: string;
			name: string;
			port?: number;
			processId?: string;
		} = {
			type: 'node',
			request: 'attach',
			name: `process ${item.pid}`
		};

		let matches = DEBUG_FLAGS_PATTERN.exec(item.cmd);
		if (matches) {
			config.port = Number(matches.groups!.port);
		} else {
			config.processId = String(item.pid); // no port -> try to attach via pid (send SIGUSR1)
		}

		// a debug-port=n or inspect-port=n overrides the port
		matches = DEBUG_PORT_PATTERN.exec(item.cmd);
		if (matches) {
			config.port = Number(matches.groups!.port); // override port
		}

		ipcRenderer.send('vscode:workbenchCommand', { id: 'debug.startFromConfig', from: 'processExplorer', args: [config] });
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

	layout(dimension: Dimension): void {
		this.dimensions = dimension;

		this.layoutTree();
	}

	private layoutTree(): void {
		if (this.dimensions && this.tree) {
			this.tree.layout(this.dimensions.height, this.dimensions.width);
		}
	}
}
