/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IAsyncDataSource } from 'vs/base/browser/ui/tree/tree';
import { CancellationToken } from 'vs/base/common/cancellation';
import { NotebookTextModel } from 'vs/workbench/contrib/notebook/common/model/notebookTextModel';
import { INotebookKernel, INotebookKernelService, VariablesResult } from 'vs/workbench/contrib/notebook/common/notebookKernelService';

export interface INotebookScope {
	type: 'root';
	readonly notebook: NotebookTextModel;
}

export interface INotebookVariableElement {
	type: 'variable';
	readonly id: number;
	readonly name: string;
	readonly value: string;
	readonly indexedChildrenCount: number;
	readonly indexStart?: number;
	readonly hasNamedChildren: boolean;
	readonly notebook: NotebookTextModel;
}

export class NotebookVariableDataSource implements IAsyncDataSource<INotebookScope, INotebookVariableElement> {

	constructor(private readonly notebookKernelService: INotebookKernelService) { }

	hasChildren(element: INotebookScope | INotebookVariableElement): boolean {
		return element.type === 'root' || element.hasNamedChildren || element.indexedChildrenCount > 0;
	}

	async getChildren(element: INotebookScope | INotebookVariableElement): Promise<Array<INotebookVariableElement>> {
		if (element.type === 'root') {
			return this.getRootVariables(element.notebook);
		} else {
			return this.getVariables(element);
		}
	}

	async getVariables(parent: INotebookVariableElement): Promise<INotebookVariableElement[]> {
		const selectedKernel = this.notebookKernelService.getMatchingKernel(parent.notebook).selected;
		if (selectedKernel && selectedKernel.hasVariableProvider) {

			let children: INotebookVariableElement[] = [];
			if (parent.hasNamedChildren) {
				const variables = selectedKernel.provideVariables(parent.notebook.uri, parent.id, 'named', 0, CancellationToken.None);
				const childNodes = await variables
					.map(variable => { return this.createVariableElement(variable, parent.notebook); })
					.toPromise();
				children = children.concat(childNodes);
			}
			if (parent.indexedChildrenCount > 0) {
				const childNodes = await this.getIndexedChildren(parent, selectedKernel);
				children = children.concat(childNodes);
			}

			return children;
		}
		return [];
	}

	async getIndexedChildren(parent: INotebookVariableElement, kernel: INotebookKernel) {
		const childNodes: INotebookVariableElement[] = [];

		if (parent.indexedChildrenCount > 100) {
			for (let start = 0; start < parent.indexedChildrenCount; start += 100) {
				let end = start + 100;
				if (end > parent.indexedChildrenCount) {
					end = parent.indexedChildrenCount;
				}

				childNodes.push({
					type: 'variable',
					notebook: parent.notebook,
					id: parent.id,
					name: `[${start}..${end - 1}]`,
					value: '',
					indexedChildrenCount: end - start,
					indexStart: start,
					hasNamedChildren: false
				});
			}
		}
		else if (parent.indexedChildrenCount > 0) {
			const variables = kernel.provideVariables(parent.notebook.uri, parent.id, 'indexed', parent.indexStart ?? 0, CancellationToken.None);

			for await (const variable of variables) {
				childNodes.push(this.createVariableElement(variable, parent.notebook));
				if (childNodes.length >= 100) {
					break;
				}
			}

		}
		return childNodes;
	}

	async getRootVariables(notebook: NotebookTextModel): Promise<INotebookVariableElement[]> {
		const selectedKernel = this.notebookKernelService.getMatchingKernel(notebook).selected;
		if (selectedKernel && selectedKernel.hasVariableProvider) {
			const variables = selectedKernel.provideVariables(notebook.uri, undefined, 'named', 0, CancellationToken.None);
			return await variables
				.map(variable => { return this.createVariableElement(variable, notebook); })
				.toPromise();
		}

		return [];
	}

	private createVariableElement(variable: VariablesResult, notebook: NotebookTextModel): INotebookVariableElement {
		return {
			type: 'variable',
			notebook,
			...variable
		};
	}
}
