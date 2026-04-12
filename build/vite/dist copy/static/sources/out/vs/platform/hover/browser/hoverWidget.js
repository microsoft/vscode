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
import './hover.css';
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from '../../../base/common/lifecycle.js';
import { Emitter } from '../../../base/common/event.js';
import * as dom from '../../../base/browser/dom.js';
import { IKeybindingService } from '../../keybinding/common/keybinding.js';
import { IConfigurationService } from '../../configuration/common/configuration.js';
import { HoverAction, HoverWidget as BaseHoverWidget, getHoverAccessibleViewHint } from '../../../base/browser/ui/hover/hoverWidget.js';
import { Widget } from '../../../base/browser/ui/widget.js';
import { IMarkdownRendererService } from '../../markdown/browser/markdownRenderer.js';
import { isMarkdownString } from '../../../base/common/htmlContent.js';
import { localize } from '../../../nls.js';
import { isMacintosh } from '../../../base/common/platform.js';
import { IAccessibilityService } from '../../accessibility/common/accessibility.js';
import { status } from '../../../base/browser/ui/aria/aria.js';
import { TimeoutTimer } from '../../../base/common/async.js';
import { isNumber } from '../../../base/common/types.js';
const $ = dom.$;
var Constants;
(function (Constants) {
    Constants[Constants["PointerSize"] = 3] = "PointerSize";
    Constants[Constants["HoverBorderWidth"] = 2] = "HoverBorderWidth";
    Constants[Constants["HoverWindowEdgeMargin"] = 2] = "HoverWindowEdgeMargin";
})(Constants || (Constants = {}));
let HoverWidget = class HoverWidget extends Widget {
    get _targetWindow() {
        return dom.getWindow(this._target.targetElements[0]);
    }
    get _targetDocumentElement() {
        return dom.getWindow(this._target.targetElements[0]).document.documentElement;
    }
    get isDisposed() { return this._isDisposed; }
    get isMouseIn() { return this._lockMouseTracker.isMouseIn; }
    get domNode() { return this._hover.containerDomNode; }
    get onDispose() { return this._onDispose.event; }
    get onRequestLayout() { return this._onRequestLayout.event; }
    get anchor() { return this._hoverPosition === 2 /* HoverPosition.BELOW */ ? 0 /* AnchorPosition.BELOW */ : 1 /* AnchorPosition.ABOVE */; }
    get x() { return this._x; }
    get y() { return this._y; }
    /**
     * Whether the hover is "locked" by holding the alt/option key. When locked, the hover will not
     * hide and can be hovered regardless of whether the `hideOnHover` hover option is set.
     */
    get isLocked() { return this._isLocked; }
    set isLocked(value) {
        if (this._isLocked === value) {
            return;
        }
        this._isLocked = value;
        this._hoverContainer.classList.toggle('locked', this._isLocked);
    }
    /**
     * Adds an element to be tracked by this hover's mouse tracker. Mouse events on
     * this element will be considered as being "inside" the hover, preventing it
     * from closing. This is used for nested hovers where the child hover's container
     * should be treated as part of the parent hover.
     */
    addMouseTrackingElement(element) {
        return this._lockMouseTracker.addElement(element);
    }
    constructor(options, _keybindingService, _configurationService, _markdownRenderer, _accessibilityService) {
        super();
        this._keybindingService = _keybindingService;
        this._configurationService = _configurationService;
        this._markdownRenderer = _markdownRenderer;
        this._accessibilityService = _accessibilityService;
        this._messageListeners = new DisposableStore();
        this._isDisposed = false;
        this._forcePosition = false;
        this._x = 0;
        this._y = 0;
        this._isLocked = false;
        this._enableFocusTraps = false;
        this._addedFocusTrap = false;
        this._maxHeightRatioRelativeToWindow = 0.5;
        this._onDispose = this._register(new Emitter());
        this._onRequestLayout = this._register(new Emitter());
        this._linkHandler = options.linkHandler;
        this._target = 'targetElements' in options.target ? options.target : new ElementHoverTarget(options.target);
        if (options.style) {
            switch (options.style) {
                case 1 /* HoverStyle.Pointer */: {
                    options.appearance ??= {};
                    options.appearance.compact ??= true;
                    options.appearance.showPointer ??= true;
                    break;
                }
                case 2 /* HoverStyle.Mouse */: {
                    options.appearance ??= {};
                    options.appearance.compact ??= true;
                    break;
                }
            }
        }
        this._hoverPointer = options.appearance?.showPointer ? $('div.workbench-hover-pointer') : undefined;
        this._hover = this._register(new BaseHoverWidget(!options.appearance?.skipFadeInAnimation));
        this._hover.containerDomNode.classList.add('workbench-hover');
        if (options.appearance?.compact) {
            this._hover.containerDomNode.classList.add('workbench-hover', 'compact');
        }
        if (this._hoverPointer) {
            this._hover.containerDomNode.classList.add('with-pointer');
        }
        if (options.additionalClasses) {
            this._hover.containerDomNode.classList.add(...options.additionalClasses);
        }
        if (options.position?.forcePosition) {
            this._forcePosition = true;
        }
        if (options.trapFocus) {
            this._enableFocusTraps = true;
        }
        const maxHeightRatio = options.appearance?.maxHeightRatio;
        if (maxHeightRatio !== undefined && maxHeightRatio > 0 && maxHeightRatio <= 1) {
            this._maxHeightRatioRelativeToWindow = maxHeightRatio;
        }
        // Default to position above when the position is unspecified or a mouse event
        this._hoverPosition = options.position?.hoverPosition === undefined
            ? 3 /* HoverPosition.ABOVE */
            : isNumber(options.position.hoverPosition)
                ? options.position.hoverPosition
                : 2 /* HoverPosition.BELOW */;
        // Don't allow mousedown out of the widget, otherwise preventDefault will call and text will
        // not be selected.
        this.onmousedown(this._hover.containerDomNode, e => e.stopPropagation());
        // Hide hover on escape
        this.onkeydown(this._hover.containerDomNode, e => {
            if (e.equals(9 /* KeyCode.Escape */)) {
                this.dispose();
            }
        });
        // Hide when the window loses focus
        this._register(dom.addDisposableListener(this._targetWindow, 'blur', () => this.dispose()));
        const rowElement = $('div.hover-row.markdown-hover');
        const contentsElement = $('div.hover-contents');
        if (typeof options.content === 'string') {
            contentsElement.textContent = options.content;
            contentsElement.style.whiteSpace = 'pre-wrap';
        }
        else if (dom.isHTMLElement(options.content)) {
            contentsElement.appendChild(options.content);
            contentsElement.classList.add('html-hover-contents');
        }
        else {
            const markdown = options.content;
            const { element } = this._register(this._markdownRenderer.render(markdown, {
                actionHandler: this._linkHandler,
                asyncRenderCallback: () => {
                    contentsElement.classList.add('code-hover-contents');
                    this.layout();
                    // This changes the dimensions of the hover so trigger a layout
                    this._onRequestLayout.fire();
                }
            }));
            contentsElement.appendChild(element);
        }
        rowElement.appendChild(contentsElement);
        this._hover.contentsDomNode.appendChild(rowElement);
        if (options.actions && options.actions.length > 0) {
            const statusBarElement = $('div.hover-row.status-bar');
            const actionsElement = $('div.actions');
            options.actions.forEach(action => {
                const keybinding = this._keybindingService.lookupKeybinding(action.commandId);
                const keybindingLabel = keybinding ? keybinding.getLabel() : null;
                this._register(HoverAction.render(actionsElement, {
                    label: action.label,
                    commandId: action.commandId,
                    run: e => {
                        action.run(e);
                        this.dispose();
                    },
                    iconClass: action.iconClass
                }, keybindingLabel));
            });
            statusBarElement.appendChild(actionsElement);
            this._hover.containerDomNode.appendChild(statusBarElement);
        }
        this._hoverContainer = $('div.workbench-hover-container');
        if (this._hoverPointer) {
            this._hoverContainer.appendChild(this._hoverPointer);
        }
        this._hoverContainer.appendChild(this._hover.containerDomNode);
        // Determine whether to hide on hover
        let hideOnHover;
        if (options.actions && options.actions.length > 0) {
            // If there are actions, require hover so they can be accessed
            hideOnHover = false;
        }
        else {
            if (options.persistence?.hideOnHover === undefined) {
                // When unset, will default to true when it's a string or when it's markdown that
                // appears to have a link using a naive check for '](' and '</a>'
                hideOnHover = typeof options.content === 'string' ||
                    isMarkdownString(options.content) && !options.content.value.includes('](') && !options.content.value.includes('</a>');
            }
            else {
                // It's set explicitly
                hideOnHover = options.persistence.hideOnHover;
            }
        }
        // Show the hover hint if needed
        if (options.appearance?.showHoverHint) {
            const statusBarElement = $('div.hover-row.status-bar');
            const infoElement = $('div.info');
            infoElement.textContent = localize('hoverhint', 'Hold {0} key to mouse over', isMacintosh ? 'Option' : 'Alt');
            statusBarElement.appendChild(infoElement);
            this._hover.containerDomNode.appendChild(statusBarElement);
        }
        const mouseTrackerTargets = [...this._target.targetElements];
        if (!hideOnHover) {
            mouseTrackerTargets.push(this._hoverContainer);
        }
        const mouseTracker = this._register(new CompositeMouseTracker(mouseTrackerTargets));
        this._register(mouseTracker.onMouseOut(() => {
            if (!this._isLocked) {
                this.dispose();
            }
        }));
        // Setup another mouse tracker when hideOnHover is set in order to track the hover as well
        // when it is locked. This ensures the hover will hide on mouseout after alt has been
        // released to unlock the element.
        if (hideOnHover) {
            const mouseTracker2Targets = [...this._target.targetElements, this._hoverContainer];
            this._lockMouseTracker = this._register(new CompositeMouseTracker(mouseTracker2Targets));
            this._register(this._lockMouseTracker.onMouseOut(() => {
                if (!this._isLocked) {
                    this.dispose();
                }
            }));
        }
        else {
            this._lockMouseTracker = mouseTracker;
        }
    }
    addFocusTrap() {
        if (!this._enableFocusTraps || this._addedFocusTrap) {
            return;
        }
        this._addedFocusTrap = true;
        // Add a hover tab loop if the hover has at least one element with a valid tabIndex
        const firstContainerFocusElement = this._hover.containerDomNode;
        const lastContainerFocusElement = this.findLastFocusableChild(this._hover.containerDomNode);
        if (lastContainerFocusElement) {
            const beforeContainerFocusElement = dom.prepend(this._hoverContainer, $('div'));
            const afterContainerFocusElement = dom.append(this._hoverContainer, $('div'));
            beforeContainerFocusElement.tabIndex = 0;
            afterContainerFocusElement.tabIndex = 0;
            this._register(dom.addDisposableListener(afterContainerFocusElement, 'focus', (e) => {
                firstContainerFocusElement.focus();
                e.preventDefault();
            }));
            this._register(dom.addDisposableListener(beforeContainerFocusElement, 'focus', (e) => {
                lastContainerFocusElement.focus();
                e.preventDefault();
            }));
        }
    }
    findLastFocusableChild(root) {
        if (root.hasChildNodes()) {
            for (let i = 0; i < root.childNodes.length; i++) {
                const node = root.childNodes.item(root.childNodes.length - i - 1);
                if (node.nodeType === node.ELEMENT_NODE) {
                    const parsedNode = node;
                    if (typeof parsedNode.tabIndex === 'number' && parsedNode.tabIndex >= 0) {
                        return parsedNode;
                    }
                }
                const recursivelyFoundElement = this.findLastFocusableChild(node);
                if (recursivelyFoundElement) {
                    return recursivelyFoundElement;
                }
            }
        }
        return undefined;
    }
    render(container) {
        container.appendChild(this._hoverContainer);
        const hoverFocused = this._hoverContainer.contains(this._hoverContainer.ownerDocument.activeElement);
        const accessibleViewHint = hoverFocused && getHoverAccessibleViewHint(this._configurationService.getValue('accessibility.verbosity.hover') === true && this._accessibilityService.isScreenReaderOptimized(), this._keybindingService.lookupKeybinding('editor.action.accessibleView')?.getAriaLabel());
        if (accessibleViewHint) {
            status(accessibleViewHint);
        }
        this.layout();
        this.addFocusTrap();
    }
    layout() {
        this._hover.containerDomNode.classList.remove('right-aligned');
        this._hover.contentsDomNode.style.maxHeight = '';
        const getZoomAccountedBoundingClientRect = (e) => {
            const zoom = dom.getDomNodeZoomLevel(e);
            const boundingRect = e.getBoundingClientRect();
            return {
                top: boundingRect.top * zoom,
                bottom: boundingRect.bottom * zoom,
                right: boundingRect.right * zoom,
                left: boundingRect.left * zoom,
            };
        };
        const targetBounds = this._target.targetElements.map(e => getZoomAccountedBoundingClientRect(e));
        const { top, right, bottom, left } = targetBounds[0];
        const width = right - left;
        const height = bottom - top;
        const targetRect = {
            top, right, bottom, left, width, height,
            center: {
                x: left + (width / 2),
                y: top + (height / 2)
            }
        };
        // These calls adjust the position depending on spacing.
        this.adjustHorizontalHoverPosition(targetRect);
        this.adjustVerticalHoverPosition(targetRect);
        // This call limits the maximum height of the hover.
        this.adjustHoverMaxHeight(targetRect);
        // Offset the hover position if there is a pointer so it aligns with the target element
        this._hoverContainer.style.padding = '';
        this._hoverContainer.style.margin = '';
        if (this._hoverPointer) {
            switch (this._hoverPosition) {
                case 1 /* HoverPosition.RIGHT */:
                    targetRect.left += 3 /* Constants.PointerSize */;
                    targetRect.right += 3 /* Constants.PointerSize */;
                    this._hoverContainer.style.paddingLeft = `${3 /* Constants.PointerSize */}px`;
                    this._hoverContainer.style.marginLeft = `${-3 /* Constants.PointerSize */}px`;
                    break;
                case 0 /* HoverPosition.LEFT */:
                    targetRect.left -= 3 /* Constants.PointerSize */;
                    targetRect.right -= 3 /* Constants.PointerSize */;
                    this._hoverContainer.style.paddingRight = `${3 /* Constants.PointerSize */}px`;
                    this._hoverContainer.style.marginRight = `${-3 /* Constants.PointerSize */}px`;
                    break;
                case 2 /* HoverPosition.BELOW */:
                    targetRect.top += 3 /* Constants.PointerSize */;
                    targetRect.bottom += 3 /* Constants.PointerSize */;
                    this._hoverContainer.style.paddingTop = `${3 /* Constants.PointerSize */}px`;
                    this._hoverContainer.style.marginTop = `${-3 /* Constants.PointerSize */}px`;
                    break;
                case 3 /* HoverPosition.ABOVE */:
                    targetRect.top -= 3 /* Constants.PointerSize */;
                    targetRect.bottom -= 3 /* Constants.PointerSize */;
                    this._hoverContainer.style.paddingBottom = `${3 /* Constants.PointerSize */}px`;
                    this._hoverContainer.style.marginBottom = `${-3 /* Constants.PointerSize */}px`;
                    break;
            }
            targetRect.center.x = targetRect.left + (width / 2);
            targetRect.center.y = targetRect.top + (height / 2);
        }
        this.computeXCordinate(targetRect);
        this.computeYCordinate(targetRect);
        if (this._hoverPointer) {
            // reset
            this._hoverPointer.classList.remove('top');
            this._hoverPointer.classList.remove('left');
            this._hoverPointer.classList.remove('right');
            this._hoverPointer.classList.remove('bottom');
            this.setHoverPointerPosition(targetRect);
        }
        this._hover.onContentsChanged();
    }
    computeXCordinate(target) {
        const hoverWidth = this._hover.containerDomNode.clientWidth + 2 /* Constants.HoverBorderWidth */;
        if (this._target.x !== undefined) {
            this._x = this._target.x;
        }
        else if (this._hoverPosition === 1 /* HoverPosition.RIGHT */) {
            this._x = target.right;
        }
        else if (this._hoverPosition === 0 /* HoverPosition.LEFT */) {
            this._x = target.left - hoverWidth;
        }
        else {
            if (this._hoverPointer) {
                this._x = target.center.x - (this._hover.containerDomNode.clientWidth / 2);
            }
            else {
                this._x = target.left;
            }
            // Hover is going beyond window towards right end
            if (this._x + hoverWidth >= this._targetDocumentElement.clientWidth) {
                this._hover.containerDomNode.classList.add('right-aligned');
                this._x = Math.max(this._targetDocumentElement.clientWidth - hoverWidth - 2 /* Constants.HoverWindowEdgeMargin */, this._targetDocumentElement.clientLeft);
            }
        }
        // Hover is going beyond window towards left end
        if (this._x < this._targetDocumentElement.clientLeft) {
            this._x = target.left + 2 /* Constants.HoverWindowEdgeMargin */;
        }
    }
    computeYCordinate(target) {
        if (this._target.y !== undefined) {
            this._y = this._target.y;
        }
        else if (this._hoverPosition === 3 /* HoverPosition.ABOVE */) {
            this._y = target.top;
        }
        else if (this._hoverPosition === 2 /* HoverPosition.BELOW */) {
            this._y = target.bottom - 2;
        }
        else {
            if (this._hoverPointer) {
                this._y = target.center.y + (this._hover.containerDomNode.clientHeight / 2);
            }
            else {
                this._y = target.bottom;
            }
        }
        // Hover on bottom is going beyond window
        if (this._y > this._targetWindow.innerHeight) {
            this._y = target.bottom;
        }
    }
    adjustHorizontalHoverPosition(target) {
        // Do not adjust horizontal hover position if x cordiante is provided
        if (this._target.x !== undefined) {
            return;
        }
        const hoverPointerOffset = (this._hoverPointer ? 3 /* Constants.PointerSize */ : 0);
        // When force position is enabled, restrict max width
        if (this._forcePosition) {
            const padding = hoverPointerOffset + 2 /* Constants.HoverBorderWidth */;
            if (this._hoverPosition === 1 /* HoverPosition.RIGHT */) {
                this._hover.containerDomNode.style.maxWidth = `${this._targetDocumentElement.clientWidth - target.right - padding}px`;
            }
            else if (this._hoverPosition === 0 /* HoverPosition.LEFT */) {
                this._hover.containerDomNode.style.maxWidth = `${target.left - padding}px`;
            }
            return;
        }
        // Position hover on right to target
        if (this._hoverPosition === 1 /* HoverPosition.RIGHT */) {
            const roomOnRight = this._targetDocumentElement.clientWidth - target.right;
            // Hover on the right is going beyond window.
            if (roomOnRight < this._hover.containerDomNode.clientWidth + hoverPointerOffset) {
                const roomOnLeft = target.left;
                // There's enough room on the left, flip the hover position
                if (roomOnLeft >= this._hover.containerDomNode.clientWidth + hoverPointerOffset) {
                    this._hoverPosition = 0 /* HoverPosition.LEFT */;
                }
                // Hover on the left would go beyond window too
                else {
                    this._hoverPosition = 2 /* HoverPosition.BELOW */;
                }
            }
        }
        // Position hover on left to target
        else if (this._hoverPosition === 0 /* HoverPosition.LEFT */) {
            const roomOnLeft = target.left;
            // Hover on the left is going beyond window.
            if (roomOnLeft < this._hover.containerDomNode.clientWidth + hoverPointerOffset) {
                const roomOnRight = this._targetDocumentElement.clientWidth - target.right;
                // There's enough room on the right, flip the hover position
                if (roomOnRight >= this._hover.containerDomNode.clientWidth + hoverPointerOffset) {
                    this._hoverPosition = 1 /* HoverPosition.RIGHT */;
                }
                // Hover on the right would go beyond window too
                else {
                    this._hoverPosition = 2 /* HoverPosition.BELOW */;
                }
            }
            // Hover on the left is going beyond window.
            if (target.left - this._hover.containerDomNode.clientWidth - hoverPointerOffset <= this._targetDocumentElement.clientLeft) {
                this._hoverPosition = 1 /* HoverPosition.RIGHT */;
            }
        }
    }
    adjustVerticalHoverPosition(target) {
        // Do not adjust vertical hover position if the y coordinate is provided
        // or the position is forced
        if (this._target.y !== undefined || this._forcePosition) {
            return;
        }
        const hoverPointerOffset = (this._hoverPointer ? 3 /* Constants.PointerSize */ : 0);
        // Position hover on top of the target
        if (this._hoverPosition === 3 /* HoverPosition.ABOVE */) {
            // Hover on top is going beyond window
            if (target.top - this._hover.containerDomNode.clientHeight - hoverPointerOffset < 0) {
                this._hoverPosition = 2 /* HoverPosition.BELOW */;
            }
        }
        // Position hover below the target
        else if (this._hoverPosition === 2 /* HoverPosition.BELOW */) {
            // Hover on bottom is going beyond window
            if (target.bottom + this._hover.containerDomNode.offsetHeight + hoverPointerOffset > this._targetWindow.innerHeight) {
                this._hoverPosition = 3 /* HoverPosition.ABOVE */;
            }
        }
    }
    adjustHoverMaxHeight(target) {
        let maxHeight = this._targetWindow.innerHeight * this._maxHeightRatioRelativeToWindow;
        // When force position is enabled, restrict max height
        if (this._forcePosition) {
            const padding = (this._hoverPointer ? 3 /* Constants.PointerSize */ : 0) + 2 /* Constants.HoverBorderWidth */;
            if (this._hoverPosition === 3 /* HoverPosition.ABOVE */) {
                maxHeight = Math.min(maxHeight, target.top - padding);
            }
            else if (this._hoverPosition === 2 /* HoverPosition.BELOW */) {
                maxHeight = Math.min(maxHeight, this._targetWindow.innerHeight - target.bottom - padding);
            }
        }
        this._hover.containerDomNode.style.maxHeight = `${maxHeight}px`;
        if (this._hover.contentsDomNode.clientHeight < this._hover.contentsDomNode.scrollHeight) {
            // Add padding for a vertical scrollbar
            const extraRightPadding = `${this._hover.scrollbar.options.verticalScrollbarSize}px`;
            if (this._hover.contentsDomNode.style.paddingRight !== extraRightPadding) {
                this._hover.contentsDomNode.style.paddingRight = extraRightPadding;
            }
        }
    }
    setHoverPointerPosition(target) {
        if (!this._hoverPointer) {
            return;
        }
        switch (this._hoverPosition) {
            case 0 /* HoverPosition.LEFT */:
            case 1 /* HoverPosition.RIGHT */: {
                this._hoverPointer.classList.add(this._hoverPosition === 0 /* HoverPosition.LEFT */ ? 'right' : 'left');
                const hoverHeight = this._hover.containerDomNode.clientHeight;
                // If hover is taller than target, then show the pointer at the center of target
                if (hoverHeight > target.height) {
                    this._hoverPointer.style.top = `${target.center.y - (this._y - hoverHeight) - 3 /* Constants.PointerSize */}px`;
                }
                // Otherwise show the pointer at the center of hover
                else {
                    this._hoverPointer.style.top = `${Math.round((hoverHeight / 2)) - 3 /* Constants.PointerSize */}px`;
                }
                break;
            }
            case 3 /* HoverPosition.ABOVE */:
            case 2 /* HoverPosition.BELOW */: {
                this._hoverPointer.classList.add(this._hoverPosition === 3 /* HoverPosition.ABOVE */ ? 'bottom' : 'top');
                const hoverWidth = this._hover.containerDomNode.clientWidth;
                // Position pointer at the center of the hover
                let pointerLeftPosition = Math.round((hoverWidth / 2)) - 3 /* Constants.PointerSize */;
                // If pointer goes beyond target then position it at the center of the target
                const pointerX = this._x + pointerLeftPosition;
                if (pointerX < target.left || pointerX > target.right) {
                    pointerLeftPosition = target.center.x - this._x - 3 /* Constants.PointerSize */;
                }
                this._hoverPointer.style.left = `${pointerLeftPosition}px`;
                break;
            }
        }
    }
    focus() {
        this._hover.containerDomNode.focus();
    }
    hide() {
        this.dispose();
    }
    dispose() {
        if (!this._isDisposed) {
            this._onDispose.fire();
            this._target.dispose?.();
            this._hoverContainer.remove();
            this._messageListeners.dispose();
            super.dispose();
        }
        this._isDisposed = true;
    }
};
HoverWidget = __decorate([
    __param(1, IKeybindingService),
    __param(2, IConfigurationService),
    __param(3, IMarkdownRendererService),
    __param(4, IAccessibilityService)
], HoverWidget);
export { HoverWidget };
class CompositeMouseTracker extends Widget {
    get onMouseOut() { return this._onMouseOut.event; }
    get isMouseIn() { return this._isMouseIn; }
    /**
     * @param _elements The target elements to track mouse in/out events on.
     * @param _eventDebounceDelay The delay in ms to debounce the event firing. This is used to
     * allow a short period for the mouse to move into the hover or a nearby target element. For
     * example hovering a scroll bar will not hide the hover immediately.
     */
    constructor(_elements, _eventDebounceDelay = 200) {
        super();
        this._elements = _elements;
        this._eventDebounceDelay = _eventDebounceDelay;
        this._isMouseIn = true;
        this._mouseTimer = this._register(new MutableDisposable());
        this._onMouseOut = this._register(new Emitter());
        for (const element of this._elements) {
            this.onmouseover(element, () => this._onTargetMouseOver());
            this.onmouseleave(element, () => this._onTargetMouseLeave());
        }
    }
    _onTargetMouseOver() {
        this._isMouseIn = true;
        this._mouseTimer.clear();
    }
    _onTargetMouseLeave() {
        this._isMouseIn = false;
        // Evaluate whether the mouse is still outside asynchronously such that other mouse targets
        // have the opportunity to first their mouse in event.
        this._mouseTimer.value = new TimeoutTimer(() => this._fireIfMouseOutside(), this._eventDebounceDelay);
    }
    _fireIfMouseOutside() {
        if (!this._isMouseIn) {
            this._onMouseOut.fire();
        }
    }
    /**
     * Adds an element to be tracked by this mouse tracker. Mouse events on this
     * element will be considered as being "inside" the tracked area.
     */
    addElement(element) {
        if (this._elements.includes(element)) {
            return Disposable.None;
        }
        this._elements.push(element);
        const store = new DisposableStore();
        store.add(dom.addDisposableListener(element, dom.EventType.MOUSE_OVER, () => this._onTargetMouseOver()));
        store.add(dom.addDisposableListener(element, dom.EventType.MOUSE_LEAVE, () => this._onTargetMouseLeave()));
        store.add(toDisposable(() => {
            const index = this._elements.indexOf(element);
            if (index >= 0) {
                this._elements.splice(index, 1);
            }
        }));
        return store;
    }
}
class ElementHoverTarget {
    constructor(_element) {
        this._element = _element;
        this.targetElements = [this._element];
    }
    dispose() {
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaG92ZXJXaWRnZXQuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9wbGF0Zm9ybS9ob3Zlci9icm93c2VyL2hvdmVyV2lkZ2V0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sYUFBYSxDQUFDO0FBQ3JCLE9BQU8sRUFBRSxVQUFVLEVBQUUsZUFBZSxFQUFlLGlCQUFpQixFQUFFLFlBQVksRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQzlILE9BQU8sRUFBUyxPQUFPLEVBQUUsTUFBTSwrQkFBK0IsQ0FBQztBQUMvRCxPQUFPLEtBQUssR0FBRyxNQUFNLDhCQUE4QixDQUFDO0FBQ3BELE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBRTNFLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLDZDQUE2QyxDQUFDO0FBQ3BGLE9BQU8sRUFBRSxXQUFXLEVBQWlCLFdBQVcsSUFBSSxlQUFlLEVBQUUsMEJBQTBCLEVBQUUsTUFBTSwrQ0FBK0MsQ0FBQztBQUN2SixPQUFPLEVBQUUsTUFBTSxFQUFFLE1BQU0sb0NBQW9DLENBQUM7QUFFNUQsT0FBTyxFQUFFLHdCQUF3QixFQUFFLE1BQU0sNENBQTRDLENBQUM7QUFDdEYsT0FBTyxFQUFFLGdCQUFnQixFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDdkUsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLGlCQUFpQixDQUFDO0FBQzNDLE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUMvRCxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSw2Q0FBNkMsQ0FBQztBQUNwRixPQUFPLEVBQUUsTUFBTSxFQUFFLE1BQU0sdUNBQXVDLENBQUM7QUFFL0QsT0FBTyxFQUFFLFlBQVksRUFBRSxNQUFNLCtCQUErQixDQUFDO0FBQzdELE9BQU8sRUFB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