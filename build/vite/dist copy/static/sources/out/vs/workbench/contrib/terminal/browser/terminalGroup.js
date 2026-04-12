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
import { TERMINAL_VIEW_ID } from '../common/terminal.js';
import { Event, Emitter } from '../../../../base/common/event.js';
import { Disposable, DisposableStore, dispose, toDisposable } from '../../../../base/common/lifecycle.js';
import { SplitView, Sizing } from '../../../../base/browser/ui/splitview/splitview.js';
import { isHorizontal, IWorkbenchLayoutService } from '../../../services/layout/browser/layoutService.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ITerminalInstanceService, ITerminalConfigurationService } from './terminal.js';
import { IViewDescriptorService } from '../../../common/views.js';
import { TerminalLocation } from '../../../../platform/terminal/common/terminal.js';
import { getWindow } from '../../../../base/browser/dom.js';
import { asArray } from '../../../../base/common/arrays.js';
import { hasKey, isNumber } from '../../../../base/common/types.js';
import { IPaneCompositePartService } from '../../../services/panecomposite/browser/panecomposite.js';
var Constants;
(function (Constants) {
    /**
     * The minimum size in pixels of a split pane.
     */
    Constants[Constants["SplitPaneMinSize"] = 80] = "SplitPaneMinSize";
    /**
     * The number of cells the terminal gets added or removed when asked to increase or decrease
     * the view size.
     */
    Constants[Constants["ResizePartCellCount"] = 4] = "ResizePartCellCount";
})(Constants || (Constants = {}));
class SplitPaneContainer extends Disposable {
    get onDidChange() { return this._onDidChange; }
    constructor(_container, orientation) {
        super();
        this._container = _container;
        this.orientation = orientation;
        this._splitViewDisposables = this._register(new DisposableStore());
        this._children = [];
        this._terminalToPane = new Map();
        this._onDidChange = Event.None;
        this._width = this._container.offsetWidth;
        this._height = this._container.offsetHeight;
        this._createSplitView();
        this._splitView.layout(this.orientation === 1 /* Orientation.HORIZONTAL */ ? this._width : this._height);
    }
    _createSplitView() {
        this._splitViewDisposables.clear();
        this._splitView = new SplitView(this._container, { orientation: this.orientation });
        this._splitViewDisposables.add(this._splitView);
        this._splitViewDisposables.add(this._splitView.onDidSashReset(() => this._splitView.distributeViewSizes()));
    }
    split(instance, index) {
        this._addChild(instance, index);
    }
    resizePane(index, direction, amount) {
        // Only resize when there is more than one pane
        if (this._children.length <= 1) {
            return;
        }
        // Get sizes
        const sizes = [];
        for (let i = 0; i < this._splitView.length; i++) {
            sizes.push(this._splitView.getViewSize(i));
        }
        // Remove size from right pane, unless index is the last pane in which case use left pane
        const isSizingEndPane = index !== this._children.length - 1;
        const indexToChange = isSizingEndPane ? index + 1 : index - 1;
        if (isSizingEndPane && direction === 0 /* Direction.Left */) {
            amount *= -1;
        }
        else if (!isSizingEndPane && direction === 1 /* Direction.Right */) {
            amount *= -1;
        }
        else if (isSizingEndPane && direction === 2 /* Direction.Up */) {
            amount *= -1;
        }
        else if (!isSizingEndPane && direction === 3 /* Direction.Down */) {
            amount *= -1;
        }
        // Ensure the size is not reduced beyond the minimum, otherwise weird things can happen
        if (sizes[index] + amount < 80 /* Constants.SplitPaneMinSize */) {
            amount = 80 /* Constants.SplitPaneMinSize */ - sizes[index];
        }
        else if (sizes[indexToChange] - amount < 80 /* Constants.SplitPaneMinSize */) {
            amount = sizes[indexToChange] - 80 /* Constants.SplitPaneMinSize */;
        }
        // Apply the size change
        sizes[index] += amount;
        sizes[indexToChange] -= amount;
        for (let i = 0; i < this._splitView.length - 1; i++) {
            this._splitView.resizeView(i, sizes[i]);
        }
    }
    resizePanes(relativeSizes) {
        if (this._children.length <= 1) {
            return;
        }
        // assign any extra size to last terminal
        relativeSizes[relativeSizes.length - 1] += 1 - relativeSizes.reduce((totalValue, currentValue) => totalValue + currentValue, 0);
        let totalSize = 0;
        for (let i = 0; i < this._splitView.length; i++) {
            totalSize += this._splitView.getViewSize(i);
        }
        for (let i = 0; i < this._splitView.length; i++) {
            this._splitView.resizeView(i, totalSize * relativeSizes[i]);
        }
    }
    getPaneSize(instance) {
        const paneForInstance = this._terminalToPane.get(instance);
        if (!paneForInstance) {
            return 0;
        }
        const index = this._children.indexOf(paneForInstance);
        return this._splitView.getViewSize(index);
    }
    _addChild(instance, index) {
        const child = new SplitPane(instance, this.orientation === 1 /* Orientation.HORIZONTAL */ ? this._height : this._width);
        child.orientation = this.orientation;
        if (isNumber(index)) {
            this._children.splice(index, 0, child);
        }
        else {
            this._children.push(child);
        }
        this._terminalToPane.set(instance, this._children[this._children.indexOf(child)]);
        this._withDisabledLayout(() => this._splitView.addView(child, Sizing.Distribute, index));
        this.layout(this._width, this._height);
        this._onDidChange = Event.any(...this._children.map(c => c.onDidChange));
    }
    remove(instance) {
        let index = null;
        for (let i = 0; i < this._children.length; i++) {
            if (this._children[i].instance === instance) {
                index = i;
            }
        }
        if (index !== null) {
            this._children.splice(index, 1);
            this._terminalToPane.delete(instance);
            this._splitView.removeView(index, Sizing.Distribute);
            instance.detachFromElement();
        }
    }
    layout(width, height) {
        this._width = width;
        this._height = height;
        if (this.orientation === 1 /* Orientation.HORIZONTAL */) {
            this._children.forEach(c => c.orthogonalLayout(height));
            this._splitView.layout(width);
        }
        else {
            this._children.forEach(c => c.orthogonalLayout(width));
            this._splitView.layout(height);
        }
    }
    setOrientation(orientation) {
        if (this.orientation === orientation) {
            return;
        }
        this.orientation = orientation;
        // Remove old split view
        while (this._container.children.length > 0) {
            this._container.children[0].remove();
        }
        // Create new split view with updated orientation
        this._createSplitView();
        this._withDisabledLayout(() => {
            this._children.forEach(child => {
                child.orientation = orientation;
                this._splitView.addView(child, 1);
            });
        });
    }
    _withDisabledLayout(innerFunction) {
        // Whenever manipulating views that are going to be changed immediately, disabling
        // layout/resize events in the terminal prevent bad dimensions going to the pty.
        this._children.forEach(c => c.instance.disableLayout = true);
        innerFunction();
        this._children.forEach(c => c.instance.disableLayout = false);
    }
}
class SplitPane {
    get onDidChange() { return this._onDidChange; }
    constructor(instance, orthogonalSize) {
        this.instance = instance;
        this.orthogonalSize = orthogonalSize;
        this.minimumSize = 80 /* Constants.SplitPaneMinSize */;
        this.maximumSize = Number.MAX_VALUE;
        this._onDidChange = Event.None;
        this.element = document.createElement('div');
        this.element.className = 'terminal-split-pane';
        this.instance.attachToElement(this.element);
    }
    layout(size) {
        // Only layout when both sizes are known
        if (!size || !this.orthogonalSize) {
            return;
        }
        if (this.orientation === 0 /* Orientation.VERTICAL */) {
            this.instance.layout({ width: this.orthogonalSize, height: size });
        }
        else {
            this.instance.layout({ width: size, height: this.orthogonalSize });
        }
    }
    orthogonalLayout(size) {
        this.orthogonalSize = size;
    }
}
let TerminalGroup = class TerminalGroup extends Disposable {
    get terminalInstances() { return this._terminalInstances; }
    get hadFocusOnExit() { return this._hadFocusOnExit; }
    constructor(_container, shellLaunchConfigOrInstance, _terminalConfigurationService, _terminalInstanceService, _paneCompositePartService, _layoutService, _viewDescriptorService, _instantiationService) {
        super();
        this._container = _container;
        this._terminalConfigurationService = _terminalConfigurationService;
        this._terminalInstanceService = _terminalInstanceService;
        this._paneCompositePartService = _paneCompositePartService;
        this._layoutService = _layoutService;
        this._viewDescriptorService = _viewDescriptorService;
        this._instantiationService = _instantiationService;
        this._terminalInstances = [];
        this._panelPosition = 2 /* Position.BOTTOM */;
        this._terminalLocation = 1 /* ViewContainerLocation.Panel */;
        this._instanceDisposables = new Map();
        this._activeInstanceIndex = -1;
        this._hadFocusOnExit = false;
        this._visible = false;
        this._onDidDisposeInstance = this._register(new Emitter());
        this.onDidDisposeInstance = this._onDidDisposeInstance.event;
        this._onDidFocusInstance = this._register(new Emitter());
        this.onDidFocusInstance = this._onDidFocusInstance.event;
        this._onDidChangeInstanceCapability = this._register(new Emitter());
        this.onDidChangeInstanceCapability = this._onDidChangeInstanceCapability.event;
        this._onDisposed = this._register(new Emitter());
        this.onDisposed = this._onDisposed.event;
        this._onInstancesChanged = this._register(new Emitter());
        this.onInstancesChanged = this._onInstancesChanged.event;
        this._onDidChangeActiveInstance = this._register(new Emitter());
        this.onDidChangeActiveInstance = this._onDidChangeActiveInstance.event;
        this._onPanelOrientationChanged = this._register(new Emitter());
        this.onPanelOrientationChanged = this._onPanelOrientationChanged.event;
        if (shellLaunchConfigOrInstance) {
            this.addInstance(shellLaunchConfigOrInstance);
        }
        if (this._container) {
            this.attachToElement(this._container);
        }
        this._onPanelOrientationChanged.fire(this._terminalLocation === 1 /* ViewContainerLocation.Panel */ && isHorizontal(this._panelPosition) ? 1 /* Orientation.HORIZONTAL */ : 0 /* Orientation.VERTICAL */);
        this._register(toDisposable(() => {
            if (this._container && this._groupElement) {
                this._groupElement.remove();
                this._groupElement = undefined;
            }
        }));
    }
    addInstance(shellLaunchConfigOrInstance, parentTerminalId) {
        let instance;
        // if a parent terminal is provided, find it
        // otherwise, parent is the active terminal
        const parentIndex = parentTerminalId ? this._terminalInstances.findIndex(t => t.instanceId === parentTerminalId) : this._activeInstanceIndex;
        if (hasKey(shellLaunchConfigOrInstance, { instanceId: true })) {
            instance = shellLaunchConfigOrInstance;
        }
        else {
            instance = this._terminalInstanceService.createInstance(shellLaunchConfigOrInstance, TerminalLocation.Panel);
        }
        if (this._terminalInstances.length === 0) {
            this._terminalInstances.push(instance);
            this._activeInstanceIndex = 0;
        }
        else {
            this._terminalInstances.splice(parentIndex + 1, 0, instance);
        }
        this._initInstanceListeners(instance);
        if (this._splitPaneContainer) {
            this._splitPaneContainer.split(instance, parentIndex + 1);
        }
        this._onInstancesChanged.fire();
    }
    dispose() {
        this._terminalInstances = [];
        this._onInstancesChanged.fire();
        this._splitPaneContainer?.dispose();
        super.dispose();
    }
    get activeInstance() {
        if (this._terminalInstances.length === 0) {
            return undefined;
        }
        return this._terminalInstances[this._activeInstanceIndex];
    }
    getLayoutInfo(isActive) {
        const instances = this.terminalInstances.filter(instance => isNumber(instance.persistentProcessId) && instance.shouldPersist);
        const totalSize = instances.map(t => this._splitPaneContainer?.getPaneSize(t) || 0).reduce((total, size) => total += size, 0);
        return {
            isActive: isActive,
            activePersistentProcessId: this.activeInstance ? this.activeInstance.persistentProcessId : undefined,
            terminals: instances.map(t => {
                return {
                    relativeSize: totalSize > 0 ? this._splitPaneContainer.getPaneSize(t) / totalSize : 0,
                    terminal: t.persistentProcessId || 0
                };
            })
        };
    }
    _initInstanceListeners(instance) {
        this._instanceDisposables.set(instance.instanceId, [
            instance.onDisposed(instance => {
                this._onDidDisposeInstance.fire(instance);
                this._handleOnDidDisposeInstance(instance);
            }),
            instance.onDidFocus(instance => {
                this._setActiveInstance(instance);
                this._onDidFocusInstance.fire(instance);
            }),
            instance.capabilities.onDidChangeCapabilities(() => this._onDidChangeInstanceCapability.fire(instance)),
        ]);
    }
    _handleOnDidDisposeInstance(instance) {
        this._removeInstance(instance);
    }
    removeInstance(instance) {
        this._removeInstance(instance);
    }
    _removeInstance(instance) {
        const index = this._terminalInstances.indexOf(instance);
        if (index === -1) {
            return;
        }
        const wasActiveInstance = instance === this.activeInstance;
        this._terminalInstances.splice(index, 1);
        // Adjust focus if the instance was active
        if (wasActiveInstance && this._terminalInstances.length > 0) {
            const newIndex = index < this._terminalInstances.length ? index : this._terminalInstances.length - 1;
            this.setActiveInstanceByIndex(newIndex);
            // TODO: Only focus the new instance if the group had focus?
            this.activeInstance?.focus(true);
        }
        else if (index < this._activeInstanceIndex) {
            // Adjust active instance index if needed
            this._activeInstanceIndex--;
        }
        this._splitPaneContainer?.remove(instance);
        // Fire events and dispose group if it was the last instance
        if (this._terminalInstances.length === 0) {
            this._hadFocusOnExit = instance.hadFocusOnExit;
            this._onDisposed.fire(this);
            this.dispose();
        }
        else {
            this._onInstancesChanged.fire();
        }
        // Dispose instance event listeners
        const disposables = this._instanceDisposables.get(instance.instanceId);
        if (disposables) {
            dispose(disposables);
            this._instanceDisposables.delete(instance.instanceId);
        }
    }
    moveInstance(instances, index, position) {
        instances = asArray(instances);
        const hasInvalidInstance = instances.some(instance => !this.terminalInstances.includes(instance));
        if (hasInvalidInstance) {
            return;
        }
        const insertIndex = position === 'before' ? index : index + 1;
        this._terminalInstances.splice(insertIndex, 0, ...instances);
        for (const item of instances) {
            const originSourceGroupIndex = position === 'after' ? this._terminalInstances.indexOf(item) : this._terminalInstances.lastIndexOf(item);
            this._terminalInstances.splice(originSourceGroupIndex, 1);
        }
        if (this._splitPaneContainer) {
            for (let i = 0; i < instances.length; i++) {
                const item = instances[i];
                this._splitPaneContainer.remove(item);
                this._splitPaneContainer.split(item, index + (position === 'before' ? i : 0));
            }
        }
        this._onInstancesChanged.fire();
    }
    _setActiveInstance(instance) {
        this.setActiveInstanceByIndex(this._getIndexFromId(instance.instanceId));
    }
    _getIndexFromId(terminalId) {
        let terminalIndex = -1;
        this.terminalInstances.forEach((terminalInstance, i) => {
            if (terminalInstance.instanceId === terminalId) {
                terminalIndex = i;
            }
        });
        if (terminalIndex === -1) {
            throw new Error(`Terminal with ID ${terminalId} does not exist (has it already been disposed?)`);
        }
        return terminalIndex;
    }
    setActiveInstanceByIndex(index, force) {
        // Check for invalid value
        if (index < 0 || index >= this._terminalInstances.length) {
            return;
        }
        const oldActiveInstance = this.activeInstance;
        this._activeInstanceIndex = index;
        if (oldActiveInstance !== this.activeInstance || force) {
            this._onInstancesChanged.fire();
            this._onDidChangeActiveInstance.fire(this.activeInstance);
        }
    }
    attachToElement(element) {
        this._container = element;
        // If we already have a group element, we can reparent it
        if (!this._groupElement) {
            this._groupElement = document.createElement('div');
            this._groupElement.classList.add('terminal-group');
        }
        this._container.appendChild(this._groupElement);
        if (!this._splitPaneContainer) {
            this._panelPosition = this._layoutService.getPanelPosition();
            this._terminalLocation = this._viewDescriptorService.getViewLocationById(TERMINAL_VIEW_ID);
            const orientation = this._terminalLocation === 1 /* ViewContainerLocation.Panel */ && isHorizontal(this._panelPosition) ? 1 /* Orientation.HORIZONTAL */ : 0 /* Orientation.VERTICAL */;
            this._splitPaneContainer = this._instantiationService.createInstance(SplitPaneContainer, this._groupElement, orientation);
            this.terminalInstances.forEach(instance => this._splitPaneContainer.split(instance, this._activeInstanceIndex + 1));
        }
    }
    get title() {
        if (this._terminalInstances.length === 0) {
            // Normally consumers should not call into title at all after the group is disposed but
            // this is required when the group is used as part of a tree.
            return '';
        }
        let title = this.terminalInstances[0].title + this._getBellTitle(this.terminalInstances[0]);
        if (this.terminalInstances[0].description) {
            title += ` (${this.terminalInstances[0].description})`;
        }
        for (let i = 1; i < this.terminalInstances.length; i++) {
            const instance = this.terminalInstances[i];
            if (instance.title) {
                title += `, ${instance.title + this._getBellTitle(instance)}`;
                if (instance.description) {
                    title += ` (${instance.description})`;
                }
            }
        }
        return title;
    }
    _getBellTitle(instance) {
        if (this._terminalConfigurationService.config.enableBell && instance.statusList.statuses.some(e => e.id === "bell" /* TerminalStatus.Bell */)) {
            return '*';
        }
        return '';
    }
    setVisible(visible) {
        this._visible = visible;
        if (this._groupElement) {
            this._groupElement.style.display = visible ? '' : 'none';
        }
        this.terminalInstances.forEach(i => i.setVisible(visible));
    }
    split(shellLaunchConfig) {
        const instance = this._terminalInstanceService.createInstance(shellLaunchConfig, TerminalLocation.Panel);
        this.addInstance(instance, shellLaunchConfig.parentTerminalId);
        this._setActiveInstance(instance);
        return instance;
    }
    addDisposable(disposable) {
        this._register(disposable);
    }
    layout(width, height) {
        if (this._splitPaneContainer) {
            // Check if the panel position changed and rotate panes if so
            const newPanelPosition = this._layoutService.getPanelPosition();
            const newTerminalLocation = this._viewDescriptorService.getViewLocationById(TERMINAL_VIEW_ID);
            const terminalPositionChanged = newPanelPosition !== this._panelPosition || newTerminalLocation !== this._terminalLocation;
            if (terminalPositionChanged) {
                const newOrientation = newTerminalLocation === 1 /* ViewContainerLocation.Panel */ && isHorizontal(newPanelPosition) ? 1 /* Orientation.HORIZONTAL */ : 0 /* Orientation.VERTICAL */;
                this._splitPaneContainer.setOrientation(newOrientation);
                this._panelPosition = newPanelPosition;
                this._terminalLocation = newTerminalLocation;
                this._onPanelOrientationChanged.fire(this._splitPaneContainer.orientation);
            }
            this._splitPaneContainer.layout(width, height);
            if (this._initialRelativeSizes && this._visible) {
                this.resizePanes(this._initialRelativeSizes);
                this._initialRelativeSizes = undefined;
            }
        }
    }
    focusPreviousPane() {
        const newIndex = this._activeInstanceIndex === 0 ? this._terminalInstances.length - 1 : this._activeInstanceIndex - 1;
        this.setActiveInstanceByIndex(newIndex);
    }
    focusNextPane() {
        const newIndex = this._activeInstanceIndex === this._terminalInstances.length - 1 ? 0 : this._activeInstanceIndex + 1;
        this.setActiveInstanceByIndex(newIndex);
    }
    _getPosition() {
        switch (this._terminalLocation) {
            case 1 /* ViewContainerLocation.Panel */:
                return this._panelPosition;
            case 0 /* ViewContainerLocation.Sidebar */:
                return this._layoutService.getSideBarPosition();
            case 2 /* ViewContainerLocation.AuxiliaryBar */:
                return this._layoutService.getSideBarPosition() === 0 /* Position.LEFT */ ? 1 /* Position.RIGHT */ : 0 /* Position.LEFT */;
            default:
                return this._panelPosition;
        }
    }
    _getOrientation() {
        return isHorizontal(this._getPosition()) ? 1 /* Orientation.HORIZONTAL */ : 0 /* Orientation.VERTICAL */;
    }
    resizePane(direction) {
        if (!this._splitPaneContainer) {
            return;
        }
        const isHorizontalResize = (direction === 0 /* Direction.Left */ || direction === 1 /* Direction.Right */);
        const groupOrientation = this._getOrientation();
        const shouldResizePart = (isHorizontalResize && groupOrientation === 0 /* Orientation.VERTICAL */) ||
            (!isHorizontalResize && groupOrientation === 1 /* Orientation.HORIZONTAL */);
        const font = this._terminalConfigurationService.getFont(getWindow(this._groupElement));
        // TODO: Support letter spacing and line height
        const charSize = (isHorizontalResize ? font.charWidth : font.charHeight);
        if (charSize) {
            let resizeAmount = charSize * 4 /* Constants.ResizePartCellCount */;
            if (shouldResizePart) {
                const position = this._getPosition();
                const shouldShrink = (position === 0 /* Position.LEFT */ && direction === 0 /* Direction.Left */) ||
                    (position === 1 /* Position.RIGHT */ && direction === 1 /* Direction.Right */) ||
                    (position === 2 /* Position.BOTTOM */ && direction === 3 /* Direction.Down */) ||
                    (position === 3 /* Position.TOP */ && direction === 2 /* Direction.Up */);
                if (shouldShrink) {
                    resizeAmount *= -1;
                }
                this._layoutService.resizePart(this._paneCompositePartService.getPartId(this._terminalLocation), resizeAmount, resizeAmount);
            }
            else {
                this._splitPaneContainer.resizePane(this._activeInstanceIndex, direction, resizeAmount);
            }
        }
    }
    resizePanes(relativeSizes) {
        if (!this._splitPaneContainer) {
            this._initialRelativeSizes = relativeSizes;
            return;
        }
        this._splitPaneContainer.resizePanes(relativeSizes);
    }
};
TerminalGroup = __decorate([
    __param(2, ITerminalConfigurationService),
    __param(3, ITerminalInstanceService),
    __param(4, IPaneCompositePartService),
    __param(5, IWorkbenchLayoutService),
    __param(6, IViewDescriptorService),
    __param(7, IInstantiationService)
], TerminalGroup);
export { TerminalGroup };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVybWluYWxHcm91cC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL3Rlcm1pbmFsL2Jyb3dzZXIvdGVybWluYWxHcm91cC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSx1QkFBdUIsQ0FBQztBQUN6RCxPQUFPLEVBQUUsS0FBSyxFQUFFLE9BQU8sRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQ2xFLE9BQU8sRUFBZSxVQUFVLEVBQUUsZUFBZSxFQUFFLE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUN2SCxPQUFPLEVBQUUsU0FBUyxFQUFzQixNQUFNLEVBQUUsTUFBTSxvREFBb0QsQ0FBQztBQUMzRyxPQUFPLEVBQUUsWUFBWSxFQUFFLHVCQUF1QixFQUFZLE1BQU0sbURBQW1ELENBQUM7QUFDcEgsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sNERBQTRELENBQUM7QUFDbkcsT0FBTyxFQUFnRCx3QkFBd0IsRUFBRSw2QkFBNkIsRUFBRSxNQUFNLGVBQWUsQ0FBQztBQUN0SSxPQUFPLEVBQXlCLHNCQUFzQixFQUFFLE1BQU0sMEJBQTBCLENBQUM7QUFDekYsT0FBTyxFQUFrRCxnQkFBZ0IsRUFBRSxNQUFNLGtEQUFrRCxDQUFDO0FBRXBJLE9BQU8sRUFBRSxTQUFTLEVBQUUsTUFBTSxpQ0FBaUMsQ0FBQztBQUM1RCxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDNUQsT0FBTyxFQUFFLE1BQU0sRUFBRSxRQUFRLEVBQXFCLE1BQU0sa0NBQWtDLENBQUM7QUFDdkYsT0FBTyxFQUFFLHlCQUF5QixFQUFFLE1BQU0sMERBQTBELENBQUM7QUFFckcsSUFBVyxTQVVWO0FBVkQsV0FBVyxTQUFTO0lB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