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
var QuickPickItemElementRenderer_1, QuickPickSeparatorElementRenderer_1;
import * as cssJs from '../../../base/browser/cssValue.js';
import * as dom from '../../../base/browser/dom.js';
import { ToolBar } from '../../../base/browser/ui/toolbar/toolbar.js';
import { IconLabel } from '../../../base/browser/ui/iconLabel/iconLabel.js';
import { KeybindingLabel } from '../../../base/browser/ui/keybindingLabel/keybindingLabel.js';
import { Checkbox, createToggleActionViewItemProvider } from '../../../base/browser/ui/toggle/toggle.js';
import { RenderIndentGuides } from '../../../base/browser/ui/tree/abstractTree.js';
import { equals } from '../../../base/common/arrays.js';
import { ThrottledDelayer } from '../../../base/common/async.js';
import { compareAnything } from '../../../base/common/comparers.js';
import { memoize } from '../../../base/common/decorators.js';
import { isCancellationError } from '../../../base/common/errors.js';
import { Emitter, Event, EventBufferer } from '../../../base/common/event.js';
import { getCodiconAriaLabel, matchesFuzzyIconAware, parseLabelWithIcons } from '../../../base/common/iconLabels.js';
import { Lazy } from '../../../base/common/lazy.js';
import { Disposable, DisposableStore, MutableDisposable } from '../../../base/common/lifecycle.js';
import { observableValue, observableValueOpts, transaction } from '../../../base/common/observable.js';
import { OS } from '../../../base/common/platform.js';
import { escape, ltrim } from '../../../base/common/strings.js';
import { URI } from '../../../base/common/uri.js';
import { localize } from '../../../nls.js';
import { IAccessibilityService } from '../../accessibility/common/accessibility.js';
import { IContextMenuService } from '../../contextview/browser/contextView.js';
import { IInstantiationService } from '../../instantiation/common/instantiation.js';
import { WorkbenchObjectTree } from '../../list/browser/listService.js';
import { defaultCheckboxStyles } from '../../theme/browser/defaultStyles.js';
import { isDark } from '../../theme/common/theme.js';
import { IThemeService } from '../../theme/common/themeService.js';
import { QuickPickFocus } from '../common/quickInput.js';
import { quickInputButtonsToActionArrays } from './quickInputUtils.js';
const $ = dom.$;
class BaseQuickPickItemElement {
    constructor(index, hasCheckbox, mainItem) {
        this.index = index;
        this.hasCheckbox = hasCheckbox;
        this._hidden = false;
        this._init = new Lazy(() => {
            const saneLabel = mainItem.label ?? '';
            const saneSortLabel = parseLabelWithIcons(saneLabel).text.trim();
            const saneAriaLabel = mainItem.ariaLabel || [saneLabel, this.saneDescription, this.saneDetail]
                .map(s => getCodiconAriaLabel(s))
                .filter(s => !!s)
                .join(', ');
            return {
                saneLabel,
                saneSortLabel,
                saneAriaLabel
            };
        });
        this._saneDescription = mainItem.description;
        this._saneTooltip = mainItem.tooltip;
    }
    // #region Lazy Getters
    get saneLabel() {
        return this._init.value.saneLabel;
    }
    get saneSortLabel() {
        return this._init.value.saneSortLabel;
    }
    get saneAriaLabel() {
        return this._init.value.saneAriaLabel;
    }
    get element() {
        return this._element;
    }
    set element(value) {
        this._element = value;
    }
    get hidden() {
        return this._hidden;
    }
    set hidden(value) {
        this._hidden = value;
    }
    get saneDescription() {
        return this._saneDescription;
    }
    set saneDescription(value) {
        this._saneDescription = value;
    }
    get saneDetail() {
        return this._saneDetail;
    }
    set saneDetail(value) {
        this._saneDetail = value;
    }
    get saneTooltip() {
        return this._saneTooltip;
    }
    set saneTooltip(value) {
        this._saneTooltip = value;
    }
    get labelHighlights() {
        return this._labelHighlights;
    }
    set labelHighlights(value) {
        this._labelHighlights = value;
    }
    get descriptionHighlights() {
        return this._descriptionHighlights;
    }
    set descriptionHighlights(value) {
        this._descriptionHighlights = value;
    }
    get detailHighlights() {
        return this._detailHighlights;
    }
    set detailHighlights(value) {
        this._detailHighlights = value;
    }
}
class QuickPickItemElement extends BaseQuickPickItemElement {
    constructor(index, childIndex, hasCheckbox, fireButtonTriggered, _onChecked, item, _separator) {
        super(index, hasCheckbox, item);
        this.childIndex = childIndex;
        this.fireButtonTriggered = fireButtonTriggered;
        this._onChecked = _onChecked;
        this.item = item;
        this._separator = _separator;
        this._checked = false;
        this.onChecked = hasCheckbox
            ? Event.map(Event.filter(this._onChecked.event, e => e.element === this), e => e.checked)
            : Event.None;
        this._saneDetail = item.detail;
        this._labelHighlights = item.highlights?.label;
        this._descriptionHighlights = item.highlights?.description;
        this._detailHighlights = item.highlights?.detail;
    }
    get separator() {
        return this._separator;
    }
    set separator(value) {
        this._separator = value;
    }
    get checked() {
        return this._checked;
    }
    set checked(value) {
        if (value !== this._checked) {
            this._checked = value;
            this._onChecked.fire({ element: this, checked: value });
        }
    }
    get checkboxDisabled() {
        return !!this.item.disabled;
    }
}
var QuickPickSeparatorFocusReason;
(function (QuickPickSeparatorFocusReason) {
    /**
     * No item is hovered or active
     */
    QuickPickSeparatorFocusReason[QuickPickSeparatorFocusReason["NONE"] = 0] = "NONE";
    /**
     * Some item within this section is hovered
     */
    QuickPickSeparatorFocusReason[QuickPickSeparatorFocusReason["MOUSE_HOVER"] = 1] = "MOUSE_HOVER";
    /**
     * Some item within this section is active
     */
    QuickPickSeparatorFocusReason[QuickPickSeparatorFocusReason["ACTIVE_ITEM"] = 2] = "ACTIVE_ITEM";
})(QuickPickSeparatorFocusReason || (QuickPickSeparatorFocusReason = {}));
class QuickPickSeparatorElement extends BaseQuickPickItemElement {
    constructor(index, fireSeparatorButtonTriggered, separator) {
        super(index, false, separator);
        this.fireSeparatorButtonTriggered = fireSeparatorButtonTriggered;
        this.separator = separator;
        this.children = new Array();
        /**
         * If this item is >0, it means that there is some item in the list that is either:
         * * hovered over
         * * active
         */
        this.focusInsideSeparator = QuickPickSeparatorFocusReason.NONE;
    }
}
class QuickInputItemDelegate {
    getHeight(element) {
        if (element instanceof QuickPickSeparatorElement) {
            return 30;
        }
        return element.saneDetail ? 44 : 22;
    }
    getTemplateId(element) {
        if (element instanceof QuickPickItemElement) {
            return QuickPickItemElementRenderer.ID;
        }
        else {
            return QuickPickSeparatorElementRenderer.ID;
        }
    }
}
class QuickInputAccessibilityProvider {
    getWidgetAriaLabel() {
        return localize('quickInput', "Quick Input");
    }
    getAriaLabel(element) {
        return element.separator?.label
            ? `${element.saneAriaLabel}, ${element.separator.label}`
            : element.saneAriaLabel;
    }
    getWidgetRole() {
        return 'listbox';
    }
    getRole(element) {
        return element.hasCheckbox ? 'checkbox' : 'option';
    }
    isChecked(element) {
        if (!element.hasCheckbox || !(element instanceof QuickPickItemElement)) {
            return undefined;
        }
        return {
            get value() { return element.checked; },
            onDidChange: e => element.onChecked(() => e()),
        };
    }
}
class BaseQuickInputListRenderer extends Disposable {
    constructor(hoverDelegate, toggleStyles, contextMenuService) {
        super();
        this.hoverDelegate = hoverDelegate;
        this.toggleStyles = toggleStyles;
        this.contextMenuService = contextMenuService;
        this._onDidDisposeFocusedElement = this._register(new Emitter());
        /**
         * This event is emitted when the renderer disposes an element that has focus.
         * This allows the list to re-focus itself and prevent focus from being lost
         * (potentially causing quickinput to dismiss itself) when an element is
         * removed while focused.
         */
        this.onDidDisposeFocusedElement = this._onDidDisposeFocusedElement.event;
    }
    // TODO: only do the common stuff here and have a subclass handle their specific stuff
    renderTemplate(container) {
        const data = Object.create(null);
        data.toDisposeElement = new DisposableStore();
        data.toDisposeTemplate = new DisposableStore();
        data.entry = dom.append(container, $('.quick-input-list-entry'));
        // Checkbox
        const label = dom.append(data.entry, $('label.quick-input-list-label'));
        data.outerLabel = label;
        data.checkbox = data.toDisposeTemplate.add(new MutableDisposable());
        data.toDisposeTemplate.add(dom.addStandardDisposableListener(label, dom.EventType.CLICK, e => {
            // `label` elements with role=checkboxes don't automatically toggle them like normal <checkbox> elements
            if (data.checkbox.value && !e.defaultPrevented && data.checkbox.value.enabled) {
                const checked = !data.checkbox.value.checked;
                data.checkbox.value.checked = checked;
                data.element.checked = checked;
            }
        }));
        // Rows
        const rows = dom.append(label, $('.quick-input-list-rows'));
        const row1 = dom.append(rows, $('.quick-input-list-row'));
        const row2 = dom.append(rows, $('.quick-input-list-row'));
        // Label
        data.label = new IconLabel(row1, { supportHighlights: true, supportDescriptionHighlights: true, supportIcons: true, hoverDelegate: this.hoverDelegate });
        data.toDisposeTemplate.add(data.label);
        data.icon = dom.prepend(data.label.element, $('.quick-input-list-icon'));
        // Keybinding
        const keybindingContainer = dom.append(row1, $('.quick-input-list-entry-keybinding'));
        data.keybinding = new KeybindingLabel(keybindingContainer, OS);
        data.toDisposeTemplate.add(data.keybinding);
        // Detail
        const detailContainer = dom.append(row2, $('.quick-input-list-label-meta'));
        data.detail = new IconLabel(detailContainer, { supportHighlights: true, supportIcons: true, hoverDelegate: this.hoverDelegate });
        data.toDisposeTemplate.add(data.detail);
        // Separator
        data.separator = dom.append(data.entry, $('.quick-input-list-separator'));
        // Actions
        data.toolBar = new ToolBar(data.entry, this.contextMenuService, {
            ...(this.hoverDelegate ? { hoverDelegate: this.hoverDelegate } : undefined),
            actionViewItemProvider: createToggleActionViewItemProvider(this.toggleStyles),
            icon: true,
            label: false
        });
        data.toolBar.getElement().classList.add('quick-input-list-entry-action-bar');
        data.toDisposeTemplate.add(data.toolBar);
        return data;
    }
    disposeTemplate(data) {
        data.toDisposeElement.dispose();
        data.toDisposeTemplate.dispose();
    }
    disposeElement(_element, _index, data) {
        if (dom.isAncestorOfActiveElement(data.entry)) {
            this._onDidDisposeFocusedElement.fire();
        }
        data.toDisposeElement.clear();
        data.toolBar.setActions([]);
    }
}
let QuickPickItemElementRenderer = class QuickPickItemElementRenderer extends BaseQuickInputListRenderer {
    static { QuickPickItemElementRenderer_1 = this; }
    static { this.ID = 'quickpickitem'; }
    constructor(hoverDelegate, toggleStyles, contextMenuService, themeService) {
        super(hoverDelegate, toggleStyles, contextMenuService);
        this.themeService = themeService;
        // Follow what we do in the separator renderer
        this._itemsWithSeparatorsFrequency = new Map();
    }
    get templateId() {
        return QuickPickItemElementRenderer_1.ID;
    }
    ensureCheckbox(element, data) {
        if (!element.hasCheckbox) {
            data.checkbox.value?.domNode.remove();
            data.checkbox.clear();
            return;
        }
        let checkbox = data.checkbox.value;
        if (!checkbox) {
            checkbox = new Checkbox(element.saneLabel, element.checked, { ...defaultCheckboxStyles, size: 15 });
            data.checkbox.value = checkbox;
            data.outerLabel.prepend(checkbox.domNode);
            // Remove checkbox from tab order since tree items are navigable with arrow keys
            // This prevents the issue where pressing Space toggles both the tabbed checkbox and the focused item
            checkbox.domNode.tabIndex = -1;
        }
        else {
            checkbox.setTitle(element.saneLabel);
        }
        if (element.checkboxDisabled) {
            checkbox.disable();
        }
        else {
            checkbox.enable();
        }
        checkbox.checked = element.checked;
        data.toDisposeElement.add(element.onChecked(checked => checkbox.checked = checked));
        data.toDisposeElement.add(checkbox.onChange(() => element.checked = checkbox.checked));
    }
    renderElement(node, index, data) {
        const element = node.element;
        data.element = element;
        element.element = data.entry ?? undefined;
        const mainItem = element.item;
        element.element.classList.toggle('not-pickable', element.item.pickable === false);
        this.ensureCheckbox(element, data);
        const { labelHighlights, descriptionHighlights, detailHighlights } = element;
        // Icon
        if (mainItem.iconPath) {
            const icon = isDark(this.themeService.getColorTheme().type) ? mainItem.iconPath.dark : (mainItem.iconPath.light ?? mainItem.iconPath.dark);
            const iconUrl = URI.revive(icon);
            data.icon.className = 'quick-input-list-icon';
            data.icon.style.backgroundImage = cssJs.asCSSUrl(iconUrl);
        }
        else {
            data.icon.style.backgroundImage = '';
            data.icon.className = mainItem.iconClass ? `quick-input-list-icon ${mainItem.iconClass}` : '';
        }
        // Label
        let descriptionTitle;
        // if we have a tooltip, that will be the hover,
        // with the saneDescription as fallback if it
        // is defined
        if (!element.saneTooltip && element.saneDescription) {
            descriptionTitle = {
                markdown: {
                    value: escape(element.saneDescription),
                    supportThemeIcons: true
                },
                markdownNotSupportedFallback: element.saneDescription
            };
        }
        const options = {
            matches: labelHighlights || [],
            // If we have a tooltip, we want that to be shown and not any other hover
            descriptionTitle,
            descriptionMatches: descriptionHighlights || [],
            labelEscapeNewLines: true
        };
        options.extraClasses = mainItem.iconClasses;
        options.italic = mainItem.italic;
        options.strikethrough = mainItem.strikethrough;
        data.entry.classList.remove('quick-input-list-separator-as-item');
        data.label.setLabel(element.saneLabel, element.saneDescription, options);
        // Keybinding
        data.keybinding.set(mainItem.keybinding);
        // Detail
        if (element.saneDetail) {
            let title;
            // If we have a tooltip, we want that to be shown and not any other hover
            if (!element.saneTooltip) {
                title = {
                    markdown: {
                        value: escape(element.saneDetail),
                        supportThemeIcons: true
                    },
                    markdownNotSupportedFallback: element.saneDetail
                };
            }
            data.detail.element.style.display = '';
            data.detail.setLabel(element.saneDetail, undefined, {
                matches: detailHighlights,
                title,
                labelEscapeNewLines: true
            });
        }
        else {
            data.detail.element.style.display = 'none';
        }
        // Separator
        if (element.separator?.label) {
            data.separator.textContent = element.separator.label;
            data.separator.style.display = '';
            this.addItemWithSeparator(element);
        }
        else {
            data.separator.style.display = 'none';
        }
        data.entry.classList.toggle('quick-input-list-separator-border', !!element.separator && element.childIndex !== 0);
        // Actions
        const buttons = mainItem.buttons;
        if (buttons && buttons.length) {
            const { primary, secondary } = quickInputButtonsToActionArrays(buttons, 'quick-input-item', (button) => element.fireButtonTriggered({ button, item: element.item }));
            data.toolBar.setActions(primary, secondary);
            data.entry.classList.add('has-actions');
        }
        else {
            data.toolBar.setActions([]);
            data.entry.classList.remove('has-actions');
        }
    }
    disposeElement(element, _index, data) {
        this.removeItemWithSeparator(element.element);
        super.disposeElement(element, _index, data);
    }
    isItemWithSeparatorVisible(item) {
        return this._itemsWithSeparatorsFrequency.has(item);
    }
    addItemWithSeparator(item) {
        this._itemsWithSeparatorsFrequency.set(item, (this._itemsWithSeparatorsFrequency.get(item) || 0) + 1);
    }
    removeItemWithSeparator(item) {
        const frequency = this._itemsWithSeparatorsFrequency.get(item) || 0;
        if (frequency > 1) {
            this._itemsWithSeparatorsFrequency.set(item, frequency - 1);
        }
        else {
            this._itemsWithSeparatorsFrequency.delete(item);
        }
    }
};
QuickPickItemElementRenderer = QuickPickItemElementRenderer_1 = __decorate([
    __param(2, IContextMenuService),
    __param(3, IThemeService)
], QuickPickItemElementRenderer);
let QuickPickSeparatorElementRenderer = class QuickPickSeparatorElementRenderer extends BaseQuickInputListRenderer {
    static { QuickPickSeparatorElementRenderer_1 = this; }
    static { this.ID = 'quickpickseparator'; }
    constructor(hoverDelegate, toggleStyles, contextMenuService) {
        super(hoverDelegate, toggleStyles, contextMenuService);
        // This is a frequency map because sticky scroll re-uses the same renderer to render a second
        // instance of the same separator.
        this._visibleSeparatorsFrequency = new Map();
    }
    get templateId() {
        return QuickPickSeparatorElementRenderer_1.ID;
    }
    get visibleSeparators() {
        return [...this._visibleSeparatorsFrequency.keys()];
    }
    isSeparatorVisible(separator) {
        return this._visibleSeparatorsFrequency.has(separator);
    }
    renderElement(node, index, data) {
        const element = node.element;
        data.element = element;
        element.element = data.entry ?? undefined;
        element.element.classList.toggle('focus-inside', !!element.focusInsideSeparator);
        const mainItem = element.separator;
        const { labelHighlights, descriptionHighlights } = element;
        // Icon
        data.icon.style.backgroundImage = '';
        data.icon.className = '';
        // Label
        let descriptionTitle;
        // if we have a tooltip, that will be the hover,
        // with the saneDescription as fallback if it
        // is defined
        if (!element.saneTooltip && element.saneDescription) {
            descriptionTitle = {
                markdown: {
                    value: escape(element.saneDescription),
                    supportThemeIcons: true
                },
                markdownNotSupportedFallback: element.saneDescription
            };
        }
        const options = {
            matches: labelHighlights || [],
            // If we have a tooltip, we want that to be shown and not any other hover
            descriptionTitle,
            descriptionMatches: descriptionHighlights || [],
            labelEscapeNewLines: true
        };
        data.entry.classList.add('quick-input-list-separator-as-item');
        data.label.setLabel(element.saneLabel, element.saneDescription, options);
        // Separator
        data.separator.style.display = 'none';
        data.entry.classList.add('quick-input-list-separator-border');
        // Actions
        const buttons = mainItem.buttons;
        if (buttons && buttons.length) {
            const { primary, secondary } = quickInputButtonsToActionArrays(buttons, 'quick-input-separator', (button) => element.fireSeparatorButtonTriggered({ button, separator: element.separator }));
            data.toolBar.setActions(primary, secondary);
            data.entry.classList.add('has-actions');
        }
        else {
            data.toolBar.setActions([]);
            data.entry.classList.remove('has-actions');
        }
        this.addSeparator(element);
    }
    disposeElement(element, _index, data) {
        this.removeSeparator(element.element);
        if (!this.isSeparatorVisible(element.element)) {
            element.element.element?.classList.remove('focus-inside');
        }
        super.disposeElement(element, _index, data);
    }
    addSeparator(separator) {
        this._visibleSeparatorsFrequency.set(separator, (this._visibleSeparatorsFrequency.get(separator) || 0) + 1);
    }
    removeSeparator(separator) {
        const frequency = this._visibleSeparatorsFrequency.get(separator) || 0;
        if (frequency > 1) {
            this._visibleSeparatorsFrequency.set(separator, frequency - 1);
        }
        else {
            this._visibleSeparatorsFrequency.delete(separator);
        }
    }
};
QuickPickSeparatorElementRenderer = QuickPickSeparatorElementRenderer_1 = __decorate([
    __param(2, IContextMenuService)
], QuickPickSeparatorElementRenderer);
let QuickInputList = class QuickInputList extends Disposable {
    constructor(parent, hoverDelegate, linkOpenerDelegate, id, styles, instantiationService, accessibilityService) {
        super();
        this.parent = parent;
        this.hoverDelegate = hoverDelegate;
        this.linkOpenerDelegate = linkOpenerDelegate;
        this.styles = styles;
        this.accessibilityService = accessibilityService;
        //#region QuickInputList Events
        this._onKeyDown = this._register(new Emitter());
        /**
         * Event that is fired when the tree receives a keydown.
        */
        this.onKeyDown = this._onKeyDown.event;
        this._onLeave = this._register(new Emitter());
        /**
         * Event that is fired when the tree would no longer have focus.
        */
        this.onLeave = this._onLeave.event;
        this._visibleCountObservable = observableValue('VisibleCount', 0);
        this.onChangedVisibleCount = Event.fromObservable(this._visibleCountObservable, this._store);
        this._allVisibleCheckedObservable = observableValue('AllVisibleChecked', false);
        this.onChangedAllVisibleChecked = Event.fromObservable(this._allVisibleCheckedObservable, this._store);
        this._checkedCountObservable = observableValue('CheckedCount', 0);
        this.onChangedCheckedCount = Event.fromObservable(this._checkedCountObservable, this._store);
        this._checkedElementsObservable = observableValueOpts({ equalsFn: equals }, new Array());
        this.onChangedCheckedElements = Event.fromObservable(this._checkedElementsObservable, this._store);
        this._onButtonTriggered = this._register(new Emitter());
        this.onButtonTriggered = this._onButtonTriggered.event;
        this._onSeparatorButtonTriggered = this._register(new Emitter());
        this.onSeparatorButtonTriggered = this._onSeparatorButtonTriggered.event;
        this._elementChecked = this._register(new Emitter());
        this._elementCheckedEventBufferer = new EventBufferer();
        //#endregion
        this._hasCheckboxes = false;
        this._inputElements = new Array();
        this._elementTree = new Array();
        this._itemElements = new Array();
        // Elements that apply to the current set of elements
        this._elementDisposable = this._register(new DisposableStore());
        this._matchOnDescription = false;
        this._matchOnDetail = false;
        this._matchOnLabel = true;
        this._matchOnLabelMode = 'fuzzy';
        this._matchOnMeta = true;
        this._sortByLabel = true;
        this._shouldLoop = true;
        this._container = dom.append(this.parent, $('.quick-input-list'));
        this._separatorRenderer = this._register(instantiationService.createInstance(QuickPickSeparatorElementRenderer, hoverDelegate, this.styles.toggle));
        this._itemRenderer = this._register(instantiationService.createInstance(QuickPickItemElementRenderer, hoverDelegate, this.styles.toggle));
        this._tree = this._register(instantiationService.createInstance((WorkbenchObjectTree), 'QuickInput', this._container, new QuickInputItemDelegate(), [this._itemRenderer, this._separatorRenderer], {
            filter: {
                filter(element) {
                    return element.hidden
                        ? 0 /* TreeVisibility.Hidden */
                        : element instanceof QuickPickSeparatorElement
                            ? 2 /* TreeVisibility.Recurse */
                            : 1 /* TreeVisibility.Visible */;
                },
            },
            sorter: {
                compare: (element, otherElement) => {
                    if (!this.sortByLabel || !this._lastQueryString) {
                        return 0;
                    }
                    const normalizedSearchValue = this._lastQueryString.toLowerCase();
                    return compareEntries(element, otherElement, normalizedSearchValue);
                },
            },
            accessibilityProvider: new QuickInputAccessibilityProvider(),
            setRowLineHeight: false,
            multipleSelectionSupport: false,
            hideTwistiesOfChildlessElements: true,
            renderIndentGuides: RenderIndentGuides.None,
            findWidgetEnabled: false,
            indent: 0,
            horizontalScrolling: false,
            allowNonCollapsibleParents: true,
            alwaysConsumeMouseWheel: true
        }));
        this._tree.getHTMLElement().id = id;
        this._register(this._itemRenderer.onDidDisposeFocusedElement(() => this._tree.domFocus()));
        this._register(this._separatorRenderer.onDidDisposeFocusedElement(() => this._tree.domFocus()));
        this._registerListeners();
    }
    //#region public getters/setters
    get onDidChangeFocus() {
        return Event.map(this._tree.onDidChangeFocus, e => e.elements.filter((e) => e instanceof QuickPickItemElement).map(e => e.item), this._store);
    }
    get onDidChangeSelection() {
        return Event.map(this._tree.onDidChangeSelection, e => ({
            items: e.elements.filter((e) => e instanceof QuickPickItemElement).map(e => e.item),
            event: e.browserEvent
        }), this._store);
    }
    get displayed() {
        return this._container.style.display !== 'none';
    }
    set displayed(value) {
        this._container.style.display = value ? '' : 'none';
    }
    get scrollTop() {
        return this._tree.scrollTop;
    }
    set scrollTop(scrollTop) {
        this._tree.scrollTop = scrollTop;
    }
    get ariaLabel() {
        return this._tree.ariaLabel;
    }
    set ariaLabel(label) {
        this._tree.ariaLabel = label ?? '';
    }
    set enabled(value) {
        this._tree.getHTMLElement().style.pointerEvents = value ? '' : 'none';
    }
    get matchOnDescription() {
        return this._matchOnDescription;
    }
    set matchOnDescription(value) {
        this._matchOnDescription = value;
    }
    get matchOnDetail() {
        return this._matchOnDetail;
    }
    set matchOnDetail(value) {
        this._matchOnDetail = value;
    }
    get matchOnLabel() {
        return this._matchOnLabel;
    }
    set matchOnLabel(value) {
        this._matchOnLabel = value;
    }
    get matchOnLabelMode() {
        return this._matchOnLabelMode;
    }
    set matchOnLabelMode(value) {
        this._matchOnLabelMode = value;
    }
    get matchOnMeta() {
        return this._matchOnMeta;
    }
    set matchOnMeta(value) {
        this._matchOnMeta = value;
    }
    get sortByLabel() {
        return this._sortByLabel;
    }
    set sortByLabel(value) {
        this._sortByLabel = value;
    }
    get shouldLoop() {
        return this._shouldLoop;
    }
    set shouldLoop(value) {
        this._shouldLoop = value;
    }
    //#endregion
    //#region register listeners
    _registerListeners() {
        this._registerOnContainerClick();
        this._registerOnMouseMiddleClick();
        this._registerOnTreeModelChanged();
        this._registerOnElementChecked();
        this._registerOnContextMenu();
        this._registerHoverListeners();
        this._registerSelectionChangeListener();
        this._registerSeparatorActionShowingListeners();
    }
    _registerOnContainerClick() {
        this._register(dom.addDisposableListener(this._container, dom.EventType.CLICK, e => {
            if (e.x || e.y) { // Avoid 'click' triggered by 'space' on checkbox.
                this._onLeave.fire();
            }
        }));
    }
    _registerOnMouseMiddleClick() {
        this._register(dom.addDisposableListener(this._container, dom.EventType.AUXCLICK, e => {
            if (e.button === 1) {
                this._onLeave.fire();
            }
        }));
    }
    _registerOnTreeModelChanged() {
        this._register(this._tree.onDidChangeModel(() => {
            const visibleCount = this._itemElements.filter(e => !e.hidden).length;
            this._visibleCountObservable.set(visibleCount, undefined);
            if (this._hasCheckboxes) {
                this._updateCheckedObservables();
            }
        }));
    }
    _registerOnElementChecked() {
        // Only fire the last event when buffered
        this._register(this._elementCheckedEventBufferer.wrapEvent(this._elementChecked.event, (_, e) => e)(_ => this._updateCheckedObservables()));
    }
    _registerOnContextMenu() {
        this._register(this._tree.onContextMenu(e => {
            if (e.element) {
                e.browserEvent.preventDefault();
                // we want to treat a context menu event as
                // a gesture to open the item at the index
                // since we do not have any context menu
                // this enables for example macOS to Ctrl-
                // click on an item to open it.
                this._tree.setSelection([e.element]);
            }
        }));
    }
    _registerHoverListeners() {
        const delayer = this._register(new ThrottledDelayer(typeof this.hoverDelegate.delay === 'function' ? this.hoverDelegate.delay() : this.hoverDelegate.delay));
        this._register(this._tree.onMouseOver(async (e) => {
            // If we hover over an anchor element, we don't want to show the hover because
            // the anchor may have a tooltip that we want to show instead.
            if (dom.isHTMLAnchorElement(e.browserEvent.target)) {
                delayer.cancel();
                return;
            }
            if (
            // anchors are an exception as called out above so we skip them here
            !(dom.isHTMLAnchorElement(e.browserEvent.relatedTarget)) &&
                // check if the mouse is still over the same element
                dom.isAncestor(e.browserEvent.relatedTarget, e.element?.element)) {
                return;
            }
            try {
                await delayer.trigger(async () => {
                    if (e.element instanceof QuickPickItemElement) {
                        this.showHover(e.element);
                    }
                });
            }
            catch (e) {
                // Ignore cancellation errors due to mouse out
                if (!isCancellationError(e)) {
                    throw e;
                }
            }
        }));
        this._register(this._tree.onMouseOut(e => {
            // onMouseOut triggers every time a new element has been moused over
            // even if it's on the same list item. We only want one event, so we
            // check if the mouse is still over the same element.
            if (dom.isAncestor(e.browserEvent.relatedTarget, e.element?.element)) {
                return;
            }
            delayer.cancel();
        }));
    }
    /**
     * Register's focus change and mouse events so that we can track when items inside of a
     * separator's section are focused or hovered so that we can display the separator's actions
     */
    _registerSeparatorActionShowingListeners() {
        this._register(this._tree.onDidChangeFocus(e => {
            const parent = e.elements[0]
                ? this._tree.getParentElement(e.elements[0])
                // treat null as focus lost and when we have no separators
                : null;
            for (const separator of this._separatorRenderer.visibleSeparators) {
                const value = separator === parent;
                // get bitness of ACTIVE_ITEM and check if it changed
                const currentActive = !!(separator.focusInsideSeparator & QuickPickSeparatorFocusReason.ACTIVE_ITEM);
                if (currentActive !== value) {
                    if (value) {
                        separator.focusInsideSeparator |= QuickPickSeparatorFocusReason.ACTIVE_ITEM;
                    }
                    else {
                        separator.focusInsideSeparator &= ~QuickPickSeparatorFocusReason.ACTIVE_ITEM;
                    }
                    this._tree.rerender(separator);
                }
            }
        }));
        this._register(this._tree.onMouseOver(e => {
            const parent = e.element
                ? this._tree.getParentElement(e.element)
                : null;
            for (const separator of this._separatorRenderer.visibleSeparators) {
                if (separator !== parent) {
                    continue;
                }
                const currentMouse = !!(separator.focusInsideSeparator & QuickPickSeparatorFocusReason.MOUSE_HOVER);
                if (!currentMouse) {
                    separator.focusInsideSeparator |= QuickPickSeparatorFocusReason.MOUSE_HOVER;
                    this._tree.rerender(separator);
                }
            }
        }));
        this._register(this._tree.onMouseOut(e => {
            const parent = e.element
                ? this._tree.getParentElement(e.element)
                : null;
            for (const separator of this._separatorRenderer.visibleSeparators) {
                if (separator !== parent) {
                    continue;
                }
                const currentMouse = !!(separator.focusInsideSeparator & QuickPickSeparatorFocusReason.MOUSE_HOVER);
                if (currentMouse) {
                    separator.focusInsideSeparator &= ~QuickPickSeparatorFocusReason.MOUSE_HOVER;
                    this._tree.rerender(separator);
                }
            }
        }));
    }
    _registerSelectionChangeListener() {
        // When the user selects a separator, the separator will move to the top and focus will be
        // set to the first element after the separator.
        this._register(this._tree.onDidChangeSelection(e => {
            const elementsWithoutSeparators = e.elements.filter((e) => e instanceof QuickPickItemElement);
            if (elementsWithoutSeparators.length !== e.elements.length) {
                if (e.elements.length === 1 && e.elements[0] instanceof QuickPickSeparatorElement) {
                    this._tree.setFocus([e.elements[0].children[0]]);
                    this._tree.reveal(e.elements[0], 0);
                }
                this._tree.setSelection(elementsWithoutSeparators);
            }
        }));
    }
    //#endregion
    //#region public methods
    setAllVisibleChecked(checked) {
        this._elementCheckedEventBufferer.bufferEvents(() => {
            this._itemElements.forEach(element => {
                if (!element.hidden && !element.checkboxDisabled && element.item.pickable !== false) {
                    // Would fire an event if we didn't beffer the events
                    element.checked = checked;
                }
            });
        });
    }
    setElements(inputElements) {
        this._elementDisposable.clear();
        this._lastQueryString = undefined;
        this._inputElements = inputElements;
        this._hasCheckboxes = this.parent.classList.contains('show-checkboxes');
        let currentSeparatorElement;
        this._itemElements = new Array();
        this._elementTree = inputElements.reduce((result, item, index) => {
            let element;
            if (item.type === 'separator') {
                if (!item.buttons) {
                    // This separator will be rendered as a part of the list item
                    return result;
                }
                currentSeparatorElement = new QuickPickSeparatorElement(index, e => this._onSeparatorButtonTriggered.fire(e), item);
                element = currentSeparatorElement;
            }
            else {
                const previous = index > 0 ? inputElements[index - 1] : undefined;
                let separator;
                if (previous && previous.type === 'separator' && !previous.buttons) {
                    separator = previous;
                }
                const qpi = new QuickPickItemElement(index, currentSeparatorElement?.children
                    ? currentSeparatorElement.children.length
                    : index, this._hasCheckboxes && item.pickable !== false, e => this._onButtonTriggered.fire(e), this._elementChecked, item, separator);
                this._itemElements.push(qpi);
                if (currentSeparatorElement) {
                    currentSeparatorElement.children.push(qpi);
                    return result;
                }
                element = qpi;
            }
            result.push(element);
            return result;
        }, new Array());
        this._setElementsToTree(this._elementTree);
        // Accessibility hack, unfortunately on next tick
        // https://github.com/microsoft/vscode/issues/211976
        if (this.accessibilityService.isScreenReaderOptimized()) {
            setTimeout(() => {
                // eslint-disable-next-line no-restricted-syntax
                const focusedElement = this._tree.getHTMLElement().querySelector(`.monaco-list-row.focused`);
                const parent = focusedElement?.parentNode;
                if (focusedElement && parent) {
                    const nextSibling = focusedElement.nextSibling;
                    focusedElement.remove();
                    parent.insertBefore(focusedElement, nextSibling);
                }
            }, 0);
        }
    }
    setFocusedElements(items) {
        const elements = items.map(item => this._itemElements.find(e => e.item === item))
            .filter((e) => !!e)
            .filter(e => !e.hidden);
        this._tree.setFocus(elements);
        if (items.length > 0) {
            const focused = this._tree.getFocus()[0];
            if (focused) {
                this._tree.reveal(focused);
            }
        }
    }
    getActiveDescendant() {
        return this._tree.getHTMLElement().getAttribute('aria-activedescendant');
    }
    setSelectedElements(items) {
        const elements = items.map(item => this._itemElements.find(e => e.item === item))
            .filter((e) => !!e);
        this._tree.setSelection(elements);
    }
    getCheckedElements() {
        return this._itemElements.filter(e => e.checked)
            .map(e => e.item);
    }
    setCheckedElements(items) {
        this._elementCheckedEventBufferer.bufferEvents(() => {
            const checked = new Set();
            for (const item of items) {
                checked.add(item);
            }
            for (const element of this._itemElements) {
                // Would fire an event if we didn't beffer the events
                element.checked = checked.has(element.item);
            }
        });
    }
    focus(what) {
        if (!this._itemElements.length) {
            return;
        }
        if (what === QuickPickFocus.Second && this._itemElements.length < 2) {
            what = QuickPickFocus.First;
        }
        switch (what) {
            case QuickPickFocus.First:
                this._tree.scrollTop = 0;
                this._tree.focusFirst(undefined, (e) => e.element instanceof QuickPickItemElement);
                break;
            case QuickPickFocus.Second: {
                this._tree.scrollTop = 0;
                let isSecondItem = false;
                this._tree.focusFirst(undefined, (e) => {
                    if (!(e.element instanceof QuickPickItemElement)) {
                        return false;
                    }
                    if (isSecondItem) {
                        return true;
                    }
                    isSecondItem = !isSecondItem;
                    return false;
                });
                break;
            }
            case QuickPickFocus.Last:
                this._tree.scrollTop = this._tree.scrollHeight;
                this._tree.focusLast(undefined, (e) => e.element instanceof QuickPickItemElement);
                break;
            case QuickPickFocus.Next: {
                const prevFocus = this._tree.getFocus();
                this._tree.focusNext(undefined, this._shouldLoop, undefined, (e) => {
                    if (!(e.element instanceof QuickPickItemElement)) {
                        return false;
                    }
                    this._tree.reveal(e.element);
                    return true;
                });
                const currentFocus = this._tree.getFocus();
                if (prevFocus.length && prevFocus[0] === currentFocus[0]) {
                    this._onLeave.fire();
                }
                break;
            }
            case QuickPickFocus.Previous: {
                const prevFocus = this._tree.getFocus();
                this._tree.focusPrevious(undefined, this._shouldLoop, undefined, (e) => {
                    if (!(e.element instanceof QuickPickItemElement)) {
                        return false;
                    }
                    const parent = this._tree.getParentElement(e.element);
                    if (parent === null || parent.children[0] !== e.element) {
                        this._tree.reveal(e.element);
                    }
                    else {
                        // Only if we are the first child of a separator do we reveal the separator
                        this._tree.reveal(parent);
                    }
                    return true;
                });
                const currentFocus = this._tree.getFocus();
                if (prevFocus.length && prevFocus[0] === currentFocus[0]) {
                    this._onLeave.fire();
                }
                break;
            }
            case QuickPickFocus.NextPage:
                this._tree.focusNextPage(undefined, (e) => {
                    if (!(e.element instanceof QuickPickItemElement)) {
                        return false;
                    }
                    this._tree.reveal(e.element);
                    return true;
                });
                break;
            case QuickPickFocus.PreviousPage:
                this._tree.focusPreviousPage(undefined, (e) => {
                    if (!(e.element instanceof QuickPickItemElement)) {
                        return false;
                    }
                    const parent = this._tree.getParentElement(e.element);
                    if (parent === null || parent.children[0] !== e.element) {
                        this._tree.reveal(e.element);
                    }
                    else {
                        this._tree.reveal(parent);
                    }
                    return true;
                });
                break;
            case QuickPickFocus.NextSeparator: {
                let foundSeparatorAsItem = false;
                const before = this._tree.getFocus()[0];
                this._tree.focusNext(undefined, true, undefined, (e) => {
                    if (foundSeparatorAsItem) {
                        // This should be the index right after the separator so it
                        // is the item we want to focus.
                        return true;
                    }
                    if (e.element instanceof QuickPickSeparatorElement) {
                        foundSeparatorAsItem = true;
                        // If the separator is visible, then we should just reveal its first child so it's not as jarring.
                        if (this._separatorRenderer.isSeparatorVisible(e.element)) {
                            this._tree.reveal(e.element.children[0]);
                        }
                        else {
                            // If the separator is not visible, then we should
                            // push it up to the top of the list.
                            this._tree.reveal(e.element, 0);
                        }
                    }
                    else if (e.element instanceof QuickPickItemElement) {
                        if (e.element.separator) {
                            if (this._itemRenderer.isItemWithSeparatorVisible(e.element)) {
                                this._tree.reveal(e.element);
                            }
                            else {
                                this._tree.reveal(e.element, 0);
                            }
                            return true;
                        }
                        else if (e.element === this._elementTree[0]) {
                            // We should stop at the first item in the list if it's a regular item.
                            this._tree.reveal(e.element, 0);
                            return true;
                        }
                    }
                    return false;
                });
                const after = this._tree.getFocus()[0];
                if (before === after) {
                    // If we didn't move, then we should just move to the end
                    // of the list.
                    this._tree.scrollTop = this._tree.scrollHeight;
                    this._tree.focusLast(undefined, (e) => e.element instanceof QuickPickItemElement);
                }
                break;
            }
            case QuickPickFocus.PreviousSeparator: {
                let focusElement;
                // If we are already sitting on an inline separator, then we
                // have already found the _current_ separator and need to
                // move to the previous one.
                let foundSeparator = !!this._tree.getFocus()[0]?.separator;
                this._tree.focusPrevious(undefined, true, undefined, (e) => {
                    if (e.element instanceof QuickPickSeparatorElement) {
                        if (foundSeparator) {
                            if (!focusElement) {
                                if (this._separatorRenderer.isSeparatorVisible(e.element)) {
                                    this._tree.reveal(e.element);
                                }
                                else {
                                    this._tree.reveal(e.element, 0);
                                }
                                focusElement = e.element.children[0];
                            }
                        }
                        else {
                            foundSeparator = true;
                        }
                    }
                    else if (e.element instanceof QuickPickItemElement) {
                        if (!focusElement) {
                            if (e.element.separator) {
                                if (this._itemRenderer.isItemWithSeparatorVisible(e.element)) {
                                    this._tree.reveal(e.element);
                                }
                                else {
                                    this._tree.reveal(e.element, 0);
                                }
                                focusElement = e.element;
                            }
                            else if (e.element === this._elementTree[0]) {
                                // We should stop at the first item in the list if it's a regular item.
                                this._tree.reveal(e.element, 0);
                                return true;
                            }
                        }
                    }
                    return false;
                });
                if (focusElement) {
                    this._tree.setFocus([focusElement]);
                }
                break;
            }
        }
    }
    clearFocus() {
        this._tree.setFocus([]);
    }
    domFocus() {
        this._tree.domFocus();
    }
    layout(maxHeight) {
        this._tree.getHTMLElement().style.maxHeight = maxHeight ? `${
        // Make sure height aligns with list item heights
        Math.floor(maxHeight / 44) * 44
            // Add some extra height so that it's clear there's more to scroll
            + 6}px` : '';
        this._tree.layout();
    }
    filter(query) {
        this._lastQueryString = query;
        if (!(this._sortByLabel || this._matchOnLabel || this._matchOnDescription || this._matchOnDetail)) {
            this._tree.layout();
            return false;
        }
        const queryWithWhitespace = query;
        query = query.trim();
        // Reset filtering
        if (!query || !(this.matchOnLabel || this.matchOnDescription || this.matchOnDetail)) {
            this._itemElements.forEach(element => {
                element.labelHighlights = undefined;
                element.descriptionHighlights = undefined;
                element.detailHighlights = undefined;
                element.hidden = false;
                const previous = element.index && this._inputElements[element.index - 1];
                if (element.item) {
                    element.separator = previous && previous.type === 'separator' && !previous.buttons ? previous : undefined;
                }
            });
        }
        // Filter by value (since we support icons in labels, use $(..) aware fuzzy matching)
        else {
            let currentSeparator;
            this._itemElements.forEach(element => {
                let labelHighlights;
                if (this.matchOnLabelMode === 'fuzzy') {
                    labelHighlights = this.matchOnLabel ? matchesFuzzyIconAware(query, parseLabelWithIcons(element.saneLabel)) ?? undefined : undefined;
                }
                else {
                    labelHighlights = this.matchOnLabel ? matchesContiguousIconAware(queryWithWhitespace, parseLabelWithIcons(element.saneLabel)) ?? undefined : undefined;
                }
                const descriptionHighlights = this.matchOnDescription ? matchesFuzzyIconAware(query, parseLabelWithIcons(element.saneDescription || '')) ?? undefined : undefined;
                const detailHighlights = this.matchOnDetail ? matchesFuzzyIconAware(query, parseLabelWithIcons(element.saneDetail || '')) ?? undefined : undefined;
                if (labelHighlights || descriptionHighlights || detailHighlights) {
                    element.labelHighlights = labelHighlights;
                    element.descriptionHighlights = descriptionHighlights;
                    element.detailHighlights = detailHighlights;
                    element.hidden = false;
                }
                else {
                    element.labelHighlights = undefined;
                    element.descriptionHighlights = undefined;
                    element.detailHighlights = undefined;
                    element.hidden = element.item ? !element.item.alwaysShow : true;
                }
                // Ensure separators are filtered out first before deciding if we need to bring them back
                if (element.item) {
                    element.separator = undefined;
                }
                else if (element.separator) {
                    element.hidden = true;
                }
                // we can show the separator unless the list gets sorted by match
                if (!this.sortByLabel) {
                    const previous = element.index && this._inputElements[element.index - 1] || undefined;
                    if (previous?.type === 'separator' && !previous.buttons) {
                        currentSeparator = previous;
                    }
                    if (currentSeparator && !element.hidden) {
                        element.separator = currentSeparator;
                        currentSeparator = undefined;
                    }
                }
            });
        }
        this._setElementsToTree(this._sortByLabel && query
            // We don't render any separators if we're sorting so just render the elements
            ? this._itemElements
            // Render the full tree
            : this._elementTree);
        this._tree.layout();
        return true;
    }
    toggleCheckbox() {
        this._elementCheckedEventBufferer.bufferEvents(() => {
            const elements = this._tree.getFocus().filter((e) => e instanceof QuickPickItemElement);
            const allChecked = this._allVisibleChecked(elements);
            for (const element of elements) {
                if (!element.checkboxDisabled) {
                    // Would fire an event if we didn't have the flag set
                    element.checked = !allChecked;
                }
            }
        });
    }
    style(styles) {
        this._tree.style(styles);
    }
    toggleHover() {
        const focused = this._tree.getFocus()[0];
        if (!focused?.saneTooltip || !(focused instanceof QuickPickItemElement)) {
            return;
        }
        // if there's a hover already, hide it (toggle off)
        if (this._lastHover && !this._lastHover.isDisposed) {
            this._lastHover.dispose();
            return;
        }
        // If there is no hover, show it (toggle on)
        this.showHover(focused);
        const store = new DisposableStore();
        store.add(this._tree.onDidChangeFocus(e => {
            if (e.elements[0] instanceof QuickPickItemElement) {
                this.showHover(e.elements[0]);
            }
        }));
        if (this._lastHover) {
            store.add(this._lastHover);
        }
        this._elementDisposable.add(store);
    }
    //#endregion
    //#region private methods
    _setElementsToTree(elements) {
        const treeElements = new Array();
        for (const element of elements) {
            if (element instanceof QuickPickSeparatorElement) {
                treeElements.push({
                    element,
                    collapsible: false,
                    collapsed: false,
                    children: element.children.map(e => ({
                        element: e,
                        collapsible: false,
                        collapsed: false,
                    })),
                });
            }
            else {
                treeElements.push({
                    element,
                    collapsible: false,
                    collapsed: false,
                });
            }
        }
        this._tree.setChildren(null, treeElements);
    }
    _allVisibleChecked(elements, whenNoneVisible = true) {
        for (let i = 0, n = elements.length; i < n; i++) {
            const element = elements[i];
            if (!element.hidden && element.item.pickable !== false) {
                if (!element.checked) {
                    return false;
                }
                else {
                    whenNoneVisible = true;
                }
            }
        }
        return whenNoneVisible;
    }
    _updateCheckedObservables() {
        transaction((tx) => {
            this._allVisibleCheckedObservable.set(this._allVisibleChecked(this._itemElements, false), tx);
            const checkedCount = this._itemElements.filter(element => element.checked).length;
            this._checkedCountObservable.set(checkedCount, tx);
            this._checkedElementsObservable.set(this.getCheckedElements(), tx);
        });
    }
    /**
     * Disposes of the hover and shows a new one for the given index if it has a tooltip.
     * @param element The element to show the hover for
     */
    showHover(element) {
        if (this._lastHover && !this._lastHover.isDisposed) {
            this.hoverDelegate.onDidHideHover?.();
            this._lastHover?.dispose();
        }
        if (!element.element || !element.saneTooltip) {
            return;
        }
        this._lastHover = this.hoverDelegate.showHover({
            content: element.saneTooltip,
            target: element.element,
            linkHandler: (url) => {
                this.linkOpenerDelegate(url);
            },
            appearance: {
                showPointer: true,
            },
            container: this._container,
            position: {
                hoverPosition: 1 /* HoverPosition.RIGHT */
            }
        }, false);
    }
};
__decorate([
    memoize
], QuickInputList.prototype, "onDidChangeFocus", null);
__decorate([
    memoize
], QuickInputList.prototype, "onDidChangeSelection", null);
QuickInputList = __decorate([
    __param(5, IInstantiationService),
    __param(6, IAccessibilityService)
], QuickInputList);
export { QuickInputList };
function matchesContiguousIconAware(query, target) {
    const { text, iconOffsets } = target;
    // Return early if there are no icon markers in the word to match against
    if (!iconOffsets || iconOffsets.length === 0) {
        return matchesContiguous(query, text);
    }
    // Trim the word to match against because it could have leading
    // whitespace now if the word started with an icon
    const wordToMatchAgainstWithoutIconsTrimmed = ltrim(text, ' ');
    const leadingWhitespaceOffset = text.length - wordToMatchAgainstWithoutIconsTrimmed.length;
    // match on value without icon
    const matches = matchesContiguous(query, wordToMatchAgainstWithoutIconsTrimmed);
    // Map matches back to offsets with icon and trimming
    if (matches) {
        for (const match of matches) {
            const iconOffset = iconOffsets[match.start + leadingWhitespaceOffset] /* icon offsets at index */ + leadingWhitespaceOffset /* overall leading whitespace offset */;
            match.start += iconOffset;
            match.end += iconOffset;
        }
    }
    return matches;
}
function matchesContiguous(word, wordToMatchAgainst) {
    const matchIndex = wordToMatchAgainst.toLowerCase().indexOf(word.toLowerCase());
    if (matchIndex !== -1) {
        return [{ start: matchIndex, end: matchIndex + word.length }];
    }
    return null;
}
function compareEntries(elementA, elementB, lookFor) {
    const labelHighlightsA = elementA.labelHighlights || [];
    const labelHighlightsB = elementB.labelHighlights || [];
    if (labelHighlightsA.length && !labelHighlightsB.length) {
        return -1;
    }
    if (!labelHighlightsA.length && labelHighlightsB.length) {
        return 1;
    }
    if (labelHighlightsA.length === 0 && labelHighlightsB.length === 0) {
        return 0;
    }
    return compareAnything(elementA.saneSortLabel, elementB.saneSortLabel, lookFor);
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicXVpY2tJbnB1dExpc3QuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9wbGF0Zm9ybS9xdWlja2lucHV0L2Jyb3dzZXIvcXVpY2tJbnB1dExpc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7O0FBRWhHLE9BQU8sS0FBSyxLQUFLLE1BQU0sbUNBQW1DLENBQUM7QUFDM0QsT0FBTyxLQUFLLEdBQUcsTUFBTSw4QkFBOEIsQ0FBQztBQUVwRCxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sNkNBQTZDLENBQUM7QUFLdEUsT0FBTyxFQUEwQixTQUFTLEVBQUUsTUFBTSxpREFBaUQsQ0FBQztBQUNwRyxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sNkRBQTZELENBQUM7QUFHOUYsT0FBTyxFQUFFLFFBQVEsRUFBRSxrQ0FBa0MsRUFBaUIsTUFBTSwyQ0FBMkMsQ0FBQztBQUN4SCxPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSwrQ0FBK0MsQ0FBQztBQUVuRixPQUFPLEVBQUUsTUFBTSxFQUFFLE1BQU0sZ0NBQWdDLENBQUM7QUFDeEQsT0FBTyxFQUFFLGdCQUFnQixFQUFFLE1BQU0sK0JBQStCLENBQUM7QUFDakUsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQ3BFLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUM3RCxPQUFPLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQUNyRSxPQUFPLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxhQUFhLEVBQXlCLE1BQU0sK0JBQStCLENBQUM7QUFHckcsT0FBTyxFQUF5QixtQkFBbUIsRUFBRSxxQkFBcUIsRUFBRSxtQkFBbUIsRUFBRSxNQUFNLG9DQUFvQyxDQUFDO0FBQzVJLE9BQU8sRUFBRSxJQUFJLEVBQUUsTUFBTSw4QkFB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