/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DisposableStore } from 'vs/base/common/lifecycle';
import { Event, Emitter } from 'vs/base/common/event';
import * as dom from 'vs/base/browser/dom';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { IHoverTarget, IHoverOptions } from 'vs/workbench/services/hover/browser/hover';
import { KeyCode } from 'vs/base/common/keyCodes';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { EDITOR_FONT_DEFAULTS, IEditorOptions } from 'vs/editor/common/config/editorOptions';
import { HoverAction, HoverPosition, HoverWidget as BaseHoverWidget } from 'vs/base/browser/ui/hover/hoverWidget';
import { Widget } from 'vs/base/browser/ui/widget';
import { AnchorPosition } from 'vs/base/browser/ui/contextview/contextview';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { MarkdownRenderer, openLinkFromMarkdown } from 'vs/editor/contrib/markdownRenderer/browser/markdownRenderer';
import { isMarkdownString } from 'vs/base/common/htmlContent';
import { localize } from 'vs/nls';
import { isMacintosh } from 'vs/base/common/platform';

const $ = dom.$;
type TargetRect = {
	left: number;
	right: number;
	top: number;
	bottom: number;
	width: number;
	height: number;
	center: { x: number; y: number };
};

const enum Constants {
	PointerSize = 3,
	HoverBorderWidth = 2,
	HoverWindowEdgeMargin = 2,
}

export class HoverWidget extends Widget {
	private readonly _messageListeners = new DisposableStore();
	private readonly _lockMouseTracker: CompositeMouseTracker;

	private readonly _hover: BaseHoverWidget;
	private readonly _hoverPointer: HTMLElement | undefined;
	private readonly _hoverContainer: HTMLElement;
	private readonly _target: IHoverTarget;
	private readonly _linkHandler: (url: string) => any;

	private _isDisposed: boolean = false;
	private _hoverPosition: HoverPosition;
	private _forcePosition: boolean = false;
	private _x: number = 0;
	private _y: number = 0;
	private _isLocked: boolean = false;
	private _enableFocusTraps: boolean = false;
	private _addedFocusTrap: boolean = false;

	get isDisposed(): boolean { return this._isDisposed; }
	get isMouseIn(): boolean { return this._lockMouseTracker.isMouseIn; }
	get domNode(): HTMLElement { return this._hover.containerDomNode; }

	private readonly _onDispose = this._register(new Emitter<void>());
	get onDispose(): Event<void> { return this._onDispose.event; }
	private readonly _onRequestLayout = this._register(new Emitter<void>());
	get onRequestLayout(): Event<void> { return this._onRequestLayout.event; }

	get anchor(): AnchorPosition { return this._hoverPosition === HoverPosition.BELOW ? AnchorPosition.BELOW : AnchorPosition.ABOVE; }
	get x(): number { return this._x; }
	get y(): number { return this._y; }

	/**
	 * Whether the hover is "locked" by holding the alt/option key. When locked, the hover will not
	 * hide and can be hovered regardless of whether the `hideOnHover` hover option is set.
	 */
	get isLocked(): boolean { return this._isLocked; }
	set isLocked(value: boolean) {
		if (this._isLocked === value) {
			return;
		}
		this._isLocked = value;
		this._hoverContainer.classList.toggle('locked', this._isLocked);
	}

	constructor(
		options: IHoverOptions,
		@IKeybindingService private readonly _keybindingService: IKeybindingService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IOpenerService private readonly _openerService: IOpenerService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
	) {
		super();

		this._linkHandler = options.linkHandler || (url => {
			return openLinkFromMarkdown(this._openerService, url, isMarkdownString(options.content) ? options.content.isTrusted : undefined);
		});

		this._target = 'targetElements' in options.target ? options.target : new ElementHoverTarget(options.target);

		this._hoverPointer = options.showPointer ? $('div.workbench-hover-pointer') : undefined;
		this._hover = this._register(new BaseHoverWidget());
		this._hover.containerDomNode.classList.add('workbench-hover', 'fadeIn');
		if (options.compact) {
			this._hover.containerDomNode.classList.add('workbench-hover', 'compact');
		}
		if (options.skipFadeInAnimation) {
			this._hover.containerDomNode.classList.add('skip-fade-in');
		}
		if (options.additionalClasses) {
			this._hover.containerDomNode.classList.add(...options.additionalClasses);
		}
		if (options.forcePosition) {
			this._forcePosition = true;
		}
		if (options.trapFocus) {
			this._enableFocusTraps = true;
		}

		this._hoverPosition = options.hoverPosition ?? HoverPosition.ABOVE;

		// Don't allow mousedown out of the widget, otherwise preventDefault will call and text will
		// not be selected.
		this.onmousedown(this._hover.containerDomNode, e => e.stopPropagation());

		// Hide hover on escape
		this.onkeydown(this._hover.containerDomNode, e => {
			if (e.equals(KeyCode.Escape)) {
				this.dispose();
			}
		});

		// Hide when the window loses focus
		this._register(dom.addDisposableListener(window, 'blur', () => this.dispose()));

		const rowElement = $('div.hover-row.markdown-hover');
		const contentsElement = $('div.hover-contents');
		if (typeof options.content === 'string') {
			contentsElement.textContent = options.content;
			contentsElement.style.whiteSpace = 'pre-wrap';

		} else if (options.content instanceof HTMLElement) {
			contentsElement.appendChild(options.content);
			contentsElement.classList.add('html-hover-contents');

		} else {
			const markdown = options.content;
			const mdRenderer = this._instantiationService.createInstance(
				MarkdownRenderer,
				{ codeBlockFontFamily: this._configurationService.getValue<IEditorOptions>('editor').fontFamily || EDITOR_FONT_DEFAULTS.fontFamily }
			);

			const { element } = mdRenderer.render(markdown, {
				actionHandler: {
					callback: (content) => this._linkHandler(content),
					disposables: this._messageListeners
				},
				asyncRenderCallback: () => {
					contentsElement.classList.add('code-hover-contents');
					this.layout();
					// This changes the dimensions of the hover so trigger a layout
					this._onRequestLayout.fire();
				}
			});
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
				HoverAction.render(actionsElement, {
					label: action.label,
					commandId: action.commandId,
					run: e => {
						action.run(e);
						this.dispose();
					},
					iconClass: action.iconClass
				}, keybindingLabel);
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
		let hideOnHover: boolean;
		if (options.actions && options.actions.length > 0) {
			// If there are actions, require hover so they can be accessed
			hideOnHover = false;
		} else {
			if (options.hideOnHover === undefined) {
				// When unset, will default to true when it's a string or when it's markdown that
				// appears to have a link using a naive check for '](' and '</a>'
				hideOnHover = typeof options.content === 'string' ||
					isMarkdownString(options.content) && !options.content.value.includes('](') && !options.content.value.includes('</a>');
			} else {
				// It's set explicitly
				hideOnHover = options.hideOnHover;
			}
		}

		// Show the hover hint if needed
		if (hideOnHover && options.showHoverHint) {
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
		} else {
			this._lockMouseTracker = mouseTracker;
		}
	}

	private addFocusTrap() {
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

	private findLastFocusableChild(root: Node): HTMLElement | undefined {
		if (root.hasChildNodes()) {
			for (let i = 0; i < root.childNodes.length; i++) {
				const node = root.childNodes.item(root.childNodes.length - i - 1);
				if (node.nodeType === node.ELEMENT_NODE) {
					const parsedNode = node as HTMLElement;
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

	public render(container: HTMLElement): void {
		container.appendChild(this._hoverContainer);

		this.layout();
		this.addFocusTrap();
	}

	public layout() {
		this._hover.containerDomNode.classList.remove('right-aligned');
		this._hover.contentsDomNode.style.maxHeight = '';

		const getZoomAccountedBoundingClientRect = (e: HTMLElement) => {
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
		const top = Math.min(...targetBounds.map(e => e.top));
		const right = Math.max(...targetBounds.map(e => e.right));
		const bottom = Math.max(...targetBounds.map(e => e.bottom));
		const left = Math.min(...targetBounds.map(e => e.left));
		const width = right - left;
		const height = bottom - top;

		const targetRect: TargetRect = {
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
				case HoverPosition.RIGHT:
					targetRect.left += Constants.PointerSize;
					targetRect.right += Constants.PointerSize;
					this._hoverContainer.style.paddingLeft = `${Constants.PointerSize}px`;
					this._hoverContainer.style.marginLeft = `${-Constants.PointerSize}px`;
					break;
				case HoverPosition.LEFT:
					targetRect.left -= Constants.PointerSize;
					targetRect.right -= Constants.PointerSize;
					this._hoverContainer.style.paddingRight = `${Constants.PointerSize}px`;
					this._hoverContainer.style.marginRight = `${-Constants.PointerSize}px`;
					break;
				case HoverPosition.BELOW:
					targetRect.top += Constants.PointerSize;
					targetRect.bottom += Constants.PointerSize;
					this._hoverContainer.style.paddingTop = `${Constants.PointerSize}px`;
					this._hoverContainer.style.marginTop = `${-Constants.PointerSize}px`;
					break;
				case HoverPosition.ABOVE:
					targetRect.top -= Constants.PointerSize;
					targetRect.bottom -= Constants.PointerSize;
					this._hoverContainer.style.paddingBottom = `${Constants.PointerSize}px`;
					this._hoverContainer.style.marginBottom = `${-Constants.PointerSize}px`;
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

	private computeXCordinate(target: TargetRect): void {
		const hoverWidth = this._hover.containerDomNode.clientWidth + Constants.HoverBorderWidth;

		if (this._target.x !== undefined) {
			this._x = this._target.x;
		}

		else if (this._hoverPosition === HoverPosition.RIGHT) {
			this._x = target.right;
		}

		else if (this._hoverPosition === HoverPosition.LEFT) {
			this._x = target.left - hoverWidth;
		}

		else {
			if (this._hoverPointer) {
				this._x = target.center.x - (this._hover.containerDomNode.clientWidth / 2);
			} else {
				this._x = target.left;
			}

			// Hover is going beyond window towards right end
			if (this._x + hoverWidth >= document.documentElement.clientWidth) {
				this._hover.containerDomNode.classList.add('right-aligned');
				this._x = Math.max(document.documentElement.clientWidth - hoverWidth - Constants.HoverWindowEdgeMargin, document.documentElement.clientLeft);
			}
		}

		// Hover is going beyond window towards left end
		if (this._x < document.documentElement.clientLeft) {
			this._x = target.left + Constants.HoverWindowEdgeMargin;
		}

	}

	private computeYCordinate(target: TargetRect): void {
		if (this._target.y !== undefined) {
			this._y = this._target.y;
		}

		else if (this._hoverPosition === HoverPosition.ABOVE) {
			this._y = target.top;
		}

		else if (this._hoverPosition === HoverPosition.BELOW) {
			this._y = target.bottom - 2;
		}

		else {
			if (this._hoverPointer) {
				this._y = target.center.y + (this._hover.containerDomNode.clientHeight / 2);
			} else {
				this._y = target.bottom;
			}
		}

		// Hover on bottom is going beyond window
		if (this._y > window.innerHeight) {
			this._y = target.bottom;
		}
	}

	private adjustHorizontalHoverPosition(target: TargetRect): void {
		// Do not adjust horizontal hover position if x cordiante is provided
		if (this._target.x !== undefined) {
			return;
		}

		// When force position is enabled, restrict max width
		if (this._forcePosition) {
			const padding = (this._hoverPointer ? Constants.PointerSize : 0) + Constants.HoverBorderWidth;
			if (this._hoverPosition === HoverPosition.RIGHT) {
				this._hover.containerDomNode.style.maxWidth = `${document.documentElement.clientWidth - target.right - padding}px`;
			} else if (this._hoverPosition === HoverPosition.LEFT) {
				this._hover.containerDomNode.style.maxWidth = `${target.left - padding}px`;
			}
			return;
		}

		// Position hover on right to target
		if (this._hoverPosition === HoverPosition.RIGHT) {
			const roomOnRight = document.documentElement.clientWidth - target.right;
			// Hover on the right is going beyond window.
			if (roomOnRight < this._hover.containerDomNode.clientWidth) {
				const roomOnLeft = target.left;
				// There's enough room on the left, flip the hover position
				if (roomOnLeft >= this._hover.containerDomNode.clientWidth) {
					this._hoverPosition = HoverPosition.LEFT;
				}
				// Hover on the left would go beyond window too
				else {
					this._hoverPosition = HoverPosition.BELOW;
				}
			}
		}
		// Position hover on left to target
		else if (this._hoverPosition === HoverPosition.LEFT) {

			const roomOnLeft = target.left;
			// Hover on the left is going beyond window.
			if (roomOnLeft < this._hover.containerDomNode.clientWidth) {
				const roomOnRight = document.documentElement.clientWidth - target.right;
				// There's enough room on the right, flip the hover position
				if (roomOnRight >= this._hover.containerDomNode.clientWidth) {
					this._hoverPosition = HoverPosition.RIGHT;
				}
				// Hover on the right would go beyond window too
				else {
					this._hoverPosition = HoverPosition.BELOW;
				}
			}
			// Hover on the left is going beyond window.
			if (target.left - this._hover.containerDomNode.clientWidth <= document.documentElement.clientLeft) {
				this._hoverPosition = HoverPosition.RIGHT;
			}
		}
	}

	private adjustVerticalHoverPosition(target: TargetRect): void {
		// Do not adjust vertical hover position if the y coordinate is provided
		// or the position is forced
		if (this._target.y !== undefined || this._forcePosition) {
			return;
		}

		// Position hover on top of the target
		if (this._hoverPosition === HoverPosition.ABOVE) {
			// Hover on top is going beyond window
			if (target.top - this._hover.containerDomNode.clientHeight < 0) {
				this._hoverPosition = HoverPosition.BELOW;
			}
		}

		// Position hover below the target
		else if (this._hoverPosition === HoverPosition.BELOW) {
			// Hover on bottom is going beyond window
			if (target.bottom + this._hover.containerDomNode.clientHeight > window.innerHeight) {
				this._hoverPosition = HoverPosition.ABOVE;
			}
		}
	}

	private adjustHoverMaxHeight(target: TargetRect): void {
		let maxHeight = window.innerHeight / 2;

		// When force position is enabled, restrict max height
		if (this._forcePosition) {
			const padding = (this._hoverPointer ? Constants.PointerSize : 0) + Constants.HoverBorderWidth;
			if (this._hoverPosition === HoverPosition.ABOVE) {
				maxHeight = Math.min(maxHeight, target.top - padding);
			} else if (this._hoverPosition === HoverPosition.BELOW) {
				maxHeight = Math.min(maxHeight, window.innerHeight - target.bottom - padding);
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

	private setHoverPointerPosition(target: TargetRect): void {
		if (!this._hoverPointer) {
			return;
		}

		switch (this._hoverPosition) {
			case HoverPosition.LEFT:
			case HoverPosition.RIGHT: {
				this._hoverPointer.classList.add(this._hoverPosition === HoverPosition.LEFT ? 'right' : 'left');
				const hoverHeight = this._hover.containerDomNode.clientHeight;

				// If hover is taller than target, then show the pointer at the center of target
				if (hoverHeight > target.height) {
					this._hoverPointer.style.top = `${target.center.y - (this._y - hoverHeight) - Constants.PointerSize}px`;
				}

				// Otherwise show the pointer at the center of hover
				else {
					this._hoverPointer.style.top = `${Math.round((hoverHeight / 2)) - Constants.PointerSize}px`;
				}

				break;
			}
			case HoverPosition.ABOVE:
			case HoverPosition.BELOW: {
				this._hoverPointer.classList.add(this._hoverPosition === HoverPosition.ABOVE ? 'bottom' : 'top');
				const hoverWidth = this._hover.containerDomNode.clientWidth;

				// Position pointer at the center of the hover
				let pointerLeftPosition = Math.round((hoverWidth / 2)) - Constants.PointerSize;

				// If pointer goes beyond target then position it at the center of the target
				const pointerX = this._x + pointerLeftPosition;
				if (pointerX < target.left || pointerX > target.right) {
					pointerLeftPosition = target.center.x - this._x - Constants.PointerSize;
				}

				this._hoverPointer.style.left = `${pointerLeftPosition}px`;
				break;
			}
		}
	}

	public focus() {
		this._hover.containerDomNode.focus();
	}

	public hide(): void {
		this.dispose();
	}

	public override dispose(): void {
		if (!this._isDisposed) {
			this._onDispose.fire();
			this._hoverContainer.remove();
			this._messageListeners.dispose();
			this._target.dispose();
			super.dispose();
		}
		this._isDisposed = true;
	}
}

class CompositeMouseTracker extends Widget {
	private _isMouseIn: boolean = true;
	private _mouseTimeout: number | undefined;

	private readonly _onMouseOut = this._register(new Emitter<void>());
	get onMouseOut(): Event<void> { return this._onMouseOut.event; }

	get isMouseIn(): boolean { return this._isMouseIn; }

	constructor(
		private _elements: HTMLElement[]
	) {
		super();
		this._elements.forEach(n => this.onmouseover(n, () => this._onTargetMouseOver()));
		this._elements.forEach(n => this.onmouseleave(n, () => this._onTargetMouseLeave()));
	}

	private _onTargetMouseOver(): void {
		this._isMouseIn = true;
		this._clearEvaluateMouseStateTimeout();
	}

	private _onTargetMouseLeave(): void {
		this._isMouseIn = false;
		this._evaluateMouseState();
	}

	private _evaluateMouseState(): void {
		this._clearEvaluateMouseStateTimeout();
		// Evaluate whether the mouse is still outside asynchronously such that other mouse targets
		// have the opportunity to first their mouse in event.
		this._mouseTimeout = window.setTimeout(() => this._fireIfMouseOutside(), 0);
	}

	private _clearEvaluateMouseStateTimeout(): void {
		if (this._mouseTimeout) {
			clearTimeout(this._mouseTimeout);
			this._mouseTimeout = undefined;
		}
	}

	private _fireIfMouseOutside(): void {
		if (!this._isMouseIn) {
			this._onMouseOut.fire();
		}
	}
}

class ElementHoverTarget implements IHoverTarget {
	readonly targetElements: readonly HTMLElement[];

	constructor(
		private _element: HTMLElement
	) {
		this.targetElements = [this._element];
	}

	dispose(): void {
	}
}
