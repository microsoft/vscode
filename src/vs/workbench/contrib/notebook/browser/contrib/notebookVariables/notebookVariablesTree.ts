/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { IListVirtualDelegate } from 'vs/base/browser/ui/list/list';
import { IListAccessibilityProvider } from 'vs/base/browser/ui/list/listWidget';
import { ITreeNode, ITreeRenderer } from 'vs/base/browser/ui/tree/tree';
import { FuzzyScore } from 'vs/base/common/filters';
import { localize } from 'vs/nls';
import { WorkbenchObjectTree } from 'vs/platform/list/browser/listService';
import { INotebookVariableElement } from 'vs/workbench/contrib/notebook/browser/contrib/notebookVariables/notebookVariablesDataSource';

export class NotebookVariablesTree extends WorkbenchObjectTree<INotebookVariableElement> { }

export class NotebookVariablesDelegate implements IListVirtualDelegate<INotebookVariableElement> {

	getHeight(element: INotebookVariableElement): number {
		return 22;
	}

	getTemplateId(element: INotebookVariableElement): string {
		return NotebookVariableRenderer.ID;
	}
}

export class NotebookVariableRenderer implements ITreeRenderer<INotebookVariableElement, FuzzyScore, { wrapper: HTMLElement }> {

	static readonly ID = 'variableElement';

	get templateId(): string {
		return NotebookVariableRenderer.ID;
	}

	renderTemplate(container: HTMLElement) {
		const wrapper = dom.append(container, dom.$('.variable'));
		return { wrapper };
	}

	renderElement(element: ITreeNode<INotebookVariableElement, FuzzyScore>, _index: number, templateData: { wrapper: HTMLElement }): void {
		templateData.wrapper.innerText = `${element.element.name}: ${element.element.value}`;
	}

	disposeTemplate(): void {
		// noop
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
