/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/part.css';
import './media/floatingPanels.css';
import { Component } from '../common/component.js';
import { IThemeService, IColorTheme } from '../../platform/theme/common/themeService.js';
import { ISizeService } from '../../platform/theme/common/sizeService.js';
import { Dimension, size, IDimension, getActiveDocument, prepend, IDomPosition, isHTMLElement, getWindow, scheduleAtNextAnimationFrame } from '../../base/browser/dom.js';
import { IStorageService } from '../../platform/storage/common/storage.js';
import { Grid, GridNode, ISerializableView, IViewSize, isGridBranchNode } from '../../base/browser/ui/grid/grid.js';
import { Event, Emitter } from '../../base/common/event.js';
import { IWorkbenchLayoutService } from '../services/layout/browser/layoutService.js';
import { assertReturnsDefined } from '../../base/common/types.js';
import { Disposable, IDisposable, MutableDisposable, toDisposable } from '../../base/common/lifecycle.js';

export interface IPartOptions {
	readonly hasTitle?: boolean;
	readonly borderWidth?: () => number;
	readonly titleHeight?: () => number | undefined;
}

export interface ILayoutContentResult {
	readonly headerSize: IDimension;
	readonly titleSize: IDimension;
	readonly contentSize: IDimension;
	readonly footerSize: IDimension;
}

/** Matches an overlay's exposed corners to the inner edges of its owning part. */
export function getPartOverlayCornerRadius(anchorElement: HTMLElement, part: Element | undefined): string | undefined {
	const root = part?.closest('.monaco-workbench');
	if (!part || part.classList.contains('modal-editor-part')
		|| !root?.matches('.modern-ui, .floating-panels, .agent-sessions-workbench:not(.phone-layout)')) {
		return undefined;
	}

	const anchor = anchorElement.getBoundingClientRect();
	const bounds = part.getBoundingClientRect();
	const content = {
		left: bounds.left + part.clientLeft,
		top: bounds.top + part.clientTop,
		right: bounds.left + part.clientLeft + part.clientWidth,
		bottom: bounds.top + part.clientTop + part.clientHeight,
	};
	const touches = (edge: 'left' | 'right' | 'top' | 'bottom') => Math.abs(anchor[edge] - content[edge]) <= 1;
	const css = getWindow(part).getComputedStyle(part);
	const radius = (value: string, firstBorder: string, secondBorder: string) =>
		Math.max(0, Number.parseFloat(value) - Math.max(Number.parseFloat(firstBorder), Number.parseFloat(secondBorder)));
	return [
		touches('top') && touches('left') ? radius(css.borderTopLeftRadius, css.borderTopWidth, css.borderLeftWidth) : 0,
		touches('top') && touches('right') ? radius(css.borderTopRightRadius, css.borderTopWidth, css.borderRightWidth) : 0,
		touches('bottom') && touches('right') ? radius(css.borderBottomRightRadius, css.borderBottomWidth, css.borderRightWidth) : 0,
		touches('bottom') && touches('left') ? radius(css.borderBottomLeftRadius, css.borderBottomWidth, css.borderLeftWidth) : 0,
	].map(value => `${value}px`).join(' ');
}

/** Keeps a portaled overlay's clipping in sync with its owning part's exposed corners. */
export class PartOverlayCorners extends Disposable {
	private anchor: HTMLElement | undefined;
	private part: Element | undefined;
	private readonly observer = this._register(new MutableDisposable());
	private readonly pendingUpdate = this._register(new MutableDisposable());

	constructor(
		private readonly element: HTMLElement,
		sizeService: ISizeService,
		themeService: IThemeService,
	) {
		super();
		const update = () => {
			this.update();
			// Auxiliary windows receive cloned theme styles in a later mutation-observer callback.
			this.pendingUpdate.value = scheduleAtNextAnimationFrame(getWindow(this.element), () => this.update());
		};
		this._register(sizeService.onDidChangeSizes(update));
		this._register(themeService.onDidColorThemeChange(update));
	}

	setAnchor(anchor: HTMLElement, part: Element | undefined): void {
		this.anchor = anchor;
		if (part !== this.part) {
			this.observer.clear();
			this.part = part;
			if (part) {
				const observer = new (getWindow(part).MutationObserver)(() => this.update());
				observer.observe(part, { attributes: true, attributeFilter: ['class', 'style'] });
				const root = part.closest('.monaco-workbench');
				if (root) {
					observer.observe(root, { attributes: true, attributeFilter: ['class'] });
				}
				this.observer.value = toDisposable(() => observer.disconnect());
			}
		}
		this.update();
	}

	private update(): void {
		const radius = this.anchor && getPartOverlayCornerRadius(this.anchor, this.part);
		if (radius === undefined) {
			this.element.style.removeProperty('border-radius');
		} else {
			this.element.style.borderRadius = radius;
		}
	}
}

/** Reapplies content metrics when allocations are unchanged and the grid would skip its leaves. */
export function relayoutWorkbenchParts(grid: Grid<ISerializableView>): void {
	const relayout = (node: GridNode<ISerializableView>): void => {
		if (isGridBranchNode(node)) {
			node.children.forEach(relayout);
		} else if (node.cachedVisibleSize === undefined && node.box.width > 0 && node.box.height > 0) {
			node.view.layout(node.box.width, node.box.height, node.box.top, node.box.left);
		}
	};
	relayout(grid.getViews());
}

/** Meets perpendicular dividers at their visible gap centers without changing sash thickness. */
export function updateSashEndpoints(gridElement: HTMLElement, enabled: boolean): void {
	const elements: HTMLElement[] = [];
	const findChild = (element: Element, className: string) => Array.from(element.children)
		.find((child): child is HTMLElement => isHTMLElement(child) && child.classList.contains(className));
	const visit = (branch: HTMLElement): void => {
		const split = findChild(branch, 'monaco-split-view2');
		const sashContainer = split && findChild(split, 'sash-container');
		if (sashContainer) {
			elements.push(...Array.from(sashContainer.children).filter(isHTMLElement).filter(child => child.classList.contains('monaco-sash')));
		}
		const scrollable = split && findChild(split, 'monaco-scrollable-element');
		const views = scrollable && findChild(scrollable, 'split-view-container');
		for (const view of views?.children ?? []) {
			const child = view.firstElementChild;
			if (isHTMLElement(child) && child.classList.contains('monaco-grid-branch-node')) {
				visit(child);
			}
		}
	};
	const branch = findChild(gridElement, 'monaco-grid-branch-node');
	if (branch) {
		visit(branch);
	}
	const topLevel = !gridElement.closest('.part');
	const root = gridElement.closest('.monaco-workbench');
	const panelHasNoGap = root?.classList.contains('nopanel')
		|| (root?.classList.contains('floating-panels') && root.classList.contains('nomaineditorarea'));
	const sashes = elements.flatMap(element => {
		const vertical = element.classList.contains('vertical');
		const parent = element.parentElement;
		if (!enabled || !parent || element.classList.contains('disabled') || (topLevel && panelHasNoGap && !vertical)
			|| parent.clientWidth === 0 || parent.clientHeight === 0) {
			return [];
		}
		const position = Number.parseFloat(vertical ? element.style.left : element.style.top);
		if (!Number.isFinite(position)) {
			return [];
		}
		const bounds = parent.getBoundingClientRect();
		const rect = element.getBoundingClientRect();
		const scaleX = bounds.width / parent.clientWidth;
		const scaleY = bounds.height / parent.clientHeight;
		return [{
			element,
			vertical,
			nativeCenter: vertical ? bounds.left + position * scaleX + rect.width / 2 : bounds.top + position * scaleY + rect.height / 2,
			center: vertical ? rect.left + rect.width / 2 : rect.top + rect.height / 2,
			start: vertical ? bounds.top : bounds.left,
			end: vertical ? bounds.bottom : bounds.right,
			scale: vertical ? scaleY : scaleX,
		}];
	});
	for (const element of elements) {
		const sash = sashes.find(sash => sash.element === element);
		for (const edge of ['start', 'end'] as const) {
			const crossing = sash && sashes.find(candidate => candidate.vertical !== sash.vertical
				&& Math.abs(candidate.nativeCenter - sash[edge]) <= 0.5
				&& sash.nativeCenter >= candidate.start - 0.5 && sash.nativeCenter <= candidate.end + 0.5);
			element.classList.toggle(`workbench-sash-${edge}-at-gap`, !!crossing);
			const property = `--workbench-sash-${edge}`;
			if (sash && crossing) {
				const value = `${(edge === 'start' ? crossing.center - sash.start : sash.end - crossing.center) / sash.scale}px`;
				if (element.style.getPropertyValue(property) !== value) {
					element.style.setProperty(property, value);
				}
			} else {
				element.style.removeProperty(property);
			}
		}
	}
}

/**
 * Parts are layed out in the workbench and have their own layout that
 * arranges an optional title and mandatory content area to show content.
 */
export abstract class Part<MementoType extends object = object> extends Component<MementoType> implements ISerializableView {

	private _dimension: Dimension | undefined;
	get dimension(): Dimension | undefined { return this._dimension; }

	private _contentPosition: IDomPosition | undefined;
	get contentPosition(): IDomPosition | undefined { return this._contentPosition; }

	protected _onDidVisibilityChange = this._register(new Emitter<boolean>());
	readonly onDidVisibilityChange = this._onDidVisibilityChange.event;

	private parent: HTMLElement | undefined;
	private headerArea: HTMLElement | undefined;
	protected titleArea: HTMLElement | undefined;
	protected contentArea: HTMLElement | undefined;
	private footerArea: HTMLElement | undefined;
	private partLayout: PartLayout | undefined;

	constructor(
		id: string,
		protected options: IPartOptions,
		themeService: IThemeService,
		storageService: IStorageService,
		protected readonly layoutService: IWorkbenchLayoutService
	) {
		super(id, themeService, storageService);

		this._register(layoutService.registerPart(this));
	}

	protected override onThemeChange(theme: IColorTheme): void {

		// only call if our create() method has been called
		if (this.parent) {
			super.onThemeChange(theme);
		}
	}

	/**
	 * Note: Clients should not call this method, the workbench calls this
	 * method. Calling it otherwise may result in unexpected behavior.
	 *
	 * Called to create title and content area of the part.
	 */
	create(parent: HTMLElement, options?: object): void {
		this.parent = parent;
		this.titleArea = this.createTitleArea(parent, options);
		this.contentArea = this.createContentArea(parent, options);

		this.partLayout = new PartLayout(this.options, this.contentArea, this.layoutService);

		this.updateStyles();
	}

	/**
	 * Returns the overall part container.
	 */
	getContainer(): HTMLElement | undefined {
		return this.parent;
	}

	/**
	 * Subclasses override to provide a title area implementation.
	 */
	protected createTitleArea(parent: HTMLElement, options?: object): HTMLElement | undefined {
		return undefined;
	}

	/**
	 * Subclasses override to provide a content area implementation.
	 */
	protected createContentArea(parent: HTMLElement, options?: object): HTMLElement | undefined {
		return undefined;
	}

	protected setHeaderArea(headerContainer: HTMLElement): void {
		if (this.headerArea) {
			throw new Error('Header already exists');
		}

		if (!this.parent || !this.titleArea) {
			return;
		}

		prepend(this.parent, headerContainer);
		headerContainer.classList.add('header-or-footer');
		headerContainer.classList.add('header');

		this.headerArea = headerContainer;
		this.partLayout?.setHeaderVisibility(true);
		this.relayout();
	}

	protected setFooterArea(footerContainer: HTMLElement): void {
		if (this.footerArea) {
			throw new Error('Footer already exists');
		}

		if (!this.parent || !this.titleArea) {
			return;
		}

		this.parent.appendChild(footerContainer);
		this.parent.classList.add('has-footer');
		footerContainer.classList.add('header-or-footer');
		footerContainer.classList.add('footer');

		this.footerArea = footerContainer;
		this.partLayout?.setFooterVisibility(true);
		this.relayout();
	}

	protected removeHeaderArea(): void {
		if (this.headerArea) {
			this.headerArea.remove();
			this.headerArea = undefined;
			this.partLayout?.setHeaderVisibility(false);
			this.relayout();
		}
	}

	protected removeFooterArea(): void {
		if (this.footerArea) {
			this.footerArea.remove();
			this.footerArea = undefined;
			this.parent?.classList.remove('has-footer');
			this.partLayout?.setFooterVisibility(false);
			this.relayout();
		}
	}

	private relayout() {
		const dimension = this.getRelayoutDimension();
		if (dimension && this.contentPosition) {
			this.layout(dimension.width, dimension.height, this.contentPosition.top, this.contentPosition.left);
		}
	}

	/**
	 * The dimension to use when the part re-lays out itself in response to internal
	 * changes (e.g. title, header or footer visibility). Subclasses that reduce the
	 * dimension passed to {@link layout} (for example to reserve space for a floating
	 * card margin) must override this to return the original, unreduced dimension so
	 * the reduction is not applied repeatedly on every relayout.
	 */
	protected getRelayoutDimension(): Dimension | undefined {
		return this._dimension;
	}

	/**
	 * Layout title and content area in the given dimension.
	 */
	protected layoutContents(width: number, height: number): ILayoutContentResult {
		const partLayout = assertReturnsDefined(this.partLayout);

		return partLayout.layout(width, height);
	}

	//#region ISerializableView

	protected _onDidChange = this._register(new Emitter<IViewSize | undefined>());
	get onDidChange(): Event<IViewSize | undefined> { return this._onDidChange.event; }

	element!: HTMLElement;

	abstract minimumWidth: number;
	abstract maximumWidth: number;
	abstract minimumHeight: number;
	abstract maximumHeight: number;

	layout(width: number, height: number, top: number, left: number): void {
		this._dimension = new Dimension(width, height);
		this._contentPosition = { top, left };
	}

	setVisible(visible: boolean) {
		this._onDidVisibilityChange.fire(visible);
	}

	abstract toJSON(): object;

	//#endregion
}

class PartLayout {

	private static readonly HEADER_HEIGHT = 35;
	private static readonly TITLE_HEIGHT = 35;
	private static readonly FOOTER_HEIGHT = 35;
	// KEEP IN SYNC WITH: modernUI/browser/media/padding.css
	private static readonly AREA_HEIGHT_MODERN_UI = 32;

	private headerVisible: boolean = false;
	private footerVisible: boolean = false;

	constructor(
		private options: IPartOptions,
		private contentArea: HTMLElement | undefined,
		private layoutService: IWorkbenchLayoutService,
	) { }

	layout(width: number, height: number): ILayoutContentResult {
		// Title Size: Width (Fill), Height (Variable).
		let titleSize: Dimension;
		if (this.options.hasTitle) {
			const titleHeight = this.options.titleHeight?.() ?? (this.layoutService.isFloatingPanelsEnabled() ? PartLayout.AREA_HEIGHT_MODERN_UI : PartLayout.TITLE_HEIGHT);
			titleSize = new Dimension(width, Math.min(height, titleHeight));
		} else {
			titleSize = Dimension.None;
		}

		// Header Size: Width (Fill), Height (Variable)
		let headerSize: Dimension;
		if (this.headerVisible) {
			const headerHeight = this.layoutService.isFloatingPanelsEnabled() ? PartLayout.AREA_HEIGHT_MODERN_UI : PartLayout.HEADER_HEIGHT;
			headerSize = new Dimension(width, Math.min(height, headerHeight));
		} else {
			headerSize = Dimension.None;
		}

		// Footer Size: Width (Fill), Height (Variable)
		let footerSize: Dimension;
		if (this.footerVisible) {
			const footerHeight = this.layoutService.isFloatingPanelsEnabled() ? PartLayout.AREA_HEIGHT_MODERN_UI : PartLayout.FOOTER_HEIGHT;
			footerSize = new Dimension(width, Math.min(height, footerHeight));
		} else {
			footerSize = Dimension.None;
		}

		let contentWidth = width;
		if (this.options && typeof this.options.borderWidth === 'function') {
			contentWidth -= this.options.borderWidth(); // adjust for border size
		}

		// Content Size: Width (Fill), Height (Variable)
		const contentSize = new Dimension(contentWidth, height - titleSize.height - headerSize.height - footerSize.height);

		// Content
		if (this.contentArea) {
			size(this.contentArea, contentSize.width, contentSize.height);
		}

		return { headerSize, titleSize, contentSize, footerSize };
	}

	setFooterVisibility(visible: boolean): void {
		this.footerVisible = visible;
	}

	setHeaderVisibility(visible: boolean): void {
		this.headerVisible = visible;
	}
}

export interface IMultiWindowPart {
	readonly element: HTMLElement;
}

export abstract class MultiWindowParts<T extends IMultiWindowPart, MementoType extends object = object> extends Component<MementoType> {

	protected readonly _parts = new Set<T>();
	get parts() { return Array.from(this._parts); }

	abstract readonly mainPart: T;

	registerPart(part: T): IDisposable {
		this._parts.add(part);

		return toDisposable(() => this.unregisterPart(part));
	}

	protected unregisterPart(part: T): void {
		this._parts.delete(part);
	}

	getPart(container: HTMLElement): T {
		return this.getPartByDocument(container.ownerDocument);
	}

	protected getPartByDocument(document: Document): T {
		if (this._parts.size > 1) {
			for (const part of this._parts) {
				if (part.element?.ownerDocument === document) {
					return part;
				}
			}
		}

		return this.mainPart;
	}

	get activePart(): T {
		return this.getPartByDocument(getActiveDocument());
	}
}
