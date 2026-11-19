/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/floatingAuxiliaryBar.css';
import { $, addDisposableListener, append, Dimension, EventType, getActiveElement, IDimension, isHTMLElement, trackFocus } from '../../base/browser/dom.js';
import { GlobalPointerMoveMonitor } from '../../base/browser/globalPointerMoveMonitor.js';
import { StandardKeyboardEvent } from '../../base/browser/keyboardEvent.js';
import { ActionBar } from '../../base/browser/ui/actionbar/actionbar.js';
import { ActionViewItem } from '../../base/browser/ui/actionbar/actionViewItems.js';
import { ResizableHTMLElement } from '../../base/browser/ui/resizable/resizable.js';
import { Action } from '../../base/common/actions.js';
import { RunOnceScheduler } from '../../base/common/async.js';
import { Codicon } from '../../base/common/codicons.js';
import { Event } from '../../base/common/event.js';
import { KeyCode } from '../../base/common/keyCodes.js';
import { Disposable, MutableDisposable, toDisposable } from '../../base/common/lifecycle.js';
import { clamp } from '../../base/common/numbers.js';
import { ThemeIcon } from '../../base/common/themables.js';
import { assertReturnsDefined } from '../../base/common/types.js';
import { localize } from '../../nls.js';
import { IAccessibilityService } from '../../platform/accessibility/common/accessibility.js';
import { IHoverService } from '../../platform/hover/browser/hover.js';
import { registerIcon } from '../../platform/theme/common/iconRegistry.js';
import { Part } from '../../workbench/browser/part.js';

const keepExpandedIcon = registerIcon('sessions-floating-details-keep-expanded', Codicon.pin, localize('floatingDetails.keepExpandedIcon', "Icon for keeping a floating panel expanded."));
const pinnedIcon = registerIcon('sessions-floating-details-pinned', Codicon.pinned, localize('floatingDetails.pinnedIcon', "Icon for a floating panel that stays expanded."));
const detailsIcon = registerIcon('sessions-floating-details-view', Codicon.listTree, localize('floatingDetails.viewIcon', "Icon for the floating details view."));
const dragIcon = registerIcon('sessions-floating-details-drag', Codicon.gripper, localize('floatingDetails.dragIcon', "Icon for moving a floating panel."));

type FloatingDetailsState = 'collapsed' | 'preview' | 'pinned';

interface IFloatingDetailsPosition {
	readonly horizontal: 'left' | 'right';
	readonly vertical: 'top' | 'bottom';
	readonly x: number;
	readonly y: number;
}

const defaultPosition: IFloatingDetailsPosition = { horizontal: 'right', vertical: 'top', x: 0, y: 0 };

class FloatingDetailsToggleViewItem extends ActionViewItem {
	private stateIcon: HTMLElement | undefined;

	override render(container: HTMLElement): void {
		super.render(container);
		const label = assertReturnsDefined(this.label);
		label.classList.add('floating-details-toggle');
		this.stateIcon = append(label, $('span.floating-details-state-icon', { 'aria-hidden': 'true' }));
	}

	setIcon(icon: ThemeIcon): void {
		assertReturnsDefined(this.stateIcon).className = `floating-details-state-icon ${ThemeIcon.asClassName(icon)}`;
	}

	setExpanded(expanded: boolean, controlsId?: string): void {
		this.label?.setAttribute('aria-expanded', String(expanded));
		if (controlsId) {
			this.label?.setAttribute('aria-controls', controlsId);
		}
	}
}

export interface IFloatingAuxiliaryBarHost {
	getTitle(): string;
	getIcon(): ThemeIcon | undefined;
	isChangesViewActive(): boolean;
	readonly onDidChangeTitle: Event<void>;
	getWidth(): number;
	setWidth(width: number): void;
	getHeight(): number;
	setHeight(height: number): void;
	getContentHeight(): number | undefined;
	readonly onDidChangeContentHeight: Event<void>;
	setSizeToContent(enabled: boolean): void;
	focusEditor(): void;
}

/** Presents the existing details part as a non-modal, resizable editor overlay. */
export class FloatingAuxiliaryBarController extends Disposable {
	private static readonly GAP = 8;
	private static readonly HEADER_HEIGHT = 32;
	private readonly resizable = this._register(new ResizableHTMLElement());
	private readonly surface = append(this.resizable.domNode, $('.floating-details-surface'));
	private readonly widthHandle: HTMLElement;
	private readonly heightHandle: HTMLElement;
	private readonly toggleAction: Action;
	private readonly toggleViewItem: FloatingDetailsToggleViewItem;
	private readonly titleIcon: HTMLElement;
	private readonly titleText: HTMLElement;
	private readonly dragHandle: HTMLElement;
	private readonly dragMonitor = this._register(new GlobalPointerMoveMonitor());
	private position = defaultPosition;
	private state: FloatingDetailsState = 'collapsed';
	private visible = false;
	private pointerInside = false;
	private resizing = false;
	private renderedSize = new Dimension(0, 0);
	private compactSize = new Dimension(0, 0);
	private readonly motion = this._register(new MutableDisposable());
	private readonly hoverExit = this._register(new RunOnceScheduler(() => {
		if (!this.hasFocus()) {
			this.collapsePreview();
		}
	}, 250));
	private readonly contentLayout = this._register(new RunOnceScheduler(() => this.layoutContent(), 0));

	constructor(
		private readonly editorContainer: HTMLElement,
		private readonly auxiliaryBarPart: Pick<Part, 'getContainer' | 'layout'>,
		private readonly host: IFloatingAuxiliaryBarHost,
		@IAccessibilityService private readonly accessibilityService: IAccessibilityService,
		@IHoverService hoverService: IHoverService,
	) {
		super();
		this.resizable.domNode.classList.add('floating-details');
		this.resizable.domNode.setAttribute('role', 'region');
		const header = append(this.surface, $('.floating-details-header'));
		const caption = append(header, $('.floating-details-caption'));
		this.titleIcon = append(caption, $('span.floating-details-icon', { 'aria-hidden': 'true' }));
		this.titleText = append(caption, $('span.floating-details-title'));
		this._register(hoverService.setupDelayedHover(caption, () => ({ content: this.host.getTitle() })));
		this._register(addDisposableListener(caption, EventType.MOUSE_ENTER, (event: MouseEvent) => {
			if (isHTMLElement(event.relatedTarget) && this.dragHandle.contains(event.relatedTarget)) {
				this.preview();
			}
		}));
		this.toggleAction = this._register(new Action('sessions.floatingDetails.toggle', '', '', true, () => this.setPinned(this.state !== 'pinned')));
		let toggleViewItem: FloatingDetailsToggleViewItem | undefined;
		const actions = this._register(new ActionBar(header, {
			ariaLabel: localize('floatingDetails.actions', "Panel Actions"),
			actionViewItemProvider: (action, options) => toggleViewItem = new FloatingDetailsToggleViewItem(undefined, action, { ...options, icon: false, label: false }),
		}));
		actions.push(this.toggleAction, { icon: true, label: false });
		this.toggleViewItem = assertReturnsDefined(toggleViewItem);
		this._register(actions.onDidCancel(() => this.collapse()));
		this.dragHandle = append(header, $('.floating-details-drag-handle', { role: 'button', tabIndex: 0 }));
		append(this.dragHandle, $('span', { 'aria-hidden': 'true' })).classList.add(...ThemeIcon.asClassNameArray(dragIcon));
		this._register(hoverService.setupDelayedHover(this.dragHandle, {
			content: localize('floatingDetails.moveHint', "Drag to move. Use Arrow keys to move, Shift for larger steps, or Home to reset. Double-click to reset the position."),
		}));
		this._register(addDisposableListener(this.dragHandle, EventType.POINTER_DOWN, (event: PointerEvent) => this.startDragging(event)));
		this._register(addDisposableListener(this.dragHandle, 'pointercancel', () => this.dragMonitor.stopMonitoring(true)));
		this._register(addDisposableListener(this.dragHandle, EventType.DBLCLICK, () => this.resetPosition()));
		this._register(addDisposableListener(this.dragHandle, EventType.KEY_DOWN, event => {
			const key = new StandardKeyboardEvent(event);
			const step = key.shiftKey ? 50 : 10;
			if (key.keyCode === KeyCode.Home) {
				key.preventDefault();
				key.stopPropagation();
				this.resetPosition();
			} else if (key.keyCode >= KeyCode.LeftArrow && key.keyCode <= KeyCode.DownArrow) {
				key.preventDefault();
				key.stopPropagation();
				this.move(key.keyCode === KeyCode.LeftArrow ? -step : key.keyCode === KeyCode.RightArrow ? step : 0,
					key.keyCode === KeyCode.UpArrow ? -step : key.keyCode === KeyCode.DownArrow ? step : 0);
			}
		}));
		this._register(addDisposableListener(actions.domNode, EventType.MOUSE_ENTER, () => this.preview()));
		this.widthHandle = this.createResizeHandle('width');
		this.heightHandle = this.createResizeHandle('height');
		this.updateTitle();
		this._register(this.host.onDidChangeTitle(() => {
			this.updateTitle();
			this.scheduleContentLayout();
		}));
		this._register(this.host.onDidChangeContentHeight(() => this.scheduleContentLayout()));
		this._register(accessibilityService.onDidChangeReducedMotion(() => {
			if (accessibilityService.isMotionReduced() && this.motion.value) {
				this.motion.clear();
				if (this.visible) {
					this.layout(this.contentTop);
				}
			}
		}));
		this.resizable.preferredSize = new Dimension(300, 400);
		this._register(this.resizable.onDidWillResize(() => {
			this.hoverExit.cancel();
			this.resizing = true;
		}));
		this._register(this.resizable.onDidResize(event => {
			if (this.visible && this.state !== 'collapsed') {
				if (event.reset === 'height' || (event.north || event.south) && event.dimension.height !== this.renderedSize.height) {
					this.host.setHeight(event.reset === 'height' ? 400 : event.dimension.height);
				}
				if (event.reset === 'width' || (event.east || event.west) && event.dimension.width !== this.renderedSize.width) {
					this.host.setWidth(event.reset === 'width' ? 300 : event.dimension.width);
				}
				this.layout(this.contentTop);
			}
			if (event.done) {
				this.resizing = false;
				this.scheduleContentLayout();
				if (this.visible && !this.pointerInside) {
					this.schedulePreviewCollapse();
				}
			}
		}));
		this._register(addDisposableListener(this.resizable.domNode, EventType.MOUSE_ENTER, (event: MouseEvent) => {
			this.hoverExit.cancel();
			this.pointerInside = true;
			const grip = this.dragHandle.getBoundingClientRect();
			if (event.clientX < grip.left || event.clientX >= grip.right || event.clientY < grip.top || event.clientY >= grip.bottom) {
				this.preview();
			}
		}));
		this._register(addDisposableListener(this.resizable.domNode, EventType.MOUSE_LEAVE, () => {
			this.pointerInside = false;
			if (!this.resizing && !this.dragMonitor.isMonitoring()) {
				this.schedulePreviewCollapse();
			}
		}));
		this._register(addDisposableListener(this.resizable.domNode, EventType.FOCUS, () => {
			if (this.state === 'collapsed') {
				this.preview();
				this.toggleViewItem.focus();
			}
		}));
		const focus = this._register(trackFocus(this.resizable.domNode));
		this._register(focus.onDidFocus(() => {
			this.hoverExit.cancel();
			const activeElement = getActiveElement();
			if (activeElement !== this.dragHandle && activeElement !== this.resizable.domNode) {
				this.preview();
			}
		}));
		this._register(focus.onDidBlur(() => {
			if (!this.pointerInside && !this.resizing && !this.dragMonitor.isMonitoring() && !this.hoverExit.isScheduled()) {
				this.collapsePreview();
			}
		}));
		this._register(addDisposableListener(this.resizable.domNode, EventType.KEY_DOWN, event => {
			if (!event.defaultPrevented && new StandardKeyboardEvent(event).keyCode === KeyCode.Escape) {
				event.preventDefault();
				event.stopPropagation();
				this.collapse();
			}
		}));
	}

	private contentTop = 0;

	layout(contentTop: number): void {
		this.stopDragging();
		this.motion.clear();
		this.contentTop = contentTop;
		this.updateTitle();
		const part = this.auxiliaryBarPart.getContainer();
		if (!part) {
			return;
		}
		this.visible = true;
		this.editorContainer.classList.add('floating-details-visible');
		this.host.setSizeToContent(true);
		if (part.id) {
			this.toggleViewItem.setExpanded(this.state !== 'collapsed', part.id);
		}
		const focusedElement = getActiveElement();
		if (this.resizable.domNode.parentElement !== this.editorContainer) {
			append(this.editorContainer, this.resizable.domNode);
		}
		if (part.parentElement !== this.surface) {
			append(this.surface, part);
		}
		part.classList.add('floating-auxiliarybar');
		const { x, y, maxWidth, maxHeight } = this.getAvailableSpace();
		this.resizable.domNode.style.display = '';
		this.applyPosition(x, y);
		this.resizable.domNode.style.maxWidth = `${maxWidth}px`;
		const expanded = this.state !== 'collapsed';
		this.resizable.domNode.classList.toggle('collapsed', !expanded);
		this.widthHandle.hidden = !expanded;
		this.heightHandle.hidden = !expanded;
		const left = this.position.horizontal === 'left';
		const bottom = this.position.vertical === 'bottom';
		this.resizable.enableSashes(expanded && bottom, expanded && left, expanded && !bottom, expanded && !left);
		if (!expanded) {
			this.resizable.domNode.style.width = 'max-content';
			this.resizable.domNode.style.height = `${Math.min(FloatingAuxiliaryBarController.HEADER_HEIGHT + 2, maxHeight)}px`;
			part.style.display = 'none';
			if (isHTMLElement(focusedElement) && part.contains(focusedElement)) {
				this.host.focusEditor();
			}
			const bounds = this.resizable.domNode.getBoundingClientRect();
			this.compactSize = new Dimension(bounds.width, bounds.height);
			return;
		}
		const heightLimits = this.getHeightLimits(maxHeight);
		this.resizable.minSize = new Dimension(Math.min(220, maxWidth), heightLimits.minimum);
		this.resizable.maxSize = new Dimension(maxWidth, heightLimits.maximum);
		this.resizable.layout(heightLimits.height, this.host.getWidth());
		const { width, height } = this.resizable.size;
		this.renderedSize = this.resizable.size;
		this.resizable.domNode.style.width = `${width}px`;
		this.resizable.domNode.style.height = `${height}px`;
		part.style.display = '';
		part.style.position = 'absolute';
		part.style.left = left ? '0' : '';
		part.style.right = left ? '' : '0';
		part.style.top = bottom ? '' : `${FloatingAuxiliaryBarController.HEADER_HEIGHT}px`;
		part.style.bottom = bottom ? `${FloatingAuxiliaryBarController.HEADER_HEIGHT}px` : '';
		part.style.width = `${Math.max(0, width - 2)}px`;
		part.style.height = `${Math.max(0, height - FloatingAuxiliaryBarController.HEADER_HEIGHT - 2)}px`;
		this.auxiliaryBarPart.layout(Math.max(0, width - 2), Math.max(0, height - FloatingAuxiliaryBarController.HEADER_HEIGHT - 2),
			bottom ? this.editorContainer.clientHeight - FloatingAuxiliaryBarController.GAP - y - height : contentTop + FloatingAuxiliaryBarController.GAP + y + FloatingAuxiliaryBarController.HEADER_HEIGHT,
			left ? FloatingAuxiliaryBarController.GAP + x : this.editorContainer.clientWidth - width - FloatingAuxiliaryBarController.GAP - x);
		this.updateResizeHandle(this.widthHandle, width, this.resizable.minSize.width, maxWidth);
		this.updateResizeHandle(this.heightHandle, height, this.resizable.minSize.height, heightLimits.maximum);
		if (isHTMLElement(focusedElement) && part.contains(focusedElement) && getActiveElement() !== focusedElement) {
			focusedElement.focus();
		}
	}

	hide(): void {
		this.stopDragging();
		this.hoverExit.cancel();
		this.motion.clear();
		this.visible = false;
		this.editorContainer.classList.remove('floating-details-visible');
		this.contentLayout.cancel();
		this.host.setSizeToContent(false);
		this.pointerInside = false;
		this.resizing = false;
		if (this.state === 'preview') {
			this.setState('collapsed');
		}
		const part = this.auxiliaryBarPart.getContainer();
		if (part?.parentElement === this.surface) {
			const focusedElement = getActiveElement();
			part.style.left = '';
			part.style.bottom = '';
			append(this.editorContainer, part);
			part.classList.remove('floating-auxiliarybar');
			if (isHTMLElement(focusedElement) && part.contains(focusedElement)) {
				focusedElement.focus();
			}
		}
		this.resizable.domNode.style.display = 'none';
	}

	setPinned(pinned: boolean): void {
		const keepPreview = this.visible && (this.pointerInside || this.hasFocus());
		this.setState(pinned ? 'pinned' : keepPreview ? 'preview' : 'collapsed');
	}

	/** Returns the effective expanded geometry without changing compact presentation. */
	getSize(): Dimension {
		const { maxWidth, maxHeight } = this.getAvailableSpace();
		return new Dimension(clamp(this.host.getWidth(), Math.min(220, maxWidth), maxWidth), this.getHeightLimits(maxHeight).height);
	}

	setSize(size: IDimension): void {
		const current = this.getSize();
		const { maxWidth, maxHeight } = this.getAvailableSpace();
		const heightLimits = this.getHeightLimits(maxHeight);
		const width = clamp(size.width, Math.min(220, maxWidth), maxWidth);
		const height = clamp(size.height, heightLimits.minimum, heightLimits.maximum);
		if (height !== current.height) {
			this.host.setHeight(height);
		}
		if (width !== current.width) {
			this.host.setWidth(width);
		}
		if (this.visible) {
			this.layout(this.contentTop);
		}
	}

	hasFocus(): boolean {
		const activeElement = getActiveElement();
		return !!activeElement && this.resizable.domNode.contains(activeElement);
	}

	/** Opening an item immediately dismisses a preview without motion, but never a pinned panel. */
	onDidOpenItem(): void {
		this.collapsePreview(false);
	}

	private collapsePreview(animate = true): void {
		if (this.state === 'preview') {
			this.collapse(animate);
		}
	}

	private preview(): void {
		if (this.state === 'collapsed' && !this.dragMonitor.isMonitoring()) {
			this.setState('preview');
		}
	}

	private schedulePreviewCollapse(): void {
		if (this.state === 'preview' && this.visible && !this.pointerInside && !this.hasFocus() && !this.resizing && !this.dragMonitor.isMonitoring()) {
			this.hoverExit.schedule();
		}
	}

	private scheduleContentLayout(): void {
		if (this.visible && this.state !== 'collapsed') {
			this.contentLayout.schedule();
		}
	}

	private getHeightLimits(availableHeight: number): { minimum: number; maximum: number; height: number } {
		const contentHeight = this.host.getContentHeight();
		const maximum = Math.min(availableHeight, contentHeight === undefined ? availableHeight : contentHeight + FloatingAuxiliaryBarController.HEADER_HEIGHT + 2);
		const minimum = Math.min(160, maximum);
		return { minimum, maximum, height: clamp(this.host.getHeight(), minimum, maximum) };
	}

	private layoutContent(): void {
		if (!this.visible || this.state === 'collapsed' || this.resizing || this.dragMonitor.isMonitoring()) {
			return;
		}
		const limits = this.getHeightLimits(this.getAvailableSpace().maxHeight);
		if (limits.height !== this.renderedSize.height || limits.maximum !== this.resizable.maxSize.height) {
			const from = this.motion.value ? this.resizable.domNode.getBoundingClientRect() : undefined;
			this.layout(this.contentTop);
			if (from) {
				this.animateFrame(from, this.resizable.domNode.getBoundingClientRect());
			}
		}
	}

	private getAvailableSize(): Dimension {
		return new Dimension(Math.max(0, this.editorContainer.clientWidth - FloatingAuxiliaryBarController.GAP * 2),
			Math.max(0, this.editorContainer.clientHeight - this.contentTop - FloatingAuxiliaryBarController.GAP * 2));
	}

	private getAvailableSpace(): { x: number; y: number; maxWidth: number; maxHeight: number } {
		const area = this.getAvailableSize();
		const x = clamp(this.position.x, 0, Math.max(0, area.width - FloatingAuxiliaryBarController.HEADER_HEIGHT - 2));
		const y = clamp(this.position.y, 0, Math.max(0, area.height - FloatingAuxiliaryBarController.HEADER_HEIGHT - 2));
		return { x, y, maxWidth: area.width - x, maxHeight: area.height - y };
	}

	private applyPosition(x: number, y: number): void {
		const element = this.resizable.domNode;
		const left = this.position.horizontal === 'left';
		const bottom = this.position.vertical === 'bottom';
		element.classList.toggle('anchored-left', left);
		element.classList.toggle('anchored-bottom', bottom);
		element.style.left = left ? `${FloatingAuxiliaryBarController.GAP + x}px` : '';
		element.style.right = left ? '' : `${FloatingAuxiliaryBarController.GAP + x}px`;
		element.style.top = bottom ? '' : `${this.contentTop + FloatingAuxiliaryBarController.GAP + y}px`;
		element.style.bottom = bottom ? `${FloatingAuxiliaryBarController.GAP + y}px` : '';
	}

	private move(deltaX: number, deltaY: number): void {
		const element = this.resizable.domNode;
		const area = this.getAvailableSize();
		const bounds = element.getBoundingClientRect();
		const maximumX = Math.max(0, area.width - bounds.width);
		const maximumY = Math.max(0, area.height - bounds.height);
		const editor = this.editorContainer.getBoundingClientRect();
		const x = clamp(bounds.left - editor.left - this.editorContainer.clientLeft - FloatingAuxiliaryBarController.GAP + deltaX, 0, maximumX);
		const y = clamp(bounds.top - editor.top - this.editorContainer.clientTop - this.contentTop - FloatingAuxiliaryBarController.GAP + deltaY, 0, maximumY);
		const horizontal = this.state === 'collapsed' ? (x > maximumX / 2 ? 'right' : 'left') : this.position.horizontal;
		const vertical = this.state === 'collapsed' ? (y > maximumY / 2 ? 'bottom' : 'top') : this.position.vertical;
		this.position = { horizontal, vertical, x: horizontal === 'left' ? x : maximumX - x, y: vertical === 'top' ? y : maximumY - y };
		this.layout(this.contentTop);
	}

	private startDragging(event: PointerEvent): void {
		if (event.button !== 0 || !this.visible) {
			return;
		}
		event.preventDefault();
		event.stopPropagation();
		this.hoverExit.cancel();
		this.layout(this.contentTop);
		const origin = this.resizable.domNode.getBoundingClientRect();
		const area = this.getAvailableSize();
		const editor = this.editorContainer.getBoundingClientRect();
		const left = origin.left - editor.left - this.editorContainer.clientLeft - FloatingAuxiliaryBarController.GAP;
		const top = origin.top - editor.top - this.editorContainer.clientTop - this.contentTop - FloatingAuxiliaryBarController.GAP;
		const position = {
			...this.position,
			x: this.position.horizontal === 'left' ? left : area.width - origin.width - left,
			y: this.position.vertical === 'top' ? top : area.height - origin.height - top,
		};
		let point = { x: event.clientX, y: event.clientY };
		this.resizable.domNode.classList.add('dragging');
		this.dragMonitor.startMonitoring(this.dragHandle, event.pointerId, event.buttons, next => {
			const deltaX = next.clientX - event.clientX;
			const deltaY = next.clientY - event.clientY;
			point = { x: next.clientX, y: next.clientY };
			this.position = {
				...position,
				x: clamp(position.x + (position.horizontal === 'left' ? deltaX : -deltaX), 0, Math.max(0, area.width - origin.width)),
				y: clamp(position.y + (position.vertical === 'top' ? deltaY : -deltaY), 0, Math.max(0, area.height - origin.height)),
			};
			this.applyPosition(this.position.x, this.position.y);
		}, () => {
			this.resizable.domNode.classList.remove('dragging');
			this.move(0, 0);
			const bounds = this.resizable.domNode.getBoundingClientRect();
			this.pointerInside = point.x >= bounds.left && point.x < bounds.right && point.y >= bounds.top && point.y < bounds.bottom;
			if (!this.pointerInside) {
				this.schedulePreviewCollapse();
			}
		});
	}

	private stopDragging(): void {
		this.dragMonitor.stopMonitoring(false);
		this.resizable.domNode.classList.remove('dragging');
	}

	private resetPosition(): void {
		this.position = defaultPosition;
		this.layout(this.contentTop);
	}

	private setState(state: FloatingDetailsState, animate = true): void {
		this.hoverExit.cancel();
		if (this.state === state) {
			return;
		}
		const expanded = this.state !== 'collapsed';
		const from = this.visible ? this.resizable.domNode.getBoundingClientRect() : undefined;
		if (!expanded && from && !this.motion.value) {
			this.compactSize = new Dimension(from.width, from.height);
		}
		this.state = state;
		this.updateTitle();
		if (this.visible && expanded !== (state !== 'collapsed')) {
			this.layout(this.contentTop);
			if (animate && from) {
				this.animateFrame(from, this.resizable.domNode.getBoundingClientRect());
			}
		}
	}

	private animateFrame(from: DOMRectReadOnly, to: DOMRectReadOnly): void {
		if (this.accessibilityService.isMotionReduced()
			|| !this.editorContainer.closest('.monaco-enable-motion')
			|| from.width <= 0 || from.height <= 0
			|| from.width === to.width && from.height === to.height) {
			return;
		}
		const element = this.resizable.domNode;
		const collapsing = this.state === 'collapsed';
		const distance = Math.max(Math.abs(to.width - from.width), Math.abs(to.height - from.height));
		const fullDistance = Math.max(Math.abs(this.renderedSize.width - this.compactSize.width), Math.abs(this.renderedSize.height - this.compactSize.height));
		const large = fullDistance > 240;
		const fullDuration = collapsing ? (large ? 150 : 100) : (large ? 250 : 200);
		const duration = Math.max(50, Math.round(fullDuration * Math.min(1, distance / Math.max(1, fullDistance))));
		// Fluent's decelerate/accelerate curves distinguish the reveal from its quicker dismissal.
		const easing = collapsing ? 'cubic-bezier(0.9, 0.1, 1, 0.2)' : 'cubic-bezier(0.1, 0.9, 0.2, 1)';
		const part = this.auxiliaryBarPart.getContainer();
		const wasInert = part?.inert;
		if (collapsing && part) {
			part.style.display = '';
			part.inert = true;
		}
		element.classList.add('animating');
		element.style.width = `${to.width}px`;
		element.style.height = `${to.height}px`;
		this.resizable.enableSashes(false, false, false, false);
		const animation = element.animate([
			{ width: `${from.width}px`, height: `${from.height}px` },
			{ width: `${to.width}px`, height: `${to.height}px` },
		], { duration, easing });
		this.motion.value = toDisposable(() => {
			animation.onfinish = null;
			animation.cancel();
			element.classList.remove('animating');
			if (collapsing && part) {
				part.inert = wasInert ?? false;
				if (this.state === 'collapsed') {
					part.style.display = 'none';
				}
			}
		});
		animation.onfinish = () => {
			this.motion.clear();
			if (this.visible) {
				this.layout(this.contentTop);
			}
		};
	}

	private collapse(animate = true): void {
		this.stopDragging();
		const activeElement = getActiveElement();
		const part = this.auxiliaryBarPart.getContainer();
		const restoreControlFocus = isHTMLElement(activeElement) && this.resizable.domNode.contains(activeElement) && !part?.contains(activeElement);
		this.setState('collapsed', animate);
		if (restoreControlFocus) {
			this.host.focusEditor();
		}
	}

	private createResizeHandle(dimension: 'width' | 'height'): HTMLElement {
		const handle = append(this.resizable.domNode, $(`.floating-details-resize-${dimension}`, {
			role: 'separator',
			tabIndex: 0,
			'aria-orientation': dimension === 'width' ? 'vertical' : 'horizontal',
		}));
		this._register(addDisposableListener(handle, EventType.KEY_DOWN, event => {
			const key = new StandardKeyboardEvent(event);
			const step = key.shiftKey ? 50 : 10;
			const decrease = dimension === 'width' ? (this.position.horizontal === 'left' ? KeyCode.LeftArrow : KeyCode.RightArrow)
				: this.position.vertical === 'bottom' ? KeyCode.DownArrow : KeyCode.UpArrow;
			const increase = dimension === 'width' ? (this.position.horizontal === 'left' ? KeyCode.RightArrow : KeyCode.LeftArrow)
				: this.position.vertical === 'bottom' ? KeyCode.UpArrow : KeyCode.DownArrow;
			if (key.keyCode !== decrease && key.keyCode !== increase && key.keyCode !== KeyCode.Home) {
				return;
			}
			key.preventDefault();
			key.stopPropagation();
			const current = this.resizable.size[dimension];
			const next = key.keyCode === KeyCode.Home ? (dimension === 'width' ? 300 : 400) : current + (key.keyCode === increase ? step : -step);
			const value = Math.max(this.resizable.minSize[dimension], Math.min(this.resizable.maxSize[dimension], next));
			if (key.keyCode === KeyCode.Home || value !== current) {
				if (dimension === 'width') {
					this.host.setWidth(key.keyCode === KeyCode.Home ? 300 : value);
				} else {
					this.host.setHeight(key.keyCode === KeyCode.Home ? 400 : value);
				}
				this.layout(this.contentTop);
			}
		}));
		return handle;
	}

	private updateTitle(): void {
		const title = this.host.getTitle();
		this.resizable.domNode.classList.toggle('changes-view-active', this.host.isChangesViewActive());
		this.titleIcon.className = `floating-details-icon ${ThemeIcon.asClassName(this.host.getIcon() ?? detailsIcon)}`;
		this.titleText.textContent = title;
		this.toggleViewItem.setIcon(this.state === 'pinned' ? pinnedIcon : keepExpandedIcon);
		this.resizable.domNode.setAttribute('aria-label', title);
		const expanded = this.state !== 'collapsed';
		this.resizable.domNode.tabIndex = expanded ? -1 : 0;
		this.toggleAction.label = this.state === 'pinned'
			? localize('floatingDetails.unpin', "Unpin {0}", title)
			: this.state === 'preview'
				? localize('floatingDetails.keepExpanded', "Keep {0} Expanded", title)
				: localize('floatingDetails.expand', "Expand {0}", title);
		this.toggleAction.checked = this.state === 'pinned';
		this.toggleViewItem.setExpanded(expanded);
		this.dragHandle.setAttribute('aria-label', localize('floatingDetails.move', "Move {0}. Use Arrow keys to move, Shift for larger steps, or Home to reset.", title));
		this.widthHandle.setAttribute('aria-label', localize('floatingDetails.resizeWidth', "Resize {0} Width. Use Left and Right Arrow keys.", title));
		this.heightHandle.setAttribute('aria-label', localize('floatingDetails.resizeHeight', "Resize {0} Height. Use Up and Down Arrow keys.", title));
	}

	private updateResizeHandle(handle: HTMLElement, value: number, min: number, max: number): void {
		handle.setAttribute('aria-valuenow', String(value));
		handle.setAttribute('aria-valuemin', String(min));
		handle.setAttribute('aria-valuemax', String(max));
	}

	override dispose(): void {
		this.hide();
		super.dispose();
	}
}
