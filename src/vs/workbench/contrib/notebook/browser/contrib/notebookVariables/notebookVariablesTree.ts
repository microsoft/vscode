/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IListVirtualDelegate } from 'vs/base/browser/ui/list/list';
import { IListAccessibilityProvider } from 'vs/base/browser/ui/list/listWidget';
import { IAsyncDataSource, ITreeNode, ITreeRenderer } from 'vs/base/browser/ui/tree/tree';
import { FuzzyScore } from 'vs/base/common/filters';
import { localize } from 'vs/nls';
import { WorkbenchAsyncDataTree } from 'vs/platform/list/browser/listService';

export abstract class VariablesSession {
	abstract getVariables(): Promise<IVariableTreeElement[]>;
}

export interface IVariableTreeElement {
	readonly id: string;
	readonly label: string;
	readonly value: string;
	readonly hasChildren: boolean;
	getChildren(): Promise<IVariableTreeElement[]>;
}

export class NotebookVariablesTree extends WorkbenchAsyncDataTree<VariablesSession, IVariableTreeElement, FuzzyScore> { }

export class NotebookVariablesDelegate implements IListVirtualDelegate<IVariableTreeElement> {

	getHeight(element: IVariableTreeElement): number {
		return 22;
	}

	getTemplateId(element: IVariableTreeElement): string {
		return NotebookVariableRenderer.ID;
	}
}

export class NotebookVariableRenderer implements ITreeRenderer<IVariableTreeElement, FuzzyScore, { container: HTMLElement }> {

	static readonly ID = 'variableElement';

	get templateId(): string {
		return NotebookVariableRenderer.ID;
	}

	renderTemplate(container: HTMLElement) {
		return { container };
	}

	renderElement(element: ITreeNode<IVariableTreeElement, FuzzyScore>, index: number, templateData: { container: HTMLElement }, height: number | undefined): void {
		templateData.container.innerText = element.element.label;
	}

	disposeTemplate(): void {
		// noop
	}
}

export class NotebookVariablesDataSource implements IAsyncDataSource<VariablesSession, IVariableTreeElement> {

	hasChildren(element: VariablesSession | IVariableTreeElement): boolean {
		if (element instanceof VariablesSession) {
			return true;
		}
		return element.hasChildren;
	}

	getChildren(element: VariablesSession | IVariableTreeElement): Promise<IVariableTreeElement[]> {
		if (element instanceof VariablesSession) {
			return element.getVariables();
		}

		return element.getChildren();
	}
}

export class NotebookVariableAccessibilityProvider implements IListAccessibilityProvider<IVariableTreeElement> {

	getWidgetAriaLabel(): string {
		return localize('debugConsole', "Notebook Variables");
	}

	getAriaLabel(element: IVariableTreeElement): string {
		return localize('notebookVariableAriaLabel', "Variable {0}, value {1}", element.label, element.value);
	}
}

export class MockVariables extends VariablesSession {
	override getVariables(): Promise<IVariableTreeElement[]> {
		return Promise.resolve([
			{
				id: '1',
				label: 'Variable 1',
				value: 'Value 1',
				hasChildren: true,
				getChildren: async () => [
					{
						id: '1.1',
						label: 'Child Variable 1',
						value: 'Child Value 1',
						hasChildren: false,
						getChildren: async () => []
					},
					{
						id: '1.2',
						label: 'Child Variable 2',
						value: 'Child Value 2',
						hasChildren: false,
						getChildren: async () => []
					}
				]
			},
			{
				id: '2',
				label: 'Variable 2',
				value: 'Value 2',
				hasChildren: false,
				getChildren: async () => []
			}
		]);
	}
}
