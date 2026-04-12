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
var AuxiliaryBarPart_1;
import '../../../workbench/browser/parts/auxiliarybar/media/auxiliaryBarPart.css';
import './media/auxiliaryBarPart.css';
import { IContextKeyService } from '../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../../platform/contextview/browser/contextView.js';
import { IInstantiationService } from '../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../platform/keybinding/common/keybinding.js';
import { INotificationService } from '../../../platform/notification/common/notification.js';
import { IStorageService } from '../../../platform/storage/common/storage.js';
import { IThemeService } from '../../../platform/theme/common/themeService.js';
import { ActiveAuxiliaryContext, AuxiliaryBarFocusContext } from '../../../workbench/common/contextkeys.js';
import { ACTIVITY_BAR_BADGE_BACKGROUND, ACTIVITY_BAR_BADGE_FOREGROUND, ACTIVITY_BAR_TOP_ACTIVE_BORDER, ACTIVITY_BAR_TOP_DRAG_AND_DROP_BORDER, ACTIVITY_BAR_TOP_FOREGROUND, ACTIVITY_BAR_TOP_INACTIVE_FOREGROUND, PANEL_ACTIVE_TITLE_BORDER, PANEL_ACTIVE_TITLE_FOREGROUND, PANEL_BORDER, PANEL_DRAG_AND_DROP_BORDER, PANEL_INACTIVE_TITLE_FOREGROUND, SIDE_BAR_TITLE_BORDER, SIDE_BAR_FOREGROUND } from '../../../workbench/common/theme.js';
import { contrastBorder } from '../../../platform/theme/common/colorRegistry.js';
import { sessionsAuxiliaryBarBackground } from '../../common/theme.js';
import { IViewDescriptorService } from '../../../workbench/common/views.js';
import { IExtensionService } from '../../../workbench/services/extensions/common/extensions.js';
import { IWorkbenchLayoutService } from '../../../workbench/services/layout/browser/layoutService.js';
import { assertReturnsDefined } from '../../../base/common/types.js';
import { AbstractPaneCompositePart, CompositeBarPosition } from '../../../workbench/browser/parts/paneCompositePart.js';
import { Part } from '../../../workbench/browser/part.js';
import { IMenuService, MenuId, MenuItemAction } from '../../../platform/actions/common/actions.js';
import { Menus } from '../menus.js';
import { IHoverService } from '../../../platform/hover/browser/hover.js';
import { DropdownWithPrimaryActionViewItem } from '../../../platform/actions/browser/dropdownWithPrimaryActionViewItem.js';
import { getFlatContextMenuActions } from '../../../platform/actions/browser/menuEntryActionViewItem.js';
import { MutableDisposable } from '../../../base/common/lifecycle.js';
import { Extensions } from '../../../workbench/browser/panecomposite.js';
/**
 * Auxiliary bar part specifically for agent sessions workbench.
 * This is a simplified version of the AuxiliaryBarPart for agent session contexts.
 */
let AuxiliaryBarPart = class AuxiliaryBarPart extends AbstractPaneCompositePart {
    static { AuxiliaryBarPart_1 = this; }
    static { this.activeViewSettingsKey = 'workbench.agentsession.auxiliarybar.activepanelid'; }
    static { this.pinnedViewsKey = 'workbench.agentsession.auxiliarybar.pinnedPanels'; }
    static { this.placeholderViewContainersKey = 'workbench.agentsession.auxiliarybar.placeholderPanels'; }
    static { this.viewContainersWorkspaceStateKey = 'workbench.agentsession.auxiliarybar.viewContainersWorkspaceState'; }
    /** Visual margin values for the card-like appearance */
    static { this.MARGIN_TOP = 10; }
    static { this.MARGIN_BOTTOM = 0; }
    static { this.MARGIN_RIGHT = 10; }
    // Action ID for run script - defined here to avoid layering issues
    static { this.RUN_SCRIPT_ACTION_ID = 'workbench.action.agentSessions.runScript'; }
    static { this.RUN_SCRIPT_DROPDOWN_MENU_ID = MenuId.for('AgentSessionsRunScriptDropdown'); }
    get preferredHeight() {
        return this.layoutService.mainContainerDimension.height * 0.4;
    }
    get preferredWidth() {
        const activeComposite = this.getActivePaneComposite();
        if (!activeComposite) {
            return undefined;
        }
        const width = activeComposite.getOptimalWidth();
        if (typeof width !== 'number') {
            return undefined;
        }
        return Math.max(width, 380);
    }
    constructor(notificationService, storageService, contextMenuService, layoutService, keybindingService, hoverService, instantiationService, themeService, viewDescriptorService, contextKeyService, extensionService, menuService) {
        super("workbench.parts.auxiliarybar" /* Parts.AUXILIARYBAR_PART */, {
            hasTitle: true,
            trailingSeparator: false,
            borderWidth: () => 0,
        }, AuxiliaryBarPart_1.activeViewSettingsKey, ActiveAuxiliaryContext.bindTo(contextKeyService), AuxiliaryBarFocusContext.bindTo(contextKeyService), 'auxiliarybar', 'auxiliarybar', undefined, SIDE_BAR_TITLE_BORDER, 2 /* ViewContainerLocation.AuxiliaryBar */, Extensions.Auxiliary, Menus.AuxiliaryBarTitle, Menus.AuxiliaryBarTitleLeft, notificationService, storageService, contextMenuService, layoutService, keybindingService, hoverService, instantiationService, themeService, viewDescriptorService, contextKeyService, extensionService, menuService);
        // Run script dropdown management
        this._runScriptDropdown = this._register(new MutableDisposable());
        this._runScriptMenu = this._register(new MutableDisposable());
        this._runScriptMenuListener = this._register(new MutableDisposable());
        // Sessions-specific auxiliary bar dimensions (intentionally not tied to the sessions SidebarPart values)
        this.minimumWidth = 270;
        this.maximumWidth = Number.POSITIVE_INFINITY;
        this.minimumHeight = 0;
        this.maximumHeight = Number.POSITIVE_INFINITY;
        this.priority = 1 /* LayoutPriority.Low */;
    }
    updateStyles() {
        super.updateStyles();
        const container = assertReturnsDefined(this.getContainer());
        // Store background and border as CSS variables for the card styling on .part
        container.style.setProperty('--part-background', this.getColor(sessionsAuxiliaryBarBackground) || '');
        container.style.setProperty('--part-border-color', this.getColor(PANEL_BORDER) || this.getColor(contrastBorder) || 'transparent');
        container.style.backgroundColor = this.getColor(sessionsAuxiliaryBarBackground) || '';
        container.style.color = this.getColor(SIDE_BAR_FOREGROUND) || '';
        // Clear borders - the card appearance uses border-radius instead
        container.style.borderLeftColor = '';
        container.style.borderRightColor = '';
        container.style.borderLeftStyle = '';
        container.style.borderRightStyle = '';
        container.style.borderLeftWidth = '';
        container.style.borderRightWidth = '';
    }
    getCompositeBarOptions() {
        const $this = this;
        return {
            partContainerClass: 'auxiliarybar',
            pinnedViewContainersKey: AuxiliaryBarPart_1.pinnedViewsKey,
            placeholderViewContainersKey: AuxiliaryBarPart_1.placeholderViewContainersKey,
            viewContainersWorkspaceStateKey: AuxiliaryBarPart_1.viewContainersWorkspaceStateKey,
            icon: false,
            orientation: 0 /* ActionsOrientation.HORIZONTAL */,
            recomputeSizes: true,
            activityHoverOptions: {
                position: () => this.getCompositeBarPosition() === CompositeBarPosition.BOTTOM ? 3 /* HoverPosition.ABOVE */ : 2 /* HoverPosition.BELOW */,
            },
            fillExtraContextMenuActions: actions => this.fillExtraContextMenuActions(actions),
            compositeSize: 0,
            iconSize: 16,
            get overflowActionSize() { return $this.getCompositeBarPosition() === CompositeBarPosition.TITLE ? 40 : 30; },
            colors: theme => ({
                activeBackgroundColor: theme.getColor(sessionsAuxiliaryBarBackground),
                inactiveBackgroundColor: theme.getColor(sessionsAuxiliaryBarBackground),
                get activeBorderBottomColor() { return $this.getCompositeBarPosition() === CompositeBarPosition.TITLE ? theme.getColor(PANEL_ACTIVE_TITLE_BORDER) : theme.getColor(ACTIVITY_BAR_TOP_ACTIVE_BORDER); },
                get activeForegroundColor() { return $this.getCompositeBarPosition() === CompositeBarPosition.TITLE ? theme.getColor(PANEL_ACTIVE_TITLE_FOREGROUND) : theme.getColor(ACTIVITY_BAR_TOP_FOREGROUND); },
                get inactiveForegroundColor() { return $this.getCompositeBarPosition() === CompositeBarPosition.TITLE ? theme.getColor(PANEL_INACTIVE_TITLE_FOREGROUND) : theme.getColor(ACTIVITY_BAR_TOP_INACTIVE_FOREGROUND); },
                badgeBackground: theme.getColor(ACTIVITY_BAR_BADGE_BACKGROUND),
                badgeForeground: theme.getColor(ACTIVITY_BAR_BADGE_FOREGROUND),
                get dragAndDropBorder() { return $this.getCompositeBarPosition() === CompositeBarPosition.TITLE ? theme.getColor(PANEL_DRAG_AND_DROP_BORDER) : theme.getColor(ACTIVITY_BAR_TOP_DRAG_AND_DROP_BORDER); }
            }),
            compact: true
        };
    }
    actionViewItemProvider(action, options) {
        // Create a DropdownWithPrimaryActionViewItem for the run script action
        if (action.id === AuxiliaryBarPart_1.RUN_SCRIPT_ACTION_ID && action instanceof MenuItemAction) {
            // Create and store the menu so we can listen for changes
            if (!this._runScriptMenu.value) {
                this._runScriptMenu.value = this.menuService.createMenu(AuxiliaryBarPart_1.RUN_SCRIPT_DROPDOWN_MENU_ID, this.contextKeyService);
                this._runScriptMenuListener.value = this._runScriptMenu.value.onDidChange(() => this._updateRunScriptDropdown());
            }
            const dropdownActions = this._getRunScriptDropdownActions();
            const dropdownAction = {
                id: 'runScriptDropdown',
                label: '',
                tooltip: '',
                class: undefined,
                enabled: true,
                run: () => { }
            };
            this._runScriptDropdown.value = this.instantiationService.createInstance(DropdownWithPrimaryActionViewItem, action, dropdownAction, dropdownActions, '', {
                hoverDelegate: options.hoverDelegate,
                getKeyBinding: (action) => this.keybindingService.lookupKeybinding(action.id, this.contextKeyService)
            });
            return this._runScriptDropdown.value;
        }
        return super.actionViewItemProvider(action, options);
    }
    _getRunScriptDropdownActions() {
        if (!this._runScriptMenu.value) {
            return [];
        }
        return getFlatContextMenuActions(this._runScriptMenu.value.getActions({ shouldForwardArgs: true }));
    }
    _updateRunScriptDropdown() {
        if (this._runScriptDropdown.value) {
            const dropdownActions = this._getRunScriptDropdownActions();
            const dropdownAction = {
                id: 'runScriptDropdown',
                label: '',
                tooltip: '',
                class: undefined,
                enabled: true,
                run: () => { }
            };
            this._runScriptDropdown.value.update(dropdownAction, dropdownActions);
        }
    }
    fillExtraContextMenuActions(_actions) { }
    shouldShowCompositeBar() {
        return true;
    }
    getCompositeBarPosition() {
        return CompositeBarPosition.TITLE;
    }
    layout(width, height, top, left) {
        if (!this.layoutService.isVisible("workbench.parts.auxiliarybar" /* Parts.AUXILIARYBAR_PART */)) {
            return;
        }
        // Layout content with reduced dimensions to account for visual margins and border
        const borderTotal = 2; // 1px border on each side
        super.layout(width - AuxiliaryBarPart_1.MARGIN_RIGHT - borderTotal, height - AuxiliaryBarPart_1.MARGIN_TOP - AuxiliaryBarPart_1.MARGIN_BOTTOM - borderTotal, top, left);
        // Restore the full grid-allocated dimensions so that Part.relayout() works correctly.
        // Part.layout() only stores _dimension and _contentPosition - no other side effects.
        Part.prototype.layout.call(this, width, height, top, left);
    }
    toJSON() {
        return {
            type: "workbench.parts.auxiliarybar" /* Parts.AUXILIARYBAR_PART */
        };
    }
};
AuxiliaryBarPart = AuxiliaryBarPart_1 = __decorate([
    __param(0, INotificationService),
    __param(1, IStorageService),
    __param(2, IContextMenuService),
    __param(3, IWorkbenchLayoutService),
    __param(4, IKeybindingService),
    __param(5, IHoverService),
    __param(6, IInstantiationService),
    __param(7, IThemeService),
    __param(8, IViewDescriptorService),
    __param(9, IContextKeyService),
    __param(10, IExtensionService),
    __param(11, IMenuService)
], AuxiliaryBarPart);
export { AuxiliaryBarPart };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXV4aWxpYXJ5QmFyUGFydC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3Nlc3Npb25zL2Jyb3dzZXIvcGFydHMvYXV4aWxpYXJ5QmFyUGFydC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7Ozs7QUFFaEcsT0FBTywwRUFBMEUsQ0FBQztBQUNsRixPQUFPLDhCQUE4QixDQUFDO0FBQ3RDLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLG1EQUFtRCxDQUFDO0FBQ3ZGLE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLHNEQUFzRCxDQUFDO0FBQzNGLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLHlEQUF5RCxDQUFDO0FBQ2hHLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLG1EQUFtRCxDQUFDO0FBQ3ZGLE9BQU8sRUFBRSxvQkFBb0IsRUFBRSxNQUFNLHVEQUF1RCxDQUFDO0FBQzdGLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSw2Q0FBNkMsQ0FBQztBQUM5RSxPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0sZ0RBQWdELENBQUM7QUFDL0UsT0FBTyxFQUFFLHNCQUFzQixFQUFFLHdCQUF3QixFQUFFLE1BQU0sMENBQTBDLENBQUM7QUFDNUcsT0FBTyxFQUFFLDZCQUE2QixFQUFFLDZCQUE2QixFQUFFLDhCQUE4QixFQUFFLHFDQUFxQyxFQUFFLDJCQUEyQixFQUFFLG9DQUFvQyxFQUFFLHlCQUF5QixFQUFFLDZCQUE2QixFQUFFLFlBQVksRUFBRSwwQkFBMEIsRUFBRSwrQkFBK0IsRUFBRSxxQkFBcUIsRUFBRSxtQkFBbUIsRUFBRSxNQUFNLG9DQUFvQyxDQUFDO0FBQzdhLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSxpREFBaUQsQ0FBQztBQUNqRixPQUFPLEVBQUUsOEJBQThCLEVBQUUsTUFBTSx1QkFBdUIsQ0FBQztBQUN2RSxP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