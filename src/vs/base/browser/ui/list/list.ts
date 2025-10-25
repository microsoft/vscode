/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDragAndDropData } from '../../dnd.js';
import { IKeyboardEvent } from '../../keyboardEvent.js';
import { IMouseEvent } from '../../mouseEvent.js';
import { GestureEvent } from '../../touch.js';
import { ListViewTargetSector } from './listView.js';
import { IDisposable } from '../../../common/lifecycle.js';

export interface IListVirtualDelegate<T> {
	getHeight(element: T): number;
	getTemplateId(element: T): string;
	hasDynamicHeight?(element: T): boolean;
	getDynamicHeight?(element: T): number | null;
	setDynamicHeight?(element: T, height: number): void;
}

export interface IListElementRenderDetails {
	readonly height?: number;
	readonly onScroll?: boolean;
}

export interface IListRenderer<T, TTemplateData> {
	readonly templateId: string;
	renderTemplate(container: HTMLElement): TTemplateData;
	renderElement(element: T, index: number, templateData: TTemplateData, details?: IListElementRenderDetails): void;
	disposeElement?(element: T, index: number, templateData: TTemplateData, details?: IListElementRenderDetails): void;
	disposeTemplate(templateData: TTemplateData): void;
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
