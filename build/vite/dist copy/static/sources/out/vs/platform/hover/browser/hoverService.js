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
import { registerSingleton } from '../../instantiation/common/extensions.js';
import { registerThemingParticipant } from '../../theme/common/themeService.js';
import { editorHoverBorder } from '../../theme/common/colorRegistry.js';
import { IHoverService } from './hover.js';
import { IContextMenuService } from '../../contextview/browser/contextView.js';
import { IInstantiationService } from '../../instantiation/common/instantiation.js';
import { HoverWidget } from './hoverWidget.js';
import { ContextView } from '../../../base/browser/ui/contextview/contextview.js';
import { Disposable, DisposableStore, toDisposable } from '../../../base/common/lifecycle.js';
import { addDisposableListener, EventType, getActiveElement, isAncestorOfActiveElement, isAncestor, getWindow, isHTMLElement, isEditableElement } from '../../../base/browser/dom.js';
import { IKeybindingService } from '../../keybinding/common/keybinding.js';
import { StandardKeyboardEvent } from '../../../base/browser/keyboardEvent.js';
import { IAccessibilityService } from '../../accessibility/common/accessibility.js';
import { ILayoutService } from '../../layout/browser/layoutService.js';
import { mainWindow } from '../../../base/browser/window.js';
import { isManagedHoverTooltipMarkdownString } from '../../../base/browser/ui/hover/hover.js';
import { ManagedHoverWidget } from './updatableHoverWidget.js';
import { timeout, TimeoutTimer } from '../../../base/common/async.js';
import { IConfigurationService } from '../../configuration/common/configuration.js';
import { isNumber, isString } from '../../../base/common/types.js';
import { KeyChord } from '../../../base/common/keyCodes.js';
import { KeybindingsRegistry } from '../../keybinding/common/keybindingsRegistry.js';
import { stripIcons } from '../../../base/common/iconLabels.js';
/**
 * Maximum nesting depth for hovers. This prevents runaway nesting.
 */
const MAX_HOVER_NESTING_DEPTH = 3;
let HoverService = class HoverService extends Disposable {
    /**
     * Gets the current (topmost) hover from the stack, if any.
     */
    get _currentHover() {
        return this._hoverStack.at(-1)?.hover;
    }
    /**
     * Gets the current (topmost) hover options from the stack, if any.
     */
    get _currentHoverOptions() {
        return this._hoverStack.at(-1)?.options;
    }
    /**
     * Returns whether the target element is inside any of the hovers in the stack.
     * If it is, returns the index of the containing hover, otherwise returns -1.
     */
    _getContainingHoverIndex(target) {
        const targetElements = isHTMLElement(target) ? [target] : target.targetElements;
        // Search from top of stack to bottom (most recent hover first)
        for (let i = this._hoverStack.length - 1; i >= 0; i--) {
            for (const targetElement of targetElements) {
                if (isAncestor(targetElement, this._hoverStack[i].hover.domNode)) {
                    return i;
                }
            }
        }
        return -1;
    }
    constructor(_instantiationService, _configurationService, contextMenuService, _keybindingService, _layoutService, _accessibilityService) {
        super();
        this._instantiationService = _instantiationService;
        this._configurationService = _configurationService;
        this._keybindingService = _keybindingService;
        this._layoutService = _layoutService;
        this._accessibilityService = _accessibilityService;
        /**
         * Stack of currently visible hovers. The last entry is the topmost hover.
         * This enables nested hovers where hovering inside a hover can show another hover.
         */
        this._hoverStack = [];
        this._currentDelayedHoverWasShown = false;
        this._delayedHovers = new Map();
        this._managedHovers = new Map();
        this._register(contextMenuService.onDidShowContextMenu(() => this.hideHover()));
        this._register(KeybindingsRegistry.registerCommandAndKeybindingRule({
            id: 'workbench.action.showHover',
            weight: 0 /* KeybindingWeight.EditorCore */,
            primary: KeyChord(2048 /* KeyMod.CtrlCmd */ | 41 /* KeyCode.KeyK */, 2048 /* KeyMod.CtrlCmd */ | 39 /* KeyCode.KeyI */),
            handler: () => { this._showAndFocusHoverForActiveElement(); },
        }));
    }
    showInstantHover(options, focus, skipLastFocusedUpdate, dontShow) {
        const hover = this._createHover(options, skipLastFocusedUpdate);
        if (!hover) {
            return undefined;
        }
        this._showHover(hover, options, focus);
        return hover.hover;
    }
    showDelayedHover(options, lifecycleOptions) {
        // Set `id` to default if it's undefined
        if (options.id === undefined) {
            options.id = getHoverIdFromContent(options.content);
        }
        if (!this._currentDelayedHover || this._currentDelayedHoverWasShown) {
            // Current hover is locked, reject
            if (this._currentHover?.isLocked) {
                return undefined;
            }
            // Identity is the same, return current hover
            if (getHoverOptionsIdentity(this._currentHoverOptions) === getHoverOptionsIdentity(options)) {
                return this._currentHover;
            }
            // Check group identity, if it's the same skip the delay and show the hover immediately
            if (this._currentHover && !this._currentHover.isDisposed && this._currentDelayedHoverGroupId !== undefined && this._currentDelayedHoverGroupId === lifecycleOptions?.groupId) {
                return this.showInstantHover({
                    ...options,
                    appearance: {
                        ...options.appearance,
                        skipFadeInAnimation: true
                    }
                });
            }
        }
        else if (this._currentDelayedHover && getHoverOptionsIdentity(this._currentHoverOptions) === getHoverOptionsIdentity(options)) {
            // If the hover is the same but timeout is not finished yet, return the current hover
            return this._currentDelayedHover;
        }
        const hover = this._createHover(options, undefined);
        if (!hover) {
            this._currentDelayedHover = undefined;
            this._currentDelayedHoverWasShown = false;
            this._currentDelayedHoverGroupId = undefined;
            return undefined;
        }
        this._currentDelayedHover = hover.hover;
        this._currentDelayedHoverWasShown = false;
        this._currentDelayedHoverGroupId = lifecycleOptions?.groupId;
        const delay = lifecycleOptions?.reducedDelay
            ? this._configurationService.getValue('workbench.hover.reducedDelay')
            : this._configurationService.getValue('workbench.hover.delay');
        timeout(delay).then(() => {
            if (hover.hover && !hover.hover.isDisposed) {
                this._currentDelayedHoverWasShown = true;
                this._showHover(hover, options);
            }
        });
        return hover.hover;
    }
    setupDelayedHover(target, options, lifecycleOptions) {
        const resolveHoverOptions = (e) => {
            const resolved = {
                ...typeof options === 'function' ? options() : options,
                target
            };
            if (resolved.style === 2 /* HoverStyle.Mouse */ && e) {
                resolved.target = resolveMouseStyleHoverTarget(target, e);
            }
            return resolved;
        };
        return this._setupDelayedHover(target, resolveHoverOptions, lifecycleOptions);
    }
    setupDelayedHoverAtMouse(target, options, lifecycleOptions) {
        const resolveHoverOptions = (e) => ({
            ...typeof options === 'function' ? options() : options,
            target: e ? resolveMouseStyleHoverTarget(target, e) : target
        });
        return this._setupDelayedHover(target, resolveHoverOptions, lifecycleOptions);
    }
    _setupDelayedHover(target, resolveHoverOptions, lifecycleOptions) {
        const store = new DisposableStore();
        store.add(addDisposableListener(target, EventType.MOUSE_OVER, e => {
            this.showDelayedHover(resolveHoverOptions(e), {
                groupId: lifecycleOptions?.groupId,
                reducedDelay: lifecycleOptions?.reducedDelay,
            });
        }));
        if (lifecycleOptions?.setupKeyboardEvents) {
            store.add(addDisposableListener(target, EventType.KEY_DOWN, e => {
                const evt = new StandardKeyboardEvent(e);
                if (evt.equals(10 /* KeyCode.Space */) || evt.equals(3 /* KeyCode.Enter */)) {
                    this.showInstantHover(resolveHoverOptions(), true);
                }
            }));
        }
        this._delayedHovers.set(target, { show: (focus) => { this.showInstantHover(resolveHoverOptions(), focus); } });
        store.add(toDisposable(() => this._delayedHovers.delete(target)));
        return store;
    }
    _createHover(options, skipLastFocusedUpdate) {
        this._currentDelayedHover?.dispose();
        this._currentDelayedHover = undefined;
        if (options.content === '') {
            return undefined;
        }
        // Set `id` to default if it's undefined
        if (options.id === undefined) {
            options.id = getHoverIdFromContent(options.content);
        }
        // Check if the target is inside an existing hover (nesting scenario)
        const containingHoverIndex = this._getContainingHoverIndex(options.target);
        const isNesting = containingHoverIndex >= 0;
        if (isNesting) {
            // Check max nesting depth
            if (this._hoverStack.length >= MAX_HOVER_NESTING_DEPTH) {
                return undefined;
            }
            // When nesting, don't check if the parent is locked - we allow nested hovers inside locked parents
        }
        else {
            // Not nesting: check if current top-level hover is locked
            if (this._currentHover?.isLocked) {
                return undefined;
            }
            // Check if identity is the same as current hover
            if (getHoverOptionsIdentity(this._currentHoverOptions) === getHoverOptionsIdentity(options)) {
                return undefined;
            }
        }
        this._lastHoverOptions = options;
        const trapFocus = options.trapFocus || this._accessibilityService.isScreenReaderOptimized();
        const activeElement = getActiveElement();
        let lastFocusedElementBeforeOpen;
        // HACK, remove this check when #189076 is fixed
        if (!skipLastFocusedUpdate) {
            if (trapFocus && activeElement) {
                if (!activeElement.classList.contains('monaco-hover')) {
                    lastFocusedElementBeforeOpen = activeElement;
                }
            }
        }
        const hoverDisposables = new DisposableStore();
        const hover = this._instantiationService.createInstance(HoverWidget, options);
        if (options.persistence?.sticky) {
            hover.isLocked = true;
        }
        // Adjust target position when a mouse event is provided as the hover position
        if (options.position?.hoverPosition && !isNumber(options.position.hoverPosition)) {
            options.target = {
                targetElements: isHTMLElement(options.target) ? [options.target] : options.target.targetElements,
                x: options.position.hoverPosition.x + 10
            };
        }
        hover.onDispose(() => {
            // Pop this hover from the stack if it's still there
            const stackIndex = this._hoverStack.findIndex(entry => entry.hover === hover);
            if (stackIndex >= 0) {
                const entry = this._hoverStack[stackIndex];
                // Restore focus if this hover was focused
                const hoverWasFocused = isAncestorOfActiveElement(hover.domNode);
                if (hoverWasFocused && entry.lastFocusedElementBeforeOpen) {
                    entry.lastFocusedElementBeforeOpen.focus();
                }
                // Also dispose all nested hovers (hovers at higher indices in the stack)
                // Dispose from end to avoid index shifting issues
                while (this._hoverStack.length > stackIndex + 1) {
                    const nestedEntry = this._hoverStack.pop();
                    nestedEntry.contextView.dispose();
                    nestedEntry.hover.dispose();
                }
                // Remove this hover from stack and dispose its context view
                this._hoverStack.splice(stackIndex, 1);
                entry.contextView.dispose();
            }
            hoverDisposables.dispose();
        }, undefined, hoverDisposables);
        // Set the container explicitly to enable aux window support
        if (!options.container) {
            const targetElement = isHTMLElement(options.target) ? options.target : options.target.targetElements[0];
            options.container = this._layoutService.getContainer(getWindow(targetElement));
        }
        if (options.persistence?.sticky) {
            hoverDisposables.add(addDisposableListener(getWindow(options.container).document, EventType.MOUSE_DOWN, e => {
                if (!isAncestor(e.target, hover.domNode)) {
                    this._hideHoverAndDescendants(hover);
                }
            }));
        }
        else {
            if ('targetElements' in options.target) {
                for (const element of options.target.targetElements) {
                    hoverDisposables.add(addDisposableListener(element, EventType.CLICK, () => this._hideHoverAndDescendants(hover)));
                }
            }
            else {
                hoverDisposables.add(addDisposableListener(options.target, EventType.CLICK, () => this._hideHoverAndDescendants(hover)));
            }
            const focusedElement = getActiveElement();
            if (focusedElement) {
                const focusedElementDocument = getWindow(focusedElement).document;
                hoverDisposables.add(addDisposableListener(focusedElement, EventType.KEY_DOWN, e => this._keyDown(e, hover, !!options.persistence?.hideOnKeyDown)));
                hoverDisposables.add(addDisposableListener(focusedElementDocument, EventType.KEY_DOWN, e => this._keyDown(e, hover, !!options.persistence?.hideOnKeyDown)));
                hoverDisposables.add(addDisposableListener(focusedElement, EventType.KEY_UP, e => this._keyUp(e, hover)));
                hoverDisposables.add(addDisposableListener(focusedElementDocument, EventType.KEY_UP, e => this._keyUp(e, hover)));
            }
        }
        if ('IntersectionObserver' in mainWindow) {
            const observer = new IntersectionObserver(e => this._intersectionChange(e, hover), { threshold: 0 });
            const firstTargetElement = 'targetElements' in options.target ? options.target.targetElements[0] : options.target;
            observer.observe(firstTargetElement);
            hoverDisposables.add(toDisposable(() => observer.disconnect()));
        }
        return { hover, lastFocusedElementBeforeOpen, store: hoverDisposables };
    }
    _showHover(result, options, focus) {
        const { hover, lastFocusedElementBeforeOpen, store } = result;
        // Check if the target is inside an existing hover (nesting scenario)
        const containingHoverIndex = this._getContainingHoverIndex(options.target);
        const isNesting = containingHoverIndex >= 0;
        // If not nesting, close all existing hovers first
        if (!isNesting) {
            this._hideAllHovers();
        }
        else {
            // When nesting, close any sibling hovers (hovers at the same level or deeper
            // than the containing hover). This ensures hovers within the same container
            // are exclusive.
            for (let i = this._hoverStack.length - 1; i > containingHoverIndex; i--) {
                this._hoverStack[i].hover.dispose();
            }
            this._hoverStack.length = containingHoverIndex + 1;
        }
        // When nesting, add the new hover's container to all parent hovers' mouse trackers.
        // This makes the parent hovers treat the nested hover as part of themselves,
        // so they won't close when the mouse moves into the nested hover.
        if (isNesting) {
            for (let i = 0; i <= containingHoverIndex; i++) {
                store.add(this._hoverStack[i].hover.addMouseTrackingElement(hover.domNode));
            }
        }
        // Create a new ContextView for this hover with higher z-index for nested hovers
        const container = options.container ?? this._layoutService.getContainer(getWindow(isHTMLElement(options.target) ? options.target : options.target.targetElements[0]));
        const contextView = new ContextView(container, 1 /* ContextViewDOMPosition.ABSOLUTE */);
        // Push to stack
        const stackEntry = {
            hover,
            options,
            contextView,
            lastFocusedElementBeforeOpen
        };
        this._hoverStack.push(stackEntry);
        // Show the hover in its context view
        const delegate = new HoverContextViewDelegate(hover, focus, this._hoverStack.length);
        contextView.show(delegate);
        // Set up layout handling
        store.add(hover.onRequestLayout(() => contextView.layout()));
        options.onDidShow?.();
    }
    /**
     * Hides a specific hover and all hovers nested inside it.
     */
    _hideHoverAndDescendants(hover) {
        const stackIndex = this._hoverStack.findIndex(entry => entry.hover === hover);
        if (stackIndex < 0) {
            return;
        }
        // Dispose all hovers from this index onwards (including nested ones)
        for (let i = this._hoverStack.length - 1; i >= stackIndex; i--) {
            this._hoverStack[i].hover.dispose();
        }
        this._hoverStack.length = stackIndex;
    }
    /**
     * Hides all hovers in the stack.
     */
    _hideAllHovers() {
        for (let i = this._hoverStack.length - 1; i >= 0; i--) {
            this._hoverStack[i].hover.dispose();
        }
        this._hoverStack.length = 0;
    }
    hideHover(force) {
        if (this._hoverStack.length === 0) {
            return;
        }
        // If not forcing and the topmost hover is locked, don't hide
        if (!force && this._currentHover?.isLocked) {
            return;
        }
        // Hide only the topmost hover (pop from stack)
        this.doHideHover();
    }
    doHideHover() {
        // Pop and dispose the topmost hover
        const length = this._hoverStack.length;
        this._hoverStack[length - 1]?.hover.dispose();
        this._hoverStack.length = length - 1;
        // After popping a nested hover, unlock the parent if it was locked due to nesting
        // (Note: the parent may have been explicitly locked via sticky, so we only unlock
        // if there are remaining hovers and they're not sticky)
        // For simplicity, we don't auto-unlock here - the parent remains in its current lock state
    }
    _intersectionChange(entries, hover) {
        const entry = entries[entries.length - 1];
        if (!entry.isIntersecting) {
            hover.dispose();
        }
    }
    showAndFocusLastHover() {
        if (!this._lastHoverOptions) {
            return;
        }
        this.showInstantHover(this._lastHoverOptions, true, true);
    }
    _showAndFocusHoverForActiveElement() {
        // TODO: if hover is visible, focus it to avoid flickering
        let activeElement = getActiveElement();
        while (activeElement) {
            const hover = this._delayedHovers.get(activeElement) ?? this._managedHovers.get(activeElement);
            if (hover) {
                hover.show(true);
                return;
            }
            activeElement = activeElement.parentElement;
        }
    }
    _keyDown(e, hover, hideOnKeyDown) {
        if (e.key === 'Alt') {
            // Lock all hovers in the stack when Alt is pressed
            for (const entry of this._hoverStack) {
                entry.hover.isLocked = true;
            }
            return;
        }
        const event = new StandardKeyboardEvent(e);
        const keybinding = this._keybindingService.resolveKeyboardEvent(event);
        if (keybinding.getSingleModifierDispatchChords().some(value => !!value) || this._keybindingService.softDispatch(event, event.target).kind !== 0 /* ResultKind.NoMatchingKb */) {
            return;
        }
        if (hideOnKeyDown && (!this._currentHoverOptions?.trapFocus || e.key !== 'Tab')) {
            // Find the entry for this hover to get its lastFocusedElementBeforeOpen
            const stackEntry = this._hoverStack.find(entry => entry.hover === hover);
            this._hideHoverAndDescendants(hover);
            stackEntry?.lastFocusedElementBeforeOpen?.focus();
        }
    }
    _keyUp(e, hover) {
        if (e.key === 'Alt') {
            // Unlock all hovers in the stack when Alt is released
            for (const entry of this._hoverStack) {
                // Only unlock if not sticky
                if (!entry.options.persistence?.sticky) {
                    entry.hover.isLocked = false;
                }
            }
            // Hide all hovers if the mouse is not over any of them
            const anyMouseIn = this._hoverStack.some(entry => entry.hover.isMouseIn);
            if (!anyMouseIn) {
                const topEntry = this._hoverStack[this._hoverStack.length - 1];
                this._hideAllHovers();
                topEntry?.lastFocusedElementBeforeOpen?.focus();
            }
        }
    }
    // TODO: Investigate performance of this function. There seems to be a lot of content created
    //       and thrown away on start up
    setupManagedHover(hoverDelegate, targetElement, content, options) {
        if (hoverDelegate.showNativeHover) {
            return setupNativeHover(targetElement, content);
        }
        targetElement.setAttribute('custom-hover', 'true');
        if (targetElement.title !== '') {
            console.warn('HTML element already has a title attribute, which will conflict with the custom hover. Please remove the title attribute.');
            // console.trace('Stack trace:', targetElement.title);
            targetElement.title = '';
        }
        let hoverPreparation;
        let hoverWidget;
        const hideHover = (disposeWidget, disposePreparation) => {
            const hadHover = hoverWidget !== undefined;
            if (disposeWidget) {
                hoverWidget?.dispose();
                hoverWidget = undefined;
            }
            if (disposePreparation) {
                hoverPreparation?.dispose();
                hoverPreparation = undefined;
            }
            if (hadHover) {
                hoverDelegate.onDidHideHover?.();
                hoverWidget = undefined;
            }
        };
        const triggerShowHover = (delay, focus, target, trapFocus) => {
            return new TimeoutTimer(async () => {
                if (!hoverWidget || hoverWidget.isDisposed) {
                    hoverWidget = new ManagedHoverWidget(hoverDelegate, target || targetElement, delay > 0);
                    await hoverWidget.update(typeof content === 'function' ? content() : content, focus, { ...options, trapFocus });
                }
            }, delay);
        };
        const store = new DisposableStore();
        let isMouseDown = false;
        store.add(addDisposableListener(targetElement, EventType.MOUSE_DOWN, () => {
            isMouseDown = true;
            hideHover(true, true);
        }, true));
        store.add(addDisposableListener(targetElement, EventType.MOUSE_UP, () => {
            isMouseDown = false;
        }, true));
        store.add(addDisposableListener(targetElement, EventType.MOUSE_LEAVE, (e) => {
            isMouseDown = false;
            hideHover(false, e.fromElement === targetElement);
        }, true));
        store.add(addDisposableListener(targetElement, EventType.MOUSE_OVER, (e) => {
            if (hoverPreparation) {
                return;
            }
            const mouseOverStore = new DisposableStore();
            const target = {
                targetElements: [targetElement],
                dispose: () => { }
            };
            if (hoverDelegate.placement === undefined || hoverDelegate.placement === 'mouse') {
                // track the mouse position
                const onMouseMove = (e) => {
                    target.x = e.x + 10;
                    if (!eventIsRelatedToTarget(e, targetElement)) {
                        hideHover(true, true);
                    }
                };
                mouseOverStore.add(addDisposableListener(targetElement, EventType.MOUSE_MOVE, onMouseMove, true));
            }
            hoverPreparation = mouseOverStore;
            if (!eventIsRelatedToTarget(e, targetElement)) {
                return; // Do not show hover when the mouse is over another hover target
            }
            mouseOverStore.add(triggerShowHover(typeof hoverDelegate.delay === 'function' ? hoverDelegate.delay(content) : hoverDelegate.delay, false, target));
        }, true));
        const onFocus = (e) => {
            if (isMouseDown || hoverPreparation) {
                return;
            }
            if (!eventIsRelatedToTarget(e, targetElement)) {
                return; // Do not show hover when the focus is on another hover target
            }
            const target = {
                targetElements: [targetElement],
                dispose: () => { }
            };
            const toDispose = new DisposableStore();
            const onBlur = () => hideHover(true, true);
            toDispose.add(addDisposableListener(targetElement, EventType.BLUR, onBlur, true));
            toDispose.add(triggerShowHover(typeof hoverDelegate.delay === 'function' ? hoverDelegate.delay(content) : hoverDelegate.delay, false, target));
            hoverPreparation = toDispose;
        };
        // Do not show hover when focusing an input or textarea
        if (!isEditableElement(targetElement)) {
            store.add(addDisposableListener(targetElement, EventType.FOCUS, onFocus, true));
        }
        const hover = {
            show: focus => {
                hideHover(false, true); // terminate a ongoing mouse over preparation
                triggerShowHover(0, focus, undefined, focus); // show hover immediately
            },
            hide: () => {
                hideHover(true, true);
            },
            update: async (newContent, hoverOptions) => {
                content = newContent;
                await hoverWidget?.update(content, undefined, hoverOptions);
            },
            dispose: () => {
                this._managedHovers.delete(targetElement);
                store.dispose();
                hideHover(true, true);
            }
        };
        this._managedHovers.set(targetElement, hover);
        return hover;
    }
    showManagedHover(target) {
        const hover = this._managedHovers.get(target);
        if (hover) {
            hover.show(true);
        }
    }
    dispose() {
        this._managedHovers.forEach(hover => hover.dispose());
        super.dispose();
    }
};
HoverService = __decorate([
    __param(0, IInstantiationService),
    __param(1, IConfigurationService),
    __param(2, IContextMenuService),
    __param(3, IKeybindingService),
    __param(4, ILayoutService),
    __param(5, IAccessibilityService)
], HoverService);
export { HoverService };
function getHoverOptionsIdentity(options) {
    if (options === undefined) {
        return undefined;
    }
    return options?.id ?? options;
}
function getHoverIdFromContent(content) {
    if (isHTMLElement(content)) {
        return undefined;
    }
    if (typeof content === 'string') {
        return content.toString();
    }
    return content.value;
}
function getStringContent(contentOrFactory) {
    const content = typeof contentOrFactory === 'function' ? contentOrFactory() : contentOrFactory;
    if (isString(content)) {
        // Icons don't render in the native hover so we strip them out
        return stripIcons(content);
    }
    if (isManagedHoverTooltipMarkdownString(content)) {
        return content.markdownNotSupportedFallback;
    }
    return undefined;
}
function setupNativeHover(targetElement, content) {
    function updateTitle(title) {
        if (title) {
            targetElement.setAttribute('title', title);
        }
        else {
            targetElement.removeAttribute('title');
        }
    }
    updateTitle(getStringContent(content));
    return {
        update: (content) => updateTitle(getStringContent(content)),
        show: () => { },
        hide: () => { },
        dispose: () => updateTitle(undefined),
    };
}
class HoverContextViewDelegate {
    get anchorPosition() {
        return this._hover.anchor;
    }
    constructor(_hover, _focus = false, stackDepth = 1) {
        this._hover = _hover;
        this._focus = _focus;
        // Base layer is 1, nested hovers get higher layers
        this.layer = stackDepth;
    }
    render(container) {
        this._hover.render(container);
        if (this._focus) {
            this._hover.focus();
        }
        return this._hover;
    }
    getAnchor() {
        return {
            x: this._hover.x,
            y: this._hover.y
        };
    }
    layout() {
        this._hover.layout();
    }
}
function eventIsRelatedToTarget(event, target) {
    return isHTMLElement(event.target) && getHoverTargetElement(event.target, target) === target;
}
function getHoverTargetElement(element, stopElement) {
    stopElement = stopElement ?? getWindow(element).document.body;
    while (!element.hasAttribute('custom-hover') && element !== stopElement) {
        element = element.parentElement;
    }
    return element;
}
function resolveMouseStyleHoverTarget(target, e) {
    return {
        targetElements: [target],
        x: e.x + 10
    };
}
registerSingleton(IHoverService, HoverService, 1 /* InstantiationType.Delayed */);
registerThemingParticipant((theme, collector) => {
    const hoverBorder = theme.getColor(editorHoverBorder);
    if (hoverBorder) {
        collector.addRule(`.monaco-hover.workbench-hover .hover-row:not(:first-child):not(:empty) { border-top: 1px solid ${hoverBorder.transparent(0.5)}; }`);
        collector.addRule(`.monaco-hover.workbench-hover hr { border-top: 1px solid ${hoverBorder.transparent(0.5)}; }`);
    }
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaG92ZXJTZXJ2aWNlLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvcGxhdGZvcm0vaG92ZXIvYnJvd3Nlci9ob3ZlclNlcnZpY2UudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFxQixpQkFBaUIsRUFBRSxNQUFNLDBDQUEwQyxDQUFDO0FBQ2hHLE9BQU8sRUFBRSwwQkFBMEIsRUFBRSxNQUFNLG9DQUFvQyxDQUFDO0FBQ2hGLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQ3hFLE9BQU8sRUFBRSxhQUFhLEVBQUUsTUFBTSxZQUFZLENBQUM7QUFDM0MsT0FBTyxFQUFFLG1CQUFtQixFQUFFLE1BQU0sMENBQTBDLENBQUM7QUFDL0UsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sNkNBQTZDLENBQUM7QUFDcEYsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLGtCQUFrQixDQUFDO0FBQy9DLE9BQU8sRUFBRSxXQUFXLEVBQXFDLE1BQU0scURBQXFELENBQUM7QUFDckgsT0FBTyxFQUFFLFVBQVUsRUFBRSxlQUFlLEVBQWUsWUFBWSxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDM0csT0FBTyxFQUFFLHFCQUFxQixFQUFFLFNBQVMsRUFBRSxnQkFBZ0IsRUFBRSx5QkFBeUIsRUFBRSxVQUFVLEVBQUUsU0FBUyxFQUFFLGFBQWEsRUFBRSxpQkFBaUIsRUFBRSxNQUFNLDhCQUE4QixDQUFDO0FBQ3RMLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBQzNFLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBRS9FLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLDZDQUE2QyxDQUFDO0FBQ3BGLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSx1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