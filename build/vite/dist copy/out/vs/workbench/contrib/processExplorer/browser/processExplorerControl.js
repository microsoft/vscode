/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import './media/processExplorer.css';
import { localize } from '../../../../nls.js';
import { $, append, getDocument } from '../../../../base/browser/dom.js';
import { StandardKeyboardEvent } from '../../../../base/browser/keyboardEvent.js';
import { isRemoteDiagnosticError } from '../../../../platform/diagnostics/common/diagnostics.js';
import { ByteSize } from '../../../../platform/files/common/files.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { WorkbenchDataTree } from '../../../../platform/list/browser/listService.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { Separator, toAction } from '../../../../base/common/actions.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { coalesce } from '../../../../base/common/arrays.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { RenderIndentGuides } from '../../../../base/browser/ui/tree/abstractTree.js';
import { Delayer } from '../../../../base/common/async.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { getDefaultHoverDelegate } from '../../../../base/browser/ui/hover/hoverDelegateFactory.js';
import { IClipboardService } from '../../../../platform/clipboard/common/clipboardService.js';
import { IRemoteAgentService } from '../../../services/remote/common/remoteAgentService.js';
import { ILabelService } from '../../../../platform/label/common/label.js';
import { Schemas } from '../../../../base/common/network.js';
import { isWeb } from '../../../../base/common/platform.js';
const DEBUG_FLAGS_PATTERN = /\s--inspect(?:-brk|port)?=(?<port>\d+)?/;
const DEBUG_PORT_PATTERN = /\s--inspect-port=(?<port>\d+)/;
function isMachineProcessInformation(item) {
    const candidate = item;
    return !!candidate?.name && !!candidate?.rootProcess;
}
function isProcessInformation(item) {
    const candidate = item;
    return !!candidate?.processRoots;
}
function isProcessItem(item) {
    const candidate = item;
    return typeof candidate?.pid === 'number';
}
class ProcessListDelegate {
    getHeight() {
        return 22;
    }
    getTemplateId(element) {
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
class ProcessTreeDataSource {
    hasChildren(element) {
        if (isRemoteDiagnosticError(element)) {
            return false;
        }
        if (isProcessItem(element)) {
            return !!element.children?.length;
        }
        return true;
    }
    getChildren(element) {
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
function createRow(container, extraClass) {
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
class ProcessHeaderTreeRenderer {
    constructor() {
        this.templateId = 'header';
    }
    renderTemplate(container) {
        container.previousElementSibling?.classList.add('force-no-twistie'); // hack, but no API for hiding twistie on tree
        return createRow(container, 'header');
    }
    renderElement(node, index, templateData) {
        templateData.name.textContent = localize('processName', "Process Name");
        templateData.cpu.textContent = localize('processCpu', "CPU (%)");
        templateData.pid.textContent = localize('processPid', "PID");
        templateData.memory.textContent = localize('processMemory', "Memory (MB)");
    }
    disposeTemplate(templateData) {
        // Nothing to do
    }
}
class MachineRenderer {
    constructor() {
        this.templateId = 'machine';
    }
    renderTemplate(container) {
        return createRow(container);
    }
    renderElement(node, index, templateData) {
        templateData.name.textContent = node.element.name;
    }
    disposeTemplate(templateData) {
        // Nothing to do
    }
}
class ErrorRenderer {
    constructor() {
        this.templateId = 'error';
    }
    renderTemplate(container) {
        return createRow(container);
    }
    renderElement(node, index, templateData) {
        templateData.name.textContent = node.element.errorMessage;
    }
    disposeTemplate(templateData) {
        // Nothing to do
    }
}
let ProcessItemHover = class ProcessItemHover extends Disposable {
    constructor(container, hoverService) {
        super();
        this.content = '';
        this.hover = this._register(hoverService.setupManagedHover(getDefaultHoverDelegate('mouse'), container, this.content));
    }
    update(content) {
        if (this.content !== content) {
            this.content = content;
            this.hover.update(content);
        }
    }
};
ProcessItemHover = __decorate([
    __param(1, IHoverService)
], ProcessItemHover);
let ProcessRenderer = class ProcessRenderer {
    constructor(model, hoverService) {
        this.model = model;
        this.hoverService = hoverService;
        this.templateId = 'process';
    }
    renderTemplate(container) {
        const row = createRow(container);
        return {
            name: row.name,
            cpu: row.cpu,
            memory: row.memory,
            pid: row.pid,
            hover: new ProcessItemHover(row.name, this.hoverService)
        };
    }
    renderElement(node, index, templateData) {
        const { element } = node;
        const pid = element.pid.toFixed(0);
        templateData.name.textContent = this.model.getName(element.pid, element.name);
        templateData.cpu.textContent = element.load.toFixed(0);
        templateData.memory.textContent = (element.mem / ByteSize.MB).toFixed(0);
        templateData.pid.textContent = pid;
        templateData.pid.parentElement.id = `pid-${pid}`;
        templateData.hover?.update(element.cmd);
    }
    disposeTemplate(templateData) {
        templateData.hover?.dispose();
    }
};
ProcessRenderer = __decorate([
    __param(1, IHoverService)
], ProcessRenderer);
class ProcessAccessibilityProvider {
    getWidgetAriaLabel() {
        return localize('processExplorer', "Process Explorer");
    }
    getAriaLabel(element) {
        if (isProcessItem(element) || isMachineProcessInformation(element)) {
            return element.name;
        }
        if (isRemoteDiagnosticError(element)) {
            return element.hostName;
        }
        return null;
    }
}
class ProcessIdentityProvider {
    getId(element) {
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
let ProcessExplorerControl = class ProcessExplorerControl extends Disposable {
    constructor(instantiationService, productService, contextMenuService, commandService, clipboardService) {
        super();
        this.instantiationService = instantiationService;
        this.productService = productService;
        this.contextMenuService = contextMenuService;
        this.commandService = commandService;
        this.clipboardService = clipboardService;
        this.dimensions = undefined;
        this.delayer = this._register(new Delayer(1000));
        this.model = new ProcessExplorerModel(this.productService);
    }
    create(container) {
        this.createProcessTree(container);
        this.update();
    }
    createProcessTree(container) {
        container.classList.add('process-explorer');
        container.id = 'process-explorer';
        const renderers = [
            this.instantiationService.createInstance(ProcessRenderer, this.model),
            new ProcessHeaderTreeRenderer(),
            new MachineRenderer(),
            new ErrorRenderer()
        ];
        this.tree = this._register(this.instantiationService.createInstance((WorkbenchDataTree), 'processExplorer', container, new ProcessListDelegate(), renderers, new ProcessTreeDataSource(), {
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
    async onTreeKeyDown(e) {
        const event = new StandardKeyboardEvent(e);
        if (event.keyCode === 35 /* KeyCode.KeyE */ && event.altKey) {
            const selectionPids = this.getSelectedPids();
            await Promise.all(selectionPids.map(pid => this.killProcess?.(pid, 'SIGTERM')));
        }
    }
    onTreeContextMenu(container, e) {
        if (!isProcessItem(e.element)) {
            return;
        }
        const item = e.element;
        const pid = Number(item.pid);
        const actions = [];
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
    isDebuggable(cmd) {
        if (isWeb) {
            return false;
        }
        const matches = DEBUG_FLAGS_PATTERN.exec(cmd);
        return (matches && matches.groups.port !== '0') || cmd.indexOf('node ') >= 0 || cmd.indexOf('node.exe') >= 0;
    }
    attachTo(item) {
        const config = {
            type: 'node',
            request: 'attach',
            name: `process ${item.pid}`
        };
        let matches = DEBUG_FLAGS_PATTERN.exec(item.cmd);
        if (matches) {
            config.port = Number(matches.groups.port);
        }
        else {
            config.processId = String(item.pid); // no port -> try to attach via pid (send SIGUSR1)
        }
        // a debug-port=n or inspect-port=n overrides the port
        matches = DEBUG_PORT_PATTERN.exec(item.cmd);
        if (matches) {
            config.port = Number(matches.groups.port); // override port
        }
        this.commandService.executeCommand('debug.startFromConfig', config);
    }
    getSelectedPids() {
        return coalesce(this.tree?.getSelection()?.map(e => {
            if (!isProcessItem(e)) {
                return undefined;
            }
            return e.pid;
        }) ?? []);
    }
    async update() {
        const { processes, pidToNames } = await this.resolveProcesses();
        this.model.update(processes, pidToNames);
        this.tree?.updateChildren();
        this.layoutTree();
        this.delayer.trigger(() => this.update());
    }
    focus() {
        this.tree?.domFocus();
    }
    layout(dimension) {
        this.dimensions = dimension;
        this.layoutTree();
    }
    layoutTree() {
        if (this.dimensions && this.tree) {
            this.tree.layout(this.dimensions.height, this.dimensions.width);
        }
    }
};
ProcessExplorerControl = __decorate([
    __param(0, IInstantiationService),
    __param(1, IProductService),
    __param(2, IContextMenuService),
    __param(3, ICommandService),
    __param(4, IClipboardService)
], ProcessExplorerControl);
export { ProcessExplorerControl };
let ProcessExplorerModel = class ProcessExplorerModel {
    constructor(productService) {
        this.productService = productService;
        this.processes = { processRoots: [] };
        this.mapPidToName = new Map();
    }
    update(processRoots, pidToNames) {
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
    getName(pid, fallback) {
        return this.mapPidToName.get(pid) ?? fallback;
    }
};
ProcessExplorerModel = __decorate([
    __param(0, IProductService)
], ProcessExplorerModel);
let BrowserProcessExplorerControl = class BrowserProcessExplorerControl extends ProcessExplorerControl {
    constructor(container, instantiationService, productService, contextMenuService, commandService, clipboardService, remoteAgentService, labelService) {
        super(instantiationService, productService, contextMenuService, commandService, clipboardService);
        this.remoteAgentService = remoteAgentService;
        this.labelService = labelService;
        this.create(container);
    }
    async resolveProcesses() {
        const connection = this.remoteAgentService.getConnection();
        if (!connection) {
            return { pidToNames: [], processes: [] };
        }
        const processes = [];
        const hostName = this.labelService.getHostLabel(Schemas.vscodeRemote, connection.remoteAuthority);
        const result = await this.remoteAgentService.getDiagnosticInfo({ includeProcesses: true });
        if (result) {
            if (isRemoteDiagnosticError(result)) {
                processes.push({ name: result.hostName, rootProcess: result });
            }
            else if (result.processes) {
                processes.push({ name: hostName, rootProcess: result.processes });
            }
        }
        return { pidToNames: [], processes };
    }
};
BrowserProcessExplorerControl = __decorate([
    __param(1, IInstantiationService),
    __param(2, IProductService),
    __param(3, IContextMenuService),
    __param(4, ICommandService),
    __param(5, IClipboardService),
    __param(6, IRemoteAgentService),
    __param(7, ILabelService)
], BrowserProcessExplorerControl);
export { BrowserProcessExplorerControl };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicHJvY2Vzc0V4cGxvcmVyQ29udHJvbC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL3Byb2Nlc3NFeHBsb3Jlci9icm93c2VyL3Byb2Nlc3NFeHBsb3JlckNvbnRyb2wudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyw2QkFBNkIsQ0FBQztBQUNyQyxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sb0JBQW9CLENBQUM7QUFDOUMsT0FBTyxFQUFFLENBQUMsRUFBRSxNQUFNLEVBQWEsV0FBVyxFQUFFLE1BQU0saUNBQWlDLENBQUM7QUFDcEYsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sMkNBQTJDLENBQUM7QUFJbEYsT0FBTyxFQUEwQix1QkFBdUIsRUFBRSxNQUFNLHdEQUF3RCxDQUFDO0FBQ3pILE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUV0RSxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDbEUsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sa0RBQWtELENBQUM7QUFDckYsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sNERBQTRELENBQUM7QUFFbkcsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLHVEQUF1RCxDQUFDO0FBQ3hGLE9BQU8sRUFBVyxTQUFTLEVBQUUsUUFBUSxFQUFFLE1BQU0sb0NBQW9DLENBQUM7QUFDbEYsT0FBTyxFQUFFLG1CQUFtQixFQUFFLE1BQU0seURBQXlELENBQUM7QUFDOUYsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQzdELE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSxrREFBa0QsQ0FBQztBQUNuRixPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSxrREFBa0QsQ0FB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