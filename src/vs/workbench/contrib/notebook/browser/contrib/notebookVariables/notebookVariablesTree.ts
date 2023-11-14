/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { IListVirtualDelegate } from 'vs/base/browser/ui/list/list';
import { IListAccessibilityProvider } from 'vs/base/browser/ui/list/listWidget';
import { IObjectTreeElement, ITreeNode, ITreeRenderer } from 'vs/base/browser/ui/tree/tree';
import { FuzzyScore } from 'vs/base/common/filters';
import { localize } from 'vs/nls';
import { WorkbenchObjectTree } from 'vs/platform/list/browser/listService';

export interface INotebookVariableElement {
	readonly id: string;
	readonly label: string;
	readonly value: string;
}

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

	renderElement(element: ITreeNode<INotebookVariableElement, FuzzyScore>, index: number, templateData: { wrapper: HTMLElement }, height: number | undefined): void {
		templateData.wrapper.innerText = `${element.element.label} - ${element.element.value}`;
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
		return localize('notebookVariableAriaLabel', "Variable {0}, value {1}", element.label, element.value);
	}
}

export function mockVariables(notebook: string, kernel: string): IObjectTreeElement<INotebookVariableElement>[] {
	return [
		{
			element: {
				id: '1',
				label: 'Notebook',
				value: notebook,
			},
			children: [
				{
					element: {
						id: '1.1',
						label: 'Kernel',
						value: kernel,
					}
				},
				{
					element: {
						id: '1.2',
						label: 'Child Variable 2',
						value: 'Child Value 2',
					}
				}
			],
			collapsed: true
		},
		{
			element: {
				id: '2',
				label: 'Variable 2',
				value: 'Value 2',
			},
			children: [
				{
					element: {
						id: '2.1',
						label: 'Child Variable 1',
						value: 'Child Value 1',
					}
				},
				{
					element: {
						id: '2.2',
						label: 'Child Variable 2',
						value: 'Child Value 2',
					}
				}
			],
			collapsed: true
		},
		{
			element: {
				id: '3',
				label: 'Variable 3',
				value: 'Value 3',
			}
		},
		{
			element: {
				id: '4',
				label: 'Variable 4',
				value: 'Value 4',
			},
			children: [
				{
					element: {
						id: '4.1',
						label: 'Child Variable 1',
						value: 'Child Value 1',
					}
				},
				{
					element: {
						id: '4.2',
						label: 'Child Variable 2',
						value: 'Child Value 2',
					}
				}
			],
			collapsed: true
		},
		{
			element: {
				id: '5',
				label: 'Variable 5',
				value: 'Value 5',
			}
		},
		{
			element: {
				id: '6',
				label: 'Variable 6',
				value: 'Value 6',
			}
		},
		{
			element: {
				id: '7',
				label: 'Variable 7',
				value: 'Value 7',
			}
		},
		{
			element: {
				id: '8',
				label: 'Variable 8',
				value: 'Value 8',
			}
		},
		{
			element: {
				id: '9',
				label: 'Variable 9',
				value: 'Value 9',
			}
		}
	];
}
