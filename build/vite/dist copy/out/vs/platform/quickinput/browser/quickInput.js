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
import * as dom from '../../../base/browser/dom.js';
import { StandardKeyboardEvent } from '../../../base/browser/keyboardEvent.js';
import { equals } from '../../../base/common/arrays.js';
import { TimeoutTimer } from '../../../base/common/async.js';
import { Codicon } from '../../../base/common/codicons.js';
import { Emitter, EventBufferer } from '../../../base/common/event.js';
import { Disposable, DisposableStore } from '../../../base/common/lifecycle.js';
import { isIOS } from '../../../base/common/platform.js';
import Severity from '../../../base/common/severity.js';
import { ThemeIcon } from '../../../base/common/themables.js';
import './media/quickInput.css';
import { localize } from '../../../nls.js';
import { ItemActivation, NO_KEY_MODS, QuickInputButtonLocation, QuickInputHideReason, QuickPickFocus } from '../common/quickInput.js';
import { quickInputButtonToAction, quickInputButtonsToActionArrays, renderQuickInputDescription } from './quickInputUtils.js';
import { IConfigurationService } from '../../configuration/common/configuration.js';
import { IHoverService, WorkbenchHoverDelegate } from '../../hover/browser/hover.js';
import { ContextKeyExpr, RawContextKey } from '../../contextkey/common/contextkey.js';
import { observableValue } from '../../../base/common/observable.js';
export const inQuickInputContextKeyValue = 'inQuickInput';
export const InQuickInputContextKey = new RawContextKey(inQuickInputContextKeyValue, false, localize('inQuickInput', "Whether keyboard focus is inside the quick input control"));
export const inQuickInputContext = ContextKeyExpr.has(inQuickInputContextKeyValue);
export const quickInputAlignmentContextKeyValue = 'quickInputAlignment';
export const QuickInputAlignmentContextKey = new RawContextKey(quickInputAlignmentContextKeyValue, 'top', localize('quickInputAlignment', "The alignment of the quick input"));
export const quickInputTypeContextKeyValue = 'quickInputType';
export const QuickInputTypeContextKey = new RawContextKey(quickInputTypeContextKeyValue, undefined, localize('quickInputType', "The type of the currently visible quick input"));
export const endOfQuickInputBoxContextKeyValue = 'cursorAtEndOfQuickInputBox';
export const EndOfQuickInputBoxContextKey = new RawContextKey(endOfQuickInputBoxContextKeyValue, false, localize('cursorAtEndOfQuickInputBox', "Whether the cursor in the quick input is at the end of the input box"));
export const endOfQuickInputBoxContext = ContextKeyExpr.has(endOfQuickInputBoxContextKeyValue);
export const backButton = {
    iconClass: ThemeIcon.asClassName(Codicon.quickInputBack),
    tooltip: localize('quickInput.back', "Back"),
    handle: -1 // TODO
};
export class QuickInput extends Disposable {
    static { this.noPromptMessage = localize('inputModeEntry', "Press 'Enter' to confirm your input or 'Escape' to cancel"); }
    constructor(ui) {
        super();
        this.ui = ui;
        this._visible = observableValue('visible', false);
        this._enabled = true;
        this._busy = false;
        this._ignoreFocusOut = false;
        this._leftButtons = [];
        this._rightButtons = [];
        this._inlineButtons = [];
        this._inputButtons = [];
        this.buttonsUpdated = false;
        this.noValidationMessage = QuickInput.noPromptMessage;
        this._severity = Severity.Ignore;
        this.onDidTriggerButtonEmitter = this._register(new Emitter());
        this.onDidHideEmitter = this._register(new Emitter());
        this.onWillHideEmitter = this._register(new Emitter());
        this.onDisposeEmitter = this._register(new Emitter());
        this.visibleDisposables = this._register(new DisposableStore());
        this.onDidTriggerButton = this.onDidTriggerButtonEmitter.event;
        this.onDidHide = this.onDidHideEmitter.event;
        this.onWillHide = this.onWillHideEmitter.event;
        this.onDispose = this.onDisposeEmitter.event;
    }
    get visible() {
        return this._visible.get();
    }
    get title() {
        return this._title;
    }
    set title(title) {
        this._title = title;
        this.update();
    }
    get description() {
        return this._description;
    }
    set description(description) {
        this._description = description;
        this.update();
    }
    get step() {
        return this._steps;
    }
    set step(step) {
        this._steps = step;
        this.update();
    }
    get totalSteps() {
        return this._totalSteps;
    }
    set totalSteps(totalSteps) {
        this._totalSteps = totalSteps;
        this.update();
    }
    get enabled() {
        return this._enabled;
    }
    set enabled(enabled) {
        this._enabled = enabled;
        this.update();
    }
    get contextKey() {
        return this._contextKey;
    }
    set contextKey(contextKey) {
        this._contextKey = contextKey;
        this.update();
    }
    get busy() {
        return this._busy;
    }
    set busy(busy) {
        this._busy = busy;
        this.update();
    }
    get ignoreFocusOut() {
        return this._ignoreFocusOut;
    }
    set ignoreFocusOut(ignoreFocusOut) {
        const shouldUpdate = this._ignoreFocusOut !== ignoreFocusOut && !isIOS;
        this._ignoreFocusOut = ignoreFocusOut && !isIOS;
        if (shouldUpdate) {
            this.update();
        }
    }
    get titleButtons() {
        return this._leftButtons.length
            ? [...this._leftButtons, this._rightButtons]
            : this._rightButtons;
    }
    get buttons() {
        return [
            ...this._leftButtons,
            ...this._rightButtons,
            ...this._inlineButtons,
            ...this._inputButtons
        ];
    }
    set buttons(buttons) {
        const leftButtons = [];
        const rightButtons = [];
        const inlineButtons = [];
        const inputButtons = [];
        for (const button of buttons) {
            if (button === backButton) {
                leftButtons.push(button);
            }
            else {
                switch (button.location) {
                    case QuickInputButtonLocation.Inline:
                        inlineButtons.push(button);
                        break;
                    case QuickInputButtonLocation.Input:
                        inputButtons.push(button);
                        break;
                    default:
                        rightButtons.push(button);
                        break;
                }
            }
        }
        this._leftButtons = leftButtons;
        this._rightButtons = rightButtons;
        this._inlineButtons = inlineButtons;
        this._inputButtons = inputButtons;
        this.buttonsUpdated = true;
        this.update();
    }
    get validationMessage() {
        return this._validationMessage;
    }
    set validationMessage(validationMessage) {
        this._validationMessage = validationMessage;
        this.update();
    }
    get severity() {
        return this._severity;
    }
    set severity(severity) {
        this._severity = severity;
        this.update();
    }
    show() {
        if (this.visible) {
            return;
        }
        this.visibleDisposables.add(this.ui.onDidTriggerButton(button => {
            if (this.buttons.indexOf(button) !== -1) {
                this.onDidTriggerButtonEmitter.fire(button);
            }
        }));
        this.ui.show(this);
        // update properties in the controller that get reset in the ui.show() call
        this._visible.set(true, undefined);
        // This ensures the message/prompt gets rendered
        this._lastValidationMessage = undefined;
        // This ensures the input box has the right severity applied
        this._lastSeverity = undefined;
        if (this.buttons.length) {
            // if there are buttons, the ui.show() clears them out of the UI so we should
            // rerender them.
            this.buttonsUpdated = true;
        }
        this.update();
    }
    hide() {
        if (!this.visible) {
            return;
        }
        this.ui.hide();
    }
    didHide(reason = QuickInputHideReason.Other) {
        this._visible.set(false, undefined);
        this.visibleDisposables.clear();
        this.onDidHideEmitter.fire({ reason });
    }
    willHide(reason = QuickInputHideReason.Other) {
        this.onWillHideEmitter.fire({ reason });
    }
    update() {
        if (!this.visible) {
            return;
        }
        const title = this.getTitle();
        if (title && this.ui.title.textContent !== title) {
            this.ui.title.textContent = title;
        }
        else if (!title && this.ui.title.innerHTML !== '&nbsp;') {
            this.ui.title.innerText = '\u00a0';
        }
        const description = this.getDescription();
        if (this.ui.description1.textContent !== description) {
            this.ui.description1.textContent = description;
        }
        if (this.ui.description2.textContent !== description) {
            this.ui.description2.textContent = description;
        }
        if (this.busy && !this.busyDelay) {
            this.busyDelay = new TimeoutTimer();
            this.busyDelay.setIfNotSet(() => {
                if (this.visible) {
                    this.ui.progressBar.infinite();
                    this.ui.progressBar.getContainer().removeAttribute('aria-hidden');
                }
            }, 800);
        }
        if (!this.busy && this.busyDelay) {
            this.ui.progressBar.stop();
            this.ui.progressBar.getContainer().setAttribute('aria-hidden', 'true');
            this.busyDelay.cancel();
            this.busyDelay = undefined;
        }
        if (this.buttonsUpdated) {
            this.buttonsUpdated = false;
            const leftActions = quickInputButtonsToActionArrays(this._leftButtons, 'left-button', (button) => this.onDidTriggerButtonEmitter.fire(button));
            this.ui.leftActionBar.setActions(leftActions.primary, leftActions.secondary);
            const rightActions = quickInputButtonsToActionArrays(this._rightButtons, 'right-button', (button) => this.onDidTriggerButtonEmitter.fire(button));
            this.ui.rightActionBar.setActions(rightActions.primary, rightActions.secondary);
            const inlineActions = quickInputButtonsToActionArrays(this._inlineButtons, 'inline-button', (button) => this.onDidTriggerButtonEmitter.fire(button));
            this.ui.inlineActionBar.setActions(inlineActions.primary, inlineActions.secondary);
            // Adjust count badge position based on input buttons (each button/toggle is ~22px wide)
            const inputButtonOffset = this._inputButtons.length * 22;
            this.ui.countContainer.style.right = inputButtonOffset > 0 ? `${4 + inputButtonOffset}px` : '4px';
            this.ui.inputBox.actions = this._inputButtons
                .map((button, index) => quickInputButtonToAction(button, `id-${index}`, async () => this.onDidTriggerButtonEmitter.fire(button)));
        }
        this.ui.ignoreFocusOut = this.ignoreFocusOut;
        this.ui.setEnabled(this.enabled);
        this.ui.setContextKey(this.contextKey);
        const validationMessage = this.validationMessage || this.noValidationMessage;
        if (this._lastValidationMessage !== validationMessage) {
            this._lastValidationMessage = validationMessage;
            dom.reset(this.ui.message);
            if (validationMessage) {
                renderQuickInputDescription(validationMessage, this.ui.message, {
                    callback: (content) => {
                        this.ui.linkOpenerDelegate(content);
                    },
                    disposables: this.visibleDisposables,
                });
            }
        }
        if (this._lastSeverity !== this.severity) {
            this._lastSeverity = this.severity;
            this.showMessageDecoration(this.severity);
        }
    }
    getTitle() {
        if (this.title && this.step) {
            return `${this.title} (${this.getSteps()})`;
        }
        if (this.title) {
            return this.title;
        }
        if (this.step) {
            return this.getSteps();
        }
        return '';
    }
    getDescription() {
        return this.description || '';
    }
    getSteps() {
        if (this.step && this.totalSteps) {
            return localize('quickInput.steps', "{0}/{1}", this.step, this.totalSteps);
        }
        if (this.step) {
            return String(this.step);
        }
        return '';
    }
    showMessageDecoration(severity) {
        this.ui.inputBox.showDecoration(severity);
        if (severity !== Severity.Ignore) {
            const styles = this.ui.inputBox.stylesForType(severity);
            this.ui.message.style.color = styles.foreground ? `${styles.foreground}` : '';
            this.ui.message.style.backgroundColor = styles.background ? `${styles.background}` : '';
            this.ui.message.style.border = styles.border ? `1px solid ${styles.border}` : '';
            this.ui.message.style.marginBottom = '-2px';
        }
        else {
            this.ui.message.style.color = '';
            this.ui.message.style.backgroundColor = '';
            this.ui.message.style.border = '';
            this.ui.message.style.marginBottom = '';
        }
    }
    dispose() {
        this.hide();
        this.onDisposeEmitter.fire();
        super.dispose();
    }
}
export class QuickPick extends QuickInput {
    static { this.DEFAULT_ARIA_LABEL = localize('quickInputBox.ariaLabel', "Type to narrow down results."); }
    constructor(ui) {
        super(ui);
        this._value = '';
        this.onDidChangeValueEmitter = this._register(new Emitter());
        this.onWillAcceptEmitter = this._register(new Emitter());
        this.onDidAcceptEmitter = this._register(new Emitter());
        this.onDidCustomEmitter = this._register(new Emitter());
        this._items = [];
        this.itemsUpdated = false;
        this._canSelectMany = false;
        this._canAcceptInBackground = false;
        this._matchOnDescription = false;
        this._matchOnDetail = false;
        this._matchOnLabel = true;
        this._matchOnLabelMode = 'fuzzy';
        this._sortByLabel = true;
        this._keepScrollPosition = false;
        this._itemActivation = ItemActivation.FIRST;
        this._activeItems = [];
        this.activeItemsUpdated = false;
        this.activeItemsToConfirm = [];
        this.onDidChangeActiveEmitter = this._register(new Emitter());
        this._selectedItems = [];
        this.selectedItemsUpdated = false;
        this.selectedItemsToConfirm = [];
        this.onDidChangeSelectionEmitter = this._register(new Emitter());
        this.onDidTriggerItemButtonEmitter = this._register(new Emitter());
        this.onDidTriggerSeparatorButtonEmitter = this._register(new Emitter());
        this.valueSelectionUpdated = true;
        this._ok = 'default';
        this._customButton = false;
        this._customButtonSecondary = false;
        this._focusEventBufferer = new EventBufferer();
        this.type = "quickPick" /* QuickInputType.QuickPick */;
        this.filterValue = (value) => value;
        this.onDidChangeValue = this.onDidChangeValueEmitter.event;
        this.onWillAccept = this.onWillAcceptEmitter.event;
        this.onDidAccept = this.onDidAcceptEmitter.event;
        this.onDidCustom = this.onDidCustomEmitter.event;
        this.onDidChangeActive = this.onDidChangeActiveEmitter.event;
        this.onDidChangeSelection = this.onDidChangeSelectionEmitter.event;
        this.onDidTriggerItemButton = this.onDidTriggerItemButtonEmitter.event;
        this.onDidTriggerSeparatorButton = this.onDidTriggerSeparatorButtonEmitter.event;
        this.noValidationMessage = undefined;
    }
    get quickNavigate() {
        return this._quickNavigate;
    }
    set quickNavigate(quickNavigate) {
        this._quickNavigate = quickNavigate;
        this.update();
    }
    get value() {
        return this._value;
    }
    set value(value) {
        this.doSetValue(value);
    }
    doSetValue(value, skipUpdate) {
        if (this._value !== value) {
            this._value = value;
            if (!skipUpdate) {
                this.update();
            }
            if (this.visible) {
                const didFilter = this.ui.list.filter(this.filterValue(this._value));
                if (didFilter) {
                    this.trySelectFirst();
                }
            }
            this.onDidChangeValueEmitter.fire(this._value);
        }
    }
    set ariaLabel(ariaLabel) {
        this._ariaLabel = ariaLabel;
        this.update();
    }
    get ariaLabel() {
        return this._ariaLabel;
    }
    get placeholder() {
        return this._placeholder;
    }
    set placeholder(placeholder) {
        this._placeholder = placeholder;
        this.update();
    }
    get prompt() {
        return this.noValidationMessage;
    }
    set prompt(prompt) {
        this.noValidationMessage = prompt;
        this.update();
    }
    get items() {
        return this._items;
    }
    get scrollTop() {
        return this.ui.list.scrollTop;
    }
    set scrollTop(scrollTop) {
        this.ui.list.scrollTop = scrollTop;
    }
    set items(items) {
        this._items = items;
        this.itemsUpdated = true;
        this.update();
    }
    get canSelectMany() {
        return this._canSelectMany;
    }
    set canSelectMany(canSelectMany) {
        this._canSelectMany = canSelectMany;
        this.update();
    }
    get canAcceptInBackground() {
        return this._canAcceptInBackground;
    }
    set canAcceptInBackground(canAcceptInBackground) {
        this._canAcceptInBackground = canAcceptInBackground;
    }
    get matchOnDescription() {
        return this._matchOnDescription;
    }
    set matchOnDescription(matchOnDescription) {
        this._matchOnDescription = matchOnDescription;
        this.update();
    }
    get matchOnDetail() {
        return this._matchOnDetail;
    }
    set matchOnDetail(matchOnDetail) {
        this._matchOnDetail = matchOnDetail;
        this.update();
    }
    get matchOnLabel() {
        return this._matchOnLabel;
    }
    set matchOnLabel(matchOnLabel) {
        this._matchOnLabel = matchOnLabel;
        this.update();
    }
    get matchOnLabelMode() {
        return this._matchOnLabelMode;
    }
    set matchOnLabelMode(matchOnLabelMode) {
        this._matchOnLabelMode = matchOnLabelMode;
        this.update();
    }
    get sortByLabel() {
        return this._sortByLabel;
    }
    set sortByLabel(sortByLabel) {
        this._sortByLabel = sortByLabel;
        this.update();
    }
    get keepScrollPosition() {
        return this._keepScrollPosition;
    }
    set keepScrollPosition(keepScrollPosition) {
        this._keepScrollPosition = keepScrollPosition;
    }
    get itemActivation() {
        return this._itemActivation;
    }
    set itemActivation(itemActivation) {
        this._itemActivation = itemActivation;
    }
    get activeItems() {
        return this._activeItems;
    }
    set activeItems(activeItems) {
        this._activeItems = activeItems;
        this.activeItemsUpdated = true;
        this.update();
    }
    get selectedItems() {
        return this._selectedItems;
    }
    set selectedItems(selectedItems) {
        this._selectedItems = selectedItems;
        this.selectedItemsUpdated = true;
        this.update();
    }
    get keyMods() {
        if (this._quickNavigate) {
            // Disable keyMods when quick navigate is enabled
            // because in this model the interaction is purely
            // keyboard driven and Ctrl/Alt are typically
            // pressed and hold during this interaction.
            return NO_KEY_MODS;
        }
        return this.ui.keyMods;
    }
    get valueSelection() {
        const selection = this.ui.inputBox.getSelection();
        if (!selection) {
            return undefined;
        }
        return [selection.start, selection.end];
    }
    set valueSelection(valueSelection) {
        this._valueSelection = valueSelection;
        this.valueSelectionUpdated = true;
        this.update();
    }
    get customButton() {
        return this._customButton;
    }
    set customButton(showCustomButton) {
        this._customButton = showCustomButton;
        this.update();
    }
    get customLabel() {
        return this._customButtonLabel;
    }
    set customLabel(label) {
        this._customButtonLabel = label;
        this.update();
    }
    get customHover() {
        return this._customButtonHover;
    }
    set customHover(hover) {
        this._customButtonHover = hover;
        this.update();
    }
    get customButtonSecondary() {
        return this._customButtonSecondary;
    }
    set customButtonSecondary(secondary) {
        this._customButtonSecondary = secondary ?? false;
        this.update();
    }
    get ok() {
        return this._ok;
    }
    set ok(showOkButton) {
        this._ok = showOkButton;
        this.update();
    }
    get okLabel() {
        return this._okLabel ?? localize('ok', "OK");
    }
    set okLabel(okLabel) {
        this._okLabel = okLabel;
        this.update();
    }
    inputHasFocus() {
        return this.visible ? this.ui.inputBox.hasFocus() : false;
    }
    focusOnInput() {
        this.ui.inputBox.setFocus();
    }
    get hideInput() {
        return !!this._hideInput;
    }
    set hideInput(hideInput) {
        this._hideInput = hideInput;
        this.update();
    }
    get hideCountBadge() {
        return !!this._hideCountBadge;
    }
    set hideCountBadge(hideCountBadge) {
        this._hideCountBadge = hideCountBadge;
        this.update();
    }
    get hideCheckAll() {
        return !!this._hideCheckAll;
    }
    set hideCheckAll(hideCheckAll) {
        this._hideCheckAll = hideCheckAll;
        this.update();
    }
    trySelectFirst() {
        if (!this.canSelectMany) {
            this.ui.list.focus(QuickPickFocus.First);
        }
    }
    show() {
        if (!this.visible) {
            this.visibleDisposables.add(this.ui.inputBox.onDidChange(value => {
                this.doSetValue(value, true /* skip update since this originates from the UI */);
            }));
            this.visibleDisposables.add(this.ui.onDidAccept(() => {
                if (this.canSelectMany) {
                    // if there are no checked elements, it means that an onDidChangeSelection never fired to overwrite
                    // `_selectedItems`. In that case, we should emit one with an empty array to ensure that
                    // `.selectedItems` is up to date.
                    if (!this.ui.list.getCheckedElements().length) {
                        this._selectedItems = [];
                        this.onDidChangeSelectionEmitter.fire(this.selectedItems);
                    }
                }
                else if (this.activeItems[0]) {
                    // For single-select, we set `selectedItems` to the item that was accepted.
                    this._selectedItems = [this.activeItems[0]];
                    this.onDidChangeSelectionEmitter.fire(this.selectedItems);
                }
                this.handleAccept(false);
            }));
            this.visibleDisposables.add(this.ui.onDidCustom(() => {
                this.onDidCustomEmitter.fire();
            }));
            this.visibleDisposables.add(this._focusEventBufferer.wrapEvent(this.ui.list.onDidChangeFocus, 
            // Only fire the last event
            (_, e) => e)(focusedItems => {
                if (this.activeItemsUpdated) {
                    return; // Expect another event.
                }
                if (this.activeItemsToConfirm !== this._activeItems && equals(focusedItems, this._activeItems, (a, b) => a === b)) {
                    return;
                }
                this._activeItems = focusedItems;
                this.onDidChangeActiveEmitter.fire(focusedItems);
            }));
            this.visibleDisposables.add(this.ui.list.onDidChangeSelection(({ items: selectedItems, event }) => {
                if (this.canSelectMany && !selectedItems.some(i => i.pickable === false)) {
                    if (selectedItems.length) {
                        this.ui.list.setSelectedElements([]);
                    }
                    return;
                }
                if (this.selectedItemsToConfirm !== this._selectedItems && equals(selectedItems, this._selectedItems, (a, b) => a === b)) {
                    return;
                }
                this._selectedItems = selectedItems;
                this.onDidChangeSelectionEmitter.fire(selectedItems);
                if (selectedItems.length) {
                    this.handleAccept(dom.isMouseEvent(event) && event.button === 1 /* mouse middle click */);
                }
            }));
            this.visibleDisposables.add(this.ui.list.onChangedCheckedElements(checkedItems => {
                if (!this.canSelectMany || !this.visible) {
                    return;
                }
                if (this.selectedItemsToConfirm !== this._selectedItems && equals(checkedItems, this._selectedItems, (a, b) => a === b)) {
                    return;
                }
                this._selectedItems = checkedItems;
                this.onDidChangeSelectionEmitter.fire(checkedItems);
            }));
            this.visibleDisposables.add(this.ui.list.onButtonTriggered(event => this.onDidTriggerItemButtonEmitter.fire(event)));
            this.visibleDisposables.add(this.ui.list.onSeparatorButtonTriggered(event => this.onDidTriggerSeparatorButtonEmitter.fire(event)));
            this.visibleDisposables.add(this.registerQuickNavigation());
            this.valueSelectionUpdated = true;
        }
        super.show(); // TODO: Why have show() bubble up while update() trickles down?
    }
    handleAccept(inBackground) {
        // Figure out veto via `onWillAccept` event
        let veto = false;
        this.onWillAcceptEmitter.fire({ veto: () => veto = true });
        // Continue with `onDidAccept` if no veto
        if (!veto) {
            this.onDidAcceptEmitter.fire({ inBackground });
        }
    }
    registerQuickNavigation() {
        return dom.addDisposableListener(this.ui.container, dom.EventType.KEY_UP, e => {
            if (this.canSelectMany || !this._quickNavigate) {
                return;
            }
            const keyboardEvent = new StandardKeyboardEvent(e);
            const keyCode = keyboardEvent.keyCode;
            // Select element when keys are pressed that signal it
            const quickNavKeys = this._quickNavigate.keybindings;
            const wasTriggerKeyPressed = quickNavKeys.some(k => {
                const chords = k.getChords();
                if (chords.length > 1) {
                    return false;
                }
                if (chords[0].shiftKey && keyCode === 4 /* KeyCode.Shift */) {
                    if (keyboardEvent.ctrlKey || keyboardEvent.altKey || keyboardEvent.metaKey) {
                        return false; // this is an optimistic check for the shift key being used to navigate back in quick input
                    }
                    return true;
                }
                if (chords[0].altKey && keyCode === 6 /* KeyCode.Alt */) {
                    return true;
                }
                if (chords[0].ctrlKey && keyCode === 5 /* KeyCode.Ctrl */) {
                    return true;
                }
                if (chords[0].metaKey && keyCode === 57 /* KeyCode.Meta */) {
                    return true;
                }
                return false;
            });
            if (wasTriggerKeyPressed) {
                if (this.activeItems[0]) {
                    this._selectedItems = [this.activeItems[0]];
                    this.onDidChangeSelectionEmitter.fire(this.selectedItems);
                    this.handleAccept(false);
                }
                // Unset quick navigate after press. It is only valid once
                // and should not result in any behaviour change afterwards
                // if the picker remains open because there was no active item
                this._quickNavigate = undefined;
            }
        });
    }
    update() {
        if (!this.visible) {
            return;
        }
        // store the scrollTop before it is reset
        const scrollTopBefore = this.keepScrollPosition ? this.scrollTop : 0;
        const hasDescription = !!this.description;
        const visibilities = {
            title: !!this.title || !!this.step || !!this.titleButtons.length,
            description: hasDescription,
            checkAll: this.canSelectMany && !this._hideCheckAll,
            checkBox: this.canSelectMany,
            inputBox: !this._hideInput,
            progressBar: !this._hideInput || hasDescription,
            visibleCount: true,
            count: this.canSelectMany && !this._hideCountBadge,
            ok: this.ok === 'default' ? this.canSelectMany : this.ok,
            list: true,
            message: !!this.validationMessage || !!this.prompt,
            customButton: this.customButton
        };
        this.ui.setVisibilities(visibilities);
        super.update();
        if (this.ui.inputBox.value !== this.value) {
            this.ui.inputBox.value = this.value;
        }
        if (this.valueSelectionUpdated) {
            this.valueSelectionUpdated = false;
            this.ui.inputBox.select(this._valueSelection && { start: this._valueSelection[0], end: this._valueSelection[1] });
        }
        if (this.ui.inputBox.placeholder !== (this.placeholder || '')) {
            this.ui.inputBox.placeholder = (this.placeholder || '');
        }
        let ariaLabel = this.ariaLabel;
        // Only set aria label to the input box placeholder if we actually have an input box.
        if (!ariaLabel && visibilities.inputBox) {
            ariaLabel = this.placeholder;
            // If we have a title, include it in the aria label.
            if (this.title) {
                ariaLabel = ariaLabel
                    ? `${ariaLabel} - ${this.title}`
                    : this.title;
            }
            if (!ariaLabel) {
                ariaLabel = QuickPick.DEFAULT_ARIA_LABEL;
            }
        }
        if (this.ui.list.ariaLabel !== ariaLabel) {
            this.ui.list.ariaLabel = ariaLabel ?? null;
        }
        if (this.ui.inputBox.ariaLabel !== ariaLabel) {
            this.ui.inputBox.ariaLabel = ariaLabel ?? 'input';
        }
        this.ui.list.matchOnDescription = this.matchOnDescription;
        this.ui.list.matchOnDetail = this.matchOnDetail;
        this.ui.list.matchOnLabel = this.matchOnLabel;
        this.ui.list.matchOnLabelMode = this.matchOnLabelMode;
        this.ui.list.sortByLabel = this.sortByLabel;
        if (this.itemsUpdated) {
            this.itemsUpdated = false;
            this._focusEventBufferer.bufferEvents(() => {
                this.ui.list.setElements(this.items);
                // We want focus to exist in the list if there are items so that space can be used to toggle
                this.ui.list.shouldLoop = !this.canSelectMany;
                this.ui.list.filter(this.filterValue(this.ui.inputBox.value));
                switch (this._itemActivation) {
                    case ItemActivation.NONE:
                        this._itemActivation = ItemActivation.FIRST; // only valid once, then unset
                        break;
                    case ItemActivation.SECOND:
                        this.ui.list.focus(QuickPickFocus.Second);
                        this._itemActivation = ItemActivation.FIRST; // only valid once, then unset
                        break;
                    case ItemActivation.LAST:
                        this.ui.list.focus(QuickPickFocus.Last);
                        this._itemActivation = ItemActivation.FIRST; // only valid once, then unset
                        break;
                    default:
                        this.trySelectFirst();
                        break;
                }
            });
        }
        if (this.ui.container.classList.contains('show-checkboxes') !== !!this.canSelectMany) {
            if (this.canSelectMany) {
                this.ui.list.clearFocus();
            }
            else {
                this.trySelectFirst();
            }
        }
        if (this.activeItemsUpdated) {
            this.activeItemsUpdated = false;
            this.activeItemsToConfirm = this._activeItems;
            this.ui.list.setFocusedElements(this.activeItems);
            if (this.activeItemsToConfirm === this._activeItems) {
                this.activeItemsToConfirm = null;
            }
        }
        if (this.selectedItemsUpdated) {
            this.selectedItemsUpdated = false;
            this.selectedItemsToConfirm = this._selectedItems;
            if (this.canSelectMany) {
                this.ui.list.setCheckedElements(this.selectedItems);
            }
            else {
                this.ui.list.setSelectedElements(this.selectedItems);
            }
            if (this.selectedItemsToConfirm === this._selectedItems) {
                this.selectedItemsToConfirm = null;
            }
        }
        this.ui.ok.label = this.okLabel || '';
        this.ui.customButton.label = this.customLabel || '';
        this.ui.customButton.element.title = this.customHover || '';
        this.ui.customButton.secondary = this.customButtonSecondary || false;
        if (!visibilities.inputBox) {
            // we need to move focus into the tree to detect keybindings
            // properly when the input box is not visible (quick nav)
            this.ui.list.domFocus();
            // Focus the first element in the list if multiselect is enabled
            if (this.canSelectMany) {
                this.ui.list.focus(QuickPickFocus.First);
            }
        }
        // Set the scroll position to what it was before updating the items
        if (this.keepScrollPosition) {
            this.scrollTop = scrollTopBefore;
        }
    }
    focus(focus) {
        this.ui.list.focus(focus);
        // To allow things like space to check/uncheck items
        if (this.canSelectMany) {
            this.ui.list.domFocus();
        }
    }
    accept(inBackground) {
        if (inBackground && !this._canAcceptInBackground) {
            return; // needs to be enabled
        }
        if (this.activeItems[0] && !this._canSelectMany) {
            this._selectedItems = [this.activeItems[0]];
            this.onDidChangeSelectionEmitter.fire(this.selectedItems);
        }
        this.handleAccept(inBackground ?? false);
    }
}
export class InputBox extends QuickInput {
    constructor() {
        super(...arguments);
        this._value = '';
        this.valueSelectionUpdated = true;
        this._password = false;
        this.onDidValueChangeEmitter = this._register(new Emitter());
        this.onDidAcceptEmitter = this._register(new Emitter());
        this.type = "inputBox" /* QuickInputType.InputBox */;
        this.onDidChangeValue = this.onDidValueChangeEmitter.event;
        this.onDidAccept = this.onDidAcceptEmitter.event;
    }
    get value() {
        return this._value;
    }
    set value(value) {
        this._value = value || '';
        this.update();
    }
    get valueSelection() {
        const selection = this.ui.inputBox.getSelection();
        if (!selection) {
            return undefined;
        }
        return [selection.start, selection.end];
    }
    set valueSelection(valueSelection) {
        this._valueSelection = valueSelection;
        this.valueSelectionUpdated = true;
        this.update();
    }
    get placeholder() {
        return this._placeholder;
    }
    set placeholder(placeholder) {
        this._placeholder = placeholder;
        this.update();
    }
    get ariaLabel() {
        return this._ariaLabel;
    }
    set ariaLabel(ariaLabel) {
        this._ariaLabel = ariaLabel;
        this.update();
    }
    get password() {
        return this._password;
    }
    set password(password) {
        this._password = password;
        this.update();
    }
    get prompt() {
        return this._prompt;
    }
    set prompt(prompt) {
        this._prompt = prompt;
        this.noValidationMessage = prompt
            ? localize('inputModeEntryDescription', "{0} (Press 'Enter' to confirm or 'Escape' to cancel)", prompt)
            : QuickInput.noPromptMessage;
        this.update();
    }
    show() {
        if (!this.visible) {
            this.visibleDisposables.add(this.ui.inputBox.onDidChange(value => {
                if (value === this.value) {
                    return;
                }
                this._value = value;
                this.onDidValueChangeEmitter.fire(value);
            }));
            this.visibleDisposables.add(this.ui.onDidAccept(() => this.onDidAcceptEmitter.fire()));
            this.valueSelectionUpdated = true;
        }
        super.show();
    }
    accept() {
        this.onDidAcceptEmitter.fire();
    }
    update() {
        if (!this.visible) {
            return;
        }
        this.ui.container.classList.remove('hidden-input');
        const visibilities = {
            title: !!this.title || !!this.step || !!this.titleButtons.length,
            description: !!this.description || !!this.step,
            inputBox: true,
            message: true,
            progressBar: true
        };
        this.ui.setVisibilities(visibilities);
        super.update();
        if (this.ui.inputBox.value !== this.value) {
            this.ui.inputBox.value = this.value;
        }
        if (this.valueSelectionUpdated) {
            this.valueSelectionUpdated = false;
            this.ui.inputBox.select(this._valueSelection && { start: this._valueSelection[0], end: this._valueSelection[1] });
        }
        if (this.ui.inputBox.placeholder !== (this.placeholder || '')) {
            this.ui.inputBox.placeholder = (this.placeholder || '');
        }
        if (this.ui.inputBox.password !== this.password) {
            this.ui.inputBox.password = this.password;
        }
        let ariaLabel = this.ariaLabel;
        // Only set aria label to the input box placeholder if we actually have an input box.
        if (!ariaLabel && visibilities.inputBox) {
            ariaLabel = this.placeholder
                ? this.title
                    ? `${this.placeholder} - ${this.title}`
                    : this.placeholder
                : this.title
                    ? this.title
                    : 'input';
        }
        if (this.ui.inputBox.ariaLabel !== ariaLabel) {
            this.ui.inputBox.ariaLabel = ariaLabel || 'input';
        }
    }
}
export class QuickWidget extends QuickInput {
    constructor() {
        super(...arguments);
        this.type = "quickWidget" /* QuickInputType.QuickWidget */;
        this._widgetUpdated = false;
    }
    get widget() {
        return this._widget;
    }
    set widget(widget) {
        if (this._widget !== widget) {
            this._widget = widget;
            this._widgetUpdated = true;
            this.update();
        }
    }
    update() {
        if (!this.visible) {
            return;
        }
        this.ui.setVisibilities({
            title: !!this.title || !!this.step || !!this.titleButtons.length,
            description: !!this.description || !!this.step
        });
        if (this._widgetUpdated) {
            this._widgetUpdated = false;
            if (this._widget) {
                dom.reset(this.ui.widget, this._widget);
            }
            else {
                dom.reset(this.ui.widget);
            }
        }
        super.update();
    }
}
let QuickInputHoverDelegate = class QuickInputHoverDelegate extends WorkbenchHoverDelegate {
    constructor(configurationService, hoverService) {
        super('mouse', undefined, (options) => this.getOverrideOptions(options), configurationService, hoverService);
    }
    getOverrideOptions(options) {
        // Only show the hover hint if the content is of a decent size
        const showHoverHint = (dom.isHTMLElement(options.content)
            ? options.content.textContent ?? ''
            : typeof options.content === 'string'
                ? options.content
                : options.content.value).includes('\n');
        return {
            persistence: {
                hideOnKeyDown: false,
            },
            appearance: {
                showHoverHint,
                skipFadeInAnimation: true,
            },
        };
    }
};
QuickInputHoverDelegate = __decorate([
    __param(0, IConfigurationService),
    __param(1, IHoverService)
], QuickInputHoverDelegate);
export { QuickInputHoverDelegate };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicXVpY2tJbnB1dC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3BsYXRmb3JtL3F1aWNraW5wdXQvYnJvd3Nlci9xdWlja0lucHV0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sS0FBSyxHQUFHLE1BQU0sOEJBQThCLENBQUM7QUFDcEQsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFVL0UsT0FBTyxFQUFFLE1BQU0sRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBQ3hELE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSwrQkFBK0IsQ0FBQztBQUM3RCxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDM0QsT0FBTyxFQUFFLE9BQU8sRUFBUyxhQUFhLEVBQUUsTUFBTSwrQkFBK0IsQ0FBQztBQUU5RSxPQUFPLEVBQUUsVUFBVSxFQUFFLGVBQWUsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQ2hGLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUN6RCxPQUFPLFFBQVEsTUFBTSxrQ0FBa0MsQ0FBQztBQUN4RCxPQUFPLEVBQUUsU0FBUyxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDOUQsT0FBTyx3QkFBd0IsQ0FBQztBQUNoQyxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0saUJBQWlCLENBQUM7QUFDM0MsT0FBTyxFQUF5UixjQUFjLEVBQUUsV0FBVyxFQUFFLHdCQUF3QixFQUFFLG9CQUFvQixFQUFrQixjQUFjLEVBQUUsTUFBTSx5QkFBeUIsQ0FBQztBQUU3YSxPQUFPLEVBQUUsd0JBQXdCLEVBQUUsK0JBQStCLEVBQUUsMkJBQTJCLEVBQUUsTUFBTSxzQkFBc0IsQ0FBQztBQUM5SCxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSw2Q0FBNkMsQ0FB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