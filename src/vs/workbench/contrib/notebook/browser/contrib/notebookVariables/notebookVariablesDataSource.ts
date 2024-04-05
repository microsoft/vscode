/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IAsyncDataSource } from 'vs/base/browser/ui/tree/tree';
import { CancellationTokenSource } from 'vs/base/common/cancellation';
import { localize } from 'vs/nls';
import { NotebookTextModel } from 'vs/workbench/contrib/notebook/common/model/notebookTextModel';
import { INotebookKernel, INotebookKernelService, VariablesResult, variablePageSize } from 'vs/workbench/contrib/notebook/common/notebookKernelService';

export interface INotebookScope {
	kind: 'root';
	readonly notebook: NotebookTextModel;
}

export interface INotebookVariableElement {
	kind: 'variable';
	readonly id: string;
	readonly extHostId: number;
	readonly name: string;
	readonly value: string;
	readonly type?: string;
	readonly interfaces?: string[];
	readonly expression?: string;
	readonly language?: string;
	readonly indexedChildrenCount: number;
	readonly indexStart?: number;
	readonly hasNamedChildren: boolean;
	readonly notebook: NotebookTextModel;
	readonly extensionId?: string;
}

export class NotebookVariableDataSource implements IAsyncDataSource<INotebookScope, INotebookVariableElement> {

	private cancellationTokenSource: CancellationTokenSource;

	constructor(private readonly notebookKernelService: INotebookKernelService) {
		this.cancellationTokenSource = new CancellationTokenSource();
	}

	hasChildren(element: INotebookScope | INotebookVariableElement): boolean {
		return element.kind === 'root' || element.hasNamedChildren || element.indexedChildrenCount > 0;
	}

	public cancel(): void {
		this.cancellationTokenSource.cancel();
		this.cancellationTokenSource.dispose();
		this.cancellationTokenSource = new CancellationTokenSource();
	}

	async getChildren(element: INotebookScope | INotebookVariableElement): Promise<Array<INotebookVariableElement>> {
		if (element.kind === 'root') {
			return this.getRootVariables(element.notebook);
		} else {
			return this.getVariables(element);
		}
	}

	private async getVariables(parent: INotebookVariableElement): Promise<INotebookVariableElement[]> {
		const selectedKernel = this.notebookKernelService.getMatchingKernel(parent.notebook).selected;
		if (selectedKernel && selectedKernel.hasVariableProvider) {

			let children: INotebookVariableElement[] = [];
			if (parent.hasNamedChildren) {
				const variables = selectedKernel.provideVariables(parent.notebook.uri, parent.extHostId, 'named', 0, this.cancellationTokenSource.token);
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

	private async getIndexedChildren(parent: INotebookVariableElement, kernel: INotebookKernel) {
		const childNodes: INotebookVariableElement[] = [];

		if (parent.indexedChildrenCount > variablePageSize) {

			const nestedPageSize = Math.floor(Math.max(parent.indexedChildrenCount / variablePageSize, 100));

			const indexedChildCountLimit = 1_000_000;
			let start = parent.indexStart ?? 0;
			const last = start + Math.min(parent.indexedChildrenCount, indexedChildCountLimit);
			for (; start < last; start += nestedPageSize) {
				let end = start + nestedPageSize;
				if (end > last) {
					end = last;
				}

				childNodes.push({
					kind: 'variable',
					notebook: parent.notebook,
					id: parent.id + `${start}`,
					extHostId: parent.extHostId,
					name: `[${start}..${end - 1}]`,
					value: '',
					indexedChildrenCount: end - start,
					indexStart: start,
					hasNamedChildren: false
				});
			}

			if (parent.indexedChildrenCount > indexedChildCountLimit) {
				childNodes.push({
					kind: 'variable',
					notebook: parent.notebook,
					id: parent.id + `${last + 1}`,
					extHostId: parent.extHostId,
					name: localize('notebook.indexedChildrenLimitReached', "Display limit reached"),
					value: '',
					indexedChildrenCount: 0,
					hasNamedChildren: false
				});
			}
		}
		else if (parent.indexedChildrenCount > 0) {
			const variables = kernel.provideVariables(parent.notebook.uri, parent.extHostId, 'indexed', parent.indexStart ?? 0, this.cancellationTokenSource.token);

			for await (const variable of variables) {
				childNodes.push(this.createVariableElement(variable, parent.notebook));
				if (childNodes.length >= variablePageSize) {
					break;
				}
			}

		}
		return childNodes;
	}

	private async getRootVariables(notebook: NotebookTextModel): Promise<INotebookVariableElement[]> {
		const selectedKernel = this.notebookKernelService.getMatchingKernel(notebook).selected;
		if (selectedKernel && selectedKernel.hasVariableProvider) {
			const variables = selectedKernel.provideVariables(notebook.uri, undefined, 'named', 0, this.cancellationTokenSource.token);
			return await variables
				.map(variable => { return this.createVariableElement(variable, notebook); })
				.toPromise();
		}

		return [];
	}

	private createVariableElement(variable: VariablesResult, notebook: NotebookTextModel): INotebookVariableElement {
		return {
			...variable,
			kind: 'variable',
			notebook,
			extHostId: variable.id,
			id: `${variable.id}`
		};
	}
}
