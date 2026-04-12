/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as DOM from '../../dom.js';
import { ActionBar } from '../actionbar/actionbar.js';
import { DropdownMenuActionViewItem } from '../dropdown/dropdownActionViewItem.js';
import { Action, Separator, SubmenuAction } from '../../../common/actions.js';
import { Codicon } from '../../../common/codicons.js';
import { ThemeIcon } from '../../../common/themables.js';
import { EventMultiplexer } from '../../../common/event.js';
import { Disposable, DisposableStore, toDisposable } from '../../../common/lifecycle.js';
import './toolbar.css';
import * as nls from '../../../../nls.js';
import { createInstantHoverDelegate } from '../hover/hoverDelegateFactory.js';
const ACTION_MIN_WIDTH = 20; /* 20px codicon */
const ACTION_PADDING = 4; /* 4px padding */
const ACTION_MIN_WIDTH_VAR = '--vscode-toolbar-action-min-width';
/**
 * A widget that combines an action bar for primary actions and a dropdown for secondary actions.
 */
export class ToolBar extends Disposable {
    get onDidChangeDropdownVisibility() { return this._onDidChangeDropdownVisibility.event; }
    constructor(container, contextMenuProvider, options = { orientation: 0 /* ActionsOrientation.HORIZONTAL */ }) {
        super();
        this.container = container;
        this.submenuActionViewItems = [];
        this.hasSecondaryActions = false;
        this._onDidChangeDropdownVisibility = this._register(new EventMultiplexer());
        this.originalPrimaryActions = [];
        this.originalSecondaryActions = [];
        this.hiddenActions = [];
        this.disposables = this._register(new DisposableStore());
        options.hoverDelegate = options.hoverDelegate ?? this._register(createInstantHoverDelegate());
        this.options = options;
        this.toggleMenuAction = this._register(new ToggleMenuAction(() => this.toggleMenuActionViewItem?.show(), options.toggleMenuTitle));
        this.element = document.createElement('div');
        this.element.className = 'monaco-toolbar';
        container.appendChild(this.element);
        this.actionBar = this._register(new ActionBar(this.element, {
            orientation: options.orientation,
            ariaLabel: options.ariaLabel,
            actionRunner: options.actionRunner,
            allowContextMenu: options.allowContextMenu,
            highlightToggledItems: options.highlightToggledItems,
            hoverDelegate: options.hoverDelegate,
            actionViewItemProvider: (action, viewItemOptions) => {
                if (action.id === ToggleMenuAction.ID) {
                    this.toggleMenuActionViewItem = new DropdownMenuActionViewItem(action, { getActions: () => this.toggleMenuAction.menuActions }, contextMenuProvider, {
                        actionViewItemProvider: this.options.actionViewItemProvider,
                        actionRunner: this.actionRunner,
                        keybindingProvider: this.options.getKeyBinding,
                        classNames: ThemeIcon.asClassNameArray(options.moreIcon ?? Codicon.toolBarMore),
                        anchorAlignmentProvider: this.options.anchorAlignmentProvider,
                        menuAsChild: !!this.options.renderDropdownAsChildElement,
                        skipTelemetry: this.options.skipTelemetry,
                        isMenu: true,
                        hoverDelegate: this.options.hoverDelegate
                    });
                    this.toggleMenuActionViewItem.setActionContext(this.actionBar.context);
                    this.disposables.add(this._onDidChangeDropdownVisibility.add(this.toggleMenuActionViewItem.onDidChangeVisibility));
                    return this.toggleMenuActionViewItem;
                }
                if (options.actionViewItemProvider) {
                    const result = options.actionViewItemProvider(action, viewItemOptions);
                    if (result) {
                        return result;
                    }
                }
                if (action instanceof SubmenuAction) {
                    const result = new DropdownMenuActionViewItem(action, action.actions, contextMenuProvider, {
                        actionViewItemProvider: this.options.actionViewItemProvider,
                        actionRunner: this.actionRunner,
                        keybindingProvider: this.options.getKeyBinding,
                        classNames: action.class,
                        anchorAlignmentProvider: this.options.anchorAlignmentProvider,
                        menuAsChild: !!this.options.renderDropdownAsChildElement,
                        skipTelemetry: this.options.skipTelemetry,
                        hoverDelegate: this.options.hoverDelegate
                    });
                    result.setActionContext(this.actionBar.context);
                    this.submenuActionViewItems.push(result);
                    this.disposables.add(this._onDidChangeDropdownVisibility.add(result.onDidChangeVisibility));
                    return result;
                }
                return undefined;
            }
        }));
        // Responsive support
        if (this.options.responsiveBehavior?.enabled) {
            this.element.classList.toggle('responsive', true);
            this.element.classList.toggle('responsive-all', this.options.responsiveBehavior.kind === 'all');
            this.element.classList.toggle('responsive-last', this.options.responsiveBehavior.kind === 'last');
            this.element.style.setProperty(ACTION_MIN_WIDTH_VAR, `${this.getConfiguredActionMinWidth()}px`);
            const observer = new ResizeObserver(() => {
                this.updateActions(this.element.getBoundingClientRect().width);
            });
            observer.observe(this.element);
            this._store.add(toDisposable(() => observer.disconnect()));
        }
    }
    set actionRunner(actionRunner) {
        this.actionBar.actionRunner = actionRunner;
    }
    get actionRunner() {
        return this.actionBar.actionRunner;
    }
    set context(context) {
        this.actionBar.context = context;
        this.toggleMenuActionViewItem?.setActionContext(context);
        for (const actionViewItem of this.submenuActionViewItems) {
            actionViewItem.setActionContext(context);
        }
    }
    getElement() {
        return this.element;
    }
    focus() {
        this.actionBar.focus();
    }
    getItemsWidth() {
        let itemsWidth = 0;
        for (let i = 0; i < this.actionBar.length(); i++) {
            itemsWidth += this.actionBar.getWidth(i);
        }
        return itemsWidth;
    }
    getItemAction(indexOrElement) {
        return this.actionBar.getAction(indexOrElement);
    }
    getItemWidth(index) {
        return this.actionBar.getWidth(index);
    }
    getItemsLength() {
        return this.actionBar.length();
    }
    setAriaLabel(label) {
        this.actionBar.setAriaLabel(label);
    }
    /**
     * Force the responsive overflow logic to re-evaluate item visibility.
     * Call this after action view items change their rendered size externally
     * (e.g. label text changes) without the toolbar being notified.
     */
    relayout() {
        if (this.options.responsiveBehavior?.enabled) {
            const width = this.element.getBoundingClientRect().width;
            this.updateActions(width);
        }
    }
    setActions(primaryActions, secondaryActions) {
        this.clear();
        // Store primary and secondary actions as rendered initially
        this.originalPrimaryActions = primaryActions ? primaryActions.slice(0) : [];
        this.originalSecondaryActions = secondaryActions ? secondaryActions.slice(0) : [];
        const primaryActionsToSet = primaryActions ? primaryActions.slice(0) : [];
        // Inject additional action to open secondary actions if present
        this.hasSecondaryActions = !!(secondaryActions && secondaryActions.length > 0);
        if (this.hasSecondaryActions && secondaryActions) {
            this.toggleMenuAction.menuActions = secondaryActions.slice(0);
            primaryActionsToSet.push(this.toggleMenuAction);
        }
        if (primaryActionsToSet.length > 0 && this.options.trailingSeparator) {
            primaryActionsToSet.push(new Separator());
        }
        primaryActionsToSet.forEach(action => {
            this.actionBar.push(action, { icon: this.options.icon ?? true, label: this.options.label ?? false, keybinding: this.getKeybindingLabel(action) });
        });
        this.updateOverflowClassName();
        this.applyResponsiveActionMinWidths();
        if (this.options.responsiveBehavior?.enabled) {
            // Reset hidden actions
            this.hiddenActions.length = 0;
            // Set the minimum width
            if (this.options.responsiveBehavior?.minItems !== undefined) {
                const itemCount = this.options.responsiveBehavior.minItems;
                const primaryActionsMinWidth = this.originalPrimaryActions
                    .slice(0, itemCount)
                    .reduce((total, action) => total + this.getActionMinWidth(action), 0);
                // Account for overflow menu
                let overflowWidth = 0;
                if (this.originalSecondaryActions.length > 0 ||
                    itemCount < this.originalPrimaryActions.length) {
                    overflowWidth = ACTION_MIN_WIDTH + ACTION_PADDING;
                }
                this.container.style.minWidth = `${primaryActionsMinWidth + overflowWidth}px`;
                this.element.style.minWidth = `${primaryActionsMinWidth + overflowWidth}px`;
            }
            else {
                const minimumActionWidth = this.originalPrimaryActions.length > 0 ? this.getActionMinWidth(this.originalPrimaryActions[0]) : ACTION_MIN_WIDTH + ACTION_PADDING;
                this.container.style.minWidth = `${minimumActionWidth}px`;
                this.element.style.minWidth = `${minimumActionWidth}px`;
            }
            // Update toolbar actions to fit with container width
            this.updateActions(this.element.getBoundingClientRect().width);
        }
    }
    isEmpty() {
        return this.actionBar.isEmpty();
    }
    getKeybindingLabel(action) {
        const key = this.options.getKeyBinding?.(action);
        return key?.getLabel() ?? undefined;
    }
    getConfiguredActionMinWidth(action) {
        if (action?.id === ToggleMenuAction.ID) {
            return ACTION_MIN_WIDTH;
        }
        return this.options.responsiveBehavior?.getActionMinWidth?.(action ?? this.toggleMenuAction)
            ?? this.options.responsiveBehavior?.actionMinWidth
            ?? ACTION_MIN_WIDTH;
    }
    getActionMinWidth(action) {
        return this.getConfiguredActionMinWidth(action) + ACTION_PADDING;
    }
    applyResponsiveActionMinWidths() {
        if (!this.options.responsiveBehavior?.enabled) {
            return;
        }
        if (this.options.responsiveBehavior.kind === 'last') {
            const hasToggleMenuAction = this.actionBar.hasAction(this.toggleMenuAction);
            const shrinkableIndex = hasToggleMenuAction ? this.actionBar.length() - 2 : this.actionBar.length() - 1;
            const shrinkableAction = shrinkableIndex >= 0 ? this.actionBar.getAction(shrinkableIndex) : undefined;
            const minWidth = `${this.getConfiguredActionMinWidth(shrinkableAction)}px`;
            if (this.element.style.getPropertyValue(ACTION_MIN_WIDTH_VAR) !== minWidth) {
                this.element.style.setProperty(ACTION_MIN_WIDTH_VAR, minWidth);
            }
            return;
        }
        const actionsContainer = this.actionBar.getContainer().firstElementChild;
        if (!DOM.isHTMLElement(actionsContainer)) {
            return;
        }
        for (let i = 0; i < actionsContainer.children.length; i++) {
            const actionItem = actionsContainer.children.item(i);
            if (!DOM.isHTMLElement(actionItem)) {
                continue;
            }
            const action = this.actionBar.getAction(i);
            const minWidth = `${this.getConfiguredActionMinWidth(action)}px`;
            if (actionItem.style.minWidth !== minWidth) {
                actionItem.style.minWidth = minWidth;
            }
        }
    }
    updateActions(containerWidth) {
        // Actions bar is empty
        if (this.actionBar.isEmpty()) {
            return;
        }
        this.applyResponsiveActionMinWidths();
        // Ensure that the container width respects the minimum width of the
        // element which is set based on the `responsiveBehavior.minItems` option
        const parsedMinWidth = parseInt(this.element.style.minWidth);
        containerWidth = Math.max(containerWidth, Number.isNaN(parsedMinWidth) ? 0 : parsedMinWidth);
        // Each action is assumed to have a minimum width so that actions with a label
        // can shrink to the action's minimum width. We do this so that action visibility
        // takes precedence over the action label.
        const actionBarWidth = (actualWidth) => {
            if (this.options.responsiveBehavior?.kind === 'last') {
                const hasToggleMenuAction = this.actionBar.hasAction(this.toggleMenuAction);
                const primaryActionsCount = hasToggleMenuAction
                    ? this.actionBar.length() - 1
                    : this.actionBar.length();
                if (primaryActionsCount === 0) {
                    return hasToggleMenuAction ? ACTION_MIN_WIDTH + ACTION_PADDING : 0;
                }
                let itemsWidth = 0;
                for (let i = 0; i < primaryActionsCount - 1; i++) {
                    itemsWidth += this.actionBar.getWidth(i) + ACTION_PADDING;
                }
                const action = this.actionBar.getAction(primaryActionsCount - 1);
                itemsWidth += actualWidth ? this.actionBar.getWidth(primaryActionsCount - 1) : this.getActionMinWidth(action); // item to shrink
                itemsWidth += hasToggleMenuAction ? ACTION_MIN_WIDTH + ACTION_PADDING : 0; // toggle menu action
                return itemsWidth;
            }
            else {
                let itemsWidth = 0;
                for (let i = 0; i < this.actionBar.length(); i++) {
                    itemsWidth += actualWidth ? this.actionBar.getWidth(i) : this.getActionMinWidth(this.actionBar.getAction(i));
                }
                return itemsWidth;
            }
        };
        const minimumWidth = actionBarWidth(false);
        // Action bar fits and there are no hidden actions to show
        if (minimumWidth <= containerWidth && this.hiddenActions.length === 0) {
            return;
        }
        if (minimumWidth > containerWidth) {
            // Check for max items limit
            if (this.options.responsiveBehavior?.minItems !== undefined) {
                const primaryActionsCount = this.actionBar.hasAction(this.toggleMenuAction)
                    ? this.actionBar.length() - 1
                    : this.actionBar.length();
                if (primaryActionsCount <= this.options.responsiveBehavior.minItems) {
                    return;
                }
            }
            // Hide actions from the right
            while (actionBarWidth(false) > containerWidth && this.actionBar.length() > 0) {
                const index = this.originalPrimaryActions.length - this.hiddenActions.length - 1;
                if (index < 0) {
                    break;
                }
                // Store the action and its size
                const action = this.originalPrimaryActions[index];
                const size = Math.min(this.getActionMinWidth(action), this.getItemWidth(index));
                this.hiddenActions.unshift({ action, size });
                // Remove the action
                this.actionBar.pull(index);
                // There are no secondary actions, but we have actions that we need to hide so we
                // create the overflow menu. This will ensure that another primary action will be
                // removed making space for the overflow menu.
                if (this.originalSecondaryActions.length === 0 && this.hiddenActions.length === 1) {
                    this.actionBar.push(this.toggleMenuAction, {
                        icon: this.options.icon ?? true,
                        label: this.options.label ?? false,
                        keybinding: this.getKeybindingLabel(this.toggleMenuAction),
                    });
                    this.updateOverflowClassName();
                }
                this.applyResponsiveActionMinWidths();
            }
        }
        else {
            // Show actions from the top of the toggle menu
            while (this.hiddenActions.length > 0) {
                const entry = this.hiddenActions.shift();
                if (actionBarWidth(true) + entry.size > containerWidth) {
                    // Not enough space to show the action
                    this.hiddenActions.unshift(entry);
                    break;
                }
                // Add the action
                this.actionBar.push(entry.action, {
                    icon: this.options.icon ?? true,
                    label: this.options.label ?? false,
                    keybinding: this.getKeybindingLabel(entry.action),
                    index: this.originalPrimaryActions.length - this.hiddenActions.length - 1
                });
                // There are no secondary actions, and there is only one hidden item left so we
                // remove the overflow menu making space for the last hidden action to be shown.
                if (this.originalSecondaryActions.length === 0 && this.hiddenActions.length === 0) {
                    this.toggleMenuAction.menuActions = [];
                    this.actionBar.pull(this.actionBar.length() - 1);
                    this.updateOverflowClassName();
                }
                this.applyResponsiveActionMinWidths();
            }
        }
        // Update overflow menu
        const hiddenActions = this.hiddenActions.map(entry => entry.action);
        if (this.originalSecondaryActions.length > 0 || hiddenActions.length > 0) {
            const secondaryActions = this.originalSecondaryActions.slice(0);
            this.toggleMenuAction.menuActions = Separator.join(hiddenActions, secondaryActions);
        }
        this.updateOverflowClassName();
        this.applyResponsiveActionMinWidths();
    }
    updateOverflowClassName() {
        this.actionBar.domNode.classList.toggle('has-overflow', this.actionBar.hasAction(this.toggleMenuAction));
    }
    clear() {
        this.submenuActionViewItems = [];
        this.disposables.clear();
        this.actionBar.clear();
    }
    dispose() {
        this.clear();
        this.disposables.dispose();
        this.element.remove();
        super.dispose();
    }
}
export class ToggleMenuAction extends Action {
    static { this.ID = 'toolbar.toggle.more'; }
    constructor(toggleDropdownMenu, title) {
        title = title || nls.localize('moreActions', "More Actions...");
        super(ToggleMenuAction.ID, title, undefined, true);
        this._menuActions = [];
        this.toggleDropdownMenu = toggleDropdownMenu;
    }
    async run() {
        this.toggleDropdownMenu();
    }
    get menuActions() {
        return this._menuActions;
    }
    set menuActions(actions) {
        this._menuActions = actions;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidG9vbGJhci5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL2Jhc2UvYnJvd3Nlci91aS90b29sYmFyL3Rvb2xiYXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFHaEcsT0FBTyxLQUFLLEdBQUcsTUFBTSxjQUFjLENBQUM7QUFDcEMsT0FBTyxFQUFFLFNBQVMsRUFBK0MsTUFBTSwyQkFBMkIsQ0FBQztBQUVuRyxPQUFPLEVBQUUsMEJBQTBCLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUNuRixPQUFPLEVBQUUsTUFBTSxFQUEwQixTQUFTLEVBQUUsYUFBYSxFQUFFLE1BQU0sNEJBQTRCLENBQUM7QUFDdEcsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLDZCQUE2QixDQUFDO0FBQ3RELE9BQU8sRUFBRSxTQUFTLEVBQUUsTUFBTSw4QkFBOEIsQ0FBQztBQUN6RCxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSwwQkFBMEIsQ0FBQztBQUU1RCxPQUFPLEVBQUUsVUFBVSxFQUFFLGVBQWUsRUFBRSxZQUFZLEVBQUUsTUFBTSw4QkFBOEIsQ0FBQztBQUN6RixPQUFPLGVBQWUsQ0FBQztBQUN2QixPQUFPLEtBQUssR0FBRyxNQUFNLG9CQUFvQixDQUFDO0FBRTFDLE9BQU8sRUFBRSwwQkFBMEIsRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBRTlFLE1BQU0sZ0JBQWdCLEdBQUcsRUFBRSxDQUFDLENBQUMsa0JBQWtCO0FBQy9DLE1BQU0sY0FBYyxHQUFHLENBQUMsQ0FBQyxDQUFDLGlCQUFpQjtBQUUzQyxNQUFNLG9CQUFvQixHQUFHLG1DQUFtQyxDQUFDO0FBbURqRTs7R0FFRztBQUNILE1BQU0sT0FBTyxPQUFRLFNBQVEsVUFBVTtJQVV0QyxJQUFJLDZCQUE2QixLQUFLLE9BQU8sSUFBSSxDQUFDLDhCQUE4QixDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUM7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