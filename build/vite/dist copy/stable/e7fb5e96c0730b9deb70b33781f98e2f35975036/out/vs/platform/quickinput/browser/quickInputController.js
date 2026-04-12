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
var QuickInputController_1;
import * as dom from '../../../base/browser/dom.js';
import * as domStylesheetsJs from '../../../base/browser/domStylesheets.js';
import { ToolBar } from '../../../base/browser/ui/toolbar/toolbar.js';
import { Button } from '../../../base/browser/ui/button/button.js';
import { CountBadge } from '../../../base/browser/ui/countBadge/countBadge.js';
import { ProgressBar } from '../../../base/browser/ui/progressbar/progressbar.js';
import { CancellationToken } from '../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../base/common/event.js';
import { Disposable, dispose } from '../../../base/common/lifecycle.js';
import Severity from '../../../base/common/severity.js';
import { isString } from '../../../base/common/types.js';
import { isModifierKey } from '../../../base/common/keyCodes.js';
import { localize } from '../../../nls.js';
import { QuickInputHideReason, QuickPickFocus } from '../common/quickInput.js';
import { QuickInputBox } from './quickInputBox.js';
import { QuickPick, backButton, InputBox, QuickWidget, InQuickInputContextKey, QuickInputTypeContextKey, EndOfQuickInputBoxContextKey, QuickInputAlignmentContextKey } from './quickInput.js';
import { ILayoutService } from '../../layout/browser/layoutService.js';
import { mainWindow } from '../../../base/browser/window.js';
import { IInstantiationService } from '../../instantiation/common/instantiation.js';
import { IContextMenuService } from '../../contextview/browser/contextView.js';
import { QuickInputList } from './quickInputList.js';
import { IContextKeyService } from '../../contextkey/common/contextkey.js';
import './quickInputActions.js';
import { autorun, observableValue } from '../../../base/common/observable.js';
import { StandardMouseEvent } from '../../../base/browser/mouseEvent.js';
import { IStorageService } from '../../storage/common/storage.js';
import { IConfigurationService } from '../../configuration/common/configuration.js';
import { platform, setTimeout0 } from '../../../base/common/platform.js';
import { getWindowControlsStyle } from '../../window/common/window.js';
import { getZoomFactor } from '../../../base/browser/browser.js';
import { TriStateCheckbox, createToggleActionViewItemProvider } from '../../../base/browser/ui/toggle/toggle.js';
import { defaultCheckboxStyles } from '../../theme/browser/defaultStyles.js';
import { QuickInputTreeController } from './tree/quickInputTreeController.js';
import { QuickTree } from './tree/quickTree.js';
import { layout2d } from '../../../base/common/layout.js';
import { getAnchorRect } from '../../../base/browser/ui/contextview/contextview.js';
const $ = dom.$;
const VIEWSTATE_STORAGE_KEY = 'workbench.quickInput.viewState';
let QuickInputController = class QuickInputController extends Disposable {
    static { QuickInputController_1 = this; }
    static { this.MAX_WIDTH = 600; } // Max total width of quick input widget
    get currentQuickInput() { return this.controller ?? undefined; }
    get container() { return this._container; }
    constructor(options, layoutService, instantiationService, contextKeyService, storageService, contextMenuService) {
        super();
        this.options = options;
        this.layoutService = layoutService;
        this.instantiationService = instantiationService;
        this.storageService = storageService;
        this.contextMenuService = contextMenuService;
        this.enabled = true;
        this.onDidAcceptEmitter = this._register(new Emitter());
        this.onDidCustomEmitter = this._register(new Emitter());
        this.onDidTriggerButtonEmitter = this._register(new Emitter());
        this.keyMods = { ctrlCmd: false, alt: false, shift: false };
        this.controller = null;
        this.onShowEmitter = this._register(new Emitter());
        this.onShow = this.onShowEmitter.event;
        this.onHideEmitter = this._register(new Emitter());
        this.onHide = this.onHideEmitter.event;
        this._alignment = observableValue(this, 'top');
        this.alignment = this._alignment;
        this.backButton = backButton;
        this.inQuickInputContext = InQuickInputContextKey.bindTo(contextKeyService);
        this.quickInputTypeContext = QuickInputTypeContextKey.bindTo(contextKeyService);
        this.endOfQuickInputBoxContext = EndOfQuickInputBoxContextKey.bindTo(contextKeyService);
        this.idPrefix = options.idPrefix;
        this._container = options.container;
        this.styles = options.styles;
        this._register(Event.runAndSubscribe(dom.onDidRegisterWindow, ({ window, disposables }) => this.registerKeyModsListeners(window, disposables), { window: mainWindow, disposables: this._store }));
        this._register(dom.onWillUnregisterWindow(window => {
            if (this.ui && dom.getWindow(this.ui.container) === window) {
                // The window this quick input is contained in is about to
                // close, so we have to make sure to reparent it back to an
                // existing parent to not loose functionality.
                // (https://github.com/microsoft/vscode/issues/195870)
                this.reparentUI(this.layoutService.mainContainer);
                this.layout(this.layoutService.mainContainerDimension, this.layoutService.mainContainerOffset.quickPickTop);
            }
        }));
        this.viewState = this.loadViewState();
    }
    registerKeyModsListeners(window, disposables) {
        const listener = (e) => {
            this.keyMods.ctrlCmd = e.ctrlKey || e.metaKey;
            this.keyMods.alt = e.altKey;
            this.keyMods.shift = e.shiftKey;
        };
        for (const event of [dom.EventType.KEY_DOWN, dom.EventType.KEY_UP, dom.EventType.MOUSE_DOWN]) {
            disposables.add(dom.addDisposableListener(window, event, listener, true));
        }
    }
    getUI(showInActiveContainer) {
        if (this.ui) {
            // In order to support aux windows, re-parent the controller
            // if the original event is from a different document
            if (showInActiveContainer) {
                if (dom.getWindow(this._container) !== dom.getWindow(this.layoutService.activeContainer)) {
                    this.reparentUI(this.layoutService.activeContainer);
                    this.layout(this.layoutService.activeContainerDimension, this.layoutService.activeContainerOffset.quickPickTop);
                }
            }
            return this.ui;
        }
        const container = dom.append(this._container, $('.quick-input-widget.show-file-icons'));
        container.tabIndex = -1;
        container.style.display = 'none';
        const styleSheet = domStylesheetsJs.createStyleSheet(container);
        const titleBar = dom.append(container, $('.quick-input-titlebar'));
        const leftActionBar = this._register(new ToolBar(titleBar, this.contextMenuService, {
            hoverDelegate: this.options.hoverDelegate,
            actionViewItemProvider: createToggleActionViewItemProvider(this.styles.toggle),
            icon: true,
            label: false
        }));
        leftActionBar.getElement().classList.add('quick-input-left-action-bar');
        const title = dom.append(titleBar, $('.quick-input-title'));
        const rightActionBar = this._register(new ToolBar(titleBar, this.contextMenuService, {
            hoverDelegate: this.options.hoverDelegate,
            actionViewItemProvider: createToggleActionViewItemProvider(this.styles.toggle),
            icon: true,
            label: false
        }));
        rightActionBar.getElement().classList.add('quick-input-right-action-bar');
        const headerContainer = dom.append(container, $('.quick-input-header'));
        const checkAll = this._register(new TriStateCheckbox(localize('quickInput.checkAll', "Toggle all checkboxes"), false, { ...defaultCheckboxStyles, size: 15 }));
        dom.append(headerContainer, checkAll.domNode);
        this._register(checkAll.onChange(() => {
            const checked = checkAll.checked;
            list.setAllVisibleChecked(checked === true);
        }));
        this._register(dom.addDisposableListener(checkAll.domNode, dom.EventType.CLICK, e => {
            if (e.x || e.y) { // Avoid 'click' triggered by 'space'...
                inputBox.setFocus();
            }
        }));
        const description2 = dom.append(headerContainer, $('.quick-input-description'));
        const inputContainer = dom.append(headerContainer, $('.quick-input-and-message'));
        const filterContainer = dom.append(inputContainer, $('.quick-input-filter'));
        const inputBox = this._register(new QuickInputBox(filterContainer, this.styles.inputBox, this.styles.toggle));
        inputBox.setAttribute('aria-describedby', `${this.idPrefix}message`);
        const visibleCountContainer = dom.append(filterContainer, $('.quick-input-visible-count'));
        visibleCountContainer.setAttribute('aria-live', 'polite');
        visibleCountContainer.setAttribute('aria-atomic', 'true');
        const visibleCount = this._register(new CountBadge(visibleCountContainer, { countFormat: localize({ key: 'quickInput.visibleCount', comment: ['This tells the user how many items are shown in a list of items to select from. The items can be anything. Currently not visible, but read by screen readers.'] }, "{0} Results") }, this.styles.countBadge));
        const countContainer = dom.append(filterContainer, $('.quick-input-count'));
        countContainer.setAttribute('aria-live', 'polite');
        const count = this._register(new CountBadge(countContainer, { countFormat: localize({ key: 'quickInput.countSelected', comment: ['This tells the user how many items are selected in a list of items to select from. The items can be anything.'] }, "{0} Selected") }, this.styles.countBadge));
        const inlineActionBar = this._register(new ToolBar(headerContainer, this.contextMenuService, {
            hoverDelegate: this.options.hoverDelegate,
            actionViewItemProvider: createToggleActionViewItemProvider(this.styles.toggle),
            icon: true,
            label: false
        }));
        inlineActionBar.getElement().classList.add('quick-input-inline-action-bar');
        const okContainer = dom.append(headerContainer, $('.quick-input-action'));
        const ok = this._register(new Button(okContainer, this.styles.button));
        ok.label = localize('ok', "OK");
        this._register(ok.onDidClick(e => {
            this.onDidAcceptEmitter.fire();
        }));
        const customButtonContainer = dom.append(headerContainer, $('.quick-input-action'));
        const customButton = this._register(new Button(customButtonContainer, { ...this.styles.button, supportIcons: true }));
        customButton.label = localize('custom', "Custom");
        this._register(customButton.onDidClick(e => {
            this.onDidCustomEmitter.fire();
        }));
        const message = dom.append(inputContainer, $(`#${this.idPrefix}message.quick-input-message`));
        const progressBar = this._register(new ProgressBar(container, this.styles.progressBar));
        progressBar.getContainer().classList.add('quick-input-progress');
        const widget = dom.append(container, $('.quick-input-html-widget'));
        widget.tabIndex = -1;
        const description1 = dom.append(container, $('.quick-input-description'));
        // List
        const listId = this.idPrefix + 'list';
        const list = this._register(this.instantiationService.createInstance(QuickInputList, container, this.options.hoverDelegate, this.options.linkOpenerDelegate, listId, this.styles));
        inputBox.setAttribute('aria-controls', listId);
        this._register(list.onDidChangeFocus(() => {
            if (inputBox.hasFocus()) {
                const activeDescendant = list.getActiveDescendant();
                if (activeDescendant) {
                    inputBox.setAttribute('aria-activedescendant', activeDescendant);
                    inputBox.setListFocusMode(true);
                }
                else {
                    inputBox.removeAttribute('aria-activedescendant');
                    inputBox.setListFocusMode(false);
                }
            }
        }));
        this._register(list.onChangedAllVisibleChecked(checked => {
            // TODO: Support tri-state checkbox when we remove the .indent property that is faking tree structure.
            checkAll.checked = checked;
        }));
        this._register(list.onChangedVisibleCount(c => {
            visibleCount.setCount(c);
        }));
        this._register(list.onChangedCheckedCount(c => {
            // TODO@TylerLeonhardt: Without this setTimeout, the screen reader will not read out
            // the final count of checked items correctly. Investigate a better way
            // to do this. ref https://github.com/microsoft/vscode/issues/258617
            setTimeout0(() => count.setCount(c));
        }));
        this._register(list.onLeave(() => {
            // Defer to avoid the input field reacting to the triggering key.
            // TODO@TylerLeonhardt https://github.com/microsoft/vscode/issues/203675
            setTimeout(() => {
                if (!this.controller) {
                    return;
                }
                inputBox.setFocus();
                if (this.controller instanceof QuickPick && this.controller.canSelectMany) {
                    list.clearFocus();
                }
            }, 0);
        }));
        // Tree
        const tree = this._register(this.instantiationService.createInstance(QuickInputTreeController, container, this.options.hoverDelegate, this.styles));
        this._register(tree.tree.onDidChangeFocus(() => {
            if (inputBox.hasFocus()) {
                const activeDescendant = tree.getActiveDescendant();
                if (activeDescendant) {
                    inputBox.setAttribute('aria-activedescendant', activeDescendant);
                    inputBox.setListFocusMode(true);
                }
                else {
                    inputBox.removeAttribute('aria-activedescendant');
                    inputBox.setListFocusMode(false);
                }
            }
        }));
        this._register(tree.onLeave(() => {
            // Defer to avoid the input field reacting to the triggering key.
            // TODO@TylerLeonhardt https://github.com/microsoft/vscode/issues/203675
            setTimeout(() => {
                if (!this.controller) {
                    return;
                }
                inputBox.setFocus();
                tree.tree.setFocus([]);
            }, 0);
        }));
        // Wire up tree's accept event to the UI's accept emitter for non-pickable items
        this._register(tree.onDidAccept(() => {
            this.onDidAcceptEmitter.fire();
        }));
        this._register(tree.tree.onDidChangeContentHeight(() => this.updateLayout()));
        const focusTracker = dom.trackFocus(container);
        this._register(focusTracker);
        this._register(dom.addDisposableListener(container, dom.EventType.FOCUS, e => {
            const ui = this.getUI();
            if (dom.isAncestor(e.relatedTarget, ui.inputContainer)) {
                const value = ui.inputBox.isSelectionAtEnd();
                if (this.endOfQuickInputBoxContext.get() !== value) {
                    this.endOfQuickInputBoxContext.set(value);
                }
            }
            // Ignore focus events within container
            if (dom.isAncestor(e.relatedTarget, ui.container)) {
                return;
            }
            this.inQuickInputContext.set(true);
            this.previousFocusElement = dom.isHTMLElement(e.relatedTarget) ? e.relatedTarget : undefined;
        }, true));
        this._register(focusTracker.onDidBlur(() => {
            if (!this.getUI().ignoreFocusOut && !this.options.ignoreFocusOut()) {
                this.hide(QuickInputHideReason.Blur);
            }
            this.inQuickInputContext.set(false);
            this.endOfQuickInputBoxContext.set(false);
            this.previousFocusElement = undefined;
        }));
        this._register(inputBox.onKeyDown(e => {
            const value = this.getUI().inputBox.isSelectionAtEnd();
            if (this.endOfQuickInputBoxContext.get() !== value) {
                this.endOfQuickInputBoxContext.set(value);
            }
            // Allow screen readers to read what's in the input
            // Note: this works for arrow keys and selection changes,
            // but not for deletions since that often triggers a
            // change in the list.
            // Don't remove aria-activedescendant when only modifier keys are pressed
            // to prevent screen reader re-announcements when users press Ctrl to silence speech.
            // See: https://github.com/microsoft/vscode/issues/271032
            if (!isModifierKey(e.keyCode)) {
                inputBox.removeAttribute('aria-activedescendant');
                // Reset ARIA popup mode to allow normal text editing with arrow keys
                inputBox.setListFocusMode(false);
            }
        }));
        this._register(dom.addDisposableListener(container, dom.EventType.FOCUS, (e) => {
            inputBox.setFocus();
        }));
        // Drag and Drop support
        this.dndController = this._register(this.instantiationService.createInstance(QuickInputDragAndDropController, this._container, container, [
            {
                node: titleBar,
                includeChildren: true,
                excludeNodes: [leftActionBar.getElement(), rightActionBar.getElement()]
            },
            {
                node: headerContainer,
                includeChildren: false
            }
        ], this.viewState));
        // DnD update layout
        this._register(autorun(reader => {
            const dndViewState = this.dndController?.dndViewState.read(reader);
            if (!dndViewState) {
                return;
            }
            if (dndViewState.top !== undefined && dndViewState.left !== undefined) {
                this.viewState = {
                    ...this.viewState,
                    top: dndViewState.top,
                    left: dndViewState.left
                };
            }
            else {
                // Reset position/size
                this.viewState = undefined;
            }
            this.updateLayout();
            // Save position
            if (dndViewState.done) {
                this.saveViewState(this.viewState);
            }
        }));
        // Mirror DnD alignment into the stable observable
        this._register(autorun(reader => {
            this._alignment.set(this.dndController.alignment.read(reader), undefined);
        }));
        this.ui = {
            container,
            styleSheet,
            leftActionBar,
            titleBar,
            title,
            description1,
            description2,
            widget,
            rightActionBar,
            inlineActionBar,
            checkAll,
            inputContainer,
            filterContainer,
            inputBox,
            visibleCountContainer,
            visibleCount,
            countContainer,
            count,
            okContainer,
            ok,
            message,
            customButtonContainer,
            customButton,
            list,
            tree,
            progressBar,
            onDidAccept: this.onDidAcceptEmitter.event,
            onDidCustom: this.onDidCustomEmitter.event,
            onDidTriggerButton: this.onDidTriggerButtonEmitter.event,
            ignoreFocusOut: false,
            keyMods: this.keyMods,
            show: controller => this.show(controller),
            hide: () => this.hide(),
            setVisibilities: visibilities => this.setVisibilities(visibilities),
            setEnabled: enabled => this.setEnabled(enabled),
            setContextKey: contextKey => this.options.setContextKey(contextKey),
            linkOpenerDelegate: content => this.options.linkOpenerDelegate(content)
        };
        this.updateStyles();
        return this.ui;
    }
    reparentUI(container) {
        if (this.ui) {
            this._container = container;
            dom.append(this._container, this.ui.container);
            this.dndController?.reparentUI(this._container);
        }
    }
    pick(picks, options = {}, token = CancellationToken.None) {
        return new Promise((doResolve, reject) => {
            let resolve = (result) => {
                resolve = doResolve;
                options.onKeyMods?.(input.keyMods);
                doResolve(result);
            };
            if (token.isCancellationRequested) {
                resolve(undefined);
                return;
            }
            const input = this.createQuickPick({ useSeparators: true });
            let activeItem;
            const disposables = [
                input,
                input.onDidAccept(() => {
                    if (input.canSelectMany) {
                        resolve(input.selectedItems.slice());
                        input.hide();
                    }
                    else {
                        const result = input.activeItems[0];
                        if (result) {
                            resolve(result);
                            input.hide();
                        }
                    }
                }),
                input.onDidChangeActive(items => {
                    const focused = items[0];
                    if (focused && options.onDidFocus) {
                        options.onDidFocus(focused);
                    }
                }),
                input.onDidChangeSelection(items => {
                    if (!input.canSelectMany) {
                        const result = items[0];
                        if (result) {
                            resolve(result);
                            input.hide();
                        }
                    }
                }),
                input.onDidTriggerItemButton(event => options.onDidTriggerItemButton && options.onDidTriggerItemButton({
                    ...event,
                    removeItem: () => {
                        const index = input.items.indexOf(event.item);
                        if (index !== -1) {
                            const items = input.items.slice();
                            const removed = items.splice(index, 1);
                            const activeItems = input.activeItems.filter(activeItem => activeItem !== removed[0]);
                            const keepScrollPositionBefore = input.keepScrollPosition;
                            input.keepScrollPosition = true;
                            input.items = items;
                            if (activeItems) {
                                input.activeItems = activeItems;
                            }
                            input.keepScrollPosition = keepScrollPositionBefore;
                        }
                    }
                })),
                input.onDidTriggerSeparatorButton(event => options.onDidTriggerSeparatorButton?.(event)),
                input.onDidChangeValue(value => {
                    if (activeItem && !value && (input.activeItems.length !== 1 || input.activeItems[0] !== activeItem)) {
                        input.activeItems = [activeItem];
                    }
                }),
                token.onCancellationRequested(() => {
                    input.hide();
                }),
                input.onDidHide(() => {
                    dispose(disposables);
                    resolve(undefined);
                }),
            ];
            input.title = options.title;
            if (options.value) {
                input.value = options.value;
            }
            input.canSelectMany = !!options.canPickMany;
            input.placeholder = options.placeHolder;
            input.prompt = options.prompt;
            input.ignoreFocusOut = !!options.ignoreFocusLost;
            input.matchOnDescription = !!options.matchOnDescription;
            input.matchOnDetail = !!options.matchOnDetail;
            if (options.sortByLabel !== undefined) {
                input.sortByLabel = options.sortByLabel;
            }
            input.matchOnLabel = (options.matchOnLabel === undefined) || options.matchOnLabel; // default to true
            input.quickNavigate = options.quickNavigate;
            input.hideInput = !!options.hideInput;
            input.contextKey = options.contextKey;
            input.anchor = options.anchor;
            input.busy = true;
            Promise.all([picks, options.activeItem])
                .then(([items, _activeItem]) => {
                activeItem = _activeItem;
                input.busy = false;
                input.items = items;
                if (input.canSelectMany) {
                    input.selectedItems = items.filter(item => item.type !== 'separator' && item.picked);
                }
                if (activeItem) {
                    input.activeItems = [activeItem];
                }
            });
            input.show();
            Promise.resolve(picks).then(undefined, err => {
                reject(err);
                input.hide();
            });
        });
    }
    setValidationOnInput(input, validationResult) {
        if (validationResult && isString(validationResult)) {
            input.severity = Severity.Error;
            input.validationMessage = validationResult;
        }
        else if (validationResult && !isString(validationResult)) {
            input.severity = validationResult.severity;
            input.validationMessage = validationResult.content;
        }
        else {
            input.severity = Severity.Ignore;
            input.validationMessage = undefined;
        }
    }
    input(options = {}, token = CancellationToken.None) {
        return new Promise((resolve) => {
            if (token.isCancellationRequested) {
                resolve(undefined);
                return;
            }
            const input = this.createInputBox();
            const validateInput = options.validateInput || (() => Promise.resolve(undefined));
            const onDidValueChange = Event.debounce(input.onDidChangeValue, (last, cur) => cur, 100);
            let validationValue = options.value || '';
            let validation = Promise.resolve(validateInput(validationValue));
            const disposables = [
                input,
                onDidValueChange(value => {
                    if (value !== validationValue) {
                        validation = Promise.resolve(validateInput(value));
                        validationValue = value;
                    }
                    validation.then(result => {
                        if (value === validationValue) {
                            this.setValidationOnInput(input, result);
                        }
                    });
                }),
                input.onDidAccept(() => {
                    const value = input.value;
                    if (value !== validationValue) {
                        validation = Promise.resolve(validateInput(value));
                        validationValue = value;
                    }
                    validation.then(result => {
                        if (!result || (!isString(result) && result.severity !== Severity.Error)) {
                            resolve(value);
                            input.hide();
                        }
                        else if (value === validationValue) {
                            this.setValidationOnInput(input, result);
                        }
                    });
                }),
                token.onCancellationRequested(() => {
                    input.hide();
                }),
                input.onDidHide(() => {
                    dispose(disposables);
                    resolve(undefined);
                }),
            ];
            input.title = options.title;
            input.value = options.value || '';
            input.valueSelection = options.valueSelection;
            input.prompt = options.prompt;
            input.placeholder = options.placeHolder;
            input.password = !!options.password;
            input.ignoreFocusOut = !!options.ignoreFocusLost;
            input.show();
        });
    }
    createQuickPick(options = { useSeparators: false }) {
        const ui = this.getUI(true);
        return new QuickPick(ui);
    }
    createInputBox() {
        const ui = this.getUI(true);
        return new InputBox(ui);
    }
    setAlignment(alignment) {
        if (this.controller?.anchor) {
            return; // anchored inputs own their own positioning
        }
        this.dndController?.setAlignment(alignment);
    }
    createQuickWidget() {
        const ui = this.getUI(true);
        return new QuickWidget(ui);
    }
    createQuickTree() {
        const ui = this.getUI(true);
        return new QuickTree(ui);
    }
    show(controller) {
        const ui = this.getUI(true);
        const oldController = this.controller;
        this.controller = controller;
        oldController?.didHide();
        this.setEnabled(true);
        ui.leftActionBar.setActions([]);
        ui.title.textContent = '';
        ui.description1.textContent = '';
        ui.description2.textContent = '';
        dom.reset(ui.widget);
        ui.rightActionBar.setActions([]);
        ui.inlineActionBar.setActions([]);
        ui.checkAll.checked = false;
        // ui.inputBox.value = ''; Avoid triggering an event.
        ui.inputBox.placeholder = '';
        ui.inputBox.password = false;
        ui.inputBox.showDecoration(Severity.Ignore);
        ui.visibleCount.setCount(0);
        ui.count.setCount(0);
        ui.countContainer.style.right = '4px';
        dom.reset(ui.message);
        ui.progressBar.stop();
        ui.progressBar.getContainer().setAttribute('aria-hidden', 'true');
        ui.list.setElements([]);
        ui.list.matchOnDescription = false;
        ui.list.matchOnDetail = false;
        ui.list.matchOnLabel = true;
        ui.list.sortByLabel = true;
        ui.tree.updateFilterOptions({
            matchOnDescription: false,
            matchOnLabel: true
        });
        ui.tree.sortByLabel = true;
        ui.ignoreFocusOut = false;
        ui.inputBox.toggles = undefined;
        ui.inputBox.actions = undefined;
        const backKeybindingLabel = this.options.backKeybindingLabel();
        backButton.tooltip = backKeybindingLabel ? localize('quickInput.backWithKeybinding', "Back ({0})", backKeybindingLabel) : localize('quickInput.back', "Back");
        ui.container.style.display = '';
        this.updateLayout();
        this.dndController?.setEnabled(!controller.anchor);
        this.dndController?.layoutContainer();
        if (controller.anchor) {
            // Anchored quick inputs are positioned near a specific element, not
            // at the default top location, so report them as custom-positioned.
            this._alignment.set('custom', undefined);
        }
        else {
            // Re-sync from DnD in case a previous anchored input left us stale.
            this._alignment.set(this.dndController?.alignment.get() ?? 'top', undefined);
        }
        this.onShowEmitter.fire();
        ui.inputBox.setFocus();
        this.quickInputTypeContext.set(controller.type);
    }
    isVisible() {
        return !!this.ui && this.ui.container.style.display !== 'none';
    }
    setVisibilities(visibilities) {
        const ui = this.getUI();
        ui.title.style.display = visibilities.title ? '' : 'none';
        ui.description1.style.display = visibilities.description && (visibilities.inputBox || visibilities.checkAll) ? '' : 'none';
        ui.description2.style.display = visibilities.description && !(visibilities.inputBox || visibilities.checkAll) ? '' : 'none';
        ui.checkAll.domNode.style.display = visibilities.checkAll ? '' : 'none';
        ui.inputContainer.style.display = visibilities.inputBox ? '' : 'none';
        ui.filterContainer.style.display = visibilities.inputBox ? '' : 'none';
        ui.visibleCountContainer.style.display = visibilities.visibleCount ? '' : 'none';
        ui.countContainer.style.display = visibilities.count ? '' : 'none';
        ui.okContainer.style.display = visibilities.ok ? '' : 'none';
        ui.customButtonContainer.style.display = visibilities.customButton ? '' : 'none';
        ui.message.style.display = visibilities.message ? '' : 'none';
        ui.progressBar.getContainer().style.display = visibilities.progressBar ? '' : 'none';
        ui.list.displayed = !!visibilities.list;
        ui.tree.displayed = !!visibilities.tree;
        ui.container.classList.toggle('show-checkboxes', !!visibilities.checkBox);
        ui.container.classList.toggle('hidden-input', !visibilities.inputBox && !visibilities.description);
        this.updateLayout(); // TODO
    }
    setEnabled(enabled) {
        if (enabled !== this.enabled) {
            this.enabled = enabled;
            const ui = this.getUI();
            for (let i = 0; i < ui.leftActionBar.getItemsLength(); i++) {
                const action = ui.leftActionBar.getItemAction(i);
                if (action) {
                    action.enabled = enabled;
                }
            }
            for (let i = 0; i < ui.rightActionBar.getItemsLength(); i++) {
                const action = ui.rightActionBar.getItemAction(i);
                if (action) {
                    action.enabled = enabled;
                }
            }
            if (enabled) {
                ui.checkAll.enable();
            }
            else {
                ui.checkAll.disable();
            }
            ui.inputBox.enabled = enabled;
            ui.ok.enabled = enabled;
            ui.list.enabled = enabled;
        }
    }
    hide(reason) {
        const controller = this.controller;
        if (!controller) {
            return;
        }
        controller.willHide(reason);
        const container = this.ui?.container;
        const focusChanged = container && !dom.isAncestorOfActiveElement(container);
        this.controller = null;
        this.onHideEmitter.fire();
        if (container) {
            container.style.display = 'none';
        }
        if (!focusChanged) {
            let currentElement = this.previousFocusElement;
            while (currentElement && !currentElement.offsetParent) {
                currentElement = currentElement.parentElement ?? undefined;
            }
            if (currentElement?.offsetParent) {
                currentElement.focus();
                this.previousFocusElement = undefined;
            }
            else {
                this.options.returnFocus();
            }
        }
        controller.didHide(reason);
    }
    focus() {
        if (this.isVisible()) {
            const ui = this.getUI();
            if (ui.inputBox.enabled) {
                ui.inputBox.setFocus();
            }
            else {
                ui.list.domFocus();
            }
        }
    }
    toggle() {
        if (!this.isVisible()) {
            return;
        }
        if (this.controller instanceof QuickPick && this.controller.canSelectMany) {
            this.getUI().list.toggleCheckbox();
        }
        else if (this.controller instanceof QuickTree) {
            this.getUI().tree.toggleCheckbox();
        }
    }
    toggleHover() {
        if (this.isVisible() && this.controller instanceof QuickPick) {
            this.getUI().list.toggleHover();
        }
    }
    navigate(next, quickNavigate) {
        if (this.isVisible() && this.getUI().list.displayed) {
            this.getUI().list.focus(next ? QuickPickFocus.Next : QuickPickFocus.Previous);
            if (quickNavigate && this.controller instanceof QuickPick) {
                this.controller.quickNavigate = quickNavigate;
            }
        }
    }
    async accept(keyMods = { alt: false, ctrlCmd: false, shift: false }) {
        // When accepting the item programmatically, it is important that
        // we update `keyMods` either from the provided set or unset it
        // because the accept did not happen from mouse or keyboard
        // interaction on the list itself
        this.keyMods.alt = keyMods.alt;
        this.keyMods.ctrlCmd = keyMods.ctrlCmd;
        this.keyMods.shift = keyMods.shift;
        this.onDidAcceptEmitter.fire();
    }
    async back() {
        this.onDidTriggerButtonEmitter.fire(this.backButton);
    }
    async cancel(reason) {
        this.hide(reason);
    }
    layout(dimension, titleBarOffset) {
        this.dimension = dimension;
        this.titleBarOffset = titleBarOffset;
        this.updateLayout();
    }
    updateLayout() {
        if (this.ui && this.isVisible()) {
            const style = this.ui.container.style;
            let width = Math.min(this.dimension.width * 0.62 /* golden cut */, QuickInputController_1.MAX_WIDTH);
            style.width = width + 'px';
            let listHeight = this.dimension && this.dimension.height * 0.4;
            // Position
            if (this.controller?.anchor) {
                const container = this.layoutService.getContainer(dom.getActiveWindow()).getBoundingClientRect();
                const anchor = getAnchorRect(this.controller.anchor);
                width = 380;
                listHeight = this.dimension ? Math.min(this.dimension.height * 0.2, 200) : 200;
                // Beware:
                // We need to add some extra pixels to the height to account for the input and padding.
                const containerHeight = Math.floor(listHeight) + 6 + 26 + 16;
                const { top, left, right, bottom, anchorAlignment, anchorPosition } = layout2d(container, { width, height: containerHeight }, anchor, { anchorPosition: 1 /* AnchorPosition.ABOVE */ });
                if (anchorAlignment === 1 /* AnchorAlignment.RIGHT */) {
                    style.right = `${right}px`;
                    style.left = 'initial';
                }
                else {
                    style.left = `${left}px`;
                    style.right = 'initial';
                }
                if (anchorPosition === 1 /* AnchorPosition.ABOVE */) {
                    style.bottom = `${bottom}px`;
                    style.top = 'initial';
                }
                else {
                    style.top = `${top}px`;
                    style.bottom = 'initial';
                }
                style.width = `${width}px`;
                style.height = '';
            }
            else {
                style.top = `${this.viewState?.top !== undefined ? Math.round(this.dimension.height * this.viewState.top) : this.titleBarOffset}px`;
                style.left = `${Math.round((this.dimension.width * (this.viewState?.left ?? 0.5 /* center */)) - (width / 2))}px`;
                style.right = '';
                style.bottom = '';
                style.height = '';
            }
            this.ui.inputBox.layout();
            this.ui.list.layout(listHeight);
            this.ui.tree.layout(listHeight);
        }
    }
    applyStyles(styles) {
        this.styles = styles;
        this.updateStyles();
    }
    updateStyles() {
        if (this.ui) {
            const { quickInputTitleBackground, quickInputBackground, quickInputForeground, widgetBorder, } = this.styles.widget;
            this.ui.titleBar.style.backgroundColor = quickInputTitleBackground ?? '';
            this.ui.container.style.backgroundColor = quickInputBackground ?? '';
            this.ui.container.style.color = quickInputForeground ?? '';
            this.ui.container.style.border = widgetBorder ? `1px solid ${widgetBorder}` : '';
            this.ui.list.style(this.styles.list);
            this.ui.tree.tree.style(this.styles.list);
            const content = [];
            if (this.styles.pickerGroup.pickerGroupBorder) {
                content.push(`.quick-input-list .quick-input-list-entry { border-top-color:  ${this.styles.pickerGroup.pickerGroupBorder}; }`);
            }
            if (this.styles.pickerGroup.pickerGroupForeground) {
                content.push(`.quick-input-list .quick-input-list-separator { color:  ${this.styles.pickerGroup.pickerGroupForeground}; }`);
            }
            if (this.styles.pickerGroup.pickerGroupForeground) {
                content.push(`.quick-input-list .quick-input-list-separator-as-item { color: var(--vscode-descriptionForeground); }`);
            }
            if (this.styles.keybindingLabel.keybindingLabelBackground ||
                this.styles.keybindingLabel.keybindingLabelBorder ||
                this.styles.keybindingLabel.keybindingLabelBottomBorder ||
                this.styles.keybindingLabel.keybindingLabelShadow ||
                this.styles.keybindingLabel.keybindingLabelForeground) {
                content.push('.quick-input-list .monaco-keybinding > .monaco-keybinding-key {');
                if (this.styles.keybindingLabel.keybindingLabelBackground) {
                    content.push(`background-color: ${this.styles.keybindingLabel.keybindingLabelBackground};`);
                }
                if (this.styles.keybindingLabel.keybindingLabelBorder) {
                    // Order matters here. `border-color` must come before `border-bottom-color`.
                    content.push(`border-color: ${this.styles.keybindingLabel.keybindingLabelBorder};`);
                }
                if (this.styles.keybindingLabel.keybindingLabelBottomBorder) {
                    content.push(`border-bottom-color: ${this.styles.keybindingLabel.keybindingLabelBottomBorder};`);
                }
                if (this.styles.keybindingLabel.keybindingLabelShadow) {
                    content.push(`box-shadow: inset 0 -1px 0 ${this.styles.keybindingLabel.keybindingLabelShadow};`);
                }
                if (this.styles.keybindingLabel.keybindingLabelForeground) {
                    content.push(`color: ${this.styles.keybindingLabel.keybindingLabelForeground};`);
                }
                content.push('}');
            }
            const newStyles = content.join('\n');
            if (newStyles !== this.ui.styleSheet.textContent) {
                this.ui.styleSheet.textContent = newStyles;
            }
        }
    }
    loadViewState() {
        try {
            const data = JSON.parse(this.storageService.get(VIEWSTATE_STORAGE_KEY, -1 /* StorageScope.APPLICATION */, '{}'));
            if (data.top !== undefined || data.left !== undefined) {
                return data;
            }
        }
        catch { }
        return undefined;
    }
    saveViewState(viewState) {
        const isMainWindow = this.layoutService.activeContainer === this.layoutService.mainContainer;
        if (!isMainWindow) {
            return;
        }
        if (viewState !== undefined) {
            this.storageService.store(VIEWSTATE_STORAGE_KEY, JSON.stringify(viewState), -1 /* StorageScope.APPLICATION */, 1 /* StorageTarget.MACHINE */);
        }
        else {
            this.storageService.remove(VIEWSTATE_STORAGE_KEY, -1 /* StorageScope.APPLICATION */);
        }
    }
};
QuickInputController = QuickInputController_1 = __decorate([
    __param(1, ILayoutService),
    __param(2, IInstantiationService),
    __param(3, IContextKeyService),
    __param(4, IStorageService),
    __param(5, IContextMenuService)
], QuickInputController);
export { QuickInputController };
let QuickInputDragAndDropController = class QuickInputDragAndDropController extends Disposable {
    constructor(_container, _quickInputContainer, _quickInputDragAreas, initialViewState, _layoutService, contextKeyService, configurationService) {
        super();
        this._container = _container;
        this._quickInputContainer = _quickInputContainer;
        this._quickInputDragAreas = _quickInputDragAreas;
        this._layoutService = _layoutService;
        this.configurationService = configurationService;
        this.dndViewState = observableValue(this, undefined);
        this._enabled = true;
        this._snapThreshold = 20;
        this._snapLineHorizontalRatio = 0.25;
        this._alignment = observableValue(this, 'top');
        this.alignment = this._alignment;
        this._quickInputAlignmentContext = QuickInputAlignmentContextKey.bindTo(contextKeyService);
        const customWindowControls = getWindowControlsStyle(this.configurationService) === "custom" /* WindowControlsStyle.CUSTOM */;
        // Do not allow the widget to overflow or underflow window controls.
        // Use CSS calculations to avoid having to force layout with `.clientWidth`
        this._controlsOnLeft = customWindowControls && platform === 1 /* Platform.Mac */;
        this._controlsOnRight = customWindowControls && (platform === 3 /* Platform.Windows */ || platform === 2 /* Platform.Linux */);
        this._registerLayoutListener();
        this.registerMouseListeners();
        this.dndViewState.set({ ...initialViewState, done: true }, undefined);
        // Initialize alignment from restored state. The exact snap alignment will
        // be refined in layoutContainer() once pixel dimensions are available.
        if (initialViewState?.top !== undefined && initialViewState?.left !== undefined) {
            this._setAlignmentState(undefined);
        }
    }
    reparentUI(container) {
        this._container = container;
    }
    layoutContainer(dimension = this._layoutService.activeContainerDimension) {
        if (!this._enabled) {
            return;
        }
        const state = this.dndViewState.get();
        const dragAreaRect = this._quickInputContainer.getBoundingClientRect();
        if (state?.top !== undefined && state?.left !== undefined) {
            const a = Math.round(state.left * 1e2) / 1e2;
            const b = dimension.width;
            const c = dragAreaRect.width;
            const d = a * b - c / 2;
            this._layout(state.top * dimension.height, d);
        }
    }
    setEnabled(enabled) {
        this._enabled = enabled;
        this._quickInputContainer.classList.toggle('no-drag', !enabled);
    }
    _setAlignmentState(value) {
        this._quickInputAlignmentContext.set(value);
        this._alignment.set(value ?? 'custom', undefined);
    }
    setAlignment(alignment, done = true) {
        if (alignment === 'top') {
            this.dndViewState.set({
                top: this._getTopSnapValue() / this._container.clientHeight,
                left: (this._getCenterXSnapValue() + (this._quickInputContainer.clientWidth / 2)) / this._container.clientWidth,
                done
            }, undefined);
            this._setAlignmentState('top');
        }
        else if (alignment === 'center') {
            this.dndViewState.set({
                top: this._getCenterYSnapValue() / this._container.clientHeight,
                left: (this._getCenterXSnapValue() + (this._quickInputContainer.clientWidth / 2)) / this._container.clientWidth,
                done
            }, undefined);
            this._setAlignmentState('center');
        }
        else {
            this.dndViewState.set({ top: alignment.top, left: alignment.left, done }, undefined);
            this._setAlignmentState(undefined);
        }
    }
    _registerLayoutListener() {
        this._register(Event.filter(this._layoutService.onDidLayoutContainer, e => e.container === this._container)((e) => this.layoutContainer(e.dimension)));
    }
    registerMouseListeners() {
        const dragArea = this._quickInputContainer;
        // Double click
        this._register(dom.addDisposableGenericMouseUpListener(dragArea, (event) => {
            if (!this._enabled) {
                return;
            }
            const originEvent = new StandardMouseEvent(dom.getWindow(dragArea), event);
            if (originEvent.detail !== 2) {
                return;
            }
            // Ignore event if the target is not the drag area
            const area = this._quickInputDragAreas.find(({ node, includeChildren }) => includeChildren ? dom.isAncestor(originEvent.target, node) : originEvent.target === node);
            if (!area || area.excludeNodes?.some(node => dom.isAncestor(originEvent.target, node))) {
                return;
            }
            this.dndViewState.set({ top: undefined, left: undefined, done: true }, undefined);
            this._setAlignmentState('top');
        }));
        // Mouse down
        this._register(dom.addDisposableGenericMouseDownListener(dragArea, (e) => {
            if (!this._enabled) {
                return;
            }
            const activeWindow = dom.getWindow(this._layoutService.activeContainer);
            const originEvent = new StandardMouseEvent(activeWindow, e);
            // Ignore event if the target is not the drag area
            const area = this._quickInputDragAreas.find(({ node, includeChildren }) => includeChildren ? dom.isAncestor(originEvent.target, node) : originEvent.target === node);
            if (!area || area.excludeNodes?.some(node => dom.isAncestor(originEvent.target, node))) {
                return;
            }
            // Mouse position offset relative to dragArea
            const dragAreaRect = this._quickInputContainer.getBoundingClientRect();
            const dragOffsetX = originEvent.browserEvent.clientX - dragAreaRect.left;
            const dragOffsetY = originEvent.browserEvent.clientY - dragAreaRect.top;
            let isMovingQuickInput = false;
            const mouseMoveListener = dom.addDisposableGenericMouseMoveListener(activeWindow, (e) => {
                const mouseMoveEvent = new StandardMouseEvent(activeWindow, e);
                mouseMoveEvent.preventDefault();
                if (!isMovingQuickInput) {
                    isMovingQuickInput = true;
                }
                this._layout(e.clientY - dragOffsetY, e.clientX - dragOffsetX);
            });
            const mouseUpListener = dom.addDisposableGenericMouseUpListener(activeWindow, (e) => {
                if (isMovingQuickInput) {
                    // Save position
                    const state = this.dndViewState.get();
                    this.dndViewState.set({ top: state?.top, left: state?.left, done: true }, undefined);
                }
                // Dispose listeners
                mouseMoveListener.dispose();
                mouseUpListener.dispose();
            });
        }));
    }
    _layout(topCoordinate, leftCoordinate) {
        const snapCoordinateYTop = this._getTopSnapValue();
        const snapCoordinateY = this._getCenterYSnapValue();
        const snapCoordinateX = this._getCenterXSnapValue();
        // Make sure the quick input is not moved outside the container
        topCoordinate = Math.max(0, Math.min(topCoordinate, this._container.clientHeight - this._quickInputContainer.clientHeight));
        if (topCoordinate < this._layoutService.activeContainerOffset.top) {
            if (this._controlsOnLeft) {
                leftCoordinate = Math.max(leftCoordinate, 80 / getZoomFactor(dom.getActiveWindow()));
            }
            else if (this._controlsOnRight) {
                leftCoordinate = Math.min(leftCoordinate, this._container.clientWidth - this._quickInputContainer.clientWidth - (140 / getZoomFactor(dom.getActiveWindow())));
            }
        }
        const snappingToTop = Math.abs(topCoordinate - snapCoordinateYTop) < this._snapThreshold;
        topCoordinate = snappingToTop ? snapCoordinateYTop : topCoordinate;
        const snappingToCenter = Math.abs(topCoordinate - snapCoordinateY) < this._snapThreshold;
        topCoordinate = snappingToCenter ? snapCoordinateY : topCoordinate;
        const top = topCoordinate / this._container.clientHeight;
        // Make sure the quick input is not moved outside the container
        leftCoordinate = Math.max(0, Math.min(leftCoordinate, this._container.clientWidth - this._quickInputContainer.clientWidth));
        const snappingToCenterX = Math.abs(leftCoordinate - snapCoordinateX) < this._snapThreshold;
        leftCoordinate = snappingToCenterX ? snapCoordinateX : leftCoordinate;
        const b = this._container.clientWidth;
        const c = this._quickInputContainer.clientWidth;
        const d = leftCoordinate;
        const left = (d + c / 2) / b;
        this.dndViewState.set({ top, left, done: false }, undefined);
        if (snappingToCenterX) {
            if (snappingToTop) {
                this._setAlignmentState('top');
                return;
            }
            else if (snappingToCenter) {
                this._setAlignmentState('center');
                return;
            }
        }
        this._setAlignmentState(undefined);
    }
    _getTopSnapValue() {
        return this._layoutService.activeContainerOffset.quickPickTop;
    }
    _getCenterYSnapValue() {
        return Math.round(this._container.clientHeight * this._snapLineHorizontalRatio);
    }
    _getCenterXSnapValue() {
        return Math.round(this._container.clientWidth / 2) - Math.round(this._quickInputContainer.clientWidth / 2);
    }
};
QuickInputDragAndDropController = __decorate([
    __param(4, ILayoutService),
    __param(5, IContextKeyService),
    __param(6, IConfigurationService)
], QuickInputDragAndDropController);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicXVpY2tJbnB1dENvbnRyb2xsZXIuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9wbGF0Zm9ybS9xdWlja2lucHV0L2Jyb3dzZXIvcXVpY2tJbnB1dENvbnRyb2xsZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7O0FBRWhHLE9BQU8sS0FBSyxHQUFHLE1BQU0sOEJBQThCLENBQUM7QUFDcEQsT0FBTyxLQUFLLGdCQUFnQixNQUFNLHlDQUF5QyxDQUFDO0FBQzVFLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSw2Q0FBNkMsQ0FBQztBQUN0RSxPQUFPLEVBQUUsTUFBTSxFQUFFLE1BQU0sMkNBQTJDLENBQUM7QUFDbkUsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLG1EQUFtRCxDQUFDO0FBQy9FLE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSxxREFBcUQsQ0FBQztBQUNsRixPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUN6RSxPQUFPLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLCtCQUErQixDQUFDO0FBQy9ELE9BQU8sRUFBRSxVQUFVLEVBQW1CLE9BQU8sRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQ3pGLE9BQU8sUUFBUSxNQUFNLGtDQUFrQyxDQUFDO0FBQ3hELE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSwrQkFBK0IsQ0FBQztBQUN6RCxPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDakUsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLGlCQUFpQixDQUFDO0FBQzNDLE9BQU8sRUFBMkosb0JBQW9CLEVBQWtCLGNBQWMsRUFBbUUsTUFBTSx5QkFBeUIsQ0FBQztBQUN6VCxPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0sb0JBQW9CLENBQUM7QUFDbkQsT0FBTyxFQUFrRSxT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