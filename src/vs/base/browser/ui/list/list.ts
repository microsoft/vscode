/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { GestureEvent } from 'vs/base/browser/touch';
import { IKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { Event } from 'vs/base/common/event';
import { IDisposable } from 'vs/base/common/lifecycle';
import { IDragAndDropData } from 'vs/base/browser/dnd';

export interface IListVirtualDelegate<T> {
	getHeight(element: T): number;
	getTemplateId(element: T): string;
	hasDynamicHeight?(element: T): boolean;
}

export interface IListRenderer<T, TTemplateData> {
	templateId: string;
	renderTemplate(container: HTMLElement): TTemplateData;
	renderElement(element: T, index: number, templateData: TTemplateData): void;
	disposeElement?(element: T, index: number, templateData: TTemplateData): void;
	disposeTemplate(templateData: TTemplateData): void;
}

export interface IListEvent<T> {
	elements: T[];
	indexes: number[];
	browserEvent?: UIEvent;
}

export interface IListMouseEvent<T> {
	browserEvent: MouseEvent;
	element: T | undefined;
	index: number | undefined;
}

export interface IListTouchEvent<T> {
	browserEvent: TouchEvent;
	element: T | undefined;
	index: number | undefined;
}

export interface IListGestureEvent<T> {
	browserEvent: GestureEvent;
	element: T | undefined;
	index: number | undefined;
}

export interface IListDragEvent<T> {
	browserEvent: DragEvent;
	element: T | undefined;
	index: number | undefined;
}

export interface IListContextMenuEvent<T> {
	browserEvent: UIEvent;
	element: T | undefined;
	index: number | undefined;
	anchor: HTMLElement | { x: number; y: number; } | undefined;
}

export interface IIdentityProvider<T> {
	getId(element: T): { toString(): string; };
}

export interface IKeyboardNavigationLabelProvider<T> {
	getKeyboardNavigationLabel(element: T): { toString(): string; };
	mightProducePrintableCharacter?(event: IKeyboardEvent): boolean;
}

export const enum ListDragOverEffect {
	Copy,
	Move
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

export interface IListDragAndDrop<T> {
	getDragURI(element: T): string | null;
	getDragLabel?(elements: T[]): string | undefined;
	onDragStart?(data: IDragAndDropData, originalEvent: DragEvent): void;
	onDragOver(data: IDragAndDropData, targetElement: T | undefined, targetIndex: number | undefined, originalEvent: DragEvent): boolean | IListDragOverReaction;
	drop(data: IDragAndDropData, targetElement: T | undefined, targetIndex: number | undefined, originalEvent: DragEvent): void;
}

/**
 * Use this renderer when you want to re-render elements on account of
 * an event firing.
 */
export abstract class AbstractListRenderer<T, TTemplateData> implements IListRenderer<T, TTemplateData> {

	private renderedElements = new Map<T, TTemplateData>();
	private listener: IDisposable;

	constructor(onDidChange: Event<T | T[] | undefined>) {
		this.listener = onDidChange(this.onDidChange, this);
	}

	renderElement(element: T, index: number, templateData: TTemplateData): void {
		this.renderedElements.set(element, templateData);
	}

	disposeElement(element: T, index: number, templateData: TTemplateData): void {
		this.renderedElements.delete(element);
	}

	private onDidChange(e: T | T[] | undefined) {
		if (typeof e === 'undefined') {
			this.renderedElements.forEach((templateData, element) => this.renderElement(element, -1 /* TODO@joao */, templateData));
		} else if (Array.isArray(e)) {
			for (const element of e) {
				this.rerender(element);
			}
		} else {
			this.rerender(e);
		}
	}

	private rerender(element: T): void {
		const templateData = this.renderedElements.get(element);

		if (templateData) {
			this.renderElement(element, -1 /* TODO@Joao */, templateData);
		}
	}

	dispose(): void {
		this.listener.dispose();
	}

	abstract readonly templateId: string;
	abstract renderTemplate(container: HTMLElement): TTemplateData;
	abstract disposeTemplate(templateData: TTemplateData): void;
}