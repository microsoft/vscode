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
import { addDisposableListener, getWindow } from '../../../base/browser/dom.js';
import { StandardMouseEvent } from '../../../base/browser/mouseEvent.js';
import { ToggleMenuAction, ToolBar } from '../../../base/browser/ui/toolbar/toolbar.js';
import { Separator, toAction } from '../../../base/common/actions.js';
import { coalesceInPlace } from '../../../base/common/arrays.js';
import { intersection } from '../../../base/common/collections.js';
import { BugIndicatingError } from '../../../base/common/errors.js';
import { Emitter } from '../../../base/common/event.js';
import { Iterable } from '../../../base/common/iterator.js';
import { DisposableStore } from '../../../base/common/lifecycle.js';
import { localize } from '../../../nls.js';
import { createActionViewItem, getActionBarActions } from './menuEntryActionViewItem.js';
import { IMenuService, MenuItemAction, SubmenuItemAction } from '../common/actions.js';
import { createConfigureKeybindingAction } from '../common/menuService.js';
import { ICommandService } from '../../commands/common/commands.js';
import { IContextKeyService } from '../../contextkey/common/contextkey.js';
import { IContextMenuService } from '../../contextview/browser/contextView.js';
import { IKeybindingService } from '../../keybinding/common/keybinding.js';
import { ITelemetryService } from '../../telemetry/common/telemetry.js';
import { IActionViewItemService } from './actionViewItemService.js';
import { IInstantiationService } from '../../instantiation/common/instantiation.js';
export var HiddenItemStrategy;
(function (HiddenItemStrategy) {
    /** This toolbar doesn't support hiding*/
    HiddenItemStrategy[HiddenItemStrategy["NoHide"] = -1] = "NoHide";
    /** Hidden items aren't shown anywhere */
    HiddenItemStrategy[HiddenItemStrategy["Ignore"] = 0] = "Ignore";
    /** Hidden items move into the secondary group */
    HiddenItemStrategy[HiddenItemStrategy["RenderInSecondaryGroup"] = 1] = "RenderInSecondaryGroup";
})(HiddenItemStrategy || (HiddenItemStrategy = {}));
/**
 * The `WorkbenchToolBar` does
 * - support hiding of menu items
 * - lookup keybindings for each actions automatically
 * - send `workbenchActionExecuted`-events for each action
 *
 * See {@link MenuWorkbenchToolBar} for a toolbar that is backed by a menu.
 */
let WorkbenchToolBar = class WorkbenchToolBar extends ToolBar {
    constructor(container, _options, _menuService, _contextKeyService, _contextMenuService, _keybindingService, _commandService, telemetryService) {
        super(container, _contextMenuService, {
            // defaults
            getKeyBinding: (action) => _keybindingService.lookupKeybinding(action.id) ?? undefined,
            // options (override defaults)
            ..._options,
            // mandatory (overide options)
            allowContextMenu: true,
            skipTelemetry: typeof _options?.telemetrySource === 'string',
        });
        this._options = _options;
        this._menuService = _menuService;
        this._contextKeyService = _contextKeyService;
        this._contextMenuService = _contextMenuService;
        this._keybindingService = _keybindingService;
        this._commandService = _commandService;
        this._sessionDisposables = this._store.add(new DisposableStore());
        // telemetry logic
        const telemetrySource = _options?.telemetrySource;
        if (telemetrySource) {
            this._store.add(this.actionBar.onDidRun(e => telemetryService.publicLog2('workbenchActionExecuted', { id: e.action.id, from: telemetrySource })));
        }
    }
    setActions(_primary, _secondary = [], menuIds) {
        this._sessionDisposables.clear();
        const primary = _primary.slice(); // for hiding and overflow we set some items to undefined
        const secondary = _secondary.slice();
        const toggleActions = [];
        let toggleActionsCheckedCount = 0;
        const extraSecondary = [];
        let someAreHidden = false;
        // unless disabled, move all hidden items to secondary group or ignore them
        if (this._options?.hiddenItemStrategy !== -1 /* HiddenItemStrategy.NoHide */) {
            for (let i = 0; i < primary.length; i++) {
                const action = primary[i];
                if (!(action instanceof MenuItemAction) && !(action instanceof SubmenuItemAction)) {
                    // console.warn(`Action ${action.id}/${action.label} is not a MenuItemAction`);
                    continue;
                }
                if (!action.hideActions) {
                    continue;
                }
                // collect all toggle actions
                toggleActions.push(action.hideActions.toggle);
                if (action.hideActions.toggle.checked) {
                    toggleActionsCheckedCount++;
                }
                // hidden items move into overflow or ignore
                if (action.hideActions.isHidden) {
                    someAreHidden = true;
                    primary[i] = undefined;
                    if (this._options?.hiddenItemStrategy !== 0 /* HiddenItemStrategy.Ignore */) {
                        extraSecondary[i] = action;
                    }
                }
            }
        }
        // count for max
        if (this._options?.overflowBehavior !== undefined) {
            const exemptedIds = intersection(new Set(this._options.overflowBehavior.exempted), Iterable.map(primary, a => a?.id));
            const maxItems = this._options.overflowBehavior.maxItems - exemptedIds.size;
            let count = 0;
            for (let i = 0; i < primary.length; i++) {
                const action = primary[i];
                if (!action) {
                    continue;
                }
                count++;
                if (exemptedIds.has(action.id)) {
                    continue;
                }
                if (count >= maxItems) {
                    primary[i] = undefined;
                    extraSecondary[i] = action;
                }
            }
        }
        // coalesce turns Array<IAction|undefined> into IAction[]
        coalesceInPlace(primary);
        coalesceInPlace(extraSecondary);
        super.setActions(Separator.clean(primary), Separator.join(extraSecondary, secondary));
        // add context menu for toggle and configure keybinding actions
        if (toggleActions.length > 0 || primary.length > 0) {
            this._sessionDisposables.add(addDisposableListener(this.getElement(), 'contextmenu', e => {
                const event = new StandardMouseEvent(getWindow(this.getElement()), e);
                const action = this.getItemAction(event.target);
                if (!(action)) {
                    return;
                }
                event.preventDefault();
                event.stopPropagation();
                const primaryActions = [];
                // -- Configure Keybinding Action --
                if (action instanceof MenuItemAction && action.menuKeybinding) {
                    primaryActions.push(action.menuKeybinding);
                }
                else if (!(action instanceof SubmenuItemAction || action instanceof ToggleMenuAction)) {
                    // only enable the configure keybinding action for actions that support keybindings
                    const supportsKeybindings = !!this._keybindingService.lookupKeybinding(action.id);
                    primaryActions.push(createConfigureKeybindingAction(this._commandService, this._keybindingService, action.id, undefined, supportsKeybindings));
                }
                // -- Hide Actions --
                if (toggleActions.length > 0) {
                    let noHide = false;
                    // last item cannot be hidden when using ignore strategy
                    if (toggleActionsCheckedCount === 1 && this._options?.hiddenItemStrategy === 0 /* HiddenItemStrategy.Ignore */) {
                        noHide = true;
                        for (let i = 0; i < toggleActions.length; i++) {
                            if (toggleActions[i].checked) {
                                toggleActions[i] = toAction({
                                    id: action.id,
                                    label: action.label,
                                    checked: true,
                                    enabled: false,
                                    run() { }
                                });
                                break; // there is only one
                            }
                        }
                    }
                    // add "hide foo" actions
                    if (!noHide && (action instanceof MenuItemAction || action instanceof SubmenuItemAction)) {
                        if (!action.hideActions) {
                            // no context menu for MenuItemAction instances that support no hiding
                            // those are fake actions and need to be cleaned up
                            return;
                        }
                        primaryActions.push(action.hideActions.hide);
                    }
                    else {
                        primaryActions.push(toAction({
                            id: 'label',
                            label: localize('hide', "Hide"),
                            enabled: false,
                            run() { }
                        }));
                    }
                }
                const actions = Separator.join(primaryActions, toggleActions);
                // add "Reset Menu" action
                if (this._options?.resetMenu && !menuIds) {
                    menuIds = [this._options.resetMenu];
                }
                if (someAreHidden && menuIds) {
                    actions.push(new Separator());
                    actions.push(toAction({
                        id: 'resetThisMenu',
                        label: localize('resetThisMenu', "Reset Menu"),
                        run: () => this._menuService.resetHiddenStates(menuIds)
                    }));
                }
                if (actions.length === 0) {
                    return;
                }
                this._contextMenuService.showContextMenu({
                    getAnchor: () => event,
                    getActions: () => actions,
                    // add context menu actions (iff appicable)
                    menuId: this._options?.contextMenu,
                    menuActionOptions: { renderShortTitle: true, ...this._options?.menuOptions },
                    skipTelemetry: typeof this._options?.telemetrySource === 'string',
                    contextKeyService: this._contextKeyService,
                });
            }));
        }
    }
};
WorkbenchToolBar = __decorate([
    __param(2, IMenuService),
    __param(3, IContextKeyService),
    __param(4, IContextMenuService),
    __param(5, IKeybindingService),
    __param(6, ICommandService),
    __param(7, ITelemetryService)
], WorkbenchToolBar);
export { WorkbenchToolBar };
/**
 * A {@link WorkbenchToolBar workbench toolbar} that is purely driven from a {@link MenuId menu}-identifier.
 *
 * *Note* that Manual updates via `setActions` are NOT supported.
 */
let MenuWorkbenchToolBar = class MenuWorkbenchToolBar extends WorkbenchToolBar {
    get onDidChangeMenuItems() { return this._onDidChangeMenuItems.event; }
    constructor(container, menuId, options, menuService, contextKeyService, contextMenuService, keybindingService, commandService, telemetryService, actionViewService, instantiationService) {
        super(container, {
            resetMenu: menuId,
            ...options,
            actionViewItemProvider: (action, opts) => {
                let provider = actionViewService.lookUp(menuId, action instanceof SubmenuItemAction ? action.item.submenu.id : action.id);
                if (!provider) {
                    provider = options?.actionViewItemProvider;
                }
                const viewItem = provider?.(action, opts, instantiationService, getWindow(container).vscodeWindowId);
                if (viewItem) {
                    return viewItem;
                }
                return createActionViewItem(instantiationService, action, opts);
            }
        }, menuService, contextKeyService, contextMenuService, keybindingService, commandService, telemetryService);
        this._onDidChangeMenuItems = this._store.add(new Emitter());
        this._container = container;
        this._menuOptions = options?.menuOptions;
        this._toolbarOptions = options?.toolbarOptions;
        // update logic
        this._menu = this._store.add(menuService.createMenu(menuId, contextKeyService, { emitEventsForSubmenuChanges: true, eventDebounceDelay: options?.eventDebounceDelay }));
        this._store.add(this._menu.onDidChange(() => {
            this._updateToolbar();
            this._onDidChangeMenuItems.fire(this);
        }));
        this._store.add(actionViewService.onDidChange(e => {
            if (e === menuId) {
                this._updateToolbar();
            }
        }));
        this._updateToolbar();
    }
    _updateToolbar() {
        const { primary, secondary } = getActionBarActions(this._menu.getActions(this._menuOptions), this._toolbarOptions?.primaryGroup, this._toolbarOptions?.shouldInlineSubmenu, this._toolbarOptions?.useSeparatorsInPrimaryActions);
        this._container.classList.toggle('has-no-actions', primary.length === 0 && secondary.length === 0);
        super.setActions(primary, secondary);
    }
    /**
     * Force the toolbar to immediately re-evaluate its menu actions.
     * Use this after synchronously updating context keys to avoid
     * layout shifts caused by the debounced menu change event.
     */
    refresh() {
        this._updateToolbar();
    }
    /**
     * @deprecated The WorkbenchToolBar does not support this method because it works with menus.
     */
    setActions() {
        throw new BugIndicatingError('This toolbar is populated from a menu.');
    }
};
MenuWorkbenchToolBar = __decorate([
    __param(3, IMenuService),
    __param(4, IContextKeyService),
    __param(5, IContextMenuService),
    __param(6, IKeybindingService),
    __param(7, ICommandService),
    __param(8, ITelemetryService),
    __param(9, IActionViewItemService),
    __param(10, IInstantiationService)
], MenuWorkbenchToolBar);
export { MenuWorkbenchToolBar };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidG9vbGJhci5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3BsYXRmb3JtL2FjdGlvbnMvYnJvd3Nlci90b29sYmFyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxTQUFTLEVBQUUsTUFBTSw4QkFBOEIsQ0FBQztBQUNoRixPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUN6RSxPQUFPLEVBQW1CLGdCQUFnQixFQUFFLE9BQU8sRUFBRSxNQUFNLDZDQUE2QyxDQUFDO0FBQ3pHLE9BQU8sRUFBVyxTQUFTLEVBQWlCLFFBQVEsRUFBdUUsTUFBTSxpQ0FBaUMsQ0FBQztBQUNuSyxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sZ0NBQWdDLENBQUM7QUFDakUsT0FBTyxFQUFFLFlBQVksRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQ25FLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBQ3BFLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSwrQkFBK0IsQ0FBQztBQUN4RCxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDNUQsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQ3BFLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxpQkFBaUIsQ0FBQztBQUMzQyxPQUFPLEVBQUUsb0JBQW9CLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSw4QkFBOEIsQ0FBQztBQUN6RixPQUFPLEVBQTZCLFlBQVksRUFBVSxjQUFjLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxzQkFBc0IsQ0FBQztBQUMxSCxPQUFPLEVBQUUsK0JBQStCLEVBQUUsTUFBTSwwQkFBMEIsQ0FBQztBQUMzRSxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0s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