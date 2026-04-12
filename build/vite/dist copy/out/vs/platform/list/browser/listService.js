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
import { isActiveElement, isKeyboardEvent } from '../../../base/browser/dom.js';
import { PagedList } from '../../../base/browser/ui/list/listPaging.js';
import { isSelectionRangeChangeEvent, isSelectionSingleChangeEvent, List, TypeNavigationMode } from '../../../base/browser/ui/list/listWidget.js';
import { Table } from '../../../base/browser/ui/table/tableWidget.js';
import { TreeFindMatchType, TreeFindMode } from '../../../base/browser/ui/tree/abstractTree.js';
import { AsyncDataTree, CompressibleAsyncDataTree } from '../../../base/browser/ui/tree/asyncDataTree.js';
import { DataTree } from '../../../base/browser/ui/tree/dataTree.js';
import { CompressibleObjectTree, ObjectTree } from '../../../base/browser/ui/tree/objectTree.js';
import { Emitter, Event } from '../../../base/common/event.js';
import { combinedDisposable, Disposable, DisposableStore, dispose, toDisposable } from '../../../base/common/lifecycle.js';
import { localize } from '../../../nls.js';
import { IConfigurationService } from '../../configuration/common/configuration.js';
import { Extensions as ConfigurationExtensions } from '../../configuration/common/configurationRegistry.js';
import { ContextKeyExpr, IContextKeyService, RawContextKey } from '../../contextkey/common/contextkey.js';
import { InputFocusedContextKey } from '../../contextkey/common/contextkeys.js';
import { IContextViewService } from '../../contextview/browser/contextView.js';
import { createDecorator, IInstantiationService } from '../../instantiation/common/instantiation.js';
import { IKeybindingService } from '../../keybinding/common/keybinding.js';
import { Registry } from '../../registry/common/platform.js';
import { defaultFindWidgetStyles, defaultListStyles, getListStyles } from '../../theme/browser/defaultStyles.js';
export const IListService = createDecorator('listService');
export class ListService {
    get lastFocusedList() {
        return this._lastFocusedWidget;
    }
    constructor() {
        this.disposables = new DisposableStore();
        this.lists = [];
        this._lastFocusedWidget = undefined;
    }
    setLastFocusedList(widget) {
        if (widget === this._lastFocusedWidget) {
            return;
        }
        this._lastFocusedWidget?.getHTMLElement().classList.remove('last-focused');
        this._lastFocusedWidget = widget;
        this._lastFocusedWidget?.getHTMLElement().classList.add('last-focused');
    }
    register(widget, extraContextKeys) {
        if (this.lists.some(l => l.widget === widget)) {
            throw new Error('Cannot register the same widget multiple times');
        }
        // Keep in our lists list
        const registeredList = { widget, extraContextKeys };
        this.lists.push(registeredList);
        // Check for currently being focused
        if (isActiveElement(widget.getHTMLElement())) {
            this.setLastFocusedList(widget);
        }
        return combinedDisposable(widget.onDidFocus(() => this.setLastFocusedList(widget)), toDisposable(() => this.lists.splice(this.lists.indexOf(registeredList), 1)), widget.onDidDispose(() => {
            this.lists = this.lists.filter(l => l !== registeredList);
            if (this._lastFocusedWidget === widget) {
                this.setLastFocusedList(undefined);
            }
        }));
    }
    dispose() {
        this.disposables.dispose();
    }
}
export const RawWorkbenchListScrollAtBoundaryContextKey = new RawContextKey('listScrollAtBoundary', 'none');
export const WorkbenchListScrollAtTopContextKey = ContextKeyExpr.or(RawWorkbenchListScrollAtBoundaryContextKey.isEqualTo('top'), RawWorkbenchListScrollAtBoundaryContextKey.isEqualTo('both'));
export const WorkbenchListScrollAtBottomContextKey = ContextKeyExpr.or(RawWorkbenchListScrollAtBoundaryContextKey.isEqualTo('bottom'), RawWorkbenchListScrollAtBoundaryContextKey.isEqualTo('both'));
export const RawWorkbenchListFocusContextKey = new RawContextKey('listFocus', true);
export const WorkbenchTreeStickyScrollFocused = new RawContextKey('treestickyScrollFocused', false);
export const WorkbenchListSupportsMultiSelectContextKey = new RawContextKey('listSupportsMultiselect', true);
export const WorkbenchListFocusContextKey = ContextKeyExpr.and(RawWorkbenchListFocusContextKey, ContextKeyExpr.not(InputFocusedContextKey), WorkbenchTreeStickyScrollFocused.negate());
export const WorkbenchListHasSelectionOrFocus = new RawContextKey('listHasSelectionOrFocus', false);
export const WorkbenchListDoubleSelection = new RawContextKey('listDoubleSelection', false);
export const WorkbenchListMultiSelection = new RawContextKey('listMultiSelection', false);
export const WorkbenchListSelectionNavigation = new RawContextKey('listSelectionNavigation', false);
export const WorkbenchListSupportsFind = new RawContextKey('listSupportsFind', true);
export const WorkbenchTreeElementCanCollapse = new RawContextKey('treeElementCanCollapse', false);
export const WorkbenchTreeElementHasParent = new RawContextKey('treeElementHasParent', false);
export const WorkbenchTreeElementCanExpand = new RawContextKey('treeElementCanExpand', false);
export const WorkbenchTreeElementHasChild = new RawContextKey('treeElementHasChild', false);
export const WorkbenchTreeFindOpen = new RawContextKey('treeFindOpen', false);
const WorkbenchListTypeNavigationModeKey = 'listTypeNavigationMode';
/**
 * @deprecated in favor of WorkbenchListTypeNavigationModeKey
 */
const WorkbenchListAutomaticKeyboardNavigationLegacyKey = 'listAutomaticKeyboardNavigation';
function createScopedContextKeyService(contextKeyService, widget) {
    const result = contextKeyService.createScoped(widget.getHTMLElement());
    RawWorkbenchListFocusContextKey.bindTo(result);
    return result;
}
function createScrollObserver(contextKeyService, widget) {
    const listScrollAt = RawWorkbenchListScrollAtBoundaryContextKey.bindTo(contextKeyService);
    const update = () => {
        const atTop = widget.scrollTop === 0;
        // We need a threshold `1` since scrollHeight is rounded.
        // https://developer.mozilla.org/en-US/docs/Web/API/Element/scrollHeight#determine_if_an_element_has_been_totally_scrolled
        const atBottom = widget.scrollHeight - widget.renderHeight - widget.scrollTop < 1;
        if (atTop && atBottom) {
            listScrollAt.set('both');
        }
        else if (atTop) {
            listScrollAt.set('top');
        }
        else if (atBottom) {
            listScrollAt.set('bottom');
        }
        else {
            listScrollAt.set('none');
        }
    };
    update();
    return widget.onDidScroll(update);
}
const multiSelectModifierSettingKey = 'workbench.list.multiSelectModifier';
const openModeSettingKey = 'workbench.list.openMode';
const horizontalScrollingKey = 'workbench.list.horizontalScrolling';
const defaultFindModeSettingKey = 'workbench.list.defaultFindMode';
const typeNavigationModeSettingKey = 'workbench.list.typeNavigationMode';
/** @deprecated in favor of `workbench.list.defaultFindMode` and `workbench.list.typeNavigationMode` */
const keyboardNavigationSettingKey = 'workbench.list.keyboardNavigation';
const scrollByPageKey = 'workbench.list.scrollByPage';
const defaultFindMatchTypeSettingKey = 'workbench.list.defaultFindMatchType';
const treeIndentKey = 'workbench.tree.indent';
const treeRenderIndentGuidesKey = 'workbench.tree.renderIndentGuides';
const listSmoothScrolling = 'workbench.list.smoothScrolling';
const mouseWheelScrollSensitivityKey = 'workbench.list.mouseWheelScrollSensitivity';
const fastScrollSensitivityKey = 'workbench.list.fastScrollSensitivity';
const treeExpandMode = 'workbench.tree.expandMode';
const treeStickyScroll = 'workbench.tree.enableStickyScroll';
const treeStickyScrollMaxElements = 'workbench.tree.stickyScrollMaxItemCount';
function useAltAsMultipleSelectionModifier(configurationService) {
    return configurationService.getValue(multiSelectModifierSettingKey) === 'alt';
}
class MultipleSelectionController extends Disposable {
    constructor(configurationService) {
        super();
        this.configurationService = configurationService;
        this.useAltAsMultipleSelectionModifier = useAltAsMultipleSelectionModifier(configurationService);
        this.registerListeners();
    }
    registerListeners() {
        this._register(this.configurationService.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration(multiSelectModifierSettingKey)) {
                this.useAltAsMultipleSelectionModifier = useAltAsMultipleSelectionModifier(this.configurationService);
            }
        }));
    }
    isSelectionSingleChangeEvent(event) {
        if (this.useAltAsMultipleSelectionModifier) {
            return event.browserEvent.altKey;
        }
        return isSelectionSingleChangeEvent(event);
    }
    isSelectionRangeChangeEvent(event) {
        return isSelectionRangeChangeEvent(event);
    }
}
function toWorkbenchListOptions(accessor, options) {
    const configurationService = accessor.get(IConfigurationService);
    const keybindingService = accessor.get(IKeybindingService);
    const disposables = new DisposableStore();
    const result = {
        ...options,
        keyboardNavigationDelegate: { mightProducePrintableCharacter(e) { return keybindingService.mightProducePrintableCharacter(e); } },
        smoothScrolling: Boolean(configurationService.getValue(listSmoothScrolling)),
        mouseWheelScrollSensitivity: configurationService.getValue(mouseWheelScrollSensitivityKey),
        fastScrollSensitivity: configurationService.getValue(fastScrollSensitivityKey),
        multipleSelectionController: options.multipleSelectionController ?? disposables.add(new MultipleSelectionController(configurationService)),
        keyboardNavigationEventFilter: createKeyboardNavigationEventFilter(keybindingService),
        scrollByPage: Boolean(configurationService.getValue(scrollByPageKey))
    };
    return [result, disposables];
}
let WorkbenchList = class WorkbenchList extends List {
    get onDidOpen() { return this.navigator.onDidOpen; }
    constructor(user, container, delegate, renderers, options, contextKeyService, listService, configurationService, instantiationService) {
        const horizontalScrolling = typeof options.horizontalScrolling !== 'undefined' ? options.horizontalScrolling : Boolean(configurationService.getValue(horizontalScrollingKey));
        const [workbenchListOptions, workbenchListOptionsDisposable] = instantiationService.invokeFunction(toWorkbenchListOptions, options);
        super(user, container, delegate, renderers, {
            keyboardSupport: false,
            ...workbenchListOptions,
            horizontalScrolling,
        });
        this.disposables.add(workbenchListOptionsDisposable);
        this.contextKeyService = createScopedContextKeyService(contextKeyService, this);
        this.disposables.add(createScrollObserver(this.contextKeyService, this));
        this.listSupportsMultiSelect = WorkbenchListSupportsMultiSelectContextKey.bindTo(this.contextKeyService);
        this.listSupportsMultiSelect.set(options.multipleSelectionSupport !== false);
        const listSelectionNavigation = WorkbenchListSelectionNavigation.bindTo(this.contextKeyService);
        listSelectionNavigation.set(Boolean(options.selectionNavigation));
        this.listHasSelectionOrFocus = WorkbenchListHasSelectionOrFocus.bindTo(this.contextKeyService);
        this.listDoubleSelection = WorkbenchListDoubleSelection.bindTo(this.contextKeyService);
        this.listMultiSelection = WorkbenchListMultiSelection.bindTo(this.contextKeyService);
        this.horizontalScrolling = options.horizontalScrolling;
        this._useAltAsMultipleSelectionModifier = useAltAsMultipleSelectionModifier(configurationService);
        this.disposables.add(this.contextKeyService);
        this.disposables.add(listService.register(this));
        this.updateStyles(options.overrideStyles);
        this.disposables.add(this.onDidChangeSelection(() => {
            const selection = this.getSelection();
            const focus = this.getFocus();
            this.contextKeyService.bufferChangeEvents(() => {
                this.listHasSelectionOrFocus.set(selection.length > 0 || focus.length > 0);
                this.listMultiSelection.set(selection.length > 1);
                this.listDoubleSelection.set(selection.length === 2);
            });
        }));
        this.disposables.add(this.onDidChangeFocus(() => {
            const selection = this.getSelection();
            const focus = this.getFocus();
            this.listHasSelectionOrFocus.set(selection.length > 0 || focus.length > 0);
        }));
        this.disposables.add(configurationService.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration(multiSelectModifierSettingKey)) {
                this._useAltAsMultipleSelectionModifier = useAltAsMultipleSelectionModifier(configurationService);
            }
            let options = {};
            if (e.affectsConfiguration(horizontalScrollingKey) && this.horizontalScrolling === undefined) {
                const horizontalScrolling = Boolean(configurationService.getValue(horizontalScrollingKey));
                options = { ...options, horizontalScrolling };
            }
            if (e.affectsConfiguration(scrollByPageKey)) {
                const scrollByPage = Boolean(configurationService.getValue(scrollByPageKey));
                options = { ...options, scrollByPage };
            }
            if (e.affectsConfiguration(listSmoothScrolling)) {
                const smoothScrolling = Boolean(configurationService.getValue(listSmoothScrolling));
                options = { ...options, smoothScrolling };
            }
            if (e.affectsConfiguration(mouseWheelScrollSensitivityKey)) {
                const mouseWheelScrollSensitivity = configurationService.getValue(mouseWheelScrollSensitivityKey);
                options = { ...options, mouseWheelScrollSensitivity };
            }
            if (e.affectsConfiguration(fastScrollSensitivityKey)) {
                const fastScrollSensitivity = configurationService.getValue(fastScrollSensitivityKey);
                options = { ...options, fastScrollSensitivity };
            }
            if (Object.keys(options).length > 0) {
                this.updateOptions(options);
            }
        }));
        this.navigator = new ListResourceNavigator(this, { configurationService, ...options });
        this.disposables.add(this.navigator);
    }
    updateOptions(options) {
        super.updateOptions(options);
        if (options.overrideStyles !== undefined) {
            this.updateStyles(options.overrideStyles);
        }
        if (options.multipleSelectionSupport !== undefined) {
            this.listSupportsMultiSelect.set(!!options.multipleSelectionSupport);
        }
    }
    updateStyles(styles) {
        this.style(styles ? getListStyles(styles) : defaultListStyles);
    }
    get useAltAsMultipleSelectionModifier() {
        return this._useAltAsMultipleSelectionModifier;
    }
};
WorkbenchList = __decorate([
    __param(5, IContextKeyService),
    __param(6, IListService),
    __param(7, IConfigurationService),
    __param(8, IInstantiationService)
], WorkbenchList);
export { WorkbenchList };
let WorkbenchPagedList = class WorkbenchPagedList extends PagedList {
    get onDidOpen() { return this.navigator.onDidOpen; }
    constructor(user, container, delegate, renderers, options, contextKeyService, listService, configurationService, instantiationService) {
        const horizontalScrolling = typeof options.horizontalScrolling !== 'undefined' ? options.horizontalScrolling : Boolean(configurationService.getValue(horizontalScrollingKey));
        const [workbenchListOptions, workbenchListOptionsDisposable] = instantiationService.invokeFunction(toWorkbenchListOptions, options);
        super(user, container, delegate, renderers, {
            keyboardSupport: false,
            ...workbenchListOptions,
            horizontalScrolling,
        });
        this.disposables = new DisposableStore();
        this.disposables.add(workbenchListOptionsDisposable);
        this.contextKeyService = createScopedContextKeyService(contextKeyService, this);
        this.disposables.add(createScrollObserver(this.contextKeyService, this.widget));
        this.horizontalScrolling = options.horizontalScrolling;
        this.listSupportsMultiSelect = WorkbenchListSupportsMultiSelectContextKey.bindTo(this.contextKeyService);
        this.listSupportsMultiSelect.set(options.multipleSelectionSupport !== false);
        const listSelectionNavigation = WorkbenchListSelectionNavigation.bindTo(this.contextKeyService);
        listSelectionNavigation.set(Boolean(options.selectionNavigation));
        this._useAltAsMultipleSelectionModifier = useAltAsMultipleSelectionModifier(configurationService);
        this.disposables.add(this.contextKeyService);
        this.disposables.add(listService.register(this));
        this.updateStyles(options.overrideStyles);
        this.disposables.add(configurationService.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration(multiSelectModifierSettingKey)) {
                this._useAltAsMultipleSelectionModifier = useAltAsMultipleSelectionModifier(configurationService);
            }
            let options = {};
            if (e.affectsConfiguration(horizontalScrollingKey) && this.horizontalScrolling === undefined) {
                const horizontalScrolling = Boolean(configurationService.getValue(horizontalScrollingKey));
                options = { ...options, horizontalScrolling };
            }
            if (e.affectsConfiguration(scrollByPageKey)) {
                const scrollByPage = Boolean(configurationService.getValue(scrollByPageKey));
                options = { ...options, scrollByPage };
            }
            if (e.affectsConfiguration(listSmoothScrolling)) {
                const smoothScrolling = Boolean(configurationService.getValue(listSmoothScrolling));
                options = { ...options, smoothScrolling };
            }
            if (e.affectsConfiguration(mouseWheelScrollSensitivityKey)) {
                const mouseWheelScrollSensitivity = configurationService.getValue(mouseWheelScrollSensitivityKey);
                options = { ...options, mouseWheelScrollSensitivity };
            }
            if (e.affectsConfiguration(fastScrollSensitivityKey)) {
                const fastScrollSensitivity = configurationService.getValue(fastScrollSensitivityKey);
                options = { ...options, fastScrollSensitivity };
            }
            if (Object.keys(options).length > 0) {
                this.updateOptions(options);
            }
        }));
        this.navigator = new ListResourceNavigator(this, { configurationService, ...options });
        this.disposables.add(this.navigator);
    }
    updateOptions(options) {
        super.updateOptions(options);
        if (options.overrideStyles !== undefined) {
            this.updateStyles(options.overrideStyles);
        }
        if (options.multipleSelectionSupport !== undefined) {
            this.listSupportsMultiSelect.set(!!options.multipleSelectionSupport);
        }
    }
    updateStyles(styles) {
        this.style(styles ? getListStyles(styles) : defaultListStyles);
    }
    get useAltAsMultipleSelectionModifier() {
        return this._useAltAsMultipleSelectionModifier;
    }
    dispose() {
        this.disposables.dispose();
        super.dispose();
    }
};
WorkbenchPagedList = __decorate([
    __param(5, IContextKeyService),
    __param(6, IListService),
    __param(7, IConfigurationService),
    __param(8, IInstantiationService)
], WorkbenchPagedList);
export { WorkbenchPagedList };
let WorkbenchTable = class WorkbenchTable extends Table {
    get onDidOpen() { return this.navigator.onDidOpen; }
    constructor(user, container, delegate, columns, renderers, options, contextKeyService, listService, configurationService, instantiationService) {
        const horizontalScrolling = typeof options.horizontalScrolling !== 'undefined' ? options.horizontalScrolling : Boolean(configurationService.getValue(horizontalScrollingKey));
        const [workbenchListOptions, workbenchListOptionsDisposable] = instantiationService.invokeFunction(toWorkbenchListOptions, options);
        super(user, container, delegate, columns, renderers, {
            keyboardSupport: false,
            ...workbenchListOptions,
            horizontalScrolling,
        });
        this.disposables.add(workbenchListOptionsDisposable);
        this.contextKeyService = createScopedContextKeyService(contextKeyService, this);
        this.disposables.add(createScrollObserver(this.contextKeyService, this));
        this.listSupportsMultiSelect = WorkbenchListSupportsMultiSelectContextKey.bindTo(this.contextKeyService);
        this.listSupportsMultiSelect.set(options.multipleSelectionSupport !== false);
        const listSelectionNavigation = WorkbenchListSelectionNavigation.bindTo(this.contextKeyService);
        listSelectionNavigation.set(Boolean(options.selectionNavigation));
        this.listHasSelectionOrFocus = WorkbenchListHasSelectionOrFocus.bindTo(this.contextKeyService);
        this.listDoubleSelection = WorkbenchListDoubleSelection.bindTo(this.contextKeyService);
        this.listMultiSelection = WorkbenchListMultiSelection.bindTo(this.contextKeyService);
        this.horizontalScrolling = options.horizontalScrolling;
        this._useAltAsMultipleSelectionModifier = useAltAsMultipleSelectionModifier(configurationService);
        this.disposables.add(this.contextKeyService);
        this.disposables.add(listService.register(this));
        this.updateStyles(options.overrideStyles);
        this.disposables.add(this.onDidChangeSelection(() => {
            const selection = this.getSelection();
            const focus = this.getFocus();
            this.contextKeyService.bufferChangeEvents(() => {
                this.listHasSelectionOrFocus.set(selection.length > 0 || focus.length > 0);
                this.listMultiSelection.set(selection.length > 1);
                this.listDoubleSelection.set(selection.length === 2);
            });
        }));
        this.disposables.add(this.onDidChangeFocus(() => {
            const selection = this.getSelection();
            const focus = this.getFocus();
            this.listHasSelectionOrFocus.set(selection.length > 0 || focus.length > 0);
        }));
        this.disposables.add(configurationService.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration(multiSelectModifierSettingKey)) {
                this._useAltAsMultipleSelectionModifier = useAltAsMultipleSelectionModifier(configurationService);
            }
            let options = {};
            if (e.affectsConfiguration(horizontalScrollingKey) && this.horizontalScrolling === undefined) {
                const horizontalScrolling = Boolean(configurationService.getValue(horizontalScrollingKey));
                options = { ...options, horizontalScrolling };
            }
            if (e.affectsConfiguration(scrollByPageKey)) {
                const scrollByPage = Boolean(configurationService.getValue(scrollByPageKey));
                options = { ...options, scrollByPage };
            }
            if (e.affectsConfiguration(listSmoothScrolling)) {
                const smoothScrolling = Boolean(configurationService.getValue(listSmoothScrolling));
                options = { ...options, smoothScrolling };
            }
            if (e.affectsConfiguration(mouseWheelScrollSensitivityKey)) {
                const mouseWheelScrollSensitivity = configurationService.getValue(mouseWheelScrollSensitivityKey);
                options = { ...options, mouseWheelScrollSensitivity };
            }
            if (e.affectsConfiguration(fastScrollSensitivityKey)) {
                const fastScrollSensitivity = configurationService.getValue(fastScrollSensitivityKey);
                options = { ...options, fastScrollSensitivity };
            }
            if (Object.keys(options).length > 0) {
                this.updateOptions(options);
            }
        }));
        this.navigator = new TableResourceNavigator(this, { configurationService, ...options });
        this.disposables.add(this.navigator);
    }
    updateOptions(options) {
        super.updateOptions(options);
        if (options.overrideStyles !== undefined) {
            this.updateStyles(options.overrideStyles);
        }
        if (options.multipleSelectionSupport !== undefined) {
            this.listSupportsMultiSelect.set(!!options.multipleSelectionSupport);
        }
    }
    updateStyles(styles) {
        this.style(styles ? getListStyles(styles) : defaultListStyles);
    }
    get useAltAsMultipleSelectionModifier() {
        return this._useAltAsMultipleSelectionModifier;
    }
    dispose() {
        this.disposables.dispose();
        super.dispose();
    }
};
WorkbenchTable = __decorate([
    __param(6, IContextKeyService),
    __param(7, IListService),
    __param(8, IConfigurationService),
    __param(9, IInstantiationService)
], WorkbenchTable);
export { WorkbenchTable };
export function getSelectionKeyboardEvent(typeArg = 'keydown', preserveFocus, pinned) {
    const e = new KeyboardEvent(typeArg);
    e.preserveFocus = preserveFocus;
    e.pinned = pinned;
    e.__forceEvent = true;
    return e;
}
class ResourceNavigator extends Disposable {
    constructor(widget, options) {
        super();
        this.widget = widget;
        this._onDidOpen = this._register(new Emitter());
        this.onDidOpen = this._onDidOpen.event;
        this._register(Event.filter(this.widget.onDidChangeSelection, e => isKeyboardEvent(e.browserEvent))(e => this.onSelectionFromKeyboard(e)));
        this._register(this.widget.onPointer((e) => this.onPointer(e.element, e.browserEvent)));
        this._register(this.widget.onMouseDblClick((e) => this.onMouseDblClick(e.element, e.browserEvent)));
        if (typeof options?.openOnSingleClick !== 'boolean' && options?.configurationService) {
            this.openOnSingleClick = options?.configurationService.getValue(openModeSettingKey) !== 'doubleClick';
            this._register(options?.configurationService.onDidChangeConfiguration(e => {
                if (e.affectsConfiguration(openModeSettingKey)) {
                    this.openOnSingleClick = options?.configurationService.getValue(openModeSettingKey) !== 'doubleClick';
                }
            }));
        }
        else {
            this.openOnSingleClick = options?.openOnSingleClick ?? true;
        }
    }
    onSelectionFromKeyboard(event) {
        if (event.elements.length !== 1) {
            return;
        }
        const selectionKeyboardEvent = event.browserEvent;
        const preserveFocus = typeof selectionKeyboardEvent.preserveFocus === 'boolean' ? selectionKeyboardEvent.preserveFocus : true;
        const pinned = typeof selectionKeyboardEvent.pinned === 'boolean' ? selectionKeyboardEvent.pinned : !preserveFocus;
        const sideBySide = false;
        this._open(this.getSelectedElement(), preserveFocus, pinned, sideBySide, event.browserEvent);
    }
    onPointer(element, browserEvent) {
        if (!this.openOnSingleClick) {
            return;
        }
        const isDoubleClick = browserEvent.detail === 2;
        if (isDoubleClick) {
            return;
        }
        const isMiddleClick = browserEvent.button === 1;
        const preserveFocus = true;
        const pinned = isMiddleClick;
        const sideBySide = browserEvent.ctrlKey || browserEvent.metaKey || browserEvent.altKey;
        this._open(element, preserveFocus, pinned, sideBySide, browserEvent);
    }
    onMouseDblClick(element, browserEvent) {
        if (!browserEvent) {
            return;
        }
        // copied from AbstractTree
        const target = browserEvent.target;
        const onTwistie = target.classList.contains('monaco-tl-twistie')
            || (target.classList.contains('monaco-icon-label') && target.classList.contains('folder-icon') && browserEvent.offsetX < 16);
        if (onTwistie) {
            return;
        }
        const preserveFocus = false;
        const pinned = true;
        const sideBySide = (browserEvent.ctrlKey || browserEvent.metaKey || browserEvent.altKey);
        this._open(element, preserveFocus, pinned, sideBySide, browserEvent);
    }
    _open(element, preserveFocus, pinned, sideBySide, browserEvent) {
        if (!element) {
            return;
        }
        this._onDidOpen.fire({
            editorOptions: {
                preserveFocus,
                pinned,
                revealIfVisible: true
            },
            sideBySide,
            element,
            browserEvent
        });
    }
}
class ListResourceNavigator extends ResourceNavigator {
    constructor(widget, options) {
        super(widget, options);
        this.widget = widget;
    }
    getSelectedElement() {
        return this.widget.getSelectedElements()[0];
    }
}
class TableResourceNavigator extends ResourceNavigator {
    constructor(widget, options) {
        super(widget, options);
    }
    getSelectedElement() {
        return this.widget.getSelectedElements()[0];
    }
}
class TreeResourceNavigator extends ResourceNavigator {
    constructor(widget, options) {
        super(widget, options);
    }
    getSelectedElement() {
        return this.widget.getSelection()[0] ?? undefined;
    }
}
function createKeyboardNavigationEventFilter(keybindingService) {
    let inMultiChord = false;
    return event => {
        if (event.toKeyCodeChord().isModifierKey()) {
            return false;
        }
        if (inMultiChord) {
            inMultiChord = false;
            return false;
        }
        const result = keybindingService.softDispatch(event, event.target);
        if (result.kind === 1 /* ResultKind.MoreChordsNeeded */) {
            inMultiChord = true;
            return false;
        }
        inMultiChord = false;
        return result.kind === 0 /* ResultKind.NoMatchingKb */;
    };
}
let WorkbenchObjectTree = class WorkbenchObjectTree extends ObjectTree {
    get contextKeyService() { return this.internals.contextKeyService; }
    get useAltAsMultipleSelectionModifier() { return this.internals.useAltAsMultipleSelectionModifier; }
    get onDidOpen() { return this.internals.onDidOpen; }
    constructor(user, container, delegate, renderers, options, instantiationService, contextKeyService, listService, configurationService) {
        // eslint-disable-next-line local/code-no-any-casts
        const { options: treeOptions, getTypeNavigationMode, disposable } = instantiationService.invokeFunction(workbenchTreeDataPreamble, options);
        super(user, container, delegate, renderers, treeOptions);
        this.disposables.add(disposable);
        this.internals = new WorkbenchTreeInternals(this, options, getTypeNavigationMode, options.overrideStyles, contextKeyService, listService, configurationService);
        this.disposables.add(this.internals);
    }
    updateOptions(options) {
        super.updateOptions(options);
        this.internals.updateOptions(options);
    }
};
WorkbenchObjectTree = __decorate([
    __param(5, IInstantiationService),
    __param(6, IContextKeyService),
    __param(7, IListService),
    __param(8, IConfigurationService)
], WorkbenchObjectTree);
export { WorkbenchObjectTree };
let WorkbenchCompressibleObjectTree = class WorkbenchCompressibleObjectTree extends CompressibleObjectTree {
    get contextKeyService() { return this.internals.contextKeyService; }
    get useAltAsMultipleSelectionModifier() { return this.internals.useAltAsMultipleSelectionModifier; }
    get onDidOpen() { return this.internals.onDidOpen; }
    constructor(user, container, delegate, renderers, options, instantiationService, contextKeyService, listService, configurationService) {
        // eslint-disable-next-line local/code-no-any-casts
        const { options: treeOptions, getTypeNavigationMode, disposable } = instantiationService.invokeFunction(workbenchTreeDataPreamble, options);
        super(user, container, delegate, renderers, treeOptions);
        this.disposables.add(disposable);
        this.internals = new WorkbenchTreeInternals(this, options, getTypeNavigationMode, options.overrideStyles, contextKeyService, listService, configurationService);
        this.disposables.add(this.internals);
    }
    updateOptions(options = {}) {
        super.updateOptions(options);
        if (options.overrideStyles) {
            this.internals.updateStyleOverrides(options.overrideStyles);
        }
        this.internals.updateOptions(options);
    }
};
WorkbenchCompressibleObjectTree = __decorate([
    __param(5, IInstantiationService),
    __param(6, IContextKeyService),
    __param(7, IListService),
    __param(8, IConfigurationService)
], WorkbenchCompressibleObjectTree);
export { WorkbenchCompressibleObjectTree };
let WorkbenchDataTree = class WorkbenchDataTree extends DataTree {
    get contextKeyService() { return this.internals.contextKeyService; }
    get useAltAsMultipleSelectionModifier() { return this.internals.useAltAsMultipleSelectionModifier; }
    get onDidOpen() { return this.internals.onDidOpen; }
    constructor(user, container, delegate, renderers, dataSource, options, instantiationService, contextKeyService, listService, configurationService) {
        // eslint-disable-next-line local/code-no-any-casts
        const { options: treeOptions, getTypeNavigationMode, disposable } = instantiationService.invokeFunction(workbenchTreeDataPreamble, options);
        super(user, container, delegate, renderers, dataSource, treeOptions);
        this.disposables.add(disposable);
        this.internals = new WorkbenchTreeInternals(this, options, getTypeNavigationMode, options.overrideStyles, contextKeyService, listService, configurationService);
        this.disposables.add(this.internals);
    }
    updateOptions(options = {}) {
        super.updateOptions(options);
        if (options.overrideStyles !== undefined) {
            this.internals.updateStyleOverrides(options.overrideStyles);
        }
        this.internals.updateOptions(options);
    }
};
WorkbenchDataTree = __decorate([
    __param(6, IInstantiationService),
    __param(7, IContextKeyService),
    __param(8, IListService),
    __param(9, IConfigurationService)
], WorkbenchDataTree);
export { WorkbenchDataTree };
let WorkbenchAsyncDataTree = class WorkbenchAsyncDataTree extends AsyncDataTree {
    get contextKeyService() { return this.internals.contextKeyService; }
    get useAltAsMultipleSelectionModifier() { return this.internals.useAltAsMultipleSelectionModifier; }
    get onDidOpen() { return this.internals.onDidOpen; }
    constructor(user, container, delegate, renderers, dataSource, options, instantiationService, contextKeyService, listService, configurationService) {
        // eslint-disable-next-line local/code-no-any-casts
        const { options: treeOptions, getTypeNavigationMode, disposable } = instantiationService.invokeFunction(workbenchTreeDataPreamble, options);
        super(user, container, delegate, renderers, dataSource, treeOptions);
        this.disposables.add(disposable);
        this.internals = new WorkbenchTreeInternals(this, options, getTypeNavigationMode, options.overrideStyles, contextKeyService, listService, configurationService);
        this.disposables.add(this.internals);
    }
    updateOptions(options = {}) {
        super.updateOptions(options);
        if (options.overrideStyles) {
            this.internals.updateStyleOverrides(options.overrideStyles);
        }
        this.internals.updateOptions(options);
    }
};
WorkbenchAsyncDataTree = __decorate([
    __param(6, IInstantiationService),
    __param(7, IContextKeyService),
    __param(8, IListService),
    __param(9, IConfigurationService)
], WorkbenchAsyncDataTree);
export { WorkbenchAsyncDataTree };
let WorkbenchCompressibleAsyncDataTree = class WorkbenchCompressibleAsyncDataTree extends CompressibleAsyncDataTree {
    get contextKeyService() { return this.internals.contextKeyService; }
    get useAltAsMultipleSelectionModifier() { return this.internals.useAltAsMultipleSelectionModifier; }
    get onDidOpen() { return this.internals.onDidOpen; }
    constructor(user, container, virtualDelegate, compressionDelegate, renderers, dataSource, options, instantiationService, contextKeyService, listService, configurationService) {
        // eslint-disable-next-line local/code-no-any-casts
        const { options: treeOptions, getTypeNavigationMode, disposable } = instantiationService.invokeFunction(workbenchTreeDataPreamble, options);
        super(user, container, virtualDelegate, compressionDelegate, renderers, dataSource, treeOptions);
        this.disposables.add(disposable);
        this.internals = new WorkbenchTreeInternals(this, options, getTypeNavigationMode, options.overrideStyles, contextKeyService, listService, configurationService);
        this.disposables.add(this.internals);
    }
    updateOptions(options) {
        super.updateOptions(options);
        this.internals.updateOptions(options);
    }
};
WorkbenchCompressibleAsyncDataTree = __decorate([
    __param(7, IInstantiationService),
    __param(8, IContextKeyService),
    __param(9, IListService),
    __param(10, IConfigurationService)
], WorkbenchCompressibleAsyncDataTree);
export { WorkbenchCompressibleAsyncDataTree };
function getDefaultTreeFindMode(configurationService) {
    const value = configurationService.getValue(defaultFindModeSettingKey);
    if (value === 'highlight') {
        return TreeFindMode.Highlight;
    }
    else if (value === 'filter') {
        return TreeFindMode.Filter;
    }
    const deprecatedValue = configurationService.getValue(keyboardNavigationSettingKey);
    if (deprecatedValue === 'simple' || deprecatedValue === 'highlight') {
        return TreeFindMode.Highlight;
    }
    else if (deprecatedValue === 'filter') {
        return TreeFindMode.Filter;
    }
    return undefined;
}
function getDefaultTreeFindMatchType(configurationService) {
    const value = configurationService.getValue(defaultFindMatchTypeSettingKey);
    if (value === 'fuzzy') {
        return TreeFindMatchType.Fuzzy;
    }
    else if (value === 'contiguous') {
        return TreeFindMatchType.Contiguous;
    }
    return undefined;
}
function workbenchTreeDataPreamble(accessor, options) {
    const configurationService = accessor.get(IConfigurationService);
    const contextViewService = accessor.get(IContextViewService);
    const contextKeyService = accessor.get(IContextKeyService);
    const instantiationService = accessor.get(IInstantiationService);
    const getTypeNavigationMode = () => {
        // give priority to the context key value to specify a value
        const modeString = contextKeyService.getContextKeyValue(WorkbenchListTypeNavigationModeKey);
        if (modeString === 'automatic') {
            return TypeNavigationMode.Automatic;
        }
        else if (modeString === 'trigger') {
            return TypeNavigationMode.Trigger;
        }
        // also check the deprecated context key to set the mode to 'trigger'
        const modeBoolean = contextKeyService.getContextKeyValue(WorkbenchListAutomaticKeyboardNavigationLegacyKey);
        if (modeBoolean === false) {
            return TypeNavigationMode.Trigger;
        }
        // finally, check the setting
        const configString = configurationService.getValue(typeNavigationModeSettingKey);
        if (configString === 'automatic') {
            return TypeNavigationMode.Automatic;
        }
        else if (configString === 'trigger') {
            return TypeNavigationMode.Trigger;
        }
        return undefined;
    };
    const horizontalScrolling = options.horizontalScrolling !== undefined ? options.horizontalScrolling : Boolean(configurationService.getValue(horizontalScrollingKey));
    const [workbenchListOptions, disposable] = instantiationService.invokeFunction(toWorkbenchListOptions, options);
    const paddingBottom = options.paddingBottom;
    const renderIndentGuides = options.renderIndentGuides !== undefined ? options.renderIndentGuides : configurationService.getValue(treeRenderIndentGuidesKey);
    return {
        getTypeNavigationMode,
        disposable,
        // eslint-disable-next-line local/code-no-dangerous-type-assertions
        options: {
            // ...options, // TODO@Joao why is this not splatted here?
            keyboardSupport: false,
            ...workbenchListOptions,
            indent: typeof configurationService.getValue(treeIndentKey) === 'number' ? configurationService.getValue(treeIndentKey) : undefined,
            renderIndentGuides,
            smoothScrolling: Boolean(configurationService.getValue(listSmoothScrolling)),
            defaultFindMode: options.defaultFindMode ?? getDefaultTreeFindMode(configurationService),
            defaultFindMatchType: options.defaultFindMatchType ?? getDefaultTreeFindMatchType(configurationService),
            horizontalScrolling,
            scrollByPage: Boolean(configurationService.getValue(scrollByPageKey)),
            paddingBottom: paddingBottom,
            hideTwistiesOfChildlessElements: options.hideTwistiesOfChildlessElements,
            expandOnlyOnTwistieClick: options.expandOnlyOnTwistieClick ?? (configurationService.getValue(treeExpandMode) === 'doubleClick'),
            contextViewProvider: contextViewService,
            findWidgetStyles: defaultFindWidgetStyles,
            enableStickyScroll: Boolean(configurationService.getValue(treeStickyScroll)),
            stickyScrollMaxItemCount: Number(configurationService.getValue(treeStickyScrollMaxElements)),
        }
    };
}
let WorkbenchTreeInternals = class WorkbenchTreeInternals {
    get onDidOpen() { return this.navigator.onDidOpen; }
    constructor(tree, options, getTypeNavigationMode, overrideStyles, contextKeyService, listService, configurationService) {
        this.tree = tree;
        this.disposables = [];
        this.contextKeyService = createScopedContextKeyService(contextKeyService, tree);
        this.disposables.push(createScrollObserver(this.contextKeyService, tree));
        this.listSupportsMultiSelect = WorkbenchListSupportsMultiSelectContextKey.bindTo(this.contextKeyService);
        this.listSupportsMultiSelect.set(options.multipleSelectionSupport !== false);
        const listSelectionNavigation = WorkbenchListSelectionNavigation.bindTo(this.contextKeyService);
        listSelectionNavigation.set(Boolean(options.selectionNavigation));
        this.listSupportFindWidget = WorkbenchListSupportsFind.bindTo(this.contextKeyService);
        this.listSupportFindWidget.set(options.findWidgetEnabled ?? true);
        this.hasSelectionOrFocus = WorkbenchListHasSelectionOrFocus.bindTo(this.contextKeyService);
        this.hasDoubleSelection = WorkbenchListDoubleSelection.bindTo(this.contextKeyService);
        this.hasMultiSelection = WorkbenchListMultiSelection.bindTo(this.contextKeyService);
        this.treeElementCanCollapse = WorkbenchTreeElementCanCollapse.bindTo(this.contextKeyService);
        this.treeElementHasParent = WorkbenchTreeElementHasParent.bindTo(this.contextKeyService);
        this.treeElementCanExpand = WorkbenchTreeElementCanExpand.bindTo(this.contextKeyService);
        this.treeElementHasChild = WorkbenchTreeElementHasChild.bindTo(this.contextKeyService);
        this.treeFindOpen = WorkbenchTreeFindOpen.bindTo(this.contextKeyService);
        this.treeStickyScrollFocused = WorkbenchTreeStickyScrollFocused.bindTo(this.contextKeyService);
        this._useAltAsMultipleSelectionModifier = useAltAsMultipleSelectionModifier(configurationService);
        this.updateStyleOverrides(overrideStyles);
        const updateCollapseContextKeys = () => {
            const focus = tree.getFocus()[0];
            if (!focus) {
                return;
            }
            const node = tree.getNode(focus);
            this.treeElementCanCollapse.set(node.collapsible && !node.collapsed);
            this.treeElementHasParent.set(!!tree.getParentElement(focus));
            this.treeElementCanExpand.set(node.collapsible && node.collapsed);
            this.treeElementHasChild.set(!!tree.getFirstElementChild(focus));
        };
        const interestingContextKeys = new Set();
        interestingContextKeys.add(WorkbenchListTypeNavigationModeKey);
        interestingContextKeys.add(WorkbenchListAutomaticKeyboardNavigationLegacyKey);
        this.disposables.push(this.contextKeyService, listService.register(tree), tree.onDidChangeSelection(() => {
            const selection = tree.getSelection();
            const focus = tree.getFocus();
            this.contextKeyService.bufferChangeEvents(() => {
                this.hasSelectionOrFocus.set(selection.length > 0 || focus.length > 0);
                this.hasMultiSelection.set(selection.length > 1);
                this.hasDoubleSelection.set(selection.length === 2);
            });
        }), tree.onDidChangeFocus(() => {
            const selection = tree.getSelection();
            const focus = tree.getFocus();
            this.hasSelectionOrFocus.set(selection.length > 0 || focus.length > 0);
            updateCollapseContextKeys();
        }), tree.onDidChangeCollapseState(updateCollapseContextKeys), tree.onDidChangeModel(updateCollapseContextKeys), tree.onDidChangeFindOpenState(enabled => this.treeFindOpen.set(enabled)), tree.onDidChangeStickyScrollFocused(focused => this.treeStickyScrollFocused.set(focused)), configurationService.onDidChangeConfiguration(e => {
            let newOptions = {};
            if (e.affectsConfiguration(multiSelectModifierSettingKey)) {
                this._useAltAsMultipleSelectionModifier = useAltAsMultipleSelectionModifier(configurationService);
            }
            if (e.affectsConfiguration(treeIndentKey)) {
                const indent = configurationService.getValue(treeIndentKey);
                newOptions = { ...newOptions, indent };
            }
            if (e.affectsConfiguration(treeRenderIndentGuidesKey) && options.renderIndentGuides === undefined) {
                const renderIndentGuides = configurationService.getValue(treeRenderIndentGuidesKey);
                newOptions = { ...newOptions, renderIndentGuides };
            }
            if (e.affectsConfiguration(listSmoothScrolling)) {
                const smoothScrolling = Boolean(configurationService.getValue(listSmoothScrolling));
                newOptions = { ...newOptions, smoothScrolling };
            }
            if (e.affectsConfiguration(defaultFindModeSettingKey) || e.affectsConfiguration(keyboardNavigationSettingKey)) {
                const defaultFindMode = getDefaultTreeFindMode(configurationService);
                newOptions = { ...newOptions, defaultFindMode };
            }
            if (e.affectsConfiguration(typeNavigationModeSettingKey) || e.affectsConfiguration(keyboardNavigationSettingKey)) {
                const typeNavigationMode = getTypeNavigationMode();
                newOptions = { ...newOptions, typeNavigationMode };
            }
            if (e.affectsConfiguration(defaultFindMatchTypeSettingKey)) {
                const defaultFindMatchType = getDefaultTreeFindMatchType(configurationService);
                newOptions = { ...newOptions, defaultFindMatchType };
            }
            if (e.affectsConfiguration(horizontalScrollingKey) && options.horizontalScrolling === undefined) {
                const horizontalScrolling = Boolean(configurationService.getValue(horizontalScrollingKey));
                newOptions = { ...newOptions, horizontalScrolling };
            }
            if (e.affectsConfiguration(scrollByPageKey)) {
                const scrollByPage = Boolean(configurationService.getValue(scrollByPageKey));
                newOptions = { ...newOptions, scrollByPage };
            }
            if (e.affectsConfiguration(treeExpandMode) && options.expandOnlyOnTwistieClick === undefined) {
                newOptions = { ...newOptions, expandOnlyOnTwistieClick: configurationService.getValue(treeExpandMode) === 'doubleClick' };
            }
            if (e.affectsConfiguration(treeStickyScroll)) {
                const enableStickyScroll = configurationService.getValue(treeStickyScroll);
                newOptions = { ...newOptions, enableStickyScroll };
            }
            if (e.affectsConfiguration(treeStickyScrollMaxElements)) {
                const stickyScrollMaxItemCount = Math.max(1, configurationService.getValue(treeStickyScrollMaxElements));
                newOptions = { ...newOptions, stickyScrollMaxItemCount };
            }
            if (e.affectsConfiguration(mouseWheelScrollSensitivityKey)) {
                const mouseWheelScrollSensitivity = configurationService.getValue(mouseWheelScrollSensitivityKey);
                newOptions = { ...newOptions, mouseWheelScrollSensitivity };
            }
            if (e.affectsConfiguration(fastScrollSensitivityKey)) {
                const fastScrollSensitivity = configurationService.getValue(fastScrollSensitivityKey);
                newOptions = { ...newOptions, fastScrollSensitivity };
            }
            if (Object.keys(newOptions).length > 0) {
                tree.updateOptions(newOptions);
            }
        }), this.contextKeyService.onDidChangeContext(e => {
            if (e.affectsSome(interestingContextKeys)) {
                tree.updateOptions({ typeNavigationMode: getTypeNavigationMode() });
            }
        }));
        this.navigator = new TreeResourceNavigator(tree, { configurationService, ...options });
        this.disposables.push(this.navigator);
    }
    get useAltAsMultipleSelectionModifier() {
        return this._useAltAsMultipleSelectionModifier;
    }
    updateOptions(options) {
        if (options.multipleSelectionSupport !== undefined) {
            this.listSupportsMultiSelect.set(!!options.multipleSelectionSupport);
        }
    }
    updateStyleOverrides(overrideStyles) {
        this.tree.style(overrideStyles ? getListStyles(overrideStyles) : defaultListStyles);
    }
    dispose() {
        this.disposables = dispose(this.disposables);
    }
};
WorkbenchTreeInternals = __decorate([
    __param(4, IContextKeyService),
    __param(5, IListService),
    __param(6, IConfigurationService)
], WorkbenchTreeInternals);
const configurationRegistry = Registry.as(ConfigurationExtensions.Configuration);
configurationRegistry.registerConfiguration({
    id: 'workbench',
    order: 7,
    title: localize('workbenchConfigurationTitle', "Workbench"),
    type: 'object',
    properties: {
        [multiSelectModifierSettingKey]: {
            type: 'string',
            enum: ['ctrlCmd', 'alt'],
            markdownEnumDescriptions: [
                localize('multiSelectModifier.ctrlCmd', "Maps to `Control` on Windows and Linux and to `Command` on macOS."),
                localize('multiSelectModifier.alt', "Maps to `Alt` on Windows and Linux and to `Option` on macOS.")
            ],
            default: 'ctrlCmd',
            description: localize({
                key: 'multiSelectModifier',
                comment: [
                    '- `ctrlCmd` refers to a value the setting can take and should not be localized.',
                    '- `Control` and `Command` refer to the modifier keys Ctrl or Cmd on the keyboard and can be localized.'
                ]
            }, "The modifier to be used to add an item in trees and lists to a multi-selection with the mouse (for example in the explorer, open editors and scm view). The 'Open to Side' mouse gestures - if supported - will adapt such that they do not conflict with the multiselect modifier.")
        },
        [openModeSettingKey]: {
            type: 'string',
            enum: ['singleClick', 'doubleClick'],
            default: 'singleClick',
            description: localize({
                key: 'openModeModifier',
                comment: ['`singleClick` and `doubleClick` refers to a value the setting can take and should not be localized.']
            }, "Controls how to open items in trees and lists using the mouse (if supported). Note that some trees and lists might choose to ignore this setting if it is not applicable.")
        },
        [horizontalScrollingKey]: {
            type: 'boolean',
            default: false,
            description: localize('horizontalScrolling setting', "Controls whether lists and trees support horizontal scrolling in the workbench. Warning: turning on this setting has a performance implication.")
        },
        [scrollByPageKey]: {
            type: 'boolean',
            default: false,
            description: localize('list.scrollByPage', "Controls whether clicks in the scrollbar scroll page by page.")
        },
        [treeIndentKey]: {
            type: 'number',
            default: 8,
            minimum: 4,
            maximum: 40,
            description: localize('tree indent setting', "Controls tree indentation in pixels.")
        },
        [treeRenderIndentGuidesKey]: {
            type: 'string',
            enum: ['none', 'onHover', 'always'],
            default: 'onHover',
            description: localize('render tree indent guides', "Controls whether the tree should render indent guides.")
        },
        [listSmoothScrolling]: {
            type: 'boolean',
            default: false,
            description: localize('list smoothScrolling setting', "Controls whether lists and trees have smooth scrolling."),
        },
        [mouseWheelScrollSensitivityKey]: {
            type: 'number',
            default: 1,
            markdownDescription: localize('Mouse Wheel Scroll Sensitivity', "A multiplier to be used on the `deltaX` and `deltaY` of mouse wheel scroll events.")
        },
        [fastScrollSensitivityKey]: {
            type: 'number',
            default: 5,
            markdownDescription: localize('Fast Scroll Sensitivity', "Scrolling speed multiplier when pressing `Alt`.")
        },
        [defaultFindModeSettingKey]: {
            type: 'string',
            enum: ['highlight', 'filter'],
            enumDescriptions: [
                localize('defaultFindModeSettingKey.highlight', "Highlight elements when searching. Further up and down navigation will traverse only the highlighted elements."),
                localize('defaultFindModeSettingKey.filter', "Filter elements when searching.")
            ],
            default: 'highlight',
            description: localize('defaultFindModeSettingKey', "Controls the default find mode for lists and trees in the workbench.")
        },
        [keyboardNavigationSettingKey]: {
            type: 'string',
            enum: ['simple', 'highlight', 'filter'],
            enumDescriptions: [
                localize('keyboardNavigationSettingKey.simple', "Simple keyboard navigation focuses elements which match the keyboard input. Matching is done only on prefixes."),
                localize('keyboardNavigationSettingKey.highlight', "Highlight keyboard navigation highlights elements which match the keyboard input. Further up and down navigation will traverse only the highlighted elements."),
                localize('keyboardNavigationSettingKey.filter', "Filter keyboard navigation will filter out and hide all the elements which do not match the keyboard input.")
            ],
            default: 'highlight',
            description: localize('keyboardNavigationSettingKey', "Controls the keyboard navigation style for lists and trees in the workbench. Can be simple, highlight and filter."),
            deprecated: true,
            deprecationMessage: localize('keyboardNavigationSettingKeyDeprecated', "Please use 'workbench.list.defaultFindMode' and	'workbench.list.typeNavigationMode' instead.")
        },
        [defaultFindMatchTypeSettingKey]: {
            type: 'string',
            enum: ['fuzzy', 'contiguous'],
            enumDescriptions: [
                localize('defaultFindMatchTypeSettingKey.fuzzy', "Use fuzzy matching when searching."),
                localize('defaultFindMatchTypeSettingKey.contiguous', "Use contiguous matching when searching.")
            ],
            default: 'fuzzy',
            description: localize('defaultFindMatchTypeSettingKey', "Controls the type of matching used when searching lists and trees in the workbench.")
        },
        [treeExpandMode]: {
            type: 'string',
            enum: ['singleClick', 'doubleClick'],
            default: 'singleClick',
            description: localize('expand mode', "Controls how tree folders are expanded when clicking the folder names. Note that some trees and lists might choose to ignore this setting if it is not applicable."),
        },
        [treeStickyScroll]: {
            type: 'boolean',
            default: true,
            description: localize('sticky scroll', "Controls whether sticky scrolling is enabled in trees."),
        },
        [treeStickyScrollMaxElements]: {
            type: 'number',
            minimum: 1,
            default: 7,
            markdownDescription: localize('sticky scroll maximum items', "Controls the number of sticky elements displayed in the tree when {0} is enabled.", '`#workbench.tree.enableStickyScroll#`'),
        },
        [typeNavigationModeSettingKey]: {
            type: 'string',
            enum: ['automatic', 'trigger'],
            default: 'automatic',
            markdownDescription: localize('typeNavigationMode2', "Controls how type navigation works in lists and trees in the workbench. When set to `trigger`, type navigation begins once the `list.triggerTypeNavigation` command is run."),
        }
    }
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibGlzdFNlcnZpY2UuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9wbGF0Zm9ybS9saXN0L2Jyb3dzZXIvbGlzdFNlcnZpY2UudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLGVBQWUsRUFBRSxlQUFlLEVBQUUsTUFBTSw4QkFBOEIsQ0FBQztBQUdoRixPQUFPLEVBQXFDLFNBQVMsRUFBRSxNQUFNLDZDQUE2QyxDQUFDO0FBQzNHLE9BQU8sRUFBMkksMkJBQTJCLEVBQUUsNEJBQTRCLEVBQUUsSUFBSSxFQUFFLGtCQUFrQixFQUFFLE1BQU0sNkNBQTZDLENBQUM7QUFFM1IsT0FBTyxFQUFvRCxLQUFLLEVBQUUsTUFBTSwrQ0FBK0MsQ0FBQztBQUN4SCxPQUFPLEVBQXdFLGlCQUFpQixFQUFFLFlBQVksRUFBRSxNQUFNLCtDQUErQyxDQUFDO0FBQ3RLLE9BQU8sRUFBRSxhQUFhLEVBQUUseUJBQXlCLEVBQWdMLE1BQU0sZ0RBQWdELENBQUM7QUFDeFIsT0FBTyxFQUFFLFFBQVEsRUFBb0IsTUFBTSwyQ0FBMkMsQ0FBQztBQUN2RixPQUFPLEVBQUUsc0JBQXNCLEVBQXVILFVBQVUsRUFBRSxNQUFNLDZDQUE2QyxDQUFDO0FBRXROLE9BQU8sRUFBRSxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0sK0JBQStCLENBQUM7QUFDL0QsT0FBTyxFQUFFLGtCQUFrQixFQUFFLFVBQVUsRUFBRSxlQUFlLEVBQUUsT0FBTyxFQUFlLFlBQVksRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQ3hJLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxpQkFBaUIsQ0FBQztBQUMzQyxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSw2Q0FBNkMsQ0FBQztBQUNwRixPQUFPLEVBQUUsVUFBVSxJQUFJLHVCQUF1QixFQUEwQixNQUFNLHFEQUFx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