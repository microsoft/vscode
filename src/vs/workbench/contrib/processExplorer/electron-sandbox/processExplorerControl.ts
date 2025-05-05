/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/processExplorer.css';
import { localize } from '../../../../nls.js';
import { ipcRenderer } from '../../../../base/parts/sandbox/electron-sandbox/globals.js';
import { INativeHostService } from '../../../../platform/native/common/native.js';
import { $, append, Dimension, getDocument } from '../../../../base/browser/dom.js';
import { StandardKeyboardEvent } from '../../../../base/browser/keyboardEvent.js';
import { IIdentityProvider, IListVirtualDelegate } from '../../../../base/browser/ui/list/list.js';
import { IDataSource, ITreeRenderer, ITreeNode, ITreeContextMenuEvent } from '../../../../base/browser/ui/tree/tree.js';
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
import { coalesce } from '../../../../base/common/arrays.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';

const DEBUG_FLAGS_PATTERN = /\s--inspect(?:-brk|port)?=(?<port>\d+)?/;
const DEBUG_PORT_PATTERN = /\s--inspect-port=(?<port>\d+)/;

//#region --- process explorer tree

interface IProcessTree {
	readonly processes: IProcessInformation;
}

interface IProcessInformation {
	readonly processRoots: IMachineProcessInformation[];
}

interface IProcessRowTemplateData {
	readonly name: HTMLElement;
}

interface IProcessItemTemplateData extends IProcessRowTemplateData {
	readonly cpu: HTMLElement;
	readonly memory: HTMLElement;
	readonly pid: HTMLElement;
}

interface IMachineProcessInformation {
	readonly name: string;
	readonly rootProcess: ProcessItem | IRemoteDiagnosticError;
}

function isMachineProcessInformation(item: unknown): item is IMachineProcessInformation {
	const candidate = item as IMachineProcessInformation | undefined;

	return !!candidate?.name && !!candidate?.rootProcess;
}

function isProcessInformation(item: unknown): item is IProcessInformation {
	const candidate = item as IProcessInformation | undefined;

	return !!candidate?.processRoots;
}

function isProcessItem(item: unknown): item is ProcessItem {
	const candidate = item as ProcessItem | undefined;

	return typeof candidate?.pid === 'number';
}

class ProcessListDelegate implements IListVirtualDelegate<IMachineProcessInformation | ProcessItem | IRemoteDiagnosticError> {

	getHeight() {
		return 22;
	}

	getTemplateId(element: IProcessInformation | IMachineProcessInformation | ProcessItem | IRemoteDiagnosticError) {
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

class ProcessTreeDataSource implements IDataSource<IProcessTree, IProcessInformation | IMachineProcessInformation | ProcessItem | IRemoteDiagnosticError> {

	hasChildren(element: IProcessTree | IProcessInformation | IMachineProcessInformation | ProcessItem | IRemoteDiagnosticError): boolean {
		if (isRemoteDiagnosticError(element)) {
			return false;
		}

		if (isProcessItem(element)) {
			return !!element.children?.length;
		}

		return true;
	}

	getChildren(element: IProcessTree | IProcessInformation | IMachineProcessInformation | ProcessItem | IRemoteDiagnosticError) {
		if (isProcessItem(element)) {
			return element.children ?? [];
		}

		if (isRemoteDiagnosticError(element)) {
			return [];
		}

		if (isProcessInformation(element)) {
			if (element.processRoots.length > 1) {
				return element.processRoots; // If there are multiple process roots, return these, otherwise go directly to the root process
			}

			return [element.processRoots[0].rootProcess];
		}

		if (isMachineProcessInformation(element)) {
			return [element.rootProcess];
		}

		return [element.processes];
	}
}

class ProcessHeaderTreeRenderer implements ITreeRenderer<IProcessInformation, void, IProcessItemTemplateData> {

	readonly templateId: string = 'header';

	renderTemplate(container: HTMLElement): IProcessItemTemplateData {
		const row = append(container, $('.row.header'));
		const name = append(row, $('.cell.nameLabel'));
		const cpu = append(row, $('.cell.cpu'));
		const memory = append(row, $('.cell.memory'));
		const pid = append(row, $('.cell.pid'));

		return { name, cpu, memory, pid };
	}

	renderElement(node: ITreeNode<IProcessInformation, void>, index: number, templateData: IProcessItemTemplateData, height: number | undefined): void {
		templateData.name.textContent = localize('processName', "Process Name");
		templateData.cpu.textContent = localize('processCpu', "CPU (%)");
		templateData.pid.textContent = localize('processPid', "PID");
		templateData.memory.textContent = localize('processMemory', "Memory (MB)");
	}

	disposeTemplate(templateData: unknown): void {
		// Nothing to do
	}
}

class MachineRenderer implements ITreeRenderer<IMachineProcessInformation, void, IProcessRowTemplateData> {

	readonly templateId: string = 'machine';

	renderTemplate(container: HTMLElement): IProcessRowTemplateData {
		const row = append(container, $('.row'));
		const name = append(row, $('.nameLabel'));

		return { name };
	}

	renderElement(node: ITreeNode<IMachineProcessInformation, void>, index: number, templateData: IProcessRowTemplateData, height: number | undefined): void {
		templateData.name.textContent = node.element.name;
	}

	disposeTemplate(templateData: IProcessRowTemplateData): void {
		// Nothing to do
	}
}

class ErrorRenderer implements ITreeRenderer<IRemoteDiagnosticError, void, IProcessRowTemplateData> {

	readonly templateId: string = 'error';

	renderTemplate(container: HTMLElement): IProcessRowTemplateData {
		const row = append(container, $('.row'));
		const name = append(row, $('.nameLabel'));

		return { name };
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

		const name = append(row, $('.cell.nameLabel'));
		const cpu = append(row, $('.cell.cpu'));
		const memory = append(row, $('.cell.memory'));
		const pid = append(row, $('.cell.pid'));

		return { name, cpu, pid, memory };
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

		templateData.cpu.textContent = element.load.toFixed(0);
		templateData.pid.textContent = pid;
		templateData.pid.parentElement!.id = `pid-${pid}`;

		const memory = this.platform === 'win32' ? element.mem : (this.totalMem * (element.mem / 100));
		templateData.memory.textContent = (memory / ByteSize.MB).toFixed(0);
	}

	disposeTemplate(templateData: IProcessItemTemplateData): void {
		// Nothing to do
	}
}

class ProcessAccessibilityProvider implements IListAccessibilityProvider<IMachineProcessInformation | ProcessItem | IRemoteDiagnosticError> {

	getWidgetAriaLabel(): string {
		return localize('processExplorer', "Process Explorer");
	}

	getAriaLabel(element: IMachineProcessInformation | ProcessItem | IRemoteDiagnosticError): string | null {
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

class ProcessIdentityProvider implements IIdentityProvider<IMachineProcessInformation | ProcessItem | IRemoteDiagnosticError> {

	getId(element: IRemoteDiagnosticError | ProcessItem | IMachineProcessInformation): { toString(): string } {
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

	private lastRequestTime: number | undefined = undefined;

	private readonly mapPidToName = new Map<number, string>();
	private dimensions: Dimension | undefined = undefined;

	private tree: WorkbenchDataTree<IProcessTree, IProcessTree | IMachineProcessInformation | ProcessItem | IProcessInformation | IRemoteDiagnosticError> | undefined;

	constructor(
		container: HTMLElement,
		@INativeHostService private readonly nativeHostService: INativeHostService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IProductService private readonly productService: IProductService,
		@IContextMenuService private readonly contextMenuService: IContextMenuService,
		@ICommandService private readonly commandService: ICommandService
	) {
		super();

		this.init(container);
	}

	private init(container: HTMLElement): void {
		ipcRenderer.on('vscode:pidToNameResponse', (event: unknown, pidToNames: [number, string][]) => {
			this.mapPidToName.clear();

			for (const [pid, name] of pidToNames) {
				this.mapPidToName.set(pid, name);
			}
		});

		ipcRenderer.on('vscode:listProcessesResponse', async (event: unknown, processRoots: IMachineProcessInformation[]) => {
			processRoots.forEach((info, index) => {
				if (isProcessItem(info.rootProcess)) {
					info.rootProcess.name = index === 0 ? `${this.productService.applicationName} main` : 'remote agent';
				}
			});

			if (!this.tree) {
				const { totalmem } = await this.nativeHostService.getOSStatistics();
				this.createProcessTree(container, processRoots, totalmem);
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

	private createProcessTree(container: HTMLElement, processRoots: IMachineProcessInformation[], totalmem: number): void {
		container.classList.add('process-explorer');
		container.id = 'process-explorer';

		const renderers = [
			new ProcessRenderer(PlatformToString(platform), totalmem, this.mapPidToName),
			new ProcessHeaderTreeRenderer(),
			new MachineRenderer(),
			new ErrorRenderer()
		];

		this.tree = this._register(this.instantiationService.createInstance(
			WorkbenchDataTree<IProcessTree, IProcessTree | IMachineProcessInformation | ProcessItem | IProcessInformation | IRemoteDiagnosticError>,
			'processExplorer',
			container,
			new ProcessListDelegate(),
			renderers,
			new ProcessTreeDataSource(),
			{
				accessibilityProvider: new ProcessAccessibilityProvider(),
				identityProvider: new ProcessIdentityProvider()
			}));

		this._register(this.tree.onKeyDown(async e => this.onTreeKeyDown(e)));
		this._register(this.tree.onContextMenu(e => this.onTreeContextMenu(container, e)));

		this.tree.setInput({ processes: { processRoots } });
		this.layoutTree();
	}

	private async onTreeKeyDown(e: KeyboardEvent): Promise<void> {
		const event = new StandardKeyboardEvent(e);
		if (event.keyCode === KeyCode.KeyE && event.altKey) {
			const selectionPids = this.getSelectedPids();
			await Promise.all(selectionPids.map(pid => this.nativeHostService.killProcess(pid, 'SIGTERM')));

			this.tree?.refresh();
		}
	}

	private onTreeContextMenu(container: HTMLElement, e: ITreeContextMenuEvent<IProcessTree | IMachineProcessInformation | ProcessItem | IProcessInformation | IRemoteDiagnosticError | null>): void {
		if (!isProcessItem(e.element)) {
			return;
		}

		const item = e.element;
		const pid = Number(item.pid);

		const actions: IAction[] = [];

		actions.push(toAction({ id: 'killProcess', label: localize('killProcess', "Kill Process"), run: () => this.nativeHostService.killProcess(pid, 'SIGTERM') }));
		actions.push(toAction({ id: 'forceKillProcess', label: localize('forceKillProcess', "Force Kill Process"), run: () => this.nativeHostService.killProcess(pid, 'SIGKILL') }));

		actions.push(new Separator());

		actions.push(toAction({
			id: 'copy',
			label: localize('copy', "Copy"),
			run: () => {
				const selectionPids = this.getSelectedPids();

				if (!selectionPids?.includes(pid)) {
					selectionPids.length = 0; // If the selection does not contain the right clicked item, copy the right clicked item only.
					selectionPids.push(pid);
				}

				const rows = selectionPids?.map(e => getDocument(container).getElementById(`pid-${e}`)).filter(e => !!e);
				if (rows) {
					const text = rows.map(e => e.innerText).filter(e => !!e);
					this.nativeHostService.writeClipboardText(text.join('\n'));
				}
			}
		}));

		actions.push(toAction({
			id: 'copyAll',
			label: localize('copyAll', "Copy All"),
			run: () => {
				const processList = getDocument(container).getElementById('process-explorer');
				if (processList) {
					this.nativeHostService.writeClipboardText(processList.innerText);
				}
			}
		}));

		if (this.isDebuggable(item.cmd)) {
			actions.push(new Separator());
			actions.push(toAction({ id: 'debug', label: localize('debug', "Debug"), run: () => this.attachTo(item) }));
		}

		this.contextMenuService.showContextMenu({
			getAnchor: () => e.anchor,
			getActions: () => actions
		});
	}

	private isDebuggable(cmd: string): boolean {
		const matches = DEBUG_FLAGS_PATTERN.exec(cmd);

		return (matches && matches.groups!.port !== '0') || cmd.indexOf('node ') >= 0 || cmd.indexOf('node.exe') >= 0;
	}

	private attachTo(item: ProcessItem): void {
		const config: { type: string; request: string; name: string; port?: number; processId?: string } = {
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

		this.commandService.executeCommand('debug.startFromConfig', config);
	}

	private requestProcessList(totalWaitTime: number): void {
		setTimeout(() => {
			if (this._store.isDisposed) {
				return;
			}

			const nextRequestTime = Date.now();
			const waited = totalWaitTime + nextRequestTime - (this.lastRequestTime ?? 0);
			this.lastRequestTime = nextRequestTime;

			if (waited > 1000 /* Wait at least a second between requests */) {
				ipcRenderer.send('vscode:pidToNameRequest');
				ipcRenderer.send('vscode:listProcesses');
			} else {
				this.requestProcessList(waited);
			}
		}, 200);
	}

	private getSelectedPids(): number[] {
		return coalesce(this.tree?.getSelection()?.map(e => {
			if (!isProcessItem(e)) {
				return undefined;
			}

			return e.pid;
		}) ?? []);
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
