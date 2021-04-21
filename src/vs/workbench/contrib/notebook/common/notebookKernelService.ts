/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from 'vs/base/common/event';
import { IDisposable } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { INotebookKernel, INotebookTextModel } from 'vs/workbench/contrib/notebook/common/notebookCommon';

export interface INotebookKernelBindEvent {
	notebook: URI;
	oldKernel: string | undefined;
	newKernel: string | undefined;
}

export interface INotebookTextModelLike { uri: URI; viewType: string; }

export const INotebookKernelService = createDecorator<INotebookKernelService>('INotebookKernelService');

export interface INotebookKernelService {
	_serviceBrand: undefined;

	readonly onDidAddKernel: Event<INotebookKernel>;
	readonly onDidRemoveKernel: Event<INotebookKernel>;
	readonly onDidChangeNotebookKernelBinding: Event<INotebookKernelBindEvent>;

	registerKernel(kernel: INotebookKernel): IDisposable;

	getNotebookKernels(notebook: INotebookTextModelLike): { bound: INotebookKernel | undefined, all: INotebookKernel[] }

	/**
	 * Bind a notebook document to a kernel. A notebook is only bound to one kernel
	 * but a kernel can be bound to many notebooks (depending on its configuration)
	 */
	updateNotebookKernelBinding(notebook: INotebookTextModel, kernel: INotebookKernel | undefined): void;

}
