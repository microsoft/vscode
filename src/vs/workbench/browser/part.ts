/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/part';
import { Component } from 'vs/workbench/common/component';
import { IThemeService, IColorTheme } from 'vs/platform/theme/common/themeService';
import { Dimension, size, IDimension, getActiveDocument, prepend, IDomPosition } from 'vs/base/browser/dom';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { ISerializableView, IViewSize } from 'vs/base/browser/ui/grid/grid';
import { Event, Emitter } from 'vs/base/common/event';
import { IWorkbenchLayoutService } from 'vs/workbench/services/layout/browser/layoutService';
import { assertIsDefined } from 'vs/base/common/types';
import { IDisposable, toDisposable } from 'vs/base/common/lifecycle';

export interface IPartOptions {
	readonly hasTitle?: boolean;
	readonly borderWidth?: () => number;
}

export interface ILayoutContentResult {
	readonly headerSize: IDimension;
	readonly titleSize: IDimension;
	readonly contentSize: IDimension;
	readonly footerSize: IDimension;
}

/**
 * Parts are layed out in the workbench and have their own layout that
 * arranges an optional title and mandatory content area to show content.
 */
export abstract class Part extends Component implements ISerializableView {

	private _dimension: Dimension | undefined;
	get dimension(): Dimension | undefined { return this._dimension; }

	private _contentPosition: IDomPosition | undefined;
	get contentPosition(): IDomPosition | undefined { return this._contentPosition; }

	protected _onDidVisibilityChange = this._register(new Emitter<boolean>());
	readonly onDidVisibilityChange = this._onDidVisibilityChange.event;

	private parent: HTMLElement | undefined;
	private headerArea: HTMLElement | undefined;
	private titleArea: HTMLElement | undefined;
	private contentArea: HTMLElement | undefined;
	private footerArea: HTMLElement | undefined;
	private partLayout: PartLayout | undefined;

	constructor(
		id: string,
		private options: IPartOptions,
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

		this.partLayout = new PartLayout(this.options, this.contentArea);

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
	 * Returns the title area container.
	 */
	protected getTitleArea(): HTMLElement | undefined {
		return this.titleArea;
	}

	/**
	 * Subclasses override to provide a content area implementation.
	 */
	protected createContentArea(parent: HTMLElement, options?: object): HTMLElement | undefined {
		return undefined;
	}

	/**
	 * Returns the content area container.
	 */
	protected getContentArea(): HTMLElement | undefined {
		return this.contentArea;
	}

	/**
	 * Sets the header area
	 */
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

	/**
	 * Sets the footer area
	 */
	protected setFooterArea(footerContainer: HTMLElement): void {
		if (this.footerArea) {
			throw new Error('Footer already exists');
		}

		if (!this.parent || !this.titleArea) {
			return;
		}

		this.parent.appendChild(footerContainer);
		footerContainer.classList.add('header-or-footer');
		footerContainer.classList.add('footer');

		this.footerArea = footerContainer;
		this.partLayout?.setFooterVisibility(true);
		this.relayout();
	}

	/**
	 * removes the header area
	 */
	protected removeHeaderArea(): void {
		if (this.headerArea) {
			this.headerArea.remove();
			this.headerArea = undefined;
			this.partLayout?.setHeaderVisibility(false);
			this.relayout();
		}
	}

	/**
	 * removes the footer area
	 */
	protected removeFooterArea(): void {
		if (this.footerArea) {
			this.footerArea.remove();
			this.footerArea = undefined;
			this.partLayout?.setFooterVisibility(false);
			this.relayout();
		}
	}

	private relayout() {
		if (this.dimension && this.contentPosition) {
			this.layout(this.dimension.width, this.dimension.height, this.contentPosition.top, this.contentPosition.left);
		}
	}
	/**
	 * Layout title and content area in the given dimension.
	 */
	protected layoutContents(width: number, height: number): ILayoutContentResult {
		const partLayout = assertIsDefined(this.partLayout);

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
	private static readonly Footer_HEIGHT = 35;

	private headerVisible: boolean = false;
	private footerVisible: boolean = false;

	constructor(private options: IPartOptions, private contentArea: HTMLElement | undefined) { }

	layout(width: number, height: number): ILayoutContentResult {

		// Title Size: Width (Fill), Height (Variable)
		let titleSize: Dimension;
		if (this.options.hasTitle) {
			titleSize = new Dimension(width, Math.min(height, PartLayout.TITLE_HEIGHT));
		} else {
			titleSize = Dimension.None;
		}

		// Header Size: Width (Fill), Height (Variable)
		let headerSize: Dimension;
		if (this.headerVisible) {
			headerSize = new Dimension(width, Math.min(height, PartLayout.HEADER_HEIGHT));
		} else {
			headerSize = Dimension.None;
		}

		// Footer Size: Width (Fill), Height (Variable)
		let footerSize: Dimension;
		if (this.footerVisible) {
			footerSize = new Dimension(width, Math.min(height, PartLayout.Footer_HEIGHT));
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

export abstract class MultiWindowParts<T extends IMultiWindowPart> extends Component {

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
