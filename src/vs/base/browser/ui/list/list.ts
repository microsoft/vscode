/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

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

export interface IListMouseEvent<T> extends MouseEvent {
	element: T;
	index: number;
}

export interface IListContextMenuEvent<T> {
	element: T;
	index: number;
	anchor: HTMLElement | { x: number; y: number; };
}