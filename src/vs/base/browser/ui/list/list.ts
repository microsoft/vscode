/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { GestureEvent } from 'vs/base/browser/touch';

export interface IDelegate<T> {
	getHeight(element: T): number;
	getTemplateId(element: T): string;
}

export interface IRenderer<TElement, TTemplateData> {
	templateId: string;
	renderTemplate(container: HTMLElement): TTemplateData;
	renderElement(element: TElement, index: number, templateData: TTemplateData): void;
	disposeTemplate(templateData: TTemplateData): void;
}

export interface IListElementEvent<T, E> {
	element: T;
	index: number;
	event: E;
}

export interface IListEvent<T> {
	elements: T[];
	indexes: number[];
}

export interface IListBrowserEvent<T, E extends Event> {
	browserEvent: E;
	elements: T[];
	index: number;
}

export interface IListMouseEvent<T> {
	browserEvent: MouseEvent;
	element: T | undefined;
	index: number;
}

export interface IListTouchEvent<T> {
	browserEvent: TouchEvent;
	element: T | undefined;
	index: number;
}

export interface IListGestureEvent<T> {
	browserEvent: GestureEvent;
	element: T | undefined;
	index: number;
}

export interface IListKeyboardEvent<T> extends IListBrowserEvent<T, KeyboardEvent> { }

export interface IListContextMenuEvent<T> {
	element: T;
	index: number;
	anchor: HTMLElement | { x: number; y: number; };
}
