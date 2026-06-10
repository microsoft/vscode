/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/processExplorer.css';
import { localize } from '../../../../nls.js';
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
import { IProductService } from '../../../../platform/product/common/productService.js';
import { IAction, Separator, toAction } from '../../../../base/common/actions.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { coalesce } from '../../../../base/common/arrays.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { RenderIndentGuides } from '../../../../base/browser/ui/tree/abstractTree.js';
import { Delayer } from '../../../../base/common/async.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { IManagedHover } from '../../../../base/browser/ui/hover/hover.js';
import { getDefaultHoverDelegate } from '../../../../base/browser/ui/hover/hoverDelegateFactory.js';
import { IClipboardService } from '../../../../platform/clipboard/common/clipboardService.js';
import { IResolvedProcessInformation } from '../../../../platform/process/common/process.js';
import { IRemoteAgentService } from '../../../services/remote/common/remoteAgentService.js';
import { ILabelService } from '../../../../platform/label/common/label.js';
import { Schemas } from '../../../../base/common/network.js';
import { isWeb } from '../../../../base/common/platform.js';

const DEBUG_FLAGS_PATTERN = /\s--inspect(?:-brk|port)?=(?<port>\d+)?/;
const DEBUG_PORT_PATTERN = /\s--inspect-port=(?<port>\d+)/;

//#region --- process explorer tree

interface IProcessTree {
	readonly processes: IProcessInformation;
}

interface IProcessInformation {
	readonly processRoots: IMachineProcessInformation[];
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

			if (element.processRoots.length > 0) {
				return [element.processRoots[0].rootProcess];
			}

			return [];
		}

		if (isMachineProcessInformation(element)) {
			return [element.rootProcess];
		}

		return element.processes ? [element.processes] : [];
	}
}

function createRow(container: HTMLElement, extraClass?: string) {
	const row = append(container, $('.row'));
	if (extraClass) {
		row.classList.add(extraClass);
	}

	const name = append(row, $('.cell.name'));
	const cpu = append(row, $('.cell.cpu'));
	const memory = append(row, $('.cell.memory'));
	const pid = append(row, $('.cell.pid'));

	return { name, cpu, memory, pid };
}

interface IProcessRowTemplateData {
	readonly name: HTMLElement;
}

interface IProcessItemTemplateData extends IProcessRowTemplateData {
	readonly cpu: HTMLElement;
	readonly memory: HTMLElement;
	readonly pid: HTMLElement;
	readonly hover?: ProcessItemHover;
}

class ProcessHeaderTreeRenderer implements ITreeRenderer<IProcessInformation, void, IProcessItemTemplateData> {

	readonly templateId: string = 'header';

	renderTemplate(container: HTMLElement): IProcessItemTemplateData {
		container.previousElementSibling?.classList.add('force-no-twistie'); // hack, but no API for hiding twistie on tree

		return createRow(container, 'header');
	}

	renderElement(node: ITreeNode<IProcessInformation, void>, index: number, templateData: IProcessItemTemplateData): void {
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
		return createRow(container);
	}

	renderElement(node: ITreeNode<IMachineProcessInformation, void>, index: number, templateData: IProcessRowTemplateData): void {
		templateData.name.textContent = node.element.name;
	}

	disposeTemplate(templateData: IProcessRowTemplateData): void {
		// Nothing to do
	}
}

class ErrorRenderer implements ITreeRenderer<IRemoteDiagnosticError, void, IProcessRowTemplateData> {

	readonly templateId: string = 'error';

	renderTemplate(container: HTMLElement): IProcessRowTemplateData {
		return createRow(container);
	}

	renderElement(node: ITreeNode<IRemoteDiagnosticError, void>, index: number, templateData: IProcessRowTemplateData): void {
		templateData.name.textContent = node.element.errorMessage;
	}

	disposeTemplate(templateData: IProcessRowTemplateData): void {
		// Nothing to do
	}
}

class ProcessItemHover extends Disposable {

	private hover: IManagedHover;
	private content = '';

	constructor(
		container: HTMLElement,
		@IHoverService hoverService: IHoverService
	) {
		super();

		this.hover = this._register(hoverService.setupManagedHover(getDefaultHoverDelegate('mouse'), container, this.content));
	}

	update(content: string): void {
		if (this.content !== content) {
			this.content = content;
			this.hover.update(content);
		}
	}
}

class ProcessRenderer implements ITreeRenderer<ProcessItem, void, IProcessItemTemplateData> {

	readonly templateId: string = 'process';

	constructor(
		private model: ProcessExplorerModel,
		@IHoverService private readonly hoverService: IHoverService
	) { }

	renderTemplate(container: HTMLElement): IProcessItemTemplateData {
		const row = createRow(container);

		return {
			name: row.name,
			cpu: row.cpu,
			memory: row.memory,
			pid: row.pid,
			hover: new ProcessItemHover(row.name, this.hoverService)
		};
	}

	renderElement(node: ITreeNode<ProcessItem, void>, index: number, templateData: IProcessItemTemplateData): void {
		const { element } = node;

		const pid = element.pid.toFixed(0);

		templateData.name.textContent = this.model.getName(element.pid, element.name);
		templateData.cpu.textContent = element.load.toFixed(0);
		templateData.memory.textContent = (element.mem / ByteSize.MB).toFixed(0);
		templateData.pid.textContent = pid;
		templateData.pid.parentElement!.id = `pid-${pid}`;

		templateData.hover?.update(element.cmd);
	}

	disposeTemplate(templateData: IProcessItemTemplateData): void {
		templateData.hover?.dispose();
	}
}

class ProcessAccessibilityProvider implements IListAccessibilityProvider<IMachineProcessInformation | ProcessItem | IRemoteDiagnosticError> {

	getWidgetAriaLabel(): string {
		return localize('processExplorer', "Process Explorer");
	}

	getAriaLabel(element: IMachineProcessInformation | ProcessItem | IRemoteDiagnosticError): string | null {
		if (isProcessItem(element) || isMachineProcessInformation(element)) {
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

export abstract class ProcessExplorerControl extends Disposable {

	private dimensions: Dimension | undefined = undefined;

	private readonly model: ProcessExplorerModel;
	private tree: WorkbenchDataTree<IProcessTree, IProcessTree | IMachineProcessInformation | ProcessItem | IProcessInformation | IRemoteDiagnosticError> | undefined;

	private readonly delayer = this._register(new Delayer(1000));

	constructor(
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IProductService private readonly productService: IProductService,
		@IContextMenuService private readonly contextMenuService: IContextMenuService,
		@ICommandService private readonly commandService: ICommandService,
		@IClipboardService private readonly clipboardService: IClipboardService
	) {
		super();

		this.model = new ProcessExplorerModel(this.productService);
	}

	protected killProcess?(pid: number, signal: string): Promise<void>;
	protected abstract resolveProcesses(): Promise<IResolvedProcessInformation>;

	protected create(container: HTMLElement): void {
		this.createProcessTree(container);

		this.update();
	}

	private createProcessTree(container: HTMLElement): void {
		container.classList.add('process-explorer');
		container.id = 'process-explorer';

		const renderers = [
			this.instantiationService.createInstance(ProcessRenderer, this.model),
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
				identityProvider: new ProcessIdentityProvider(),
				expandOnlyOnTwistieClick: true,
				renderIndentGuides: RenderIndentGuides.OnHover
			}));

		this._register(this.tree.onKeyDown(e => this.onTreeKeyDown(e)));
		this._register(this.tree.onContextMenu(e => this.onTreeContextMenu(container, e)));

		this.tree.setInput(this.model);
		this.layoutTree();
	}

	private async onTreeKeyDown(e: KeyboardEvent): Promise<void> {
		const event = new StandardKeyboardEvent(e);
		if (event.keyCode === KeyCode.KeyE && event.altKey) {
			const selectionPids = this.getSelectedPids();
			await Promise.all(selectionPids.map(pid => this.killProcess?.(pid, 'SIGTERM')));
		}
	}

	private onTreeContextMenu(container: HTMLElement, e: ITreeContextMenuEvent<IProcessTree | IMachineProcessInformation | ProcessItem | IProcessInformation | IRemoteDiagnosticError | null>): void {
		if (!isProcessItem(e.element)) {
			return;
		}

		const item = e.element;
		const pid = Number(item.pid);

		const actions: IAction[] = [];

		if (typeof this.killProcess === 'function') {
			actions.push(toAction({ id: 'killProcess', label: localize('killProcess', "Kill Process"), run: () => this.killProcess?.(pid, 'SIGTERM') }));
			actions.push(toAction({ id: 'forceKillProcess', label: localize('forceKillProcess', "Force Kill Process"), run: () => this.killProcess?.(pid, 'SIGKILL') }));

			actions.push(new Separator());
		}

		actions.push(toAction({
			id: 'copy',
			label: localize('copy', "Copy"),
			run: () => {
				const selectionPids = this.getSelectedPids();

				if (!selectionPids?.includes(pid)) {
					selectionPids.length = 0; // If the selection does not contain the right clicked item, copy the right clicked item only.
					selectionPids.push(pid);
				}

				// eslint-disable-next-line no-restricted-syntax
				const rows = selectionPids?.map(e => getDocument(container).getElementById(`pid-${e}`)).filter(e => !!e);
				if (rows) {
					const text = rows.map(e => e.innerText).filter(e => !!e);
					this.clipboardService.writeText(text.join('\n'));
				}
			}
		}));

		actions.push(toAction({
			id: 'copyAll',
			label: localize('copyAll', "Copy All"),
			run: () => {
				// eslint-disable-next-line no-restricted-syntax
				const processList = getDocument(container).getElementById('process-explorer');
				if (processList) {
					this.clipboardService.writeText(processList.innerText);
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
		if (isWeb) {
			return false;
		}

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

	private getSelectedPids(): number[] {
		return coalesce(this.tree?.getSelection()?.map(e => {
			if (!isProcessItem(e)) {
				return undefined;
			}

			return e.pid;
		}) ?? []);
	}

	private async update(): Promise<void> {
		const { processes, pidToNames } = await this.resolveProcesses();

		this.model.update(processes, pidToNames);

		this.tree?.updateChildren();
		this.layoutTree();

		this.delayer.trigger(() => this.update());
	}

	focus(): void {
		this.tree?.domFocus();
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

class ProcessExplorerModel implements IProcessTree {

	processes: IProcessInformation = { processRoots: [] };

	private readonly mapPidToName = new Map<number, string>();

	constructor(@IProductService private productService: IProductService) { }

	update(processRoots: IMachineProcessInformation[], pidToNames: [number, string][]): void {

		// PID to Names
		this.mapPidToName.clear();

		for (const [pid, name] of pidToNames) {
			this.mapPidToName.set(pid, name);
		}

		// Processes
		processRoots.forEach((info, index) => {
			if (isProcessItem(info.rootProcess)) {
				info.rootProcess.name = index === 0 ? this.productService.applicationName : 'remote-server';
			}
		});

		this.processes = { processRoots };
	}

	getName(pid: number, fallback: string): string {
		return this.mapPidToName.get(pid) ?? fallback;
	}
}

export class BrowserProcessExplorerControl extends ProcessExplorerControl {

	constructor(
		container: HTMLElement,
		@IInstantiationService instantiationService: IInstantiationService,
		@IProductService productService: IProductService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@ICommandService commandService: ICommandService,
		@IClipboardService clipboardService: IClipboardService,
		@IRemoteAgentService private readonly remoteAgentService: IRemoteAgentService,
		@ILabelService private readonly labelService: ILabelService
	) {
		super(instantiationService, productService, contextMenuService, commandService, clipboardService);

		this.create(container);
	}

	protected override async resolveProcesses(): Promise<IResolvedProcessInformation> {
		const connection = this.remoteAgentService.getConnection();
		if (!connection) {
			return { pidToNames: [], processes: [] };
		}

		const processes: { name: string; rootProcess: ProcessItem | IRemoteDiagnosticError }[] = [];

		const hostName = this.labelService.getHostLabel(Schemas.vscodeRemote, connection.remoteAuthority);
		const result = await this.remoteAgentService.getDiagnosticInfo({ includeProcesses: true });
		if (result) {
			if (isRemoteDiagnosticError(result)) {
				processes.push({ name: result.hostName, rootProcess: result });
			} else if (result.processes) {
				processes.push({ name: hostName, rootProcess: result.processes });
			}
		}

		return { pidToNames: [], processes };
	}
}
