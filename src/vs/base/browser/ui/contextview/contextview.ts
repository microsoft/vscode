/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BrowserFeatures } from '../../canIUse.js';
import * as DOM from '../../dom.js';
import { createStyleSheet } from '../../domStylesheets.js';
import { StandardMouseEvent } from '../../mouseEvent.js';
import { onUnexpectedError } from '../../../common/errors.js';
import { Disposable, DisposableStore, IDisposable, toDisposable } from '../../../common/lifecycle.js';
import { AnchorAlignment, AnchorAxisAlignment, AnchorPosition, IRect, layout2d } from '../../../common/layout.js';
import * as platform from '../../../common/platform.js';
import { OmitOptional } from '../../../common/types.js';
import './contextview.css';

export { AnchorAlignment, AnchorAxisAlignment, AnchorPosition } from '../../../common/layout.js';

export const enum ContextViewDOMPosition {
	ABSOLUTE = 1,
	FIXED,
	FIXED_SHADOW,
	/**
	 * Hosts the view inside the container (the owner) as a manual popover,
	 * so focus stays inside the owner while the view renders in the top layer.
	 */
	POPOVER,
	/**
	 * Like {@link ContextViewDOMPosition.POPOVER}, with the view in a shadow root.
	 */
	POPOVER_SHADOW
}

export function isPopoverDOMPosition(domPosition: ContextViewDOMPosition): boolean {
	return domPosition === ContextViewDOMPosition.POPOVER || domPosition === ContextViewDOMPosition.POPOVER_SHADOW;
}

export interface IContextViewRenderContext {
	/**
	 * Where the view is actually hosted. A popover position can fall back
	 * to a fixed position when the popover cannot be shown.
	 */
	readonly domPosition: ContextViewDOMPosition;
}

export interface IContextViewOptions {
	/**
	 * Returns the container to use when a popover cannot be shown in its owner.
	 * Defaults to the owner's document body.
	 */
	readonly getFallbackContainer?: (owner: HTMLElement) => HTMLElement;
}

export interface IAnchor {
	x: number;
	y: number;
	width?: number;
	height?: number;
}

export function isAnchor(obj: unknown): obj is IAnchor | OmitOptional<IAnchor> {
	const anchor = obj as IAnchor | OmitOptional<IAnchor> | undefined;

	return !!anchor && typeof anchor.x === 'number' && typeof anchor.y === 'number';
}

export interface IDelegate {
	/**
	 * The anchor where to position the context view.
	 * Use a `HTMLElement` to position the view at the element,
	 * a `StandardMouseEvent` to position it at the mouse position
	 * or an `IAnchor` to position it at a specific location.
	 */
	getAnchor(): HTMLElement | StandardMouseEvent | IAnchor;
	render(container: HTMLElement, context?: IContextViewRenderContext): IDisposable | null;
	focus?(): void;
	layout?(): void;
	anchorAlignment?: AnchorAlignment; // default: left
	anchorPosition?: AnchorPosition; // default: below
	anchorAxisAlignment?: AnchorAxisAlignment; // default: vertical
	canRelayout?: boolean; // default: true
	onDOMEvent?(e: Event, activeElement: HTMLElement): void;
	onHide?(data?: unknown): void;
	closeAnimation?: IContextViewCloseAnimation;

	/**
	 * context views with higher layers are rendered higher in z-index order
	 */
	layer?: number; // Default: 0
}

export interface IContextViewCloseAnimation {
	readonly className: string;
	readonly duration: number;
	/** Requirements must match one ancestor; a nested array accepts any listed class. */
	readonly requiredAncestorClasses?: readonly (string | readonly string[])[];
}

export function hasRequiredAncestorClasses(element: HTMLElement, classNames: IContextViewCloseAnimation['requiredAncestorClasses']): boolean {
	if (!classNames?.length) {
		return true;
	}

	for (let candidate: HTMLElement | null = element; candidate;) {
		const current: HTMLElement = candidate;
		if (classNames.every(requirement => typeof requirement === 'string'
			? current.classList.contains(requirement)
			: requirement.some(className => current.classList.contains(className)))) {
			return true;
		}

		if (current.parentElement) {
			candidate = current.parentElement;
		} else {
			const root = current.getRootNode();
			candidate = root instanceof ShadowRoot && DOM.isHTMLElement(root.host) ? root.host : null;
		}
	}

	return false;
}

export const CONTEXT_VIEW_MENU_MOTION_CLASS = 'context-view-menu-motion';
export const CONTEXT_VIEW_MENU_MOTION_CLOSING_CLASS = 'context-view-menu-motion-closing';
export const CONTEXT_VIEW_MENU_MOTION_CLOSE_ANIMATION_DURATION = 150;
export const CONTEXT_VIEW_MENU_MOTION_ANCESTOR_CLASSES = [['modern-ui', 'modern-ui-frosted-glass'], 'monaco-enable-motion'] as const;
export const CONTEXT_VIEW_CLOSE_ANIMATION_DURATION_VARIABLE = '--vscode-context-view-close-animation-duration';
export const CONTEXT_VIEW_MENU_MOTION_SHADOW_VARIABLE = '--vscode-context-view-menu-motion-shadow';
/** Inherited while an opacity animation isolates descendant menu backdrops. */
export const CONTEXT_VIEW_MENU_MOTION_BACKDROP_OPACITY_VARIABLE = '--vscode-context-view-menu-motion-backdrop-opacity';
export const CONTEXT_VIEW_MENU_MOTION_CLOSE_START_OPACITY_VARIABLE = '--vscode-context-view-menu-motion-close-start-opacity';
export const CONTEXT_VIEW_MENU_MOTION_CLOSE_START_TRANSFORM_VARIABLE = '--vscode-context-view-menu-motion-close-start-transform';

export const CONTEXT_VIEW_MENU_MOTION_OPEN_DURATION_MS = 250;
export const CONTEXT_VIEW_MENU_MOTION_EASING = 'cubic-bezier(0.22, 1, 0.36, 1)';

export const contextViewMenuCloseAnimation: IContextViewCloseAnimation = {
	className: CONTEXT_VIEW_MENU_MOTION_CLOSING_CLASS,
	duration: CONTEXT_VIEW_MENU_MOTION_CLOSE_ANIMATION_DURATION,
	requiredAncestorClasses: CONTEXT_VIEW_MENU_MOTION_ANCESTOR_CLASSES,
};

function getContextViewMenuMotionCss(enabledSelectorPrefix: string): string {
	return /* css */ `
	${enabledSelectorPrefix} .context-view.${CONTEXT_VIEW_MENU_MOTION_CLASS} {
		animation: none;
		box-shadow: none;
		overflow: visible;
	}

	${enabledSelectorPrefix} .context-view.${CONTEXT_VIEW_MENU_MOTION_CLASS} > .monaco-scrollable-element {
		animation: context-view-menu-motion-open ${CONTEXT_VIEW_MENU_MOTION_OPEN_DURATION_MS}ms ${CONTEXT_VIEW_MENU_MOTION_EASING} backwards;
		box-shadow: var(${CONTEXT_VIEW_MENU_MOTION_SHADOW_VARIABLE});
		transform-origin: top left;
		will-change: opacity;
	}

	${enabledSelectorPrefix} .context-view.${CONTEXT_VIEW_MENU_MOTION_CLASS}.right > .monaco-scrollable-element {
		transform-origin: top right;
	}

	${enabledSelectorPrefix} .context-view.${CONTEXT_VIEW_MENU_MOTION_CLASS}.top > .monaco-scrollable-element {
		transform-origin: bottom left;
	}

	${enabledSelectorPrefix} .context-view.${CONTEXT_VIEW_MENU_MOTION_CLASS}.top.right > .monaco-scrollable-element {
		transform-origin: bottom right;
	}

	${enabledSelectorPrefix} .context-view.${CONTEXT_VIEW_MENU_MOTION_CLASS}.${CONTEXT_VIEW_MENU_MOTION_CLOSING_CLASS} > .monaco-scrollable-element {
		animation: context-view-menu-motion-close var(${CONTEXT_VIEW_CLOSE_ANIMATION_DURATION_VARIABLE}) ${CONTEXT_VIEW_MENU_MOTION_EASING} both;
		pointer-events: none;
	}

	@keyframes context-view-menu-motion-open {
		from, to {
			${CONTEXT_VIEW_MENU_MOTION_BACKDROP_OPACITY_VARIABLE}: 100%;
		}

		0% {
			opacity: 0;
			transform: scale(0.97);
		}

		100% {
			opacity: 1;
			transform: scale(1);
		}
	}

	@keyframes context-view-menu-motion-close {
		from, to {
			${CONTEXT_VIEW_MENU_MOTION_BACKDROP_OPACITY_VARIABLE}: 100%;
		}

		0% {
			opacity: var(${CONTEXT_VIEW_MENU_MOTION_CLOSE_START_OPACITY_VARIABLE}, 1);
			transform: var(${CONTEXT_VIEW_MENU_MOTION_CLOSE_START_TRANSFORM_VARIABLE}, scale(1));
		}

		100% {
			opacity: 0;
			transform: scale(0.99);
		}
	}`;
}

let contextViewMenuMotionStyleSheet: HTMLStyleElement | undefined;

function ensureContextViewMenuMotionStyleSheet(): void {
	if (!contextViewMenuMotionStyleSheet) {
		contextViewMenuMotionStyleSheet = createStyleSheet(undefined, style => {
			style.textContent = getContextViewMenuMotionCss('.modern-ui.monaco-enable-motion');
		});
	}
}

export interface IContextViewProvider {
	showContextView(delegate: IDelegate, container?: HTMLElement): void;
	hideContextView(): void;
	layout(): void;
}

export function getAnchorRect(anchor: HTMLElement | StandardMouseEvent | IAnchor): IRect {
	// Get the element's position and size (to anchor the view)
	if (DOM.isHTMLElement(anchor)) {
		const elementPosition = DOM.getDomNodePagePosition(anchor);

		// In areas where zoom is applied to the element or its ancestors, we need to adjust the size of the element
		// e.g. The title bar has counter zoom behavior meaning it applies the inverse of zoom level.
		// Window Zoom Level: 1.5, Title Bar Zoom: 1/1.5, Size Multiplier: 1.5
		const zoom = DOM.getDomNodeZoomLevel(anchor);

		return {
			top: elementPosition.top * zoom,
			left: elementPosition.left * zoom,
			width: elementPosition.width * zoom,
			height: elementPosition.height * zoom
		};
	} else if (isAnchor(anchor)) {
		return {
			top: anchor.y,
			left: anchor.x,
			width: anchor.width || 1,
			height: anchor.height || 2
		};
	} else {
		return {
			top: anchor.posy,
			left: anchor.posx,
			// We are about to position the context view where the mouse
			// cursor is. To prevent the view being exactly under the mouse
			// when showing and thus potentially triggering an action within,
			// we treat the mouse location like a small sized block element.
			width: 2,
			height: 2
		};
	}
}

function getDeepActiveElement(doc: Document): Element | null {
	let result = doc.activeElement;
	while (result?.shadowRoot?.activeElement) {
		result = result.shadowRoot.activeElement;
	}
	return result;
}

/**
 * The context view of the document that contains focus, including
 * context views hosted in a shadow root.
 */
export function getFocusedContextView(doc: Document): HTMLElement | undefined {
	const activeElement = getDeepActiveElement(doc);
	return DOM.isHTMLElement(activeElement) ? DOM.findParentWithClass(activeElement, 'context-view') ?? undefined : undefined;
}

/**
 * Whether focus is inside a context view of the document, including
 * context views hosted in a shadow root.
 */
export function isContextViewFocused(doc: Document): boolean {
	return !!getFocusedContextView(doc);
}

export class ContextView extends Disposable {

	private static readonly BUBBLE_UP_EVENTS = ['click', 'keydown', 'focus', 'blur'];
	private static readonly BUBBLE_DOWN_EVENTS = ['click'];
	private static readonly ISOLATED_KEY_EVENTS = ['keydown', 'keyup', 'keypress'];

	private container: HTMLElement | null = null;
	private view: HTMLElement;
	private useFixedPosition = false;
	private useShadowDOM = false;
	private delegate: IDelegate | null = null;
	private toDisposeOnClean: IDisposable = Disposable.None;
	private toDisposeOnSetContainer: IDisposable = Disposable.None;
	private hidingContextView: { readonly disposable: IDisposable; readonly toDispose: IDisposable; readonly className: string } | undefined;
	private shadowRoot: ShadowRoot | null = null;
	private shadowRootHostElement: HTMLElement | null = null;
	private domPosition: ContextViewDOMPosition = ContextViewDOMPosition.ABSOLUTE;
	private readonly toDisposeOnPopoverHide = this._register(new DisposableStore());
	private focusToRestore: HTMLElement | null = null;
	private showCount = 0;

	constructor(container: HTMLElement, domPosition: ContextViewDOMPosition, private readonly options: IContextViewOptions = {}) {
		super();

		ensureContextViewMenuMotionStyleSheet();

		this.view = DOM.$('.context-view');
		DOM.hide(this.view);

		this.setContainer(container, domPosition);
		this._register(toDisposable(() => this.setContainer(null, ContextViewDOMPosition.ABSOLUTE)));
	}

	setContainer(container: HTMLElement | null, domPosition: ContextViewDOMPosition): void {
		const previousDOMPosition = this.domPosition;
		const usedShadowDOM = this.useShadowDOM;
		const useShadowDOM = domPosition === ContextViewDOMPosition.FIXED_SHADOW || domPosition === ContextViewDOMPosition.POPOVER_SHADOW;
		const unchanged = container === this.container && usedShadowDOM === useShadowDOM && isPopoverDOMPosition(previousDOMPosition) === isPopoverDOMPosition(domPosition);

		// Tear down the previous popover while its position is still current, so
		// that its owner tracking is disposed and its top layer entry is closed
		if (this.container && !unchanged && isPopoverDOMPosition(previousDOMPosition)) {
			this.hide(undefined, true);
			this.completeHideAnimation();
		}

		this.domPosition = domPosition;
		this.useFixedPosition = domPosition !== ContextViewDOMPosition.ABSOLUTE;
		this.useShadowDOM = useShadowDOM;

		if (unchanged) {
			return; // container is the same and neither shadow DOM nor popover usage has changed
		}

		if (this.container) {
			this.toDisposeOnSetContainer.dispose();

			this.view.remove();
			this.view.removeAttribute('popover');
			if (this.shadowRoot) {
				this.shadowRoot = null;
				this.shadowRootHostElement?.remove();
				this.shadowRootHostElement = null;
			}

			this.container = null;
		}

		if (container) {
			this.container = container;
			const isPopover = isPopoverDOMPosition(domPosition);

			if (this.useShadowDOM) {
				this.shadowRootHostElement = DOM.$('.shadow-root-host');
				Object.assign(this.shadowRootHostElement.style, {
					position: 'fixed',
					top: '0',
					left: '0',
					width: '0',
					height: '0'
				});
				if (isPopover) {
					// Attached to the owner only while shown, see showPopover.
					// contextview.css resets the user agent popover styles
					this.shadowRootHostElement.setAttribute('popover', 'manual');
				} else {
					this.container.appendChild(this.shadowRootHostElement);
				}
				this.shadowRoot = this.shadowRootHostElement.attachShadow({ mode: 'open' });
				const style = document.createElement('style');
				style.textContent = SHADOW_ROOT_CSS;
				this.shadowRoot.appendChild(style);
				this.shadowRoot.appendChild(this.view);
				this.shadowRoot.appendChild(DOM.$('slot'));
			} else {
				if (isPopover) {
					// Attached to the owner only while shown, see showPopover.
					// contextview.css resets the user agent popover styles
					this.view.setAttribute('popover', 'manual');
				} else {
					this.container.appendChild(this.view);
				}
			}

			const toDisposeOnSetContainer = new DisposableStore();

			if (isPopover) {
				// Keep keys pressed in the view from reaching the owner or
				// window-level keybinding listeners while the view is hosted.
				const popoverElement = this.getPopoverElement();
				ContextView.ISOLATED_KEY_EVENTS.forEach(event => {
					toDisposeOnSetContainer.add(DOM.addDisposableListener(popoverElement, event, e => e.stopPropagation()));
				});
			}

			ContextView.BUBBLE_UP_EVENTS.forEach(event => {
				toDisposeOnSetContainer.add(DOM.addStandardDisposableListener(this.container!, event, e => {
					this.onDOMEvent(e, false);
				}));
			});

			ContextView.BUBBLE_DOWN_EVENTS.forEach(event => {
				toDisposeOnSetContainer.add(DOM.addStandardDisposableListener(this.container!, event, e => {
					this.onDOMEvent(e, true);
				}, true));
			});

			this.toDisposeOnSetContainer = toDisposeOnSetContainer;
		}
	}

	show(delegate: IDelegate): void {
		this.showCount++;
		this.completeHideAnimation();

		if (this.isVisible()) {
			this.hide(undefined, true);
		}

		const ownerDocument = this.container?.ownerDocument ?? DOM.getActiveDocument();
		const activeElement = getDeepActiveElement(ownerDocument);
		this.focusToRestore = DOM.isHTMLElement(activeElement) ? activeElement : null;

		if (isPopoverDOMPosition(this.domPosition)) {
			this.showPopover();
		}

		// Show static box
		DOM.clearNode(this.view);
		this.view.className = 'context-view monaco-component';
		this.view.style.top = '0px';
		this.view.style.left = '0px';
		const zIndex = `${2575 + (delegate.layer ?? 0)}`;
		this.view.style.zIndex = zIndex;
		if (this.shadowRootHostElement) {
			this.shadowRootHostElement.style.zIndex = zIndex;
		}
		this.view.style.position = this.useFixedPosition ? 'fixed' : 'absolute';
		DOM.show(this.view);

		// Render content
		this.toDisposeOnClean = delegate.render(this.view, { domPosition: this.domPosition }) || Disposable.None;

		// Set active delegate
		this.delegate = delegate;

		if (isPopoverDOMPosition(this.domPosition)) {
			this.trackPopoverOwner();
		}

		// Layout
		this.doLayout();

		// Layout hides the view when its popover owner is hidden or removed,
		// for example by rendering; do not move focus into a hidden view
		if (this.delegate !== delegate) {
			return;
		}

		// Focus
		delegate.focus?.();
	}

	getViewElement(): HTMLElement {
		return this.view;
	}

	/**
	 * The position the view is hosted at, after any popover fallback.
	 */
	getEffectiveDOMPosition(): ContextViewDOMPosition {
		return this.domPosition;
	}

	private getPopoverElement(): HTMLElement {
		return this.shadowRootHostElement ?? this.view;
	}

	private showPopover(): void {
		const owner = this.container;
		if (!owner) {
			return;
		}

		// Fall back to a fixed position without the Popover API or a connected
		// owner; only report a failure to show a popover that should have shown
		const popoverElement = this.getPopoverElement();
		if (typeof popoverElement.showPopover === 'function' && owner.isConnected) {
			try {
				if (popoverElement.parentElement !== owner) {
					adoptPopoverResetStyles(owner);
					owner.appendChild(popoverElement);
				}
				if (!popoverElement.matches(':popover-open')) {
					popoverElement.showPopover();
				}
				return;
			} catch (e) {
				onUnexpectedError(e);
			}
		}

		popoverElement.remove();
		const fallbackContainer = this.options.getFallbackContainer?.(owner) ?? DOM.getWindow(owner).document.body;
		this.setContainer(fallbackContainer, this.domPosition === ContextViewDOMPosition.POPOVER_SHADOW ? ContextViewDOMPosition.FIXED_SHADOW : ContextViewDOMPosition.FIXED);
	}

	private trackPopoverOwner(): void {
		const owner = this.container;
		if (!owner) {
			return;
		}

		const popoverElement = this.getPopoverElement();
		const targetWindow = DOM.getWindow(owner);

		// Dismiss on pointer presses outside both the view and its owner, without restoring focus
		this.toDisposeOnPopoverHide.add(DOM.addDisposableListener(targetWindow, DOM.EventType.POINTER_DOWN, e => {
			const path = e.composedPath();
			if (!path.includes(popoverElement) && !path.includes(owner)) {
				this.hideWithoutRestoringFocus();
			}
		}, true));

		const ResizeObserverCtor = (targetWindow as Window & typeof globalThis).ResizeObserver;
		if (typeof ResizeObserverCtor === 'function') {
			const observer = new ResizeObserverCtor(() => this.checkPopoverOwner());
			observer.observe(owner);
			this.toDisposeOnPopoverHide.add(toDisposable(() => observer.disconnect()));
		}
	}

	private isPopoverOwnerLost(): boolean {
		const owner = this.container;
		return !owner || !owner.isConnected || owner.getClientRects().length === 0;
	}

	private checkPopoverOwner(): boolean {
		if (this.isVisible() && isPopoverDOMPosition(this.domPosition) && this.isPopoverOwnerLost()) {
			this.hideWithoutRestoringFocus();
			return false;
		}
		return true;
	}

	private hideWithoutRestoringFocus(): void {
		this.focusToRestore = null;
		this.hide(undefined, true);
	}

	private restorePopoverFocus(): void {
		const focusToRestore = this.focusToRestore;
		this.focusToRestore = null;
		if (!focusToRestore?.isConnected) {
			return;
		}

		const activeElement = getDeepActiveElement(focusToRestore.ownerDocument);
		if (activeElement && (activeElement === focusToRestore.ownerDocument.body || DOM.isAncestor(activeElement, this.view))) {
			focusToRestore.focus();
		}
	}

	private hidePopover(): void {
		this.toDisposeOnPopoverHide.clear();

		const popoverElement = this.getPopoverElement();
		if (popoverElement.hasAttribute('popover') && popoverElement.matches(':popover-open')) {
			popoverElement.hidePopover();
		}

		// Leave nothing behind in the owner, which may be an arbitrary element such as an input's parent
		popoverElement.remove();
	}

	layout(): void {
		if (!this.isVisible()) {
			return;
		}

		if (this.delegate!.canRelayout === false && !(platform.isIOS && BrowserFeatures.pointerEvents)) {
			this.hide();
			return;
		}

		this.delegate?.layout?.();

		this.doLayout();
	}

	private doLayout(): void {
		// Check that we still have a delegate - this.delegate.layout may have hidden
		if (!this.isVisible()) {
			return;
		}

		if (!this.checkPopoverOwner()) {
			return;
		}

		// Get anchor
		const anchor = getAnchorRect(this.delegate!.getAnchor());
		const containerWindow = this.container ? DOM.getWindow(this.container) : DOM.getActiveWindow();
		const viewport = { top: containerWindow.pageYOffset, left: containerWindow.pageXOffset, width: containerWindow.innerWidth, height: containerWindow.innerHeight };
		this.view.classList.toggle('fixed', this.useFixedPosition);
		this.view.style.top = '0px';
		this.view.style.left = '0px';
		const positioningOrigin = DOM.getDomNodePagePosition(this.view);
		const view = { width: DOM.getTotalWidth(this.view), height: DOM.getTotalHeight(this.view) };
		const anchorPosition = this.delegate!.anchorPosition;
		const anchorAlignment = this.delegate!.anchorAlignment;
		const anchorAxisAlignment = this.delegate!.anchorAxisAlignment;
		const layoutResult = layout2d(viewport, view, anchor, { anchorAlignment, anchorPosition, anchorAxisAlignment });
		const { top, left } = layoutResult;

		this.view.classList.remove('top', 'bottom', 'left', 'right');
		this.view.classList.add(layoutResult.anchorPosition === AnchorPosition.BELOW ? 'bottom' : 'top');
		this.view.classList.add(layoutResult.anchorAlignment === AnchorAlignment.LEFT ? 'left' : 'right');

		this.view.style.top = `${top - positioningOrigin.top}px`;
		this.view.style.left = `${left - positioningOrigin.left}px`;
		this.view.style.width = 'initial';
	}

	hide(data?: unknown, skipAnimation = false): void {
		if (this.hidingContextView) {
			if (skipAnimation) {
				this.completeHideAnimation();
			}
			return;
		}

		const delegate = this.delegate;
		this.delegate = null;

		if (!delegate) {
			return;
		}

		const toDispose = this.toDisposeOnClean;
		this.toDisposeOnClean = Disposable.None;

		delegate.onHide?.(data);

		const isPopover = isPopoverDOMPosition(this.domPosition);
		if (isPopover) {
			// Stop tracking the owner first, then restore focus before the view
			// becomes inert or hidden, so that focus never leaves the owner
			this.toDisposeOnPopoverHide.clear();
			const showCount = this.showCount;
			this.restorePopoverFocus();
			if (this.showCount !== showCount) {
				// Restoring focus showed another view, for example an input box
				// message; it now owns the view, so only clean up this rendering
				toDispose.dispose();
				return;
			}
		} else {
			this.focusToRestore = null;
		}

		const closeAnimation = delegate.closeAnimation;
		if (!skipAnimation && closeAnimation && closeAnimation.duration > 0 && hasRequiredAncestorClasses(this.view, closeAnimation.requiredAncestorClasses)) {
			this.view.style.setProperty(CONTEXT_VIEW_CLOSE_ANIMATION_DURATION_VARIABLE, `${closeAnimation.duration}ms`);
			this.prepareMenuCloseAnimation();
			this.view.inert = true;
			this.view.classList.add(closeAnimation.className);
			const timeout = setTimeout(() => this.completeHideAnimation(), closeAnimation.duration);
			this.hidingContextView = {
				disposable: toDisposable(() => clearTimeout(timeout)),
				toDispose,
				className: closeAnimation.className
			};
			return;
		}

		DOM.hide(this.view);
		if (isPopover) {
			this.hidePopover();
		}
		toDispose.dispose();
	}

	private isVisible(): boolean {
		return !!this.delegate;
	}

	private completeHideAnimation(): void {
		const hidingContextView = this.hidingContextView;
		if (!hidingContextView) {
			return;
		}

		this.hidingContextView = undefined;
		hidingContextView.disposable.dispose();
		this.view.classList.remove(hidingContextView.className);
		this.view.style.removeProperty(CONTEXT_VIEW_CLOSE_ANIMATION_DURATION_VARIABLE);
		this.view.style.removeProperty(CONTEXT_VIEW_MENU_MOTION_CLOSE_START_OPACITY_VARIABLE);
		this.view.style.removeProperty(CONTEXT_VIEW_MENU_MOTION_CLOSE_START_TRANSFORM_VARIABLE);
		DOM.hide(this.view);
		this.view.inert = false;
		if (isPopoverDOMPosition(this.domPosition)) {
			this.hidePopover();
		}
		hidingContextView.toDispose.dispose();
	}

	private prepareMenuCloseAnimation(): void {
		if (!this.view.classList.contains(CONTEXT_VIEW_MENU_MOTION_CLASS)) {
			return;
		}

		const surface = Array.from(this.view.children).find(element => DOM.isHTMLElement(element) && element.classList.contains('monaco-scrollable-element'));
		if (!DOM.isHTMLElement(surface)) {
			return;
		}

		const computedStyle = DOM.getWindow(surface).getComputedStyle(surface);
		this.view.style.setProperty(CONTEXT_VIEW_MENU_MOTION_CLOSE_START_OPACITY_VARIABLE, computedStyle.opacity);
		this.view.style.setProperty(CONTEXT_VIEW_MENU_MOTION_CLOSE_START_TRANSFORM_VARIABLE, computedStyle.transform);
	}

	private onDOMEvent(e: UIEvent, onCapture: boolean): void {
		if (this.delegate) {
			if (this.delegate.onDOMEvent) {
				this.delegate.onDOMEvent(e, <HTMLElement>DOM.getWindow(e).document.activeElement);
			} else if (onCapture && !DOM.isAncestor(<HTMLElement>e.target, this.container)) {
				this.hide();
			}
		}
	}

	override dispose(): void {
		this.hide(undefined, true);
		this.completeHideAnimation();

		super.dispose();
	}
}

// Mirrors the popover reset in contextview.css, whose rules do not reach an
// owner inside a shadow root
const POPOVER_RESET_CSS = /* css */ `
	.context-view[popover],
	.shadow-root-host[popover] {
		position: fixed;
		inset: auto;
		width: auto;
		height: auto;
		margin: 0;
		padding: 0;
		border: 0;
		overflow: visible;
		color: inherit;
		background: transparent;
	}
`;

const shadowRootsWithPopoverReset = new WeakSet<ShadowRoot>();

function adoptPopoverResetStyles(owner: HTMLElement): void {
	const shadowRoot = DOM.getShadowRoot(owner);
	if (shadowRoot && !shadowRootsWithPopoverReset.has(shadowRoot)) {
		shadowRootsWithPopoverReset.add(shadowRoot);
		const style = owner.ownerDocument.createElement('style');
		style.textContent = POPOVER_RESET_CSS;
		shadowRoot.appendChild(style);
	}
}

const SHADOW_ROOT_CSS = /* css */ `
	:host {
		all: initial; /* 1st rule so subsequent properties are reset. */
	}

	.codicon[class*='codicon-'] {
		font: normal normal normal 16px/1 codicon;
		display: inline-block;
		text-decoration: none;
		text-rendering: auto;
		text-align: center;
		-webkit-font-smoothing: antialiased;
		-moz-osx-font-smoothing: grayscale;
		user-select: none;
		-webkit-user-select: none;
		-ms-user-select: none;
	}

	:host {
		font-family: -apple-system, BlinkMacSystemFont, "Segoe WPC", "Segoe UI", "HelveticaNeue-Light", system-ui, "Ubuntu", "Droid Sans", sans-serif;
	}

	:host-context(.mac) { font-family: -apple-system, BlinkMacSystemFont, sans-serif; }
	:host-context(.mac:lang(zh-Hans)) { font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB", sans-serif; }
	:host-context(.mac:lang(zh-Hant)) { font-family: -apple-system, BlinkMacSystemFont, "PingFang TC", sans-serif; }
	:host-context(.mac:lang(ja)) { font-family: -apple-system, BlinkMacSystemFont, "Hiragino Kaku Gothic Pro", sans-serif; }
	:host-context(.mac:lang(ko)) { font-family: -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Nanum Gothic", "AppleGothic", sans-serif; }

	:host-context(.windows) { font-family: "Segoe WPC", "Segoe UI", sans-serif; }
	:host-context(.windows:lang(zh-Hans)) { font-family: "Segoe WPC", "Segoe UI", "Microsoft YaHei", sans-serif; }
	:host-context(.windows:lang(zh-Hant)) { font-family: "Segoe WPC", "Segoe UI", "Microsoft Jhenghei", sans-serif; }
	:host-context(.windows:lang(ja)) { font-family: "Segoe WPC", "Segoe UI", "Yu Gothic UI", "Meiryo UI", sans-serif; }
	:host-context(.windows:lang(ko)) { font-family: "Segoe WPC", "Segoe UI", "Malgun Gothic", "Dotom", sans-serif; }

	:host-context(.linux) { font-family: system-ui, "Ubuntu", "Droid Sans", sans-serif; }
	:host-context(.linux:lang(zh-Hans)) { font-family: system-ui, "Ubuntu", "Droid Sans", "Source Han Sans SC", "Source Han Sans CN", "Source Han Sans", sans-serif; }
	:host-context(.linux:lang(zh-Hant)) { font-family: system-ui, "Ubuntu", "Droid Sans", "Source Han Sans TC", "Source Han Sans TW", "Source Han Sans", sans-serif; }
	:host-context(.linux:lang(ja)) { font-family: system-ui, "Ubuntu", "Droid Sans", "Source Han Sans J", "Source Han Sans JP", "Source Han Sans", sans-serif; }
	:host-context(.linux:lang(ko)) { font-family: system-ui, "Ubuntu", "Droid Sans", "Source Han Sans K", "Source Han Sans JR", "Source Han Sans", "UnDotum", "FBaekmuk Gulim", sans-serif; }
	${getContextViewMenuMotionCss(':host-context(.modern-ui.monaco-enable-motion)')}
`;
