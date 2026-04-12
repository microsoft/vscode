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
import { IListService, WorkbenchList } from '../../../../platform/list/browser/listService.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { ITerminalConfigurationService, ITerminalGroupService, ITerminalService, ITerminalEditingService } from './terminal.js';
import { localize } from '../../../../nls.js';
import * as DOM from '../../../../base/browser/dom.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ActionBar } from '../../../../base/browser/ui/actionbar/actionbar.js';
import { MenuItemAction } from '../../../../platform/actions/common/actions.js';
import { MenuEntryActionViewItem } from '../../../../platform/actions/browser/menuEntryActionViewItem.js';
import { TerminalLocation } from '../../../../platform/terminal/common/terminal.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Action } from '../../../../base/common/actions.js';
import { DEFAULT_LABELS_CONTAINER, ResourceLabels } from '../../../browser/labels.js';
import { IDecorationsService } from '../../../services/decorations/common/decorations.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import Severity from '../../../../base/common/severity.js';
import { Disposable, DisposableStore, dispose, toDisposable } from '../../../../base/common/lifecycle.js';
import { DataTransfers } from '../../../../base/browser/dnd.js';
import { disposableTimeout } from '../../../../base/common/async.js';
import { ElementsDragAndDropData, NativeDragAndDropData } from '../../../../base/browser/ui/list/listView.js';
import { URI } from '../../../../base/common/uri.js';
import { getColorClass, getIconId, getUriClasses } from './terminalIcon.js';
import { IContextViewService } from '../../../../platform/contextview/browser/contextView.js';
import { InputBox } from '../../../../base/browser/ui/inputbox/inputBox.js';
import { createSingleCallFunction } from '../../../../base/common/functional.js';
import { CodeDataTransfers, containsDragType, getPathForFile } from '../../../../platform/dnd/browser/dnd.js';
import { terminalStrings } from '../common/terminalStrings.js';
import { ILifecycleService } from '../../../services/lifecycle/common/lifecycle.js';
import { TerminalContextKeys } from '../common/terminalContextKey.js';
import { getTerminalResourcesFromDragEvent, parseTerminalUri } from './terminalUri.js';
import { getInstanceHoverInfo } from './terminalTooltip.js';
import { defaultInputBoxStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { Emitter } from '../../../../base/common/event.js';
import { Schemas } from '../../../../base/common/network.js';
import { getColorForSeverity } from './terminalStatusList.js';
import { TerminalContextActionRunner } from './terminalContextMenu.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { isObject } from '../../../../base/common/types.js';
const $ = DOM.$;
export var TerminalTabsListSizes;
(function (TerminalTabsListSizes) {
    TerminalTabsListSizes[TerminalTabsListSizes["TabHeight"] = 22] = "TabHeight";
    TerminalTabsListSizes[TerminalTabsListSizes["NarrowViewWidth"] = 46] = "NarrowViewWidth";
    TerminalTabsListSizes[TerminalTabsListSizes["WideViewMinimumWidth"] = 80] = "WideViewMinimumWidth";
    TerminalTabsListSizes[TerminalTabsListSizes["DefaultWidth"] = 120] = "DefaultWidth";
    TerminalTabsListSizes[TerminalTabsListSizes["MidpointViewWidth"] = 63] = "MidpointViewWidth";
    TerminalTabsListSizes[TerminalTabsListSizes["ActionbarMinimumWidth"] = 105] = "ActionbarMinimumWidth";
    TerminalTabsListSizes[TerminalTabsListSizes["MaximumWidth"] = 500] = "MaximumWidth";
})(TerminalTabsListSizes || (TerminalTabsListSizes = {}));
let TerminalTabList = class TerminalTabList extends WorkbenchList {
    get hasText() { return this._hasText; }
    get hasActionBar() { return this._hasActionBar; }
    constructor(container, contextKeyService, listService, _configurationService, _terminalService, _terminalGroupService, _terminalEditingService, instantiationService, decorationsService, _themeService, _storageService, lifecycleService, _hoverService) {
        super('TerminalTabsList', container, {
            getHeight: () => 22 /* TerminalTabsListSizes.TabHeight */,
            getTemplateId: () => 'terminal.tabs'
        }, [instantiationService.createInstance(TerminalTabsRenderer, container, instantiationService.createInstance(ResourceLabels, DEFAULT_LABELS_CONTAINER), () => this.getSelectedElements(), () => this.hasText, () => this.hasActionBar)], {
            horizontalScrolling: false,
            supportDynamicHeights: false,
            selectionNavigation: true,
            identityProvider: {
                getId: e => e?.instanceId
            },
            accessibilityProvider: instantiationService.createInstance(TerminalTabsAccessibilityProvider),
            smoothScrolling: _configurationService.getValue('workbench.list.smoothScrolling'),
            multipleSelectionSupport: true,
            paddingBottom: 22 /* TerminalTabsListSizes.TabHeight */,
            dnd: instantiationService.createInstance(TerminalTabsDragAndDrop),
            openOnSingleClick: true
        }, contextKeyService, listService, _configurationService, instantiationService);
        this._configurationService = _configurationService;
        this._terminalService = _terminalService;
        this._terminalGroupService = _terminalGroupService;
        this._terminalEditingService = _terminalEditingService;
        this._themeService = _themeService;
        this._storageService = _storageService;
        this._hoverService = _hoverService;
        this._hasText = true;
        this._hasActionBar = true;
        const instanceDisposables = [
            this._terminalGroupService.onDidChangeInstances(() => this.refresh()),
            this._terminalGroupService.onDidChangeGroups(() => this.refresh()),
            this._terminalGroupService.onDidShow(() => this.refresh()),
            this._terminalGroupService.onDidChangeInstanceCapability(() => this.refresh()),
            this._terminalService.onAnyInstanceTitleChange(() => this.refresh()),
            this._terminalService.onAnyInstanceIconChange(() => this.refresh()),
            this._terminalService.onAnyInstancePrimaryStatusChange(() => this.refresh()),
            this._terminalService.onDidChangeConnectionState(() => this.refresh()),
            this._themeService.onDidColorThemeChange(() => this.refresh()),
            this._terminalGroupService.onDidChangeActiveInstance(e => {
                if (e) {
                    const i = this._terminalGroupService.instances.indexOf(e);
                    this.setSelection([i]);
                    this.reveal(i);
                }
                this.refresh();
            }),
            this._storageService.onDidChangeValue(-1 /* StorageScope.APPLICATION */, "terminal.integrated.tabs.showDetailed" /* TerminalStorageKeys.TabsShowDetailed */, this.disposables)(() => this.refresh()),
        ];
        // Dispose of instance listeners on shutdown to avoid extra work and so tabs don't disappear
        // briefly
        this.disposables.add(lifecycleService.onWillShutdown(e => {
            dispose(instanceDisposables);
            instanceDisposables.length = 0;
        }));
        this.disposables.add(toDisposable(() => {
            dispose(instanceDisposables);
            instanceDisposables.length = 0;
        }));
        this.disposables.add(this.onMouseDblClick(async (e) => {
            if (!e.element) {
                e.browserEvent.preventDefault();
                e.browserEvent.stopPropagation();
                const instance = await this._terminalService.createTerminal({ location: TerminalLocation.Panel });
                this._terminalGroupService.setActiveInstance(instance);
                await instance.focusWhenReady();
                return;
            }
            if (this._terminalEditingService.getEditingTerminal()?.instanceId === e.element.instanceId) {
                return;
            }
            if (this._getFocusMode() === 'doubleClick' && this.getFocus().length === 1) {
                e.element.focus(true);
            }
        }));
        // on left click, if focus mode = single click, focus the element
        // unless multi-selection is in progress
        this.disposables.add(this.onMouseClick(async (e) => {
            if (this._terminalEditingService.getEditingTerminal()?.instanceId === e.element?.instanceId) {
                return;
            }
            if (e.browserEvent.altKey && e.element) {
                await this._terminalService.createTerminal({ location: { parentTerminal: e.element } });
            }
            else if (this._getFocusMode() === 'singleClick') {
                if (this.getSelection().length <= 1) {
                    e.element?.focus(true);
                }
            }
        }));
        // on right click, set the focus to that element
        // unless multi-selection is in progress
        this.disposables.add(this.onContextMenu(e => {
            if (!e.element) {
                this.setSelection([]);
                return;
            }
            const selection = this.getSelectedElements();
            if (!selection || !selection.find(s => e.element === s)) {
                this.setFocus(e.index !== undefined ? [e.index] : []);
            }
        }));
        this._terminalTabsSingleSelectedContextKey = TerminalContextKeys.tabsSingularSelection.bindTo(contextKeyService);
        this._isSplitContextKey = TerminalContextKeys.splitTerminalTabFocused.bindTo(contextKeyService);
        this.disposables.add(this.onDidChangeSelection(e => this._updateContextKey()));
        this.disposables.add(this.onDidChangeFocus(() => this._updateContextKey()));
        this.disposables.add(this.onDidOpen(async (e) => {
            const instance = e.element;
            if (!instance) {
                return;
            }
            this._terminalGroupService.setActiveInstance(instance);
            if (!e.editorOptions.preserveFocus) {
                await instance.focusWhenReady();
            }
        }));
        if (!this._decorationsProvider) {
            this._decorationsProvider = this.disposables.add(instantiationService.createInstance(TabDecorationsProvider));
            this.disposables.add(decorationsService.registerDecorationsProvider(this._decorationsProvider));
        }
        this.refresh();
    }
    _getFocusMode() {
        return this._configurationService.getValue("terminal.integrated.tabs.focusMode" /* TerminalSettingId.TabsFocusMode */);
    }
    refresh(cancelEditing = true) {
        if (cancelEditing && this._terminalEditingService.isEditable(undefined)) {
            this.domFocus();
        }
        this.splice(0, this.length, this._terminalGroupService.instances.slice());
    }
    focusHover() {
        const instance = this.getSelectedElements()[0];
        if (!instance) {
            return;
        }
        this._hoverService.showInstantHover({
            ...getInstanceHoverInfo(instance, this._storageService),
            target: this.getHTMLElement(),
            trapFocus: true
        }, true);
    }
    _updateContextKey() {
        this._terminalTabsSingleSelectedContextKey.set(this.getSelectedElements().length === 1);
        const instance = this.getFocusedElements();
        this._isSplitContextKey.set(instance.length > 0 && this._terminalGroupService.instanceIsSplit(instance[0]));
    }
    layout(height, width) {
        super.layout(height, width);
        const actualWidth = width ?? this.getHTMLElement().clientWidth;
        const newHasText = actualWidth >= 63 /* TerminalTabsListSizes.MidpointViewWidth */;
        const newHasActionBar = actualWidth > 105 /* TerminalTabsListSizes.ActionbarMinimumWidth */;
        if (this._hasText !== newHasText || this._hasActionBar !== newHasActionBar) {
            this._hasText = newHasText;
            this._hasActionBar = newHasActionBar;
            this.refresh();
        }
    }
};
TerminalTabList = __decorate([
    __param(1, IContextKeyService),
    __param(2, IListService),
    __param(3, IConfigurationService),
    __param(4, ITerminalService),
    __param(5, ITerminalGroupService),
    __param(6, ITerminalEditingService),
    __param(7, IInstantiationService),
    __param(8, IDecorationsService),
    __param(9, IThemeService),
    __param(10, IStorageService),
    __param(11, ILifecycleService),
    __param(12, IHoverService)
], TerminalTabList);
export { TerminalTabList };
let TerminalTabsRenderer = class TerminalTabsRenderer {
    constructor(_container, _labels, _getSelection, _getHasText, _getHasActionBar, _instantiationService, _terminalConfigurationService, _terminalService, _terminalGroupService, _terminalEditingService, _hoverService, _keybindingService, _listService, _storageService, _themeService, _contextViewService, _commandService) {
        this._labels = _labels;
        this._getSelection = _getSelection;
        this._getHasText = _getHasText;
        this._getHasActionBar = _getHasActionBar;
        this._instantiationService = _instantiationService;
        this._terminalConfigurationService = _terminalConfigurationService;
        this._terminalService = _terminalService;
        this._terminalGroupService = _terminalGroupService;
        this._terminalEditingService = _terminalEditingService;
        this._hoverService = _hoverService;
        this._keybindingService = _keybindingService;
        this._listService = _listService;
        this._storageService = _storageService;
        this._themeService = _themeService;
        this._contextViewService = _contextViewService;
        this._commandService = _commandService;
        this.templateId = 'terminal.tabs';
    }
    renderTemplate(container) {
        const element = DOM.append(container, $('.terminal-tabs-entry'));
        const context = {};
        const templateDisposables = new DisposableStore();
        const label = templateDisposables.add(this._labels.create(element, {
            supportHighlights: true,
            supportDescriptionHighlights: true,
            supportIcons: true,
            hoverDelegate: {
                delay: 0,
                showHover: options => {
                    return this._hoverService.showDelayedHover({
                        ...options,
                        actions: context.hoverActions,
                        target: element,
                        appearance: {
                            showPointer: true
                        },
                        position: {
                            hoverPosition: this._terminalConfigurationService.config.tabs.location === 'left' ? 1 /* HoverPosition.RIGHT */ : 0 /* HoverPosition.LEFT */
                        }
                    }, { groupId: 'terminal-tabs-list' });
                }
            }
        }));
        const actionsContainer = DOM.append(label.element, $('.actions'));
        const actionBar = templateDisposables.add(new ActionBar(actionsContainer, {
            actionRunner: templateDisposables.add(new TerminalContextActionRunner()),
            actionViewItemProvider: (action, options) => action instanceof MenuItemAction
                ? templateDisposables.add(this._instantiationService.createInstance(MenuEntryActionViewItem, action, { hoverDelegate: options.hoverDelegate }))
                : undefined
        }));
        return {
            element,
            label,
            actionBar,
            context,
            elementDisposables: new DisposableStore(),
            templateDisposables
        };
    }
    renderElement(instance, index, template) {
        const hasText = this._getHasText();
        const hasActionBar = this._getHasActionBar();
        const group = this._terminalGroupService.getGroupForInstance(instance);
        if (!group) {
            throw new Error(`Could not find group for instance "${instance.instanceId}"`);
        }
        template.element.classList.toggle('has-text', hasText);
        template.element.classList.toggle('is-active', this._terminalGroupService.activeInstance === instance);
        let prefix = '';
        if (group.terminalInstances.length > 1) {
            const terminalIndex = group.terminalInstances.indexOf(instance);
            if (terminalIndex === 0) {
                prefix = `┌ `;
            }
            else if (terminalIndex === group.terminalInstances.length - 1) {
                prefix = `└ `;
            }
            else {
                prefix = `├ `;
            }
        }
        const hoverInfo = getInstanceHoverInfo(instance, this._storageService);
        template.context.hoverActions = hoverInfo.actions;
        const iconId = this._instantiationService.invokeFunction(getIconId, instance);
        let label = '';
        if (!hasText) {
            const primaryStatus = instance.statusList.primary;
            // Don't show ignore severity
            if (primaryStatus && primaryStatus.severity > Severity.Ignore) {
                label = `${prefix}$(${primaryStatus.icon?.id || iconId})`;
            }
            else {
                label = `${prefix}$(${iconId})`;
            }
        }
        else {
            this.fillActionBar(instance, template);
            label = prefix;
            // Only add the title if the icon is set, this prevents the title jumping around for
            // example when launching with a ShellLaunchConfig.name and no icon
            if (instance.icon) {
                label += `$(${iconId}) ${instance.title}`;
            }
        }
        if (!hasActionBar) {
            template.actionBar.clear();
        }
        // Kill terminal on middle click
        template.elementDisposables.add(DOM.addDisposableListener(template.element, DOM.EventType.AUXCLICK, e => {
            e.stopImmediatePropagation();
            if (e.button === 1 /*middle*/) {
                this._terminalService.safeDisposeTerminal(instance);
            }
        }));
        const extraClasses = [];
        const colorClass = getColorClass(instance);
        if (colorClass) {
            extraClasses.push(colorClass);
        }
        const uriClasses = getUriClasses(instance, this._themeService.getColorTheme().type);
        if (uriClasses) {
            extraClasses.push(...uriClasses);
        }
        template.label.setResource({
            resource: instance.resource,
            name: label,
            description: hasText ? instance.description : undefined
        }, {
            fileDecorations: {
                colors: true,
                badges: hasText
            },
            title: {
                markdown: hoverInfo.content,
                markdownNotSupportedFallback: undefined
            },
            extraClasses
        });
        const editableData = this._terminalEditingService.getEditableData(instance);
        template.label.element.classList.toggle('editable-tab', !!editableData);
        if (editableData) {
            // eslint-disable-next-line no-restricted-syntax
            template.elementDisposables.add(this._renderInputBox(template.label.element.querySelector('.monaco-icon-label-container'), instance, editableData));
            template.actionBar.clear();
        }
    }
    _renderInputBox(container, instance, editableData) {
        const value = instance.title || '';
        const inputBox = new InputBox(container, this._contextViewService, {
            validationOptions: {
                validation: (value) => {
                    const message = editableData.validationMessage(value);
                    if (!message || message.severity !== Severity.Error) {
                        return null;
                    }
                    return {
                        content: message.content,
                        formatContent: true,
                        type: 3 /* MessageType.ERROR */
                    };
                }
            },
            ariaLabel: localize('terminalInputAriaLabel', "Type terminal name. Press Enter to confirm or Escape to cancel."),
            inputBoxStyles: defaultInputBoxStyles
        });
        inputBox.element.style.height = '22px';
        inputBox.value = value;
        inputBox.focus();
        inputBox.select({ start: 0, end: value.length });
        const done = createSingleCallFunction((success, finishEditing) => {
            inputBox.element.style.display = 'none';
            const value = inputBox.value;
            dispose(toDispose);
            inputBox.element.remove();
            if (finishEditing) {
                editableData.onFinish(value, success);
            }
        });
        const showInputBoxNotification = () => {
            if (inputBox.isInputValid()) {
                const message = editableData.validationMessage(inputBox.value);
                if (message) {
                    inputBox.showMessage({
                        content: message.content,
                        formatContent: true,
                        type: message.severity === Severity.Info ? 1 /* MessageType.INFO */ : message.severity === Severity.Warning ? 2 /* MessageType.WARNING */ : 3 /* MessageType.ERROR */
                    });
                }
                else {
                    inputBox.hideMessage();
                }
            }
        };
        showInputBoxNotification();
        const toDispose = [
            inputBox,
            DOM.addStandardDisposableListener(inputBox.inputElement, DOM.EventType.KEY_DOWN, (e) => {
                e.stopPropagation();
                if (e.equals(3 /* KeyCode.Enter */)) {
                    done(inputBox.isInputValid(), true);
                }
                else if (e.equals(9 /* KeyCode.Escape */)) {
                    done(false, true);
                }
            }),
            DOM.addStandardDisposableListener(inputBox.inputElement, DOM.EventType.KEY_UP, (e) => {
                showInputBoxNotification();
            }),
            DOM.addDisposableListener(inputBox.inputElement, DOM.EventType.BLUR, () => {
                done(inputBox.isInputValid(), true);
            })
        ];
        return toDisposable(() => {
            done(false, false);
        });
    }
    disposeElement(instance, index, templateData) {
        templateData.elementDisposables.clear();
        templateData.actionBar.clear();
    }
    disposeTemplate(templateData) {
        templateData.elementDisposables.dispose();
        templateData.templateDisposables.dispose();
    }
    fillActionBar(instance, template) {
        // If the instance is within the selection, split all selected
        const actions = [
            template.elementDisposables.add(new Action("workbench.action.terminal.splitActiveTab" /* TerminalCommandId.SplitActiveTab */, terminalStrings.split.short, ThemeIcon.asClassName(Codicon.splitHorizontal), true, async () => {
                this._runForSelectionOrInstance(instance, async (e) => {
                    this._terminalService.createTerminal({ location: { parentTerminal: e } });
                });
            })),
        ];
        if (instance.shellLaunchConfig.tabActions) {
            for (const action of instance.shellLaunchConfig.tabActions) {
                actions.push(template.elementDisposables.add(new Action(action.id, action.label, action.icon ? ThemeIcon.asClassName(action.icon) : undefined, true, async () => {
                    this._runForSelectionOrInstance(instance, e => this._commandService.executeCommand(action.id, instance));
                })));
            }
        }
        actions.push(template.elementDisposables.add(new Action("workbench.action.terminal.killActiveTab" /* TerminalCommandId.KillActiveTab */, terminalStrings.kill.short, ThemeIcon.asClassName(Codicon.trashcan), true, async () => {
            this._runForSelectionOrInstance(instance, e => this._terminalService.safeDisposeTerminal(e));
        })));
        // TODO: Cache these in a way that will use the correct instance
        template.actionBar.clear();
        for (const action of actions) {
            template.actionBar.push(action, { icon: true, label: false, keybinding: this._keybindingService.lookupKeybinding(action.id)?.getLabel() });
        }
    }
    _runForSelectionOrInstance(instance, callback) {
        const selection = this._getSelection();
        if (selection.includes(instance)) {
            for (const s of selection) {
                if (s) {
                    callback(s);
                }
            }
        }
        else {
            callback(instance);
        }
        this._terminalGroupService.focusTabs();
        this._listService.lastFocusedList?.focusNext();
    }
};
TerminalTabsRenderer = __decorate([
    __param(5, IInstantiationService),
    __param(6, ITerminalConfigurationService),
    __param(7, ITerminalService),
    __param(8, ITerminalGroupService),
    __param(9, ITerminalEditingService),
    __param(10, IHoverService),
    __param(11, IKeybindingService),
    __param(12, IListService),
    __param(13, IStorageService),
    __param(14, IThemeService),
    __param(15, IContextViewService),
    __param(16, ICommandService)
], TerminalTabsRenderer);
let TerminalTabsAccessibilityProvider = class TerminalTabsAccessibilityProvider {
    constructor(_terminalGroupService) {
        this._terminalGroupService = _terminalGroupService;
    }
    getWidgetAriaLabel() {
        return localize('terminal.tabs', "Terminal tabs");
    }
    getAriaLabel(instance) {
        let ariaLabel = '';
        const tab = this._terminalGroupService.getGroupForInstance(instance);
        if (tab && tab.terminalInstances?.length > 1) {
            const terminalIndex = tab.terminalInstances.indexOf(instance);
            ariaLabel = localize({
                key: 'splitTerminalAriaLabel',
                comment: [
                    `The terminal's ID`,
                    `The terminal's title`,
                    `The terminal's split number`,
                    `The terminal group's total split number`
                ]
            }, "Terminal {0} {1}, split {2} of {3}", instance.instanceId, instance.title, terminalIndex + 1, tab.terminalInstances.length);
        }
        else {
            ariaLabel = localize({
                key: 'terminalAriaLabel',
                comment: [
                    `The terminal's ID`,
                    `The terminal's title`
                ]
            }, "Terminal {0} {1}", instance.instanceId, instance.title);
        }
        return ariaLabel;
    }
};
TerminalTabsAccessibilityProvider = __decorate([
    __param(0, ITerminalGroupService)
], TerminalTabsAccessibilityProvider);
let TerminalTabsDragAndDrop = class TerminalTabsDragAndDrop extends Disposable {
    constructor(_terminalService, _terminalGroupService, _terminalEditingService, _listService) {
        super();
        this._terminalService = _terminalService;
        this._terminalGroupService = _terminalGroupService;
        this._terminalEditingService = _terminalEditingService;
        this._listService = _listService;
        this._autoFocusDisposable = Disposable.None;
        this._primaryBackend = this._terminalService.getPrimaryBackend();
    }
    getDragURI(instance) {
        if (this._terminalEditingService.getEditingTerminal()?.instanceId === instance.instanceId) {
            return null;
        }
        return instance.resource.toString();
    }
    getDragLabel(elements, originalEvent) {
        return elements.length === 1 ? elements[0].title : undefined;
    }
    onDragLeave() {
        this._autoFocusInstance = undefined;
        this._autoFocusDisposable.dispose();
        this._autoFocusDisposable = Disposable.None;
    }
    onDragStart(data, originalEvent) {
        if (!originalEvent.dataTransfer) {
            return;
        }
        const dndData = data.getData();
        if (!Array.isArray(dndData)) {
            return;
        }
        // Attach terminals type to event
        const terminals = dndData.filter(isTerminalInstance);
        if (terminals.length > 0) {
            originalEvent.dataTransfer.setData("Terminals" /* TerminalDataTransfers.Terminals */, JSON.stringify(terminals.map(e => e.resource.toString())));
        }
    }
    onDragOver(data, targetInstance, targetIndex, targetSector, originalEvent) {
        if (data instanceof NativeDragAndDropData) {
            if (!containsDragType(originalEvent, DataTransfers.FILES, DataTransfers.RESOURCES, "Terminals" /* TerminalDataTransfers.Terminals */, CodeDataTransfers.FILES)) {
                return false;
            }
        }
        const didChangeAutoFocusInstance = this._autoFocusInstance !== targetInstance;
        if (didChangeAutoFocusInstance) {
            this._autoFocusDisposable.dispose();
            this._autoFocusInstance = targetInstance;
        }
        if (!targetInstance && !containsDragType(originalEvent, "Terminals" /* TerminalDataTransfers.Terminals */)) {
            return data instanceof ElementsDragAndDropData;
        }
        if (didChangeAutoFocusInstance && targetInstance) {
            this._autoFocusDisposable = disposableTimeout(() => {
                this._terminalService.setActiveInstance(targetInstance);
                this._autoFocusInstance = undefined;
            }, 500, this._store);
        }
        return {
            feedback: targetIndex ? [targetIndex] : undefined,
            accept: true,
            effect: { type: 1 /* ListDragOverEffectType.Move */, position: "drop-target" /* ListDragOverEffectPosition.Over */ }
        };
    }
    async drop(data, targetInstance, targetIndex, targetSector, originalEvent) {
        this._autoFocusDisposable.dispose();
        this._autoFocusInstance = undefined;
        let sourceInstances;
        const promises = [];
        const resources = getTerminalResourcesFromDragEvent(originalEvent);
        if (resources) {
            for (const uri of resources) {
                const instance = this._terminalService.getInstanceFromResource(uri);
                if (instance) {
                    if (Array.isArray(sourceInstances)) {
                        sourceInstances.push(instance);
                    }
                    else {
                        sourceInstances = [instance];
                    }
                    this._terminalService.moveToTerminalView(instance);
                }
                else if (this._primaryBackend) {
                    const terminalIdentifier = parseTerminalUri(uri);
                    if (terminalIdentifier.instanceId) {
                        promises.push(this._primaryBackend.requestDetachInstance(terminalIdentifier.workspaceId, terminalIdentifier.instanceId));
                    }
                }
            }
        }
        if (promises.length) {
            let processes = await Promise.all(promises);
            processes = processes.filter(p => p !== undefined);
            let lastInstance;
            for (const attachPersistentProcess of processes) {
                lastInstance = await this._terminalService.createTerminal({ config: { attachPersistentProcess } });
            }
            if (lastInstance) {
                this._terminalService.setActiveInstance(lastInstance);
            }
            return;
        }
        if (sourceInstances === undefined) {
            if (!(data instanceof ElementsDragAndDropData)) {
                this._handleExternalDrop(targetInstance, originalEvent);
                return;
            }
            const draggedElement = data.getData();
            if (!draggedElement || !Array.isArray(draggedElement)) {
                return;
            }
            sourceInstances = [];
            for (const e of draggedElement) {
                if (isTerminalInstance(e)) {
                    sourceInstances.push(e);
                }
            }
        }
        if (!targetInstance) {
            this._terminalGroupService.moveGroupToEnd(sourceInstances);
            this._terminalService.setActiveInstance(sourceInstances[0]);
            const targetGroup = this._terminalGroupService.getGroupForInstance(sourceInstances[0]);
            if (targetGroup) {
                const index = this._terminalGroupService.groups.indexOf(targetGroup);
                this._listService.lastFocusedList?.setSelection([index]);
            }
            return;
        }
        this._terminalGroupService.moveGroup(sourceInstances, targetInstance);
        this._terminalService.setActiveInstance(sourceInstances[0]);
        const targetGroup = this._terminalGroupService.getGroupForInstance(sourceInstances[0]);
        if (targetGroup) {
            const index = this._terminalGroupService.groups.indexOf(targetGroup);
            this._listService.lastFocusedList?.setSelection([index]);
        }
    }
    async _handleExternalDrop(instance, e) {
        if (!instance || !e.dataTransfer) {
            return;
        }
        // Check if files were dragged from the tree explorer
        let resource;
        const rawResources = e.dataTransfer.getData(DataTransfers.RESOURCES);
        if (rawResources) {
            resource = URI.parse(JSON.parse(rawResources)[0]);
        }
        const rawCodeFiles = e.dataTransfer.getData(CodeDataTransfers.FILES);
        if (!resource && rawCodeFiles) {
            resource = URI.file(JSON.parse(rawCodeFiles)[0]);
        }
        if (!resource && e.dataTransfer.files.length > 0 && getPathForFile(e.dataTransfer.files[0])) {
            // Check if the file was dragged from the filesystem
            resource = URI.file(getPathForFile(e.dataTransfer.files[0]));
        }
        if (!resource) {
            return;
        }
        this._terminalService.setActiveInstance(instance);
        instance.focus();
        await instance.sendPath(resource, false);
    }
};
TerminalTabsDragAndDrop = __decorate([
    __param(0, ITerminalService),
    __param(1, ITerminalGroupService),
    __param(2, ITerminalEditingService),
    __param(3, IListService)
], TerminalTabsDragAndDrop);
let TabDecorationsProvider = class TabDecorationsProvider extends Disposable {
    constructor(_terminalService) {
        super();
        this._terminalService = _terminalService;
        this.label = localize('label', "Terminal");
        this._onDidChange = this._register(new Emitter());
        this.onDidChange = this._onDidChange.event;
        this._register(this._terminalService.onAnyInstancePrimaryStatusChange(e => this._onDidChange.fire([e.resource])));
    }
    provideDecorations(resource) {
        if (resource.scheme !== Schemas.vscodeTerminal) {
            return undefined;
        }
        const instance = this._terminalService.getInstanceFromResource(resource);
        if (!instance) {
            return undefined;
        }
        const primaryStatus = instance?.statusList?.primary;
        if (!primaryStatus?.icon) {
            return undefined;
        }
        return {
            color: getColorForSeverity(primaryStatus.severity),
            letter: primaryStatus.icon,
            tooltip: primaryStatus.tooltip
        };
    }
};
TabDecorationsProvider = __decorate([
    __param(0, ITerminalService)
], TabDecorationsProvider);
function isTerminalInstance(obj) {
    return isObject(obj) && 'instanceId' in obj;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVybWluYWxUYWJzTGlzdC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL3Rlcm1pbmFsL2Jyb3dzZXIvdGVybWluYWxUYWJzTGlzdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsWUFBWSxFQUFFLGFBQWEsRUFBRSxNQUFNLGtEQUFrRCxDQUFDO0FBRS9GLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLDREQUE0RCxDQUFDO0FBQ25HLE9BQU8sRUFBZSxrQkFBa0IsRUFBRSxNQUFNLHNEQUFzRCxDQUFDO0FBQ3ZHLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLHNEQUFzRCxDQUFDO0FBQzFGLE9BQU8sRUFBRSxhQUFhLEVBQUUsTUFBTSxtREFBbUQsQ0FBQztBQUNsRixPQUFPLEVBQUUsU0FBUyxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDakUsT0FBTyxFQUFFLDZCQUE2QixFQUFFLHFCQUFxQixFQUFxQixnQkFBZ0IsRUFBRSx1QkFBdUIsRUFBeUIsTUFBTSxlQUFlLENBQUM7QUFDMUssT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLG9CQUFvQixDQUFDO0FBQzlDLE9BQU8sS0FBSyxHQUFHLE1BQU0saUNBQWlDLENBQUM7QUFDdkQsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sNERBQTRELENBQUM7QUFDbkcsT0FBTyxFQUFFLFNBQVMsRUFBRSxNQUFNLG9EQUFvRCxDQUFDO0FBQy9FLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSxnREFBZ0QsQ0FBQztBQUNoRixPQUFPLEVBQUUsdUJBQXVCLEVBQUUsTUFBTSxpRUFBaUUsQ0FBQztBQUUxRyxPQUFPLEVBQW9CLGdCQUFnQixFQUFxQixNQUFNLGtEQUFrRCxDQUFDO0FBQ3pILE9BQU8sRUFBRSxPQUFPLEVBQUUs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