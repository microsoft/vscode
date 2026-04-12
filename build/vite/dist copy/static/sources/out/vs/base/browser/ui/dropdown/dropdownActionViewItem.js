/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as nls from '../../../../nls.js';
import { Action } from '../../../common/actions.js';
import { Codicon } from '../../../common/codicons.js';
import { Emitter } from '../../../common/event.js';
import { ThemeIcon } from '../../../common/themables.js';
import { $, addDisposableListener, append, EventType, h } from '../../dom.js';
import { StandardKeyboardEvent } from '../../keyboardEvent.js';
import { ActionViewItem, BaseActionViewItem } from '../actionbar/actionViewItems.js';
import { getBaseLayerHoverDelegate } from '../hover/hoverDelegate2.js';
import { getDefaultHoverDelegate } from '../hover/hoverDelegateFactory.js';
import './dropdown.css';
import { DropdownMenu } from './dropdown.js';
export class DropdownMenuActionViewItem extends BaseActionViewItem {
    get onDidChangeVisibility() { return this._onDidChangeVisibility.event; }
    constructor(action, menuActionsOrProvider, contextMenuProvider, options = Object.create(null)) {
        super(null, action, options);
        this.actionItem = null;
        this._onDidChangeVisibility = this._register(new Emitter());
        this.menuActionsOrProvider = menuActionsOrProvider;
        this.contextMenuProvider = contextMenuProvider;
        this.options = options;
        if (this.options.actionRunner) {
            this.actionRunner = this.options.actionRunner;
        }
    }
    render(container) {
        this.actionItem = container;
        const labelRenderer = (el) => {
            this.element = append(el, $('a.action-label'));
            this.setAriaLabelAttributes(this.element);
            return this.renderLabel(this.element);
        };
        const isActionsArray = Array.isArray(this.menuActionsOrProvider);
        const options = {
            contextMenuProvider: this.contextMenuProvider,
            labelRenderer: labelRenderer,
            menuAsChild: this.options.menuAsChild,
            actions: isActionsArray ? this.menuActionsOrProvider : undefined,
            actionProvider: isActionsArray ? undefined : this.menuActionsOrProvider,
            skipTelemetry: this.options.skipTelemetry
        };
        this.dropdownMenu = this._register(new DropdownMenu(container, options));
        this._register(this.dropdownMenu.onDidChangeVisibility(visible => {
            this.element?.setAttribute('aria-expanded', `${visible}`);
            this._onDidChangeVisibility.fire(visible);
        }));
        this.dropdownMenu.menuOptions = {
            actionViewItemProvider: this.options.actionViewItemProvider,
            actionRunner: this.actionRunner,
            getKeyBinding: this.options.keybindingProvider,
            context: this._context
        };
        if (this.options.anchorAlignmentProvider) {
            const that = this;
            this.dropdownMenu.menuOptions = {
                ...this.dropdownMenu.menuOptions,
                get anchorAlignment() {
                    return that.options.anchorAlignmentProvider();
                }
            };
        }
        this.updateTooltip();
        this.updateEnabled();
    }
    renderLabel(element) {
        let classNames = [];
        if (typeof this.options.classNames === 'string') {
            classNames = this.options.classNames.split(/\s+/g).filter(s => !!s);
        }
        else if (this.options.classNames) {
            classNames = this.options.classNames;
        }
        // todo@aeschli: remove codicon, should come through `this.options.classNames`
        if (!classNames.find(c => c === 'icon')) {
            classNames.push('codicon');
        }
        element.classList.add(...classNames);
        if (this._action.label) {
            this._register(getBaseLayerHoverDelegate().setupManagedHover(this.options.hoverDelegate ?? getDefaultHoverDelegate('mouse'), element, this._action.label));
        }
        return null;
    }
    setAriaLabelAttributes(element) {
        element.setAttribute('role', 'button');
        element.setAttribute('aria-haspopup', 'true');
        element.setAttribute('aria-expanded', 'false');
        element.ariaLabel = this._action.label || '';
    }
    getTooltip() {
        let title = null;
        if (this.action.tooltip) {
            title = this.action.tooltip;
        }
        else if (this.action.label) {
            title = this.action.label;
        }
        return title ?? undefined;
    }
    setActionContext(newContext) {
        super.setActionContext(newContext);
        if (this.dropdownMenu) {
            if (this.dropdownMenu.menuOptions) {
                this.dropdownMenu.menuOptions.context = newContext;
            }
            else {
                this.dropdownMenu.menuOptions = { context: newContext };
            }
        }
    }
    show() {
        this.dropdownMenu?.show();
    }
    updateEnabled() {
        const disabled = !this.action.enabled;
        this.actionItem?.classList.toggle('disabled', disabled);
        this.element?.classList.toggle('disabled', disabled);
    }
}
export class ActionWithDropdownActionViewItem extends ActionViewItem {
    constructor(context, action, options, contextMenuProvider) {
        super(context, action, options);
        this.contextMenuProvider = contextMenuProvider;
    }
    render(container) {
        super.render(container);
        if (this.element) {
            this.element.classList.add('action-dropdown-item');
            const menuActionsProvider = {
                getActions: () => {
                    const actionsProvider = this.options.menuActionsOrProvider;
                    return Array.isArray(actionsProvider) ? actionsProvider : actionsProvider.getActions(); // TODO: microsoft/TypeScript#42768
                }
            };
            const menuActionClassNames = this.options.menuActionClassNames || [];
            const separator = h('div.action-dropdown-item-separator', [h('div', {})]).root;
            separator.classList.toggle('prominent', menuActionClassNames.includes('prominent'));
            append(this.element, separator);
            this.dropdownMenuActionViewItem = this._register(new DropdownMenuActionViewItem(this._register(new Action('dropdownAction', nls.localize('moreActions', "More Actions..."))), menuActionsProvider, this.contextMenuProvider, { classNames: ['dropdown', ...ThemeIcon.asClassNameArray(Codicon.dropDownButton), ...menuActionClassNames], hoverDelegate: this.options.hoverDelegate }));
            this.dropdownMenuActionViewItem.render(this.element);
            this._register(addDisposableListener(this.element, EventType.KEY_DOWN, e => {
                // If we don't have any actions then the dropdown is hidden so don't try to focus it #164050
                if (menuActionsProvider.getActions().length === 0) {
                    return;
                }
                const event = new StandardKeyboardEvent(e);
                let handled = false;
                if (this.dropdownMenuActionViewItem?.isFocused() && event.equals(15 /* KeyCode.LeftArrow */)) {
                    handled = true;
                    this.dropdownMenuActionViewItem?.blur();
                    this.focus();
                }
                else if (this.isFocused() && event.equals(17 /* KeyCode.RightArrow */)) {
                    handled = true;
                    this.blur();
                    this.dropdownMenuActionViewItem?.focus();
                }
                if (handled) {
                    event.preventDefault();
                    event.stopPropagation();
                }
            }));
        }
    }
    blur() {
        super.blur();
        this.dropdownMenuActionViewItem?.blur();
    }
    setFocusable(focusable) {
        super.setFocusable(focusable);
        this.dropdownMenuActionViewItem?.setFocusable(focusable);
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZHJvcGRvd25BY3Rpb25WaWV3SXRlbS5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL2Jhc2UvYnJvd3Nlci91aS9kcm9wZG93bi9kcm9wZG93bkFjdGlvblZpZXdJdGVtLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sS0FBSyxHQUFHLE1BQU0sb0JBQW9CLENBQUM7QUFDMUMsT0FBTyxFQUFFLE1BQU0sRUFBMEIsTUFBTSw0QkFBNEIsQ0FBQztBQUM1RSxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sNkJBQTZCLENBQUM7QUFDdEQsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLDBCQUEwQixDQUFDO0FBSW5ELE9BQU8sRUFBRSxTQUFTLEVBQUUsTUFBTSw4QkFBOEIsQ0FBQztBQUV6RCxPQUFPLEVBQUUsQ0FBQyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sRUFBRSxTQUFTLEVBQUUsQ0FBQyxFQUFFLE1BQU0sY0FBYyxDQUFDO0FBQzlFLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLHdCQUF3QixDQUFDO0FBRS9ELE9BQU8sRUFBRSxjQUFjLEVBQUUsa0JBQWtCLEVBQXNELE1BQU0saUNBQWlDLENBQUM7QUFFekksT0FBTyxFQUFFLHlCQUF5QixFQUFFLE1BQU0sNEJBQTRCLENBQUM7QUFDdkUsT0FBTyxFQUFFLHVCQUF1QixFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDM0UsT0FBTyxnQkFBZ0IsQ0FBQztBQUN4QixPQUFPLEVBQUUsWUFBWSxFQUF5RCxNQUFNLGVBQWUsQ0FBQztBQW9CcEcsTUFBTSxPQUFPLDBCQUEyQixTQUFRLGtCQUFrQjtJQU9qRSxJQUFJLHFCQUFxQixLQUFLLE9BQU8sSUFBSSxDQUFDLHNCQUFzQixDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUM7SUFJekUsWUFDQyxNQUFlLEVBQ2YscUJBQTJELEVBQzNELG1C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