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
var CommandCenterCenterViewItem_1;
import { isActiveDocument, reset } from '../../../../base/browser/dom.js';
import { BaseActionViewItem } from '../../../../base/browser/ui/actionbar/actionViewItems.js';
import { getDefaultHoverDelegate } from '../../../../base/browser/ui/hover/hoverDelegateFactory.js';
import { renderIcon } from '../../../../base/browser/ui/iconLabel/iconLabels.js';
import { SubmenuAction } from '../../../../base/common/actions.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { autorun } from '../../../../base/common/observable.js';
import { localize } from '../../../../nls.js';
import { createActionViewItem } from '../../../../platform/actions/browser/menuEntryActionViewItem.js';
import { MenuWorkbenchToolBar, WorkbenchToolBar } from '../../../../platform/actions/browser/toolbar.js';
import { MenuId, MenuRegistry, SubmenuItemAction } from '../../../../platform/actions/common/actions.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { IQuickInputService } from '../../../../platform/quickinput/common/quickInput.js';
import { IEditorGroupsService } from '../../../services/editor/common/editorGroupsService.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
const AI_DISABLED_SETTING = 'chat.disableAIFeatures';
const AI_CUSTOMIZATION_MENU_ENABLED_SETTING = 'chat.customizationsMenu.enabled';
const AGENT_STATUS_ENABLED_SETTING = 'chat.agentsControl.enabled';
let CommandCenterControl = class CommandCenterControl {
    constructor(windowTitle, hoverDelegate, instantiationService, quickInputService) {
        this._disposables = new DisposableStore();
        this._onDidChangeVisibility = this._disposables.add(new Emitter());
        this.onDidChangeVisibility = this._onDidChangeVisibility.event;
        this.element = document.createElement('div');
        this.element.classList.add('command-center');
        const titleToolbar = instantiationService.createInstance(MenuWorkbenchToolBar, this.element, MenuId.CommandCenter, {
            contextMenu: MenuId.TitleBarContext,
            hiddenItemStrategy: -1 /* HiddenItemStrategy.NoHide */,
            toolbarOptions: {
                primaryGroup: () => true,
            },
            telemetrySource: 'commandCenter',
            actionViewItemProvider: (action, options) => {
                if (action instanceof SubmenuItemAction && action.item.submenu === MenuId.CommandCenterCenter) {
                    return instantiationService.createInstance(CommandCenterCenterViewItem, action, windowTitle, { ...options, hoverDelegate });
                }
                else {
                    return createActionViewItem(instantiationService, action, { ...options, hoverDelegate });
                }
            }
        });
        let quickInputVisible = false;
        this._disposables.add(Event.filter(quickInputService.onShow, () => isActiveDocument(this.element), this._disposables)(() => {
            quickInputVisible = true;
            this._setVisibility(quickInputService.alignment.get() !== 'top');
        }));
        this._disposables.add(quickInputService.onHide(() => {
            quickInputVisible = false;
            this._setVisibility(true);
        }));
        this._disposables.add(autorun(reader => {
            const alignment = quickInputService.alignment.read(reader);
            if (quickInputVisible) {
                this._setVisibility(alignment !== 'top');
            }
        }));
        this._disposables.add(titleToolbar);
    }
    _setVisibility(show) {
        this.element.classList.toggle('hide', !show);
        this._onDidChangeVisibility.fire();
    }
    dispose() {
        this._disposables.dispose();
    }
};
CommandCenterControl = __decorate([
    __param(2, IInstantiationService),
    __param(3, IQuickInputService)
], CommandCenterControl);
export { CommandCenterControl };
let CommandCenterCenterViewItem = class CommandCenterCenterViewItem extends BaseActionViewItem {
    static { CommandCenterCenterViewItem_1 = this; }
    static { this._quickOpenCommandId = 'workbench.action.quickOpenWithModes'; }
    constructor(_submenu, _windowTitle, options, _hoverService, _keybindingService, _instaService, _editorGroupService, _configurationService) {
        super(undefined, _submenu.actions.find(action => action.id === 'workbench.action.quickOpenWithModes') ?? _submenu.actions[0], options);
        this._submenu = _submenu;
        this._windowTitle = _windowTitle;
        this._hoverService = _hoverService;
        this._keybindingService = _keybindingService;
        this._instaService = _instaService;
        this._editorGroupService = _editorGroupService;
        this._configurationService = _configurationService;
        this._hoverDelegate = options.hoverDelegate ?? getDefaultHoverDelegate('mouse');
    }
    render(container) {
        super.render(container);
        container.classList.add('command-center-center');
        container.classList.toggle('multiple', (this._submenu.actions.length > 1));
        const hover = this._store.add(this._hoverService.setupManagedHover(this._hoverDelegate, container, this.getTooltip()));
        // update label & tooltip when window title changes
        this._store.add(this._windowTitle.onDidChange(() => {
            hover.update(this.getTooltip());
        }));
        const groups = [];
        for (const action of this._submenu.actions) {
            if (action instanceof SubmenuAction) {
                groups.push(action.actions);
            }
            else {
                groups.push([action]);
            }
        }
        for (let i = 0; i < groups.length; i++) {
            const group = groups[i];
            // nested toolbar
            const toolbar = this._instaService.createInstance(WorkbenchToolBar, container, {
                hiddenItemStrategy: -1 /* HiddenItemStrategy.NoHide */,
                telemetrySource: 'commandCenterCenter',
                actionViewItemProvider: (action, options) => {
                    options = {
                        ...options,
                        hoverDelegate: this._hoverDelegate,
                    };
                    if (action.id !== CommandCenterCenterViewItem_1._quickOpenCommandId) {
                        return createActionViewItem(this._instaService, action, options);
                    }
                    const that = this;
                    return this._instaService.createInstance(class CommandCenterQuickPickItem extends BaseActionViewItem {
                        constructor() {
                            super(undefined, action, options);
                        }
                        render(container) {
                            super.render(container);
                            container.classList.toggle('command-center-quick-pick');
                            container.role = 'button';
                            container.setAttribute('aria-description', this.getTooltip());
                            // When agent control mode is 'compact', hide search icon and left-align the label
                            // Backward compat: the old boolean setting (true) and the new default (undefined) both map to compact
                            const aiFeaturesDisabled = that._configurationService.getValue(AI_DISABLED_SETTING) === true;
                            const aiCustomizationsDisabled = that._configurationService.getValue('disableAICustomizations') === true
                                || that._configurationService.getValue('workbench.disableAICustomizations') === true
                                || that._configurationService.getValue(AI_CUSTOMIZATION_MENU_ENABLED_SETTING) === false;
                            const forcedHidden = aiFeaturesDisabled && aiCustomizationsDisabled;
                            const agentControlValue = that._configurationService.getValue(AGENT_STATUS_ENABLED_SETTING);
                            const isCompactMode = !forcedHidden && (agentControlValue === true || agentControlValue === undefined || agentControlValue === 'compact');
                            container.classList.toggle('compact-mode', isCompactMode);
                            const action = this.action;
                            // icon (search) - hidden in compact mode
                            const searchIcon = document.createElement('span');
                            searchIcon.ariaHidden = 'true';
                            searchIcon.className = action.class ?? '';
                            searchIcon.classList.add('search-icon');
                            // label: just workspace name and optional decorations
                            const label = this._getLabel();
                            const labelElement = document.createElement('span');
                            labelElement.classList.add('search-label');
                            labelElement.textContent = label;
                            if (isCompactMode) {
                                reset(container, labelElement);
                            }
                            else {
                                reset(container, searchIcon, labelElement);
                            }
                            const hover = this._store.add(that._hoverService.setupManagedHover(that._hoverDelegate, container, this.getTooltip()));
                            // update label & tooltip when window title changes
                            this._store.add(that._windowTitle.onDidChange(() => {
                                hover.update(this.getTooltip());
                                labelElement.textContent = this._getLabel();
                            }));
                            // update label & tooltip when tabs visibility changes
                            this._store.add(that._editorGroupService.onDidChangeEditorPartOptions(({ newPartOptions, oldPartOptions }) => {
                                if (newPartOptions.showTabs !== oldPartOptions.showTabs) {
                                    hover.update(this.getTooltip());
                                    labelElement.textContent = this._getLabel();
                                }
                            }));
                        }
                        getTooltip() {
                            return that.getTooltip();
                        }
                        _getLabel() {
                            const { prefix, suffix } = that._windowTitle.getTitleDecorations();
                            let label = that._windowTitle.workspaceName;
                            if (that._windowTitle.isCustomTitleFormat()) {
                                label = that._windowTitle.getWindowTitle();
                            }
                            else if (that._editorGroupService.partOptions.showTabs === 'none') {
                                label = that._windowTitle.fileName ?? label;
                            }
                            if (!label) {
                                label = localize('label.dfl', "Search");
                            }
                            if (prefix) {
                                label = localize('label1', "{0} {1}", prefix, label);
                            }
                            if (suffix) {
                                label = localize('label2', "{0} {1}", label, suffix);
                            }
                            return label.replaceAll(/\r\n|\r|\n/g, '\u23CE');
                        }
                    });
                }
            });
            toolbar.setActions(group);
            this._store.add(toolbar);
            // spacer
            if (i < groups.length - 1) {
                const icon = renderIcon(Codicon.circleSmallFilled);
                icon.style.padding = '0 8px';
                icon.style.height = '100%';
                icon.style.opacity = '0.5';
                container.appendChild(icon);
            }
        }
    }
    getTooltip() {
        // tooltip: full windowTitle
        const kb = this._keybindingService.lookupKeybinding(this.action.id)?.getLabel();
        const title = kb
            ? localize('title', "Search {0} ({1}) \u2014 {2}", this._windowTitle.workspaceName, kb, this._windowTitle.value)
            : localize('title2', "Search {0} \u2014 {1}", this._windowTitle.workspaceName, this._windowTitle.value);
        return title;
    }
};
CommandCenterCenterViewItem = CommandCenterCenterViewItem_1 = __decorate([
    __param(3, IHoverService),
    __param(4, IKeybindingService),
    __param(5, IInstantiationService),
    __param(6, IEditorGroupsService),
    __param(7, IConfigurationService)
], CommandCenterCenterViewItem);
MenuRegistry.appendMenuItem(MenuId.CommandCenter, {
    submenu: MenuId.CommandCenterCenter,
    title: localize('title3', "Command Center"),
    icon: Codicon.shield,
    order: 101,
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29tbWFuZENlbnRlckNvbnRyb2wuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvYnJvd3Nlci9wYXJ0cy90aXRsZWJhci9jb21tYW5kQ2VudGVyQ29udHJvbC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLGdCQUFnQixFQUFFLEtBQUssRUFBRSxNQUFNLGlDQUFpQyxDQUFDO0FBQzFFLE9BQU8sRUFBRSxrQkFBa0IsRUFBOEIsTUFBTSwwREFBMEQsQ0FBQztBQUMxSCxPQUFPLEVBQUUsdUJBQXVCLEVBQUUsTUFBTSwyREFBMkQsQ0FBQztBQUVwRyxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0scURBQXFELENBQUM7QUFDakYsT0FBTyxFQUFXLGFBQWEsRUFBRSxNQUFNLG9DQUFvQyxDQUFDO0FBQzVFLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUM5RCxPQUFPLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQ2xFLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUN2RSxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sdUNBQXVDLENBQUM7QUFDaEUsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLG9CQUFvQixDQUFDO0FBQzlDLE9BQU8sRUFBRSxvQkFBb0IsRUFBRSxNQUFNLGlFQUFpRSxDQUFDO0FBQ3ZHLE9BQU8sRUFBc0Isb0JBQW9CLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSxpREFBaUQsQ0FBQztBQUM3SCxPQUFPLEVBQUUsTUFBTSxFQUFFLFlBQVksRUFBRSxpQkFBaUIsRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBQ3pHLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLDREQUE0RCxDQUFDO0FBQ25HLE9B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