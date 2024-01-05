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
	readonly notebook: NotebookTextModel | undefined;
}

export interface INotebookVariableElement {
	type: 'variable';
	readonly id: number;
	readonly name: string;
	readonly value: string;
	readonly indexedChildrenCount: number;
	readonly hasNamedChildren: boolean;
}

export class NotebookVariableDataSource implements IAsyncDataSource<INotebookScope, INotebookVariableElement> {

	private notebook: NotebookTextModel | undefined = undefined;

	constructor(private readonly notebookKernelService: INotebookKernelService) { }

	hasChildren(element: INotebookScope | INotebookVariableElement): boolean {
		return element.type === 'root' || element.hasNamedChildren || element.indexedChildrenCount > 0;
	}

	async getChildren(element: INotebookScope | INotebookVariableElement): Promise<Array<INotebookVariableElement>> {
		if (element.type === 'root') {
			this.notebook = element.notebook;
			return this.getRootVariables();
		} else {
			return this.getVariables(element);
		}
	}

	async getVariables(parent: INotebookVariableElement): Promise<INotebookVariableElement[]> {
		if (!this.notebook) {
			return [];
		}
		const selectedKernel = this.notebookKernelService.getMatchingKernel(this.notebook).selected;
		if (selectedKernel && selectedKernel.hasVariableProvider) {

			let children: INotebookVariableElement[] = [];
			if (parent.hasNamedChildren) {
				const variables = selectedKernel.provideVariables(this.notebook.uri, parent.id, 'named', 0, CancellationToken.None);
				const childNodes = await variables
					.map(variable => { return this.createVariableElement(variable); })
					.toPromise();
				children = children.concat(childNodes);
			}
			if (parent.indexedChildrenCount > 0) {
				const variables = selectedKernel.provideVariables(this.notebook.uri, parent.id, 'indexed', 0, CancellationToken.None);
				const childNodes = await variables
					.map(variable => { return this.createVariableElement(variable); })
					.toPromise();
				children = children.concat(childNodes);
			}

			return children;
		}
		return [];
	}

	async getRootVariables(): Promise<INotebookVariableElement[]> {
		if (!this.notebook) {
			return [];
		}

		const selectedKernel = this.notebookKernelService.getMatchingKernel(this.notebook).selected;
		if (selectedKernel && selectedKernel.hasVariableProvider) {
			const variables = selectedKernel.provideVariables(this.notebook.uri, undefined, 'named', 0, CancellationToken.None);
			return await variables
				.map(variable => { return this.createVariableElement(variable); })
				.toPromise();
		}

		return [];
	}

	private createVariableElement(variable: VariablesResult): INotebookVariableElement {
		return {
			type: 'variable',
			...variable
		};
	}
}
