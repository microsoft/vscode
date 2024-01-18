/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IAsyncDataSource } from 'vs/base/browser/ui/tree/tree';
import { CancellationToken } from 'vs/base/common/cancellation';
import { NotebookTextModel } from 'vs/workbench/contrib/notebook/common/model/notebookTextModel';
import { INotebookKernelService, VariablesResult } from 'vs/workbench/contrib/notebook/common/notebookKernelService';

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
				const variables = selectedKernel.provideVariables(parent.notebook.uri, parent.id, 'indexed', 0, CancellationToken.None);
				const childNodes = await variables
					.map(variable => { return this.createVariableElement(variable, parent.notebook); })
					.toPromise();
				children = children.concat(childNodes);
			}

			return children;
		}
		return [];
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
