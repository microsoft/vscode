/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDragAndDropData } from 'vs/base/browser/dnd';
import { IKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { IMouseEvent } from 'vs/base/browser/mouseEvent';
import { GestureEvent } from 'vs/base/browser/touch';
import { IHoverDelegateOptions, IHoverWidget } from 'vs/base/browser/ui/iconLabel/iconHoverDelegate';
import { ListViewTargetSector } from 'vs/base/browser/ui/list/listView';
import { mainWindow } from 'vs/base/browser/window';
import { IDisposable } from 'vs/base/common/lifecycle';
import { getWindow } from 'vs/base/browser/dom';

export interface IListVirtualDelegate<T> {
	getHeight(element: T): number;
	getTemplateId(element: T): string;
	hasDynamicHeight?(element: T): boolean;
	getDynamicHeight?(element: T): number | null;
	setDynamicHeight?(element: T, height: number): void;
}

export interface IListRenderer<T, TTemplateData> {
	readonly templateId: string;
	renderTemplate(container: HTMLElement): TTemplateData;
	renderElement(element: T, index: number, templateData: TTemplateData, height: number | undefined): void;
	disposeElement?(element: T, index: number, templateData: TTemplateData, height: number | undefined): void;
	disposeTemplate(templateData: TTemplateData): void;
}

export class GlobalListHoverDelegate implements IListHoverDelegate {

	private activeHoverContainer: HTMLElement | undefined = undefined;

	constructor() { }

	showHover(container: HTMLElement, isOverflowing: boolean, options?: IHoverDelegateOptions, forceUpdate?: boolean): IHoverWidget | undefined {
		// handle old state
		if (!forceUpdate && this.activeHoverContainer === container) {
			return;
		}
		else if (this.activeHoverContainer) {
			this.hideHover();
		}

		if (!isOverflowing) {
			return undefined;
		}

		const clone = this.cloneContainer(container);
		this.setupHoverBehaviours(clone);

		this.activeHoverContainer = clone;
		getWindow(container).document.body.appendChild(clone);

		return undefined;
	}

	hideHover(): void {
		if (!this.activeHoverContainer) {
			return;
		}

		const clone = this.activeHoverContainer;

		getWindow(clone).document.body.removeChild(clone);

		this.activeHoverContainer = undefined;
	}

	private getTargetPosition(container: HTMLElement): { x: number; y: number } {
		const rect = container.getBoundingClientRect();
		return { x: rect.left, y: rect.top };
	}

	private cloneContainer(container: HTMLElement): HTMLElement {
		const oldWidth = container.style.width;
		container.style.width = 'fit-content';

		const clone = container.cloneNode(true) as HTMLElement;
		this.applyStylesRecursively(clone, container);

		container.style.width = oldWidth;

		const pos = this.getTargetPosition(container);
		clone.style.left = `${pos.x}px`;
		clone.style.top = `${pos.y}px`;
		clone.style.zIndex = `100`;

		clone.style.width = 'fit-content';
		clone.style.paddingRight = `10px`;
		clone.classList.add('show-file-icons'); // make sure any file icons are shown

		return clone;
	}

	private applyStylesRecursively(clone: HTMLElement, original: HTMLElement): void {
		const computedStyle = getWindow(original).getComputedStyle(original);
		for (const prop of computedStyle) {
			try {
				clone.style.setProperty(prop, computedStyle.getPropertyValue(prop));
			} catch (error) {
				console.error(`Error applying property ${prop}:`, error);
			}
		}

		// Copy classes from original to clone
		clone.className = original.className;

		const originalChildren = Array.from(original.children) as HTMLElement[];
		const clonedChildren = Array.from(clone.children) as HTMLElement[];

		for (let i = 0; i < originalChildren.length; i++) {
			this.applyStylesRecursively(clonedChildren[i], originalChildren[i]);
		}
	}

	private setupHoverBehaviours(clone: HTMLElement): void {
		clone.addEventListener('mouseleave', () => {
			mainWindow.setTimeout(() => {
				this.hideHover();
			}, 250);
		});
	}
}

export interface IListEvent<T> {
	readonly elements: readonly T[];
	readonly indexes: readonly number[];
	readonly browserEvent?: UIEvent;
}

export interface IListBrowserMouseEvent extends MouseEvent {
	isHandledByList?: boolean;
}

export interface IListMouseEvent<T> {
	readonly browserEvent: IListBrowserMouseEvent;
	readonly element: T | undefined;
	readonly index: number | undefined;
}

export interface IListTouchEvent<T> {
	readonly browserEvent: TouchEvent;
	readonly element: T | undefined;
	readonly index: number | undefined;
}

export interface IListGestureEvent<T> {
	readonly browserEvent: GestureEvent;
	readonly element: T | undefined;
	readonly index: number | undefined;
}

export interface IListDragEvent<T> {
	readonly browserEvent: DragEvent;
	readonly element: T | undefined;
	readonly index: number | undefined;
	readonly sector: ListViewTargetSector | undefined;
}

export interface IListContextMenuEvent<T> {
	readonly browserEvent: UIEvent;
	readonly element: T | undefined;
	readonly index: number | undefined;
	readonly anchor: HTMLElement | IMouseEvent;
}

export interface IIdentityProvider<T> {
	getId(element: T): { toString(): string };
}

export interface IKeyboardNavigationLabelProvider<T> {

	/**
	 * Return a keyboard navigation label(s) which will be used by
	 * the list for filtering/navigating. Return `undefined` to make
	 * an element always match.
	 */
	getKeyboardNavigationLabel(element: T): { toString(): string | undefined } | { toString(): string | undefined }[] | undefined;
}

export interface IKeyboardNavigationDelegate {
	mightProducePrintableCharacter(event: IKeyboardEvent): boolean;
}

export interface IListHoverDelegate {
	showHover(container: HTMLElement, isOverflowing: boolean, options?: IHoverDelegateOptions): IHoverWidget | undefined;
	hideHover(): void;
}

export const enum ListDragOverEffectType {
	Copy,
	Move
}

export const enum ListDragOverEffectPosition {
	Over = 'drop-target',
	Before = 'drop-target-before',
	After = 'drop-target-after'
}

export interface ListDragOverEffect {
	type: ListDragOverEffectType;
	position?: ListDragOverEffectPosition;
}

export interface IListDragOverReaction {
	accept: boolean;
	effect?: ListDragOverEffect;
	feedback?: number[]; // use -1 for entire list
}

export const ListDragOverReactions = {
	reject(): IListDragOverReaction { return { accept: false }; },
	accept(): IListDragOverReaction { return { accept: true }; },
};

/**
 * Warning: Once passed to a list, that list takes up
 * the responsibility of disposing it.
 */
export interface IListDragAndDrop<T> extends IDisposable {
	getDragURI(element: T): string | null;
	getDragLabel?(elements: T[], originalEvent: DragEvent): string | undefined;
	onDragStart?(data: IDragAndDropData, originalEvent: DragEvent): void;
	onDragOver(data: IDragAndDropData, targetElement: T | undefined, targetIndex: number | undefined, targetSector: ListViewTargetSector | undefined, originalEvent: DragEvent): boolean | IListDragOverReaction;
	onDragLeave?(data: IDragAndDropData, targetElement: T | undefined, targetIndex: number | undefined, originalEvent: DragEvent): void;
	drop(data: IDragAndDropData, targetElement: T | undefined, targetIndex: number | undefined, targetSector: ListViewTargetSector | undefined, originalEvent: DragEvent): void;
	onDragEnd?(originalEvent: DragEvent): void;
}

export class ListError extends Error {

	constructor(user: string, message: string) {
		super(`ListError [${user}] ${message}`);
	}
}

export abstract class CachedListVirtualDelegate<T extends object> implements IListVirtualDelegate<T> {

	private cache = new WeakMap<T, number>();

	getHeight(element: T): number {
		return this.cache.get(element) ?? this.estimateHeight(element);
	}

	protected abstract estimateHeight(element: T): number;
	abstract getTemplateId(element: T): string;

	setDynamicHeight(element: T, height: number): void {
		if (height > 0) {
			this.cache.set(element, height);
		}
	}
}
