var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var ActionListWidget_1;
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as dom from '../../../base/browser/dom.js';
import { renderMarkdown } from '../../../base/browser/markdownRenderer.js';
import { ActionBar } from '../../../base/browser/ui/actionbar/actionbar.js';
import { getAnchorRect } from '../../../base/browser/ui/contextview/contextview.js';
import { KeybindingLabel } from '../../../base/browser/ui/keybindingLabel/keybindingLabel.js';
import { List } from '../../../base/browser/ui/list/listWidget.js';
import { SubmenuAction, toAction } from '../../../base/common/actions.js';
import { CancellationTokenSource } from '../../../base/common/cancellation.js';
import { Codicon } from '../../../base/common/codicons.js';
import { Emitter } from '../../../base/common/event.js';
import { MarkdownString } from '../../../base/common/htmlContent.js';
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from '../../../base/common/lifecycle.js';
import { OS } from '../../../base/common/platform.js';
import { ThemeIcon } from '../../../base/common/themables.js';
import { URI } from '../../../base/common/uri.js';
import './actionWidget.css';
import { localize } from '../../../nls.js';
import { IContextViewService } from '../../contextview/browser/contextView.js';
import { IKeybindingService } from '../../keybinding/common/keybinding.js';
import { IOpenerService } from '../../opener/common/opener.js';
import { defaultListStyles } from '../../theme/browser/defaultStyles.js';
import { asCssVariable } from '../../theme/common/colorRegistry.js';
import { ILayoutService } from '../../layout/browser/layoutService.js';
import { IInstantiationService } from '../../instantiation/common/instantiation.js';
import { IHoverService } from '../../hover/browser/hover.js';
export const acceptSelectedActionCommand = 'acceptSelectedCodeAction';
export const previewSelectedActionCommand = 'previewSelectedCodeAction';
export var ActionListItemKind;
(function (ActionListItemKind) {
    ActionListItemKind["Action"] = "action";
    ActionListItemKind["Header"] = "header";
    ActionListItemKind["Separator"] = "separator";
})(ActionListItemKind || (ActionListItemKind = {}));
class HeaderRenderer {
    get templateId() { return "header" /* ActionListItemKind.Header */; }
    renderTemplate(container) {
        container.classList.add('group-header');
        const text = document.createElement('span');
        container.append(text);
        return { container, text };
    }
    renderElement(element, _index, templateData) {
        templateData.text.textContent = element.group?.title ?? element.label ?? '';
    }
    disposeTemplate(_templateData) {
        // noop
    }
}
class SeparatorRenderer {
    get templateId() { return "separator" /* ActionListItemKind.Separator */; }
    renderTemplate(container) {
        container.classList.add('separator');
        const text = document.createElement('span');
        container.append(text);
        return { container, text };
    }
    renderElement(element, _index, templateData) {
        templateData.text.textContent = element.label ?? '';
    }
    disposeTemplate(_templateData) {
        // noop
    }
}
let ActionItemRenderer = class ActionItemRenderer {
    get templateId() { return "action" /* ActionListItemKind.Action */; }
    constructor(_supportsPreview, _onRemoveItem, _onShowSubmenu, _hasAnySubmenuActions, _linkHandler, _keybindingService, _openerService) {
        this._supportsPreview = _supportsPreview;
        this._onRemoveItem = _onRemoveItem;
        this._onShowSubmenu = _onShowSubmenu;
        this._hasAnySubmenuActions = _hasAnySubmenuActions;
        this._linkHandler = _linkHandler;
        this._keybindingService = _keybindingService;
        this._openerService = _openerService;
    }
    renderTemplate(container) {
        container.classList.add(this.templateId);
        const icon = document.createElement('div');
        icon.className = 'icon';
        container.append(icon);
        const text = document.createElement('span');
        text.className = 'title';
        container.append(text);
        const badge = document.createElement('span');
        badge.className = 'action-item-badge';
        container.append(badge);
        const description = document.createElement('span');
        description.className = 'description';
        container.append(description);
        const keybinding = new KeybindingLabel(container, OS);
        const toolbar = document.createElement('div');
        toolbar.className = 'action-list-item-toolbar';
        container.append(toolbar);
        const submenuIndicator = document.createElement('div');
        submenuIndicator.className = 'action-list-submenu-indicator';
        container.append(submenuIndicator);
        const elementDisposables = new DisposableStore();
        return { container, icon, text, badge, description, keybinding, toolbar, submenuIndicator, elementDisposables };
    }
    renderElement(element, _index, data) {
        // Clear previous element disposables
        data.elementDisposables.clear();
        if (element.group?.icon) {
            data.icon.className = ThemeIcon.asClassName(element.group.icon);
            if (element.group.icon.color) {
                data.icon.style.color = asCssVariable(element.group.icon.color.id);
            }
        }
        else {
            data.icon.className = ThemeIcon.asClassName(Codicon.lightBulb);
            data.icon.style.color = 'var(--vscode-editorLightBulb-foreground)';
        }
        if (!element.item || !element.label) {
            return;
        }
        dom.setVisibility(!element.hideIcon, data.icon);
        // Set aria-expanded for section toggle items
        if (element.isSectionToggle) {
            const expanded = element.group?.icon === Codicon.chevronDown;
            data.container.setAttribute('aria-expanded', String(expanded));
        }
        else {
            data.container.removeAttribute('aria-expanded');
        }
        // Apply optional className - clean up previous to avoid stale classes
        // from virtualized row reuse
        if (data.previousClassName) {
            data.container.classList.remove(data.previousClassName);
        }
        data.container.classList.toggle('action-list-custom', !!element.className);
        if (element.className) {
            data.container.classList.add(element.className);
        }
        data.previousClassName = element.className;
        data.text.textContent = stripNewlines(element.label);
        // Render optional badge
        if (element.badge) {
            data.badge.textContent = element.badge;
            data.badge.style.display = '';
        }
        else {
            data.badge.textContent = '';
            data.badge.style.display = 'none';
        }
        if (element.keybinding) {
            data.description.textContent = element.keybinding.getLabel();
            data.description.style.display = 'inline';
            data.description.style.letterSpacing = '0.5px';
        }
        else if (element.description) {
            dom.clearNode(data.description);
            if (typeof element.description === 'string') {
                data.description.textContent = stripNewlines(element.description);
            }
            else {
                const rendered = renderMarkdown(element.description, {
                    actionHandler: (content) => {
                        const uri = URI.parse(content);
                        if (this._linkHandler) {
                            this._linkHandler(uri, element);
                        }
                        else {
                            void this._openerService.open(uri, { allowCommands: true });
                        }
                    }
                });
                data.elementDisposables.add(rendered);
                data.description.appendChild(rendered.element);
            }
            data.description.style.display = 'inline';
        }
        else {
            data.description.textContent = '';
            data.description.style.display = 'none';
        }
        const actionTitle = this._keybindingService.lookupKeybinding(acceptSelectedActionCommand)?.getLabel();
        const previewTitle = this._keybindingService.lookupKeybinding(previewSelectedActionCommand)?.getLabel();
        data.container.classList.toggle('option-disabled', !!element.disabled);
        if (element.hover !== undefined) {
            // Don't show tooltip when hover content is configured - the rich hover will show instead
            data.container.title = '';
        }
        else if (element.tooltip) {
            data.container.title = element.tooltip;
        }
        else if (element.disabled) {
            data.container.title = element.label;
        }
        else if (actionTitle && previewTitle) {
            if (this._supportsPreview && element.canPreview) {
                data.container.title = localize({ key: 'label-preview', comment: ['placeholders are keybindings, e.g "F2 to Apply, Shift+F2 to Preview"'] }, "{0} to Apply, {1} to Preview", actionTitle, previewTitle);
            }
            else {
                data.container.title = localize({ key: 'label', comment: ['placeholder is a keybinding, e.g "F2 to Apply"'] }, "{0} to Apply", actionTitle);
            }
        }
        else {
            data.container.title = '';
        }
        // Clear and render toolbar actions
        dom.clearNode(data.toolbar);
        const toolbarActions = [...(element.toolbarActions ?? [])];
        if (element.onRemove) {
            toolbarActions.push(toAction({
                id: 'actionList.remove',
                label: localize('actionList.remove', "Remove"),
                class: ThemeIcon.asClassName(Codicon.close),
                run: () => {
                    element.onRemove();
                    this._onRemoveItem?.(element);
                },
            }));
        }
        data.container.classList.toggle('has-toolbar', toolbarActions.length > 0);
        if (toolbarActions.length > 0) {
            const actionBar = new ActionBar(data.toolbar);
            data.elementDisposables.add(actionBar);
            actionBar.push(toolbarActions, { icon: true, label: false });
        }
        // Show submenu indicator only for items with submenu actions
        if (element.submenuActions?.length) {
            data.submenuIndicator.className = 'action-list-submenu-indicator has-submenu ' + ThemeIcon.asClassName(Codicon.chevronRight);
            data.submenuIndicator.style.display = '';
            data.submenuIndicator.style.visibility = '';
            data.elementDisposables.add(dom.addDisposableListener(data.submenuIndicator, dom.EventType.CLICK, (e) => {
                e.stopPropagation();
                this._onShowSubmenu?.(element);
            }));
        }
        else if (this._hasAnySubmenuActions) {
            // Reserve space for alignment when other items have submenus
            data.submenuIndicator.className = 'action-list-submenu-indicator';
            data.submenuIndicator.style.display = '';
            data.submenuIndicator.style.visibility = 'hidden';
        }
        else {
            data.submenuIndicator.className = 'action-list-submenu-indicator';
            data.submenuIndicator.style.display = 'none';
        }
    }
    disposeTemplate(templateData) {
        templateData.keybinding.dispose();
        templateData.elementDisposables.dispose();
    }
};
ActionItemRenderer = __decorate([
    __param(5, IKeybindingService),
    __param(6, IOpenerService)
], ActionItemRenderer);
class AcceptSelectedEvent extends UIEvent {
    constructor() { super('acceptSelectedAction'); }
}
class PreviewSelectedEvent extends UIEvent {
    constructor() { super('previewSelectedAction'); }
}
function getKeyboardNavigationLabel(item) {
    // Filter out header vs. action vs. separator
    if (item.kind === 'action') {
        return item.label;
    }
    return undefined;
}
/**
 * A standalone action list widget that handles core list rendering, filtering,
 * hover, submenu, and section management without depending on IContextViewService
 * or anchor-based positioning. Suitable for embedding directly in any container.
 */
let ActionListWidget = ActionListWidget_1 = class ActionListWidget extends Disposable {
    constructor(user, preview, items, _delegate, accessibilityProvider, _options, _keybindingService, _hoverService, _openerService, _instantiationService) {
        super();
        this._delegate = _delegate;
        this._options = _options;
        this._keybindingService = _keybindingService;
        this._hoverService = _hoverService;
        this._openerService = _openerService;
        this._instantiationService = _instantiationService;
        this._baseLineHeight = 24;
        this._headerLineHeight = 24;
        this._separatorLineHeight = 8;
        this.cts = this._register(new CancellationTokenSource());
        this._hover = this._register(new MutableDisposable());
        this._submenuDisposables = this._register(new DisposableStore());
        this._collapsedSections = new Set();
        this._filterText = '';
        this._suppressHover = false;
        this._hasLaidOut = false;
        this._onDidRequestLayout = this._register(new Emitter());
        /**
         * Fired when the widget's visible item set changes and the parent should
         * re-layout (e.g. after filtering or collapsing a section).
         */
        this.onDidRequestLayout = this._onDidRequestLayout.event;
        this.domNode = document.createElement('div');
        this.domNode.classList.add('actionList');
        if (this._options?.descriptionBelow) {
            this.domNode.classList.add('description-below');
        }
        this._actionLineHeight = this._options?.descriptionBelow ? 48 : 24;
        // Create submenu container appended to domNode
        this._submenuContainer = document.createElement('div');
        this._submenuContainer.className = 'action-list-submenu-panel action-widget';
        this._submenuContainer.style.display = 'none';
        this.domNode.append(this._submenuContainer);
        this._register(dom.addDisposableListener(this._submenuContainer, 'mouseenter', () => {
            this._cancelSubmenuHide();
        }));
        this._register(dom.addDisposableListener(this._submenuContainer, 'mouseleave', () => {
            this._scheduleSubmenuHide();
        }));
        this._register(toDisposable(() => {
            this._cancelSubmenuHide();
            this._cancelSubmenuShow();
        }));
        // Initialize collapsed sections
        if (this._options?.collapsedByDefault) {
            for (const section of this._options.collapsedByDefault) {
                this._collapsedSections.add(section);
            }
        }
        const virtualDelegate = {
            getHeight: element => {
                return this._getItemHeight(element);
            },
            getTemplateId: element => element.kind
        };
        const reserveSubmenuSpace = this._options?.reserveSubmenuSpace ?? true;
        const hasAnySubmenuActions = reserveSubmenuSpace && items.some(item => !!item.submenuActions?.length);
        this._list = this._register(new List(user, this.domNode, virtualDelegate, [
            new ActionItemRenderer(preview, (item) => this._removeItem(item), (item) => this._showSubmenuForItem(item), hasAnySubmenuActions, this._options?.linkHandler, this._keybindingService, this._openerService),
            new HeaderRenderer(),
            new SeparatorRenderer(),
        ], {
            keyboardSupport: false,
            typeNavigationEnabled: !this._options?.showFilter,
            keyboardNavigationLabelProvider: { getKeyboardNavigationLabel },
            accessibilityProvider: {
                getAriaLabel: element => {
                    if (element.kind === "action" /* ActionListItemKind.Action */) {
                        let label = element.label ? stripNewlines(element?.label) : '';
                        if (element.description) {
                            const descText = typeof element.description === 'string' ? element.description : element.description.value;
                            label = label + ', ' + stripNewlines(descText);
                        }
                        if (element.disabled) {
                            label = localize({ key: 'customQuickFixWidget.labels', comment: [`Action widget labels for accessibility.`] }, "{0}, Disabled Reason: {1}", label, element.disabled);
                        }
                        return label;
                    }
                    return null;
                },
                getWidgetAriaLabel: () => localize({ key: 'customQuickFixWidget', comment: [`An action widget option`] }, "Action Widget"),
                getRole: (e) => {
                    switch (e.kind) {
                        case "action" /* ActionListItemKind.Action */:
                            return 'option';
                        case "separator" /* ActionListItemKind.Separator */:
                            return 'separator';
                        default:
                            return 'separator';
                    }
                },
                getWidgetRole: () => 'listbox',
                ...accessibilityProvider
            },
        }));
        this._list.style(defaultListStyles);
        this._register(this._list.onMouseClick(e => this.onListClick(e)));
        this._register(this._list.onMouseOver(e => this.onListHover(e)));
        this._register(this._list.onDidChangeFocus(() => this.onFocus()));
        this._register(this._list.onDidChangeSelection(e => this.onListSelection(e)));
        this._allMenuItems = [...items];
        // Create filter input
        if (this._options?.showFilter) {
            this._filterContainer = document.createElement('div');
            this._filterContainer.className = 'action-list-filter';
            const filterRow = dom.append(this._filterContainer, dom.$('.action-list-filter-row'));
            this._filterInput = document.createElement('input');
            this._filterInput.type = 'text';
            this._filterInput.className = 'action-list-filter-input';
            this._filterInput.placeholder = this._options?.filterPlaceholder ?? localize('actionList.filter.placeholder', "Search...");
            this._filterInput.setAttribute('aria-label', localize('actionList.filter.ariaLabel', "Filter items"));
            filterRow.appendChild(this._filterInput);
            const filterActions = this._options?.filterActions ?? [];
            if (filterActions.length > 0) {
                const filterActionsContainer = dom.append(filterRow, dom.$('.action-list-filter-actions'));
                const filterActionBar = this._register(new ActionBar(filterActionsContainer));
                filterActionBar.push(filterActions, { icon: true, label: false });
            }
            this._register(dom.addDisposableListener(this._filterInput, 'input', () => {
                this._filterText = this._filterInput.value;
                this._applyFilter();
            }));
        }
        this._applyFilter();
        if (this._list.length) {
            this._focusCheckedOrFirst();
        }
        // ArrowRight opens submenu for the focused item and moves focus into it
        this._register(dom.addDisposableListener(this.domNode, 'keydown', (e) => {
            if (e.key === 'ArrowRight') {
                const focused = this._list.getFocus();
                if (focused.length > 0) {
                    const element = this._list.element(focused[0]);
                    if (element?.submenuActions?.length) {
                        dom.EventHelper.stop(e, true);
                        const rowElement = this._getRowElement(focused[0]);
                        if (rowElement) {
                            this._showSubmenuForElement(element, rowElement);
                            this._currentSubmenuWidget?.focus();
                        }
                    }
                }
            }
        }));
        // When the list has focus and user types a printable character,
        // forward it to the filter input so search begins automatically.
        if (this._filterInput) {
            this._register(dom.addDisposableListener(this.domNode, 'keydown', (e) => {
                if (this._filterInput && !dom.isActiveElement(this._filterInput)
                    && e.key.length === 1 && e.key !== ' ' && !e.ctrlKey && !e.metaKey && !e.altKey) {
                    this._filterInput.focus();
                    this._filterInput.value = e.key;
                    this._filterText = e.key;
                    this._applyFilter();
                    e.preventDefault();
                    e.stopPropagation();
                }
            }));
        }
    }
    _toggleSection(section) {
        if (this._collapsedSections.has(section)) {
            this._collapsedSections.delete(section);
        }
        else {
            this._collapsedSections.add(section);
        }
        this._options?.onDidToggleSection?.(section, this._collapsedSections.has(section));
        this._applyFilter();
    }
    _applyFilter() {
        const filterLower = this._filterText.toLowerCase();
        const isFiltering = filterLower.length > 0;
        const visible = [];
        // Remember the focused item before splice
        const focusedIndexes = this._list.getFocus();
        let focusedItem;
        if (focusedIndexes.length > 0) {
            focusedItem = this._list.element(focusedIndexes[0]);
        }
        for (const item of this._allMenuItems) {
            if (item.kind === "header" /* ActionListItemKind.Header */) {
                if (isFiltering) {
                    // When filtering, skip all headers
                    continue;
                }
                visible.push(item);
                continue;
            }
            if (item.kind === "separator" /* ActionListItemKind.Separator */) {
                if (isFiltering) {
                    continue;
                }
                if (item.section && this._collapsedSections.has(item.section)) {
                    continue;
                }
                visible.push(item);
                continue;
            }
            // Action item
            if (isFiltering) {
                // Always show items tagged with showAlways
                if (item.showAlways) {
                    visible.push(item);
                    continue;
                }
                // When filtering, skip section toggle items and only match content
                if (item.isSectionToggle) {
                    continue;
                }
                // Match against label and description
                const label = (item.label ?? '').toLowerCase();
                const descValue = typeof item.description === 'string' ? item.description : item.description?.value ?? '';
                const desc = descValue.toLowerCase();
                if (label.includes(filterLower) || desc.includes(filterLower)) {
                    visible.push(item);
                }
            }
            else {
                // Update icon for section toggle items based on collapsed state
                if (item.isSectionToggle && item.section) {
                    const collapsed = this._collapsedSections.has(item.section);
                    visible.push({
                        ...item,
                        group: { ...item.group, icon: collapsed ? Codicon.chevronRight : Codicon.chevronDown },
                    });
                    continue;
                }
                // Not filtering - check collapsed sections
                if (item.section && this._collapsedSections.has(item.section)) {
                    continue;
                }
                visible.push(item);
            }
        }
        // Capture whether the filter input currently has focus before splice
        // which may cause DOM changes that shift focus.
        const filterInputHasFocus = this._filterInput && dom.isActiveElement(this._filterInput);
        this._list.splice(0, this._list.length, visible);
        // Notify the parent that a re-layout is needed
        this._onDidRequestLayout.fire();
        // Restore focus after splice destroyed DOM elements,
        // otherwise the blur handler in ActionWidgetService closes the widget.
        // Keep focus on the filter input if the user is typing a filter.
        if (filterInputHasFocus) {
            this._filterInput?.focus();
            // Keep a highlighted item in the list so Enter works without pressing DownArrow first
            this._focusCheckedOrFirst();
        }
        else if (this._hasLaidOut) {
            // Restore focus to the previously focused item
            if (focusedItem) {
                const focusedItemId = focusedItem.item?.id;
                if (focusedItemId) {
                    for (let i = 0; i < this._list.length; i++) {
                        const el = this._list.element(i);
                        if (el.item?.id === focusedItemId) {
                            this._list.setFocus([i]);
                            this._list.reveal(i);
                            break;
                        }
                    }
                }
            }
        }
    }
    /**
     * Returns the filter container element, if filter is enabled.
     * The caller is responsible for appending it to the widget DOM.
     */
    get filterContainer() {
        return this._filterContainer;
    }
    get filterInput() {
        return this._filterInput;
    }
    focusCondition(element) {
        return !element.disabled && element.kind === "action" /* ActionListItemKind.Action */;
    }
    focus() {
        if (this._filterInput && this._options?.focusFilterOnOpen) {
            this._filterInput.focus();
            // Highlight the first item so Enter works immediately
            this._focusCheckedOrFirst();
            return;
        }
        this._list.domFocus();
        this._focusCheckedOrFirst();
    }
    getFocusedElement() {
        const focused = this._list.getFocus();
        if (focused.length > 0) {
            return this._list.element(focused[0]);
        }
        return undefined;
    }
    _focusCheckedOrFirst() {
        this._suppressHover = true;
        try {
            // Try to focus the checked item first
            for (let i = 0; i < this._list.length; i++) {
                const element = this._list.element(i);
                if (element.kind === "action" /* ActionListItemKind.Action */ && element.item?.checked) {
                    this._list.setFocus([i]);
                    this._list.reveal(i);
                    return;
                }
            }
            // Set focus on the first focusable item without moving DOM focus
            this._list.focusFirst(undefined, this.focusCondition);
            const focused = this._list.getFocus();
            if (focused.length > 0) {
                this._list.reveal(focused[0]);
            }
        }
        finally {
            this._suppressHover = false;
        }
    }
    hide(didCancel) {
        this._delegate.onHide(didCancel);
        this.cts.cancel();
        this._hover.clear();
        this._hideSubmenu();
    }
    clearFilter() {
        if (this._filterInput && this._filterText) {
            this._filterInput.value = '';
            this._filterText = '';
            this._applyFilter();
            return true;
        }
        return false;
    }
    /**
     * Whether this widget uses dynamic height (has filter or collapsible sections).
     */
    get hasDynamicHeight() {
        if (this._options?.showFilter) {
            return true;
        }
        return this._allMenuItems.some(item => item.isSectionToggle);
    }
    /**
     * The height of a single action row in pixels.
     */
    get lineHeight() {
        return this._actionLineHeight;
    }
    /**
     * Returns the height for an action item, using the base line height
     * for items without a description when `descriptionBelow` is enabled.
     */
    _getItemHeight(item) {
        switch (item.kind) {
            case "header" /* ActionListItemKind.Header */:
                return this._headerLineHeight;
            case "separator" /* ActionListItemKind.Separator */:
                return this._separatorLineHeight;
            default:
                if (this._options?.descriptionBelow && !item.description) {
                    return this._baseLineHeight;
                }
                return this._actionLineHeight;
        }
    }
    /**
     * Computes the total height of all items (including collapsed/filtered items).
     */
    computeFullHeight() {
        let fullHeight = 0;
        for (const item of this._allMenuItems) {
            fullHeight += this._getItemHeight(item);
        }
        return fullHeight;
    }
    /**
     * Computes the total height of visible items in the list.
     */
    computeListHeight() {
        const visibleCount = this._list.length;
        let listHeight = 0;
        for (let i = 0; i < visibleCount; i++) {
            const element = this._list.element(i);
            listHeight += this._getItemHeight(element);
        }
        return listHeight;
    }
    /**
     * Lays out the list widget with the given explicit dimensions.
     */
    layout(height, width) {
        this._hasLaidOut = true;
        this._list.layout(height, width);
        this.domNode.style.height = `${height}px`;
        // Place filter container on the preferred side.
        if (this._filterContainer && this._filterContainer.parentElement) {
            this._filterContainer.parentElement.insertBefore(this._filterContainer, this.domNode);
        }
    }
    computeMaxWidth(minWidth) {
        const visibleCount = this._list.length;
        const effectiveMinWidth = Math.max(minWidth, this._options?.minWidth ?? 0);
        let maxWidth = effectiveMinWidth;
        const totalItemCount = this._allMenuItems.length;
        if (totalItemCount >= 50) {
            return Math.max(380, effectiveMinWidth);
        }
        if (totalItemCount > visibleCount) {
            // Temporarily splice in all items to measure widths,
            // preventing width jumps when expanding/collapsing sections.
            const visibleItems = [];
            for (let i = 0; i < visibleCount; i++) {
                visibleItems.push(this._list.element(i));
            }
            const allItems = [...this._allMenuItems];
            this._list.splice(0, visibleCount, allItems);
            let allItemsHeight = 0;
            for (const item of allItems) {
                allItemsHeight += this._getItemHeight(item);
            }
            this._list.layout(allItemsHeight);
            const itemWidths = [];
            for (let i = 0; i < allItems.length; i++) {
                const element = this._getRowElement(i);
                if (element) {
                    element.style.width = 'auto';
                    const width = element.getBoundingClientRect().width;
                    element.style.width = '';
                    itemWidths.push(width + this._computeToolbarWidth(allItems[i]));
                }
            }
            maxWidth = Math.max(...itemWidths, effectiveMinWidth);
            // Restore visible items
            this._list.splice(0, allItems.length, visibleItems);
            return maxWidth;
        }
        // All items are visible, measure them directly
        const itemWidths = [];
        for (let i = 0; i < visibleCount; i++) {
            const element = this._getRowElement(i);
            if (element) {
                element.style.width = 'auto';
                const width = element.getBoundingClientRect().width;
                element.style.width = '';
                itemWidths.push(width + this._computeToolbarWidth(this._list.element(i)));
            }
        }
        return Math.max(...itemWidths, effectiveMinWidth);
    }
    focusPrevious() {
        if (this._filterInput && dom.isActiveElement(this._filterInput)) {
            this._list.domFocus();
            // An item is already highlighted; advance from it instead of jumping to last
            const current = this._list.getFocus();
            if (current.length > 0) {
                this._list.focusPrevious(1, false, undefined, this.focusCondition);
                const focused = this._list.getFocus();
                // If we couldn't move (already at first), go to filter
                if (focused.length > 0 && focused[0] >= current[0]) {
                    this._filterInput.focus();
                }
                else if (focused.length > 0) {
                    this._list.reveal(focused[0]);
                }
            }
            else {
                this._list.focusLast(undefined, this.focusCondition);
                const focused = this._list.getFocus();
                if (focused.length > 0) {
                    this._list.reveal(focused[0]);
                }
            }
            return;
        }
        const previousFocus = this._list.getFocus();
        this._list.focusPrevious(1, true, undefined, this.focusCondition);
        const focused = this._list.getFocus();
        if (focused.length > 0) {
            // If focus wrapped (was at first focusable, now at last), move to filter instead
            if (this._filterInput && previousFocus.length > 0 && focused[0] > previousFocus[0]) {
                this._list.setFocus([]);
                this._filterInput.focus();
                return;
            }
            this._list.reveal(focused[0]);
        }
    }
    focusNext() {
        if (this._filterInput && dom.isActiveElement(this._filterInput)) {
            this._list.domFocus();
            // An item is already highlighted; advance from it instead of jumping to first
            const current = this._list.getFocus();
            if (current.length > 0) {
                this._list.focusNext(1, false, undefined, this.focusCondition);
                const focused = this._list.getFocus();
                if (focused.length > 0) {
                    this._list.reveal(focused[0]);
                }
            }
            else {
                this._list.focusFirst(undefined, this.focusCondition);
                const focused = this._list.getFocus();
                if (focused.length > 0) {
                    this._list.reveal(focused[0]);
                }
            }
            return;
        }
        const previousFocus = this._list.getFocus();
        this._list.focusNext(1, true, undefined, this.focusCondition);
        const focused = this._list.getFocus();
        if (focused.length > 0) {
            // If focus wrapped (was at last focusable, now at first), move to filter instead
            if (this._filterInput && previousFocus.length > 0 && focused[0] < previousFocus[0]) {
                this._list.setFocus([]);
                this._filterInput.focus();
                return;
            }
            this._list.reveal(focused[0]);
        }
    }
    collapseFocusedSection() {
        const section = this._getFocusedSection();
        if (section && !this._collapsedSections.has(section)) {
            this._toggleSection(section);
        }
    }
    expandFocusedSection() {
        const section = this._getFocusedSection();
        if (section && this._collapsedSections.has(section)) {
            this._toggleSection(section);
        }
    }
    toggleFocusedSection() {
        const focused = this._list.getFocus();
        if (focused.length === 0) {
            return false;
        }
        const element = this._list.element(focused[0]);
        if (element.isSectionToggle && element.section) {
            this._toggleSection(element.section);
            return true;
        }
        return false;
    }
    _getFocusedSection() {
        const focused = this._list.getFocus();
        if (focused.length === 0) {
            return undefined;
        }
        const element = this._list.element(focused[0]);
        if (element.isSectionToggle && element.section) {
            return element.section;
        }
        return element.section;
    }
    acceptSelected(preview) {
        const focused = this._list.getFocus();
        if (focused.length === 0) {
            return;
        }
        const focusIndex = focused[0];
        const element = this._list.element(focusIndex);
        if (!this.focusCondition(element)) {
            return;
        }
        const event = preview ? new PreviewSelectedEvent() : new AcceptSelectedEvent();
        this._list.setSelection([focusIndex], event);
    }
    onListSelection(e) {
        if (!e.elements.length) {
            return;
        }
        const element = e.elements[0];
        if (element.isSectionToggle && element.section) {
            this._list.setSelection([]);
            const section = element.section;
            queueMicrotask(() => {
                this._toggleSection(section);
            });
            return;
        }
        // Don't select when clicking the toolbar or submenu indicator
        if (dom.isMouseEvent(e.browserEvent)) {
            const target = e.browserEvent.target;
            if (dom.isHTMLElement(target) && (target.closest('.action-list-item-toolbar') || target.closest('.action-list-submenu-indicator'))) {
                this._list.setSelection([]);
                return;
            }
        }
        if (element.item && this.focusCondition(element)) {
            this._delegate.onSelect(element.item, e.browserEvent instanceof PreviewSelectedEvent);
        }
        else {
            this._list.setSelection([]);
        }
    }
    onFocus() {
        const focused = this._list.getFocus();
        if (focused.length === 0) {
            return;
        }
        const focusIndex = focused[0];
        const element = this._list.element(focusIndex);
        this._delegate.onFocus?.(element.item);
        // Show hover on focus change (suppress during programmatic initial focus)
        if (!this._suppressHover) {
            this._showHoverForElement(element, focusIndex);
        }
    }
    _removeItem(item) {
        const index = this._allMenuItems.indexOf(item);
        if (index >= 0) {
            this._allMenuItems.splice(index, 1);
            this._applyFilter();
        }
    }
    _computeToolbarWidth(item) {
        let actionCount = item.toolbarActions?.length ?? 0;
        if (item.onRemove) {
            actionCount++;
        }
        if (actionCount === 0) {
            return 0;
        }
        // Each toolbar action button is ~22px (16px icon + padding) plus 6px row gap
        const actionButtonWidth = 22;
        return actionCount * actionButtonWidth + 6;
    }
    _getRowElement(index) {
        // eslint-disable-next-line no-restricted-syntax
        return this.domNode.ownerDocument.getElementById(this._list.getElementID(index));
    }
    _showHoverForElement(element, index) {
        if (this._currentSubmenuElement === element || element.submenuActions?.length) {
            return;
        }
        this._submenuDisposables.clear();
        const rowElement = this._getRowElement(index);
        if (!rowElement) {
            this._hover.clear();
            return;
        }
        const hasHoverContent = !!element.hover?.content;
        if (!hasHoverContent) {
            this._hover.clear();
            return;
        }
        const markdown = typeof element.hover.content === 'string' ? new MarkdownString(element.hover.content) : element.hover.content;
        const linkHandler = this._options?.linkHandler;
        this._hover.value = this._hoverService.showDelayedHover({
            content: markdown ?? '',
            target: rowElement,
            additionalClasses: ['action-widget-hover'],
            linkHandler: linkHandler ? (url) => {
                linkHandler(URI.parse(url), element);
            } : undefined,
            position: {
                hoverPosition: 0 /* HoverPosition.LEFT */,
                forcePosition: false,
                ...element.hover.position,
            },
            appearance: {
                showPointer: true,
            },
        }, { groupId: `actionListHover` });
    }
    _showSubmenuForItem(item) {
        const index = this._list.indexOf(item);
        if (index >= 0) {
            const rowElement = this._getRowElement(index);
            if (rowElement) {
                this._showSubmenuForElement(item, rowElement);
            }
        }
    }
    _showSubmenuForElement(element, anchor) {
        this._submenuDisposables.clear();
        this._hover.clear();
        this._currentSubmenuElement = element;
        dom.clearNode(this._submenuContainer);
        // Convert submenu actions into ActionListWidget items
        const submenuItems = [];
        const submenuGroups = element.submenuActions.filter((a) => a instanceof SubmenuAction);
        const groupsWithActions = submenuGroups.filter(g => g.actions.length > 0);
        for (let gi = 0; gi < groupsWithActions.length; gi++) {
            const group = groupsWithActions[gi];
            if (group.label) {
                submenuItems.push({
                    kind: "header" /* ActionListItemKind.Header */,
                    group: { title: group.label },
                    label: group.label,
                });
            }
            for (let ci = 0; ci < group.actions.length; ci++) {
                const child = group.actions[ci];
                submenuItems.push({
                    item: child,
                    kind: "action" /* ActionListItemKind.Action */,
                    label: child.label,
                    description: child.tooltip || undefined,
                    group: { title: '', icon: ThemeIcon.fromId(child.checked ? Codicon.check.id : Codicon.blank.id) },
                    hideIcon: false,
                    hover: {},
                });
            }
            if (gi < groupsWithActions.length - 1) {
                submenuItems.push({ kind: "separator" /* ActionListItemKind.Separator */, label: '' });
            }
        }
        // Also include non-SubmenuAction items directly
        for (const action of element.submenuActions) {
            if (!(action instanceof SubmenuAction)) {
                submenuItems.push({
                    item: action,
                    kind: "action" /* ActionListItemKind.Action */,
                    label: action.label,
                    description: action.tooltip || undefined,
                    group: { title: '' },
                    hideIcon: false,
                    hover: {},
                });
            }
        }
        const submenuDelegate = {
            onHide: () => { },
            onSelect: (action) => {
                action.run();
                // Also select the parent item in the main list
                const parentItem = this._currentSubmenuElement?.item;
                this._hideSubmenu();
                if (parentItem) {
                    this._delegate.onSelect(parentItem);
                }
                this.hide();
            },
        };
        // Show container before creating widget so List can measure during construction
        this._submenuContainer.style.display = '';
        this._submenuContainer.style.position = 'absolute';
        // Position: prefer right side, fall back to left if not enough space
        const anchorRect = anchor.getBoundingClientRect();
        const parentRect = this.domNode.getBoundingClientRect();
        const submenuWidget = this._submenuDisposables.add(this._instantiationService.createInstance((ActionListWidget_1), 'submenu', false, submenuItems, submenuDelegate, undefined, undefined));
        this._submenuContainer.appendChild(submenuWidget.domNode);
        this._currentSubmenuWidget = submenuWidget;
        // Layout: first pass renders items, second pass measures true width
        const totalHeight = submenuWidget.computeListHeight();
        submenuWidget.layout(totalHeight);
        const maxWidth = submenuWidget.computeMaxWidth(0);
        submenuWidget.layout(totalHeight, maxWidth);
        submenuWidget.domNode.style.width = `${maxWidth}px`;
        // Position: prefer right side, fall back to left if not enough space
        const targetWindow = dom.getWindow(this.domNode);
        const viewportWidth = targetWindow.innerWidth;
        const spaceRight = viewportWidth - anchorRect.right;
        const spaceLeft = parentRect.left;
        const submenuWidth = maxWidth + 10; // account for border/padding
        const gap = 4;
        if (spaceRight >= submenuWidth || spaceRight >= spaceLeft) {
            // Show on the right, offset past the parent's right edge
            this._submenuContainer.style.left = `${parentRect.right - parentRect.left + gap}px`;
        }
        else {
            // Show on the left
            this._submenuContainer.style.left = `${-submenuWidth - gap}px`;
        }
        this._submenuContainer.style.top = `${anchorRect.top - parentRect.top - 4}px`;
        // Keyboard navigation in submenu
        this._submenuDisposables.add(dom.addDisposableListener(submenuWidget.domNode, 'keydown', (e) => {
            if (e.key === 'ArrowLeft' || e.key === 'Escape') {
                dom.EventHelper.stop(e, true);
                this._hideSubmenu();
                this._list.domFocus();
            }
            else if (e.key === 'Enter') {
                dom.EventHelper.stop(e, true);
                const focused = submenuWidget.getFocusedElement();
                if (focused?.item) {
                    focused.item.run();
                    const parentItem = this._currentSubmenuElement?.item;
                    this._hideSubmenu();
                    if (parentItem) {
                        this._delegate.onSelect(parentItem);
                    }
                    this.hide();
                }
            }
            else if (e.key === 'ArrowDown') {
                dom.EventHelper.stop(e, true);
                submenuWidget.focusNext();
            }
            else if (e.key === 'ArrowUp') {
                dom.EventHelper.stop(e, true);
                submenuWidget.focusPrevious();
            }
        }));
    }
    _hideSubmenu() {
        this._cancelSubmenuHide();
        this._cancelSubmenuShow();
        this._submenuDisposables.clear();
        this._currentSubmenuWidget = undefined;
        this._currentSubmenuElement = undefined;
        dom.clearNode(this._submenuContainer);
        this._submenuContainer.style.display = 'none';
    }
    _scheduleSubmenuHide() {
        this._cancelSubmenuHide();
        this._submenuHideTimeout = setTimeout(() => {
            this._hideSubmenu();
        }, 300);
    }
    _cancelSubmenuHide() {
        if (this._submenuHideTimeout !== undefined) {
            clearTimeout(this._submenuHideTimeout);
            this._submenuHideTimeout = undefined;
        }
    }
    _scheduleSubmenuShow(element, index) {
        this._cancelSubmenuShow();
        this._submenuShowTimeout = setTimeout(() => {
            this._submenuShowTimeout = undefined;
            const rowElement = typeof index === 'number' ? this._getRowElement(index) : null;
            if (rowElement) {
                this._showSubmenuForElement(element, rowElement);
            }
        }, 300);
    }
    _cancelSubmenuShow() {
        if (this._submenuShowTimeout !== undefined) {
            clearTimeout(this._submenuShowTimeout);
            this._submenuShowTimeout = undefined;
        }
    }
    async onListHover(e) {
        const element = e.element;
        if (element && element.item && this.focusCondition(element)) {
            // Check if the hover target is inside a toolbar - if so, skip the splice
            // to avoid re-rendering which would destroy the element mid-hover.
            // But still maintain submenu state for items with submenu actions.
            const isHoveringToolbar = dom.isHTMLElement(e.browserEvent.target) && e.browserEvent.target.closest('.action-list-item-toolbar') !== null;
            if (isHoveringToolbar) {
                if (!element.submenuActions?.length) {
                    this._cancelSubmenuShow();
                }
                this._list.setFocus([]);
                return;
            }
            // Set focus immediately for responsive hover feedback
            this._list.setFocus(typeof e.index === 'number' ? [e.index] : []);
            // Show submenu on row hover for items with submenu actions
            if (element.submenuActions?.length) {
                if (this._currentSubmenuElement === element) {
                    this._cancelSubmenuHide();
                    this._cancelSubmenuShow();
                }
                else {
                    this._scheduleSubmenuShow(element, e.index);
                }
                return;
            }
            if (this._currentSubmenuElement === element) {
                this._cancelSubmenuHide();
            }
            else {
                this._cancelSubmenuShow();
                this._hideSubmenu();
            }
            if (this._delegate.onHover && !element.disabled && element.kind === "action" /* ActionListItemKind.Action */ && this._currentSubmenuElement !== element) {
                const result = await this._delegate.onHover(element.item, this.cts.token);
                const canPreview = result ? result.canPreview : undefined;
                if (canPreview !== element.canPreview) {
                    element.canPreview = canPreview;
                    if (typeof e.index === 'number') {
                        this._list.splice(e.index, 1, [element]);
                        this._list.setFocus([e.index]);
                    }
                }
            }
        }
        else if (element && element.hover?.content && typeof e.index === 'number') {
            // Show hover for disabled items that have hover content
            this._showHoverForElement(element, e.index);
        }
    }
    onListClick(e) {
        if (e.element && this.focusCondition(e.element)) {
            this._list.setFocus([]);
        }
    }
};
ActionListWidget = ActionListWidget_1 = __decorate([
    __param(6, IKeybindingService),
    __param(7, IHoverService),
    __param(8, IOpenerService),
    __param(9, IInstantiationService)
], ActionListWidget);
export { ActionListWidget };
/**
 * An action list that wraps {@link ActionListWidget} with context-view positioning
 * and anchor-based height computation.
 */
let ActionList = class ActionList extends Disposable {
    get domNode() {
        return this._widget.domNode;
    }
    get filterContainer() {
        return this._widget.filterContainer;
    }
    get filterInput() {
        return this._widget.filterInput;
    }
    /**
     * Returns the resolved anchor position after the first layout.
     * Used by the context view delegate to lock the dropdown direction.
     */
    get anchorPosition() {
        if (this._showAbove === undefined) {
            return undefined;
        }
        return this._showAbove ? 1 /* AnchorPosition.ABOVE */ : 0 /* AnchorPosition.BELOW */;
    }
    constructor(user, preview, items, _delegate, accessibilityProvider, options, anchor, _contextViewService, _layoutService, instantiationService) {
        super();
        this._contextViewService = _contextViewService;
        this._layoutService = _layoutService;
        this._lastMinWidth = 0;
        this._hasLaidOut = false;
        this._anchor = anchor;
        this._widget = this._register(instantiationService.createInstance((ActionListWidget), user, preview, items, _delegate, accessibilityProvider, options));
        this._register(this._widget.onDidRequestLayout(() => {
            if (this._hasLaidOut) {
                this.layout(this._lastMinWidth);
                this._contextViewService.layout();
            }
        }));
    }
    focus() {
        this._widget.focus();
    }
    hide(didCancel) {
        this._widget.hide(didCancel);
        this._contextViewService.hideContextView();
    }
    clearFilter() {
        return this._widget.clearFilter();
    }
    focusPrevious() {
        this._widget.focusPrevious();
    }
    focusNext() {
        this._widget.focusNext();
    }
    collapseFocusedSection() {
        this._widget.collapseFocusedSection();
    }
    expandFocusedSection() {
        this._widget.expandFocusedSection();
    }
    toggleFocusedSection() {
        return this._widget.toggleFocusedSection();
    }
    acceptSelected(preview) {
        this._widget.acceptSelected(preview);
    }
    hasDynamicHeight() {
        return this._widget.hasDynamicHeight;
    }
    computeHeight() {
        const listHeight = this._widget.computeListHeight();
        const filterHeight = this._widget.filterContainer ? 36 : 0;
        const padding = 10;
        const targetWindow = dom.getWindow(this.domNode);
        let availableHeight;
        if (this.hasDynamicHeight()) {
            const viewportHeight = targetWindow.innerHeight;
            const anchorRect = getAnchorRect(this._anchor);
            const anchorTopInViewport = anchorRect.top - targetWindow.pageYOffset;
            const spaceBelow = viewportHeight - anchorTopInViewport - anchorRect.height - padding;
            const spaceAbove = anchorTopInViewport - padding;
            // Lock the direction on first layout based on whether the full
            // unconstrained list fits below. Once decided, the dropdown stays
            // in the same position even when the visible item count changes.
            if (this._showAbove === undefined) {
                const fullHeight = filterHeight + this._widget.computeFullHeight();
                this._showAbove = fullHeight > spaceBelow && spaceAbove > spaceBelow;
            }
            availableHeight = this._showAbove ? spaceAbove : spaceBelow;
        }
        else {
            const windowHeight = this._layoutService.getContainer(targetWindow).clientHeight;
            const widgetTop = this.domNode.getBoundingClientRect().top;
            availableHeight = widgetTop > 0 ? windowHeight - widgetTop - padding : windowHeight * 0.7;
        }
        const viewportMaxHeight = Math.floor(targetWindow.innerHeight * 0.6);
        const actionLineHeight = this._widget.lineHeight;
        const maxHeight = Math.min(Math.max(availableHeight, actionLineHeight * 3 + filterHeight), viewportMaxHeight);
        const height = Math.min(listHeight + filterHeight, maxHeight);
        return height - filterHeight;
    }
    layout(minWidth) {
        this._hasLaidOut = true;
        this._lastMinWidth = minWidth;
        const listHeight = this.computeHeight();
        this._widget.layout(listHeight);
        this._cachedMaxWidth = this._widget.computeMaxWidth(minWidth);
        this._widget.layout(listHeight, this._cachedMaxWidth);
        return this._cachedMaxWidth;
    }
};
ActionList = __decorate([
    __param(7, IContextViewService),
    __param(8, ILayoutService),
    __param(9, IInstantiationService)
], ActionList);
export { ActionList };
function stripNewlines(str) {
    return str.replace(/\r\n|\r|\n/g, ' ');
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYWN0aW9uTGlzdC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3BsYXRmb3JtL2FjdGlvbldpZGdldC9icm93c2VyL2FjdGlvbkxpc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7OztBQUFBOzs7Z0dBR2dHO0FBQ2hHLE9BQU8sS0FBSyxHQUFHLE1BQU0sOEJBQThCLENBQUM7QUFFcEQsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLDJDQUEyQyxDQUFDO0FBQzNFLE9BQU8sRUFBRSxTQUFTLEVBQUUsTUFBTSxpREFBaUQsQ0FBQztBQUM1RSxPQUFPLEVBQUUsYUFBYSxFQUFXLE1BQU0scURBQXFELENBQUM7QUFDN0YsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLDZEQUE2RCxDQUFDO0FBRTlGLE9BQU8sRUFBOEIsSUFBSSxFQUFFLE1BQU0sNkNBQTZDLENBQUM7QUFDL0YsT0FBTyxFQUFXLGFBQWEsRUFBRSxRQUFRLEVBQUUsTUFBTSxpQ0FBaUMsQ0FBQztBQUNuRixPQUFPLEVBQXFCLHVCQUF1QixFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDbEcsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQzNELE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSwrQkFBK0IsQ0FBQztBQUN4RCxPQUFPLEVBQW1CLGNBQWMsRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBR3RGLE9BQU8sRUFBRSxVQUFVLEVBQUUsZUFBZSxFQUFFLGlCQUFpQixFQUFFLFlBQVksRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQ2pILE9BQU8sRUFBRSxFQUFFLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUN0RCxPQUFPLEVBQUUsU0FBUyxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDOUQsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLDZCQUE2QixDQUFDO0FBQ2xELE9BQU8sb0JB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