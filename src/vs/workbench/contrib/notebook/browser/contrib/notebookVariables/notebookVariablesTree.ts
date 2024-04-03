/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { IListVirtualDelegate } from 'vs/base/browser/ui/list/list';
import { IListAccessibilityProvider } from 'vs/base/browser/ui/list/listWidget';
import { ITreeNode, ITreeRenderer } from 'vs/base/browser/ui/tree/tree';
import { FuzzyScore } from 'vs/base/common/filters';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { localize } from 'vs/nls';
import { IHoverService } from 'vs/platform/hover/browser/hover';
import { WorkbenchObjectTree } from 'vs/platform/list/browser/listService';
import { renderExpressionValue } from 'vs/workbench/contrib/debug/browser/baseDebugView';
import { INotebookVariableElement } from 'vs/workbench/contrib/notebook/browser/contrib/notebookVariables/notebookVariablesDataSource';

const $ = dom.$;
const MAX_VALUE_RENDER_LENGTH_IN_VIEWLET = 1024;

export class NotebookVariablesTree extends WorkbenchObjectTree<INotebookVariableElement> { }

export class NotebookVariablesDelegate implements IListVirtualDelegate<INotebookVariableElement> {

	getHeight(element: INotebookVariableElement): number {
		return 22;
	}

	getTemplateId(element: INotebookVariableElement): string {
		return NotebookVariableRenderer.ID;
	}
}

export interface IVariableTemplateData {
	expression: HTMLElement;
	name: HTMLSpanElement;
	value: HTMLSpanElement;
	elementDisposables: DisposableStore;
}

export class NotebookVariableRenderer implements ITreeRenderer<INotebookVariableElement, FuzzyScore, IVariableTemplateData> {

	static readonly ID = 'variableElement';

	get templateId(): string {
		return NotebookVariableRenderer.ID;
	}

	constructor(
		@IHoverService private readonly _hoverService: IHoverService
	) {
	}

	renderTemplate(container: HTMLElement): IVariableTemplateData {
		const expression = dom.append(container, $('.expression'));
		const name = dom.append(expression, $('span.name'));
		const value = dom.append(expression, $('span.value'));

		const template: IVariableTemplateData = { expression, name, value, elementDisposables: new DisposableStore() };

		return template;
	}

	renderElement(element: ITreeNode<INotebookVariableElement, FuzzyScore>, _index: number, data: IVariableTemplateData): void {
		const text = element.element.value.trim() !== '' ? `${element.element.name}:` : element.element.name;
		data.name.textContent = text;
		data.name.title = element.element.type ?? '';

		renderExpressionValue(element.element, data.value, {
			colorize: true,
			hover: data.elementDisposables,
			maxValueLength: MAX_VALUE_RENDER_LENGTH_IN_VIEWLET
		}, this._hoverService);
	}

	disposeElement(element: ITreeNode<INotebookVariableElement, FuzzyScore>, index: number, templateData: IVariableTemplateData, height: number | undefined): void {
		templateData.elementDisposables.clear();
	}


	disposeTemplate(templateData: IVariableTemplateData): void {
		templateData.elementDisposables.dispose();
	}
}

export class NotebookVariableAccessibilityProvider implements IListAccessibilityProvider<INotebookVariableElement> {

	getWidgetAriaLabel(): string {
		return localize('debugConsole', "Notebook Variables");
	}

	getAriaLabel(element: INotebookVariableElement): string {
		return localize('notebookVariableAriaLabel', "Variable {0}, value {1}", element.name, element.value);
	}
}
