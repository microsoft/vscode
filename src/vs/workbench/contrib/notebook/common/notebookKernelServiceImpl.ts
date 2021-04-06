/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event, Emitter } from 'vs/base/common/event';
import { IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { INotebookTextModel } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { INotebookKernel2, INotebookKernelService } from 'vs/workbench/contrib/notebook/common/notebookKernelService';
import { score } from 'vs/workbench/contrib/notebook/common/notebookSelector';

export class NotebookKernelService implements INotebookKernelService {

	declare _serviceBrand: undefined;

	private readonly _kernels = new Set<INotebookKernel2>();
	private readonly _onDidAddKernel = new Emitter<INotebookKernel2>();
	private readonly _onDidRemoveKernel = new Emitter<INotebookKernel2>();

	readonly onDidAddKernel: Event<INotebookKernel2> = this._onDidAddKernel.event;
	readonly onDidRemoveKernel: Event<INotebookKernel2> = this._onDidRemoveKernel.event;

	addKernel(kernel: INotebookKernel2): IDisposable {
		this._kernels.add(kernel);
		this._onDidAddKernel.fire(kernel);
		return toDisposable(() => {
			if (this._kernels.delete(kernel)) {
				this._onDidRemoveKernel.fire(kernel);
			}
		});
	}

	selectKernels(notebook: INotebookTextModel): INotebookKernel2[] {
		const result: INotebookKernel2[] = [];
		for (let kernel of this._kernels) {
			if (score(kernel.selector, notebook.uri, notebook.viewType) > 0) {
				result.push(kernel);
			}
		}
		return result;
	}
}
