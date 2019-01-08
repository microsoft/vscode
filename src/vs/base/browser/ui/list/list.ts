/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { GestureEvent } from 'vs/base/browser/touch';
import { IKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { Event } from 'vs/base/common/event';
import { IDisposable } from 'vs/base/common/lifecycle';
import { DragMouseEvent } from 'vs/base/browser/mouseEvent';

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

export const enum DragOverEffect {
	Copy,
	Move
}

// export const enum DragOverBubble {
// 	Down,
// 	Up
// }

export interface IDragOverReaction {
	accept: boolean;
	effect?: DragOverEffect;
	// bubble?: DragOverBubble;
	// autoExpand?: boolean;
}

export const DragOverReactions = {
	reject(): IDragOverReaction { return { accept: false }; },
	accept(): IDragOverReaction { return { accept: true }; },
	// acceptBubbleUp(): IDragOverReaction { return { accept: true, bubble: DragOverBubble.Up }; },
	// acceptBubbleDown(autoExpand = false): IDragOverReaction { return { accept: true, bubble: DragOverBubble.Down, autoExpand }; },
	// acceptCopyBubbleUp(): IDragOverReaction { return { accept: true, bubble: DragOverBubble.Up, effect: DragOverEffect.Copy }; },
	// acceptCopyBubbleDown(autoExpand = false): IDragOverReaction { return { accept: true, bubble: DragOverBubble.Down, effect: DragOverEffect.Copy, autoExpand }; }
};

export interface IDragAndDropData {
	update(event: DragMouseEvent): void;
	getData(): any;
}

export interface IDragAndDrop<T> {
	getDragURI(element: T): string | null;
	getDragLabel?(elements: T[]): string;
	onDragStart(data: IDragAndDropData, originalEvent: DragMouseEvent): void;
	onDragOver(data: IDragAndDropData, targetElement: T, originalEvent: DragMouseEvent): boolean | IDragOverReaction;
	drop(data: IDragAndDropData, targetElement: T, originalEvent: DragMouseEvent): void;
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