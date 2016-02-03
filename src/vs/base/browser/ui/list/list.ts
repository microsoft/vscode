/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export interface IScrollEvent {
	vertical: boolean;
	horizontal: boolean;
}

export interface IDelegate<T> {
	getHeight(element: T): number;
	getTemplateId(element: T): string;
}

export interface IRenderer<TElement, TTemplateData> {
	renderTemplate(container: HTMLElement): TTemplateData;
	renderElement(element: TElement, templateData: TTemplateData): void;
	disposeTemplate(templateData: TTemplateData): void;
}

export interface IRendererMap<T> {
	[templateId: string]: IRenderer<T, any>;
}
