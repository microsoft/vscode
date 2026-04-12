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
var AuxiliaryEditorPart_1, AuxiliaryEditorPartImpl_1;
import { onDidChangeFullscreen } from '../../../../base/browser/browser.js';
import { $, getActiveWindow, hide, show } from '../../../../base/browser/dom.js';
import { mainWindow } from '../../../../base/browser/window.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { DisposableStore, markAsSingleton, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { isNative } from '../../../../base/common/platform.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ContextKeyExpr, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ServiceCollection } from '../../../../platform/instantiation/common/serviceCollection.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { hasCustomTitlebar } from '../../../../platform/window/common/window.js';
import { EditorPart } from './editorPart.js';
import { WindowTitle } from '../titlebar/windowTitle.js';
import { IAuxiliaryWindowService } from '../../../services/auxiliaryWindow/browser/auxiliaryWindowService.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { IHostService } from '../../../services/host/browser/host.js';
import { IWorkbenchLayoutService, shouldShowCustomTitleBar } from '../../../services/layout/browser/layoutService.js';
import { ILifecycleService } from '../../../services/lifecycle/common/lifecycle.js';
import { IStatusbarService } from '../../../services/statusbar/browser/statusbar.js';
import { ITitleService } from '../../../services/title/browser/titleService.js';
import { Action2, MenuId, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { localize, localize2 } from '../../../../nls.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { IsAuxiliaryWindowContext, IsAuxiliaryWindowFocusedContext, IsCompactTitleBarContext } from '../../../common/contextkeys.js';
import { Categories } from '../../../../platform/action/common/actionCommonCategories.js';
const compactWindowEmitter = markAsSingleton(new Emitter());
registerAction2(class extends Action2 {
    constructor() {
        super({
            id: 'workbench.action.toggleCompactAuxiliaryWindow',
            title: localize2('toggleCompactAuxiliaryWindow', "Toggle Window Compact Mode"),
            category: Categories.View,
            f1: true,
            precondition: IsAuxiliaryWindowFocusedContext
        });
    }
    async run() {
        compactWindowEmitter.fire({ windowId: getActiveWindow().vscodeWindowId, compact: 'toggle' });
    }
});
registerAction2(class extends Action2 {
    constructor() {
        super({
            id: 'workbench.action.enableCompactAuxiliaryWindow',
            title: localize('enableCompactAuxiliaryWindow', "Turn On Compact Mode"),
            icon: Codicon.screenFull,
            menu: {
                id: MenuId.LayoutControlMenu,
                when: ContextKeyExpr.and(IsCompactTitleBarContext.toNegated(), IsAuxiliaryWindowContext),
                order: 0
            }
        });
    }
    async run() {
        compactWindowEmitter.fire({ windowId: getActiveWindow().vscodeWindowId, compact: true });
    }
});
registerAction2(class extends Action2 {
    constructor() {
        super({
            id: 'workbench.action.disableCompactAuxiliaryWindow',
            title: localize('disableCompactAuxiliaryWindow', "Turn Off Compact Mode"),
            icon: Codicon.screenNormal,
            menu: {
                id: MenuId.LayoutControlMenu,
                when: ContextKeyExpr.and(IsCompactTitleBarContext, IsAuxiliaryWindowContext),
                order: 0
            }
        });
    }
    async run() {
        compactWindowEmitter.fire({ windowId: getActiveWindow().vscodeWindowId, compact: false });
    }
});
let AuxiliaryEditorPart = class AuxiliaryEditorPart {
    static { AuxiliaryEditorPart_1 = this; }
    static { this.STATUS_BAR_VISIBILITY = 'workbench.statusBar.visible'; }
    constructor(editorPartsView, instantiationService, auxiliaryWindowService, lifecycleService, configurationService, statusbarService, titleService, editorService, layoutService) {
        this.editorPartsView = editorPartsView;
        this.instantiationService = instantiationService;
        this.auxiliaryWindowService = auxiliaryWindowService;
        this.lifecycleService = lifecycleService;
        this.configurationService = configurationService;
        this.statusbarService = statusbarService;
        this.titleService = titleService;
        this.editorService = editorService;
        this.layoutService = layoutService;
    }
    async create(label, options) {
        const that = this;
        const disposables = new DisposableStore();
        let compact = Boolean(options?.compact);
        function computeEditorPartHeightOffset() {
            let editorPartHeightOffset = 0;
            if (statusbarVisible) {
                editorPartHeightOffset += statusbarPart.height;
            }
            if (titlebarPart && titlebarVisible) {
                editorPartHeightOffset += titlebarPart.height;
            }
            return editorPartHeightOffset;
        }
        function updateStatusbarVisibility(fromEvent) {
            if (statusbarVisible) {
                show(statusbarPart.container);
            }
            else {
                hide(statusbarPart.container);
            }
            if (fromEvent) {
                auxiliaryWindow.layout();
            }
        }
        function updateTitlebarVisibility(fromEvent) {
            if (!titlebarPart) {
                return;
            }
            if (titlebarVisible) {
                show(titlebarPart.container);
            }
            else {
                hide(titlebarPart.container);
            }
            if (fromEvent) {
                auxiliaryWindow.layout();
            }
        }
        function updateCompact(newCompact) {
            if (newCompact === compact) {
                return;
            }
            compact = newCompact;
            auxiliaryWindow.updateOptions({ compact });
            titlebarPart?.updateOptions({ compact });
            editorPart.updateOptions({ compact });
            const oldStatusbarVisible = statusbarVisible;
            statusbarVisible = !compact && that.configurationService.getValue(AuxiliaryEditorPart_1.STATUS_BAR_VISIBILITY) !== false;
            if (oldStatusbarVisible !== statusbarVisible) {
                updateStatusbarVisibility(true);
            }
        }
        // Auxiliary Window
        const auxiliaryWindow = disposables.add(await this.auxiliaryWindowService.open(options));
        // Editor Part
        const editorPartContainer = $('.part.editor', { role: 'main' });
        editorPartContainer.style.position = 'relative';
        auxiliaryWindow.container.appendChild(editorPartContainer);
        const editorPart = disposables.add(this.instantiationService.createInstance(AuxiliaryEditorPartImpl, auxiliaryWindow.window.vscodeWindowId, this.editorPartsView, options?.state, label));
        editorPart.updateOptions({ compact });
        disposables.add(this.editorPartsView.registerPart(editorPart));
        editorPart.create(editorPartContainer);
        const scopedEditorPartInstantiationService = disposables.add(editorPart.scopedInstantiationService.createChild(new ServiceCollection([IEditorService, this.editorService.createScoped(editorPart, disposables)])));
        // Titlebar
        let titlebarPart = undefined;
        let titlebarVisible = false;
        const useCustomTitle = isNative && hasCustomTitlebar(this.configurationService); // custom title in aux windows only enabled in native
        if (useCustomTitle) {
            titlebarPart = disposables.add(this.titleService.createAuxiliaryTitlebarPart(auxiliaryWindow.container, editorPart, scopedEditorPartInstantiationService));
            titlebarPart.updateOptions({ compact });
            titlebarVisible = shouldShowCustomTitleBar(this.configurationService, auxiliaryWindow.window, undefined);
            const handleTitleBarVisibilityEvent = () => {
                const oldTitlebarPartVisible = titlebarVisible;
                titlebarVisible = shouldShowCustomTitleBar(this.configurationService, auxiliaryWindow.window, undefined);
                if (oldTitlebarPartVisible !== titlebarVisible) {
                    updateTitlebarVisibility(true);
                }
            };
            disposables.add(titlebarPart.onDidChange(() => auxiliaryWindow.layout()));
            disposables.add(this.layoutService.onDidChangePartVisibility(() => handleTitleBarVisibilityEvent()));
            disposables.add(onDidChangeFullscreen(windowId => {
                if (windowId !== auxiliaryWindow.window.vscodeWindowId) {
                    return; // ignore all but our window
                }
                handleTitleBarVisibilityEvent();
            }));
            updateTitlebarVisibility(false);
        }
        else {
            disposables.add(scopedEditorPartInstantiationService.createInstance(WindowTitle, auxiliaryWindow.window));
        }
        // Statusbar
        const statusbarPart = disposables.add(this.statusbarService.createAuxiliaryStatusbarPart(auxiliaryWindow.container, scopedEditorPartInstantiationService));
        let statusbarVisible = !compact && this.configurationService.getValue(AuxiliaryEditorPart_1.STATUS_BAR_VISIBILITY) !== false;
        disposables.add(this.configurationService.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration(AuxiliaryEditorPart_1.STATUS_BAR_VISIBILITY)) {
                statusbarVisible = !compact && this.configurationService.getValue(AuxiliaryEditorPart_1.STATUS_BAR_VISIBILITY) !== false;
                updateStatusbarVisibility(true);
            }
        }));
        updateStatusbarVisibility(false);
        // Lifecycle
        const editorCloseListener = disposables.add(Event.once(editorPart.onWillClose)(() => auxiliaryWindow.window.close()));
        disposables.add(Event.once(auxiliaryWindow.onUnload)(() => {
            if (disposables.isDisposed) {
                return; // the close happened as part of an earlier dispose call
            }
            editorCloseListener.dispose();
            editorPart.close();
            disposables.dispose();
        }));
        disposables.add(Event.once(this.lifecycleService.onDidShutdown)(() => disposables.dispose()));
        disposables.add(auxiliaryWindow.onBeforeUnload(event => {
            for (const group of editorPart.groups) {
                for (const editor of group.editors) {
                    // Closing an auxiliary window with opened editors
                    // will move the editors to the main window. As such,
                    // we need to validate that we can move and otherwise
                    // prevent the window from closing.
                    const canMoveVeto = editor.canMove(group.id, this.editorPartsView.mainPart.activeGroup.id);
                    if (typeof canMoveVeto === 'string') {
                        group.openEditor(editor);
                        event.veto(canMoveVeto);
                        return;
                    }
                }
            }
        }));
        // Layout: specifically `onWillLayout` to have a chance
        // to build the aux editor part before other components
        // have a chance to react.
        disposables.add(auxiliaryWindow.onWillLayout(dimension => {
            const titlebarPartHeight = titlebarPart?.height ?? 0;
            titlebarPart?.layout(dimension.width, titlebarPartHeight, 0, 0);
            const editorPartHeight = dimension.height - computeEditorPartHeightOffset();
            editorPart.layout(dimension.width, editorPartHeight, titlebarPartHeight, 0);
            statusbarPart.layout(dimension.width, statusbarPart.height, dimension.height - statusbarPart.height, 0);
        }));
        auxiliaryWindow.layout();
        // Compact mode
        disposables.add(compactWindowEmitter.event(e => {
            if (e.windowId === auxiliaryWindow.window.vscodeWindowId) {
                let newCompact;
                if (typeof e.compact === 'boolean') {
                    newCompact = e.compact;
                }
                else {
                    newCompact = !compact;
                }
                updateCompact(newCompact);
            }
        }));
        disposables.add(editorPart.onDidAddGroup(group => {
            updateCompact(false); // leave compact mode when a group is added
            disposables.add(group.onDidActiveEditorChange(() => {
                if (group.count > 1) {
                    updateCompact(false); // leave compact mode when more than 1 editor is active
                }
            }));
        }));
        disposables.add(editorPart.activeGroup.onDidActiveEditorChange(() => {
            if (editorPart.activeGroup.count > 1) {
                updateCompact(false); // leave compact mode when more than 1 editor is active
            }
        }));
        // Have a scoped instantiation service that is scoped to the auxiliary window
        const scopedInstantiationService = disposables.add(scopedEditorPartInstantiationService.createChild(new ServiceCollection([IStatusbarService, this.statusbarService.createScoped(statusbarPart, disposables)])));
        return {
            part: editorPart,
            instantiationService: scopedInstantiationService,
            disposables
        };
    }
};
AuxiliaryEditorPart = AuxiliaryEditorPart_1 = __decorate([
    __param(1, IInstantiationService),
    __param(2, IAuxiliaryWindowService),
    __param(3, ILifecycleService),
    __param(4, IConfigurationService),
    __param(5, IStatusbarService),
    __param(6, ITitleService),
    __param(7, IEditorService),
    __param(8, IWorkbenchLayoutService)
], AuxiliaryEditorPart);
export { AuxiliaryEditorPart };
let AuxiliaryEditorPartImpl = class AuxiliaryEditorPartImpl extends EditorPart {
    static { AuxiliaryEditorPartImpl_1 = this; }
    static { this.COUNTER = 1; }
    constructor(windowId, editorPartsView, state, groupsLabel, instantiationService, themeService, configurationService, storageService, layoutService, hostService, contextKeyService) {
        const id = AuxiliaryEditorPartImpl_1.COUNTER++;
        super(editorPartsView, `workbench.parts.auxiliaryEditor.${id}`, groupsLabel, windowId, instantiationService, themeService, configurationService, storageService, layoutService, hostService, contextKeyService);
        this.state = state;
        this._onWillClose = this._register(new Emitter());
        this.onWillClose = this._onWillClose.event;
        this.optionsDisposable = this._register(new MutableDisposable());
        this.isCompact = false;
    }
    handleContextKeys() {
        const isAuxiliaryWindowContext = IsAuxiliaryWindowContext.bindTo(this.scopedContextKeyService);
        isAuxiliaryWindowContext.set(true);
        super.handleContextKeys();
    }
    updateOptions(options) {
        this.isCompact = options.compact;
        if (options.compact) {
            if (!this.optionsDisposable.value) {
                this.optionsDisposable.value = this.enforcePartOptions({
                    showTabs: 'none',
                    closeEmptyGroups: true
                });
            }
        }
        else {
            this.optionsDisposable.clear();
        }
    }
    addGroup(location, direction, groupToCopy) {
        if (this.isCompact) {
            // When in compact mode, we prefer to open groups in the main part
            // as compact mode is typically meant for showing just 1 editor.
            location = this.editorPartsView.mainPart.activeGroup;
        }
        return super.addGroup(location, direction, groupToCopy);
    }
    removeGroup(group, preserveFocus) {
        // Close aux window when last group removed
        const groupView = this.assertGroupView(group);
        if (this.count === 1 && this.activeGroup === groupView) {
            this.doRemoveLastGroup(preserveFocus);
        }
        // Otherwise delegate to parent implementation
        else {
            super.removeGroup(group, preserveFocus);
        }
    }
    doRemoveLastGroup(preserveFocus) {
        const restoreFocus = !preserveFocus && this.shouldRestoreFocus(this.container);
        // Activate next group when closing
        const mostRecentlyActiveGroups = this.editorPartsView.getGroups(1 /* GroupsOrder.MOST_RECENTLY_ACTIVE */);
        const nextActiveGroup = mostRecentlyActiveGroups[1]; // [0] will be the current group we are about to dispose
        if (nextActiveGroup) {
            nextActiveGroup.groupsView.activateGroup(nextActiveGroup, undefined, 1 /* GroupActivationReason.PART_CLOSE */);
        }
        // Deal with focus: focus the next recently used group but skip
        // this if the next group is in the main part and the main part
        // is currently hidden, as that would make it visible.
        if (nextActiveGroup && restoreFocus) {
            const nextGroupInHiddenMainPart = nextActiveGroup.groupsView === this.editorPartsView.mainPart && !this.layoutService.isVisible("workbench.parts.editor" /* Parts.EDITOR_PART */, mainWindow);
            if (!nextGroupInHiddenMainPart) {
                nextActiveGroup.focus();
            }
        }
        this.doClose(false /* do not merge any confirming editors to main part */);
    }
    loadState() {
        return this.state;
    }
    saveState() {
        return; // disabled, auxiliary editor part state is tracked outside
    }
    close() {
        return this.doClose(true /* merge all confirming editors to main part */);
    }
    doClose(mergeConfirmingEditorsToMainPart) {
        let result = true;
        if (mergeConfirmingEditorsToMainPart) {
            // First close all editors that are non-confirming
            for (const group of this.groups) {
                group.closeAllEditors({ excludeConfirming: true });
            }
            // Then merge remaining to main part
            result = this.mergeGroupsToMainPart();
            if (!result) {
                return false; // Do not close when editors could not be merged back
            }
        }
        this._onWillClose.fire();
        return result;
    }
    mergeGroupsToMainPart() {
        if (!this.groups.some(group => group.count > 0)) {
            return true; // skip if we have no editors opened
        }
        // Find the most recent group that is not locked
        let targetGroup = undefined;
        for (const group of this.editorPartsView.mainPart.getGroups(1 /* GroupsOrder.MOST_RECENTLY_ACTIVE */)) {
            if (!group.isLocked) {
                targetGroup = group;
                break;
            }
        }
        if (!targetGroup) {
            targetGroup = this.editorPartsView.mainPart.addGroup(this.editorPartsView.mainPart.activeGroup, this.partOptions.openSideBySideDirection === 'right' ? 3 /* GroupDirection.RIGHT */ : 1 /* GroupDirection.DOWN */);
        }
        const result = this.mergeAllGroups(targetGroup, {
            // Try to reduce the impact of closing the auxiliary window
            // as much as possible by not changing existing editors
            // in the main window.
            preserveExistingIndex: true
        });
        targetGroup.focus();
        return result;
    }
};
AuxiliaryEditorPartImpl = AuxiliaryEditorPartImpl_1 = __decorate([
    __param(4, IInstantiationService),
    __param(5, IThemeService),
    __param(6, IConfigurationService),
    __param(7, IStorageService),
    __param(8, IWorkbenchLayoutService),
    __param(9, IHostService),
    __param(10, IContextKeyService)
], AuxiliaryEditorPartImpl);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXV4aWxpYXJ5RWRpdG9yUGFydC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9icm93c2VyL3BhcnRzL2VkaXRvci9hdXhpbGlhcnlFZGl0b3JQYXJ0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUM1RSxPQUFPLEVBQUUsQ0FBQyxFQUFFLGVBQWUsRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFLE1BQU0saUNBQWlDLENBQUM7QUFDakYsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLG9DQUFvQyxDQUFDO0FBQ2hFLE9BQU8sRUFBRSxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDbEUsT0FBTyxFQUFFLGVBQWUsRUFBRSxlQUFlLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUMzRyxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDL0QsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sNERBQTRELENBQUM7QUFDbkcsT0FBTyxFQUFFLGNBQWMsRUFBRSxrQkFBa0IsRUFBRSxNQUFNLHNEQUFzRCxDQUFDO0FBQzFHLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLDREQUE0RCxDQUFDO0FBQ25HLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLGdFQUFnRSxDQUFDO0FBQ25HLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSxnREFBZ0QsQ0FBQztBQUNqRixPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0sbURBQW1ELENBQUM7QUFDbEYsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sOENBQThDLENBQUM7QUFFakYsT0FBTyxFQUFFLFVBQVUsRUFBc0IsTUFBTSxpQkFBaUIs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