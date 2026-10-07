/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IListRenderer } from '../../../../../base/browser/ui/list/list.js';
import { ITreeRenderer } from '../../../../../base/browser/ui/tree/tree.js';

export interface ICustomizationTreeGroup<T> {
	readonly id: string;
	readonly label: string;
	readonly description: string;
	readonly count: number;
	readonly element: T;
	readonly children: readonly T[];
}

export const customizationTreeStyles = {
	treeStickyScrollBackground: 'agentsPanel.background',
};

export function getCustomizationTreeContentHeight(container: HTMLElement, treeContainer: HTMLElement, fallbackHeight: number): number {
	const availableHeight = container.clientHeight || fallbackHeight;
	const contentOffset = Math.max(0, treeContainer.getBoundingClientRect().top - container.getBoundingClientRect().top);
	return Math.max(0, availableHeight - contentOffset);
}

export function asTreeRenderer<T, TTemplateData>(renderer: IListRenderer<T, TTemplateData>): ITreeRenderer<T, void, TTemplateData> {
	return {
		templateId: renderer.templateId,
		renderTemplate: container => renderer.renderTemplate(container),
		renderElement: (node, index, templateData) => renderer.renderElement(node.element, index, templateData),
		disposeElement: renderer.disposeElement
			? (node, index, templateData) => renderer.disposeElement!(node.element, index, templateData)
			: undefined,
		disposeTemplate: templateData => renderer.disposeTemplate(templateData),
	};
}
