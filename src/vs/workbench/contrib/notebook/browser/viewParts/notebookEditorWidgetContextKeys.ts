/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DisposableStore, dispose, IDisposable } from 'vs/base/common/lifecycle';
import { IContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { ICellViewModel, INotebookEditorDelegate, KERNEL_EXTENSIONS } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import { NOTEBOOK_CELL_TOOLBAR_LOCATION, NOTEBOOK_HAS_OUTPUTS, NOTEBOOK_HAS_RUNNING_CELL, NOTEBOOK_INTERRUPTIBLE_KERNEL, NOTEBOOK_KERNEL, NOTEBOOK_KERNEL_COUNT, NOTEBOOK_KERNEL_SELECTED, NOTEBOOK_MISSING_KERNEL_EXTENSION, NOTEBOOK_USE_CONSOLIDATED_OUTPUT_BUTTON, NOTEBOOK_VIEW_TYPE } from 'vs/workbench/contrib/notebook/common/notebookContextKeys';
import { INotebookExecutionStateService } from 'vs/workbench/contrib/notebook/common/notebookExecutionStateService';
import { INotebookKernelService, NotebookKernelType } from 'vs/workbench/contrib/notebook/common/notebookKernelService';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';

export class NotebookEditorContextKeys {

	private readonly _notebookKernel: IContextKey<string>;
	private readonly _notebookKernelCount: IContextKey<number>;
	private readonly _notebookKernelSelected: IContextKey<boolean>;
	private readonly _interruptibleKernel: IContextKey<boolean>;
	private readonly _someCellRunning: IContextKey<boolean>;
	private readonly _hasOutputs: IContextKey<boolean>;
	private readonly _useConsolidatedOutputButton: IContextKey<boolean>;
	private readonly _viewType!: IContextKey<string>;
	private readonly _missingKernelExtension: IContextKey<boolean>;
	private readonly _cellToolbarLocation: IContextKey<'left' | 'right' | 'hidden'>;

	private readonly _disposables = new DisposableStore();
	private readonly _viewModelDisposables = new DisposableStore();
	private readonly _cellOutputsListeners: IDisposable[] = [];

	constructor(
		private readonly _editor: INotebookEditorDelegate,
		@INotebookKernelService private readonly _notebookKernelService: INotebookKernelService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IExtensionService private readonly _extensionService: IExtensionService,
		@INotebookExecutionStateService private readonly _notebookExecutionStateService: INotebookExecutionStateService
	) {
		this._notebookKernel = NOTEBOOK_KERNEL.bindTo(contextKeyService);
		this._notebookKernelCount = NOTEBOOK_KERNEL_COUNT.bindTo(contextKeyService);
		this._notebookKernelSelected = NOTEBOOK_KERNEL_SELECTED.bindTo(contextKeyService);
		this._interruptibleKernel = NOTEBOOK_INTERRUPTIBLE_KERNEL.bindTo(contextKeyService);
		this._someCellRunning = NOTEBOOK_HAS_RUNNING_CELL.bindTo(contextKeyService);
		this._useConsolidatedOutputButton = NOTEBOOK_USE_CONSOLIDATED_OUTPUT_BUTTON.bindTo(contextKeyService);
		this._hasOutputs = NOTEBOOK_HAS_OUTPUTS.bindTo(contextKeyService);
		this._viewType = NOTEBOOK_VIEW_TYPE.bindTo(contextKeyService);
		this._missingKernelExtension = NOTEBOOK_MISSING_KERNEL_EXTENSION.bindTo(contextKeyService);
		this._cellToolbarLocation = NOTEBOOK_CELL_TOOLBAR_LOCATION.bindTo(contextKeyService);

		this._handleDidChangeModel();
		this._updateForNotebookOptions();

		this._disposables.add(_editor.onDidChangeModel(this._handleDidChangeModel, this));
		this._disposables.add(_notebookKernelService.onDidAddKernel(this._updateKernelContext, this));
		this._disposables.add(_notebookKernelService.onDidChangeSelectedNotebooks(this._updateKernelContext, this));
		this._disposables.add(_editor.notebookOptions.onDidChangeOptions(this._updateForNotebookOptions, this));
		this._disposables.add(_extensionService.onDidChangeExtensions(this._updateForInstalledExtension, this));
		this._disposables.add(_notebookExecutionStateService.onDidChangeCellExecution(this._updateForCellExecution, this));
	}

	dispose(): void {
		this._disposables.dispose();
		this._viewModelDisposables.dispose();
		this._notebookKernelCount.reset();
		this._interruptibleKernel.reset();
		this._someCellRunning.reset();
		this._viewType.reset();
		dispose(this._cellOutputsListeners);
		this._cellOutputsListeners.length = 0;
	}

	private _handleDidChangeModel(): void {

		this._updateKernelContext();
		this._updateForNotebookOptions();

		this._viewModelDisposables.clear();
		dispose(this._cellOutputsListeners);
		this._cellOutputsListeners.length = 0;

		if (!this._editor.hasModel()) {
			return;
		}

		const recomputeOutputsExistence = () => {
			let hasOutputs = false;
			if (this._editor.hasModel()) {
				for (let i = 0; i < this._editor.getLength(); i++) {
					if (this._editor.cellAt(i).outputsViewModels.length > 0) {
						hasOutputs = true;
						break;
					}
				}
			}

			this._hasOutputs.set(hasOutputs);
		};

		const addCellOutputsListener = (c: ICellViewModel) => {
			return c.model.onDidChangeOutputs(() => {
				recomputeOutputsExistence();
			});
		};

		for (let i = 0; i < this._editor.getLength(); i++) {
			const cell = this._editor.cellAt(i);
			this._cellOutputsListeners.push(addCellOutputsListener(cell));
		}

		recomputeOutputsExistence();
		this._updateForInstalledExtension();

		this._viewModelDisposables.add(this._editor.onDidChangeViewCells(e => {
			e.splices.reverse().forEach(splice => {
				const [start, deleted, newCells] = splice;
				const deletedCellOutputStates = this._cellOutputsListeners.splice(start, deleted, ...newCells.map(addCellOutputsListener));
				dispose(deletedCellOutputStates);
			});
		}));
		this._viewType.set(this._editor.textModel.viewType);
	}

	private _updateForCellExecution(): void {
		if (this._editor.textModel) {
			const notebookExe = this._notebookExecutionStateService.getCellExecutionStatesForNotebook(this._editor.textModel.uri);
			this._someCellRunning.set(notebookExe.length > 0);
		} else {
			this._someCellRunning.set(false);
		}
	}

	private async _updateForInstalledExtension(): Promise<void> {
		if (!this._editor.hasModel()) {
			return;
		}

		const viewType = this._editor.textModel.viewType;
		const kernelExtensionId = KERNEL_EXTENSIONS.get(viewType);
		this._missingKernelExtension.set(
			!!kernelExtensionId && !(await this._extensionService.getExtension(kernelExtensionId)));
	}

	private _updateKernelContext(): void {
		if (!this._editor.hasModel()) {
			this._notebookKernelCount.reset();
			this._interruptibleKernel.reset();
			return;
		}

		const { selected, all } = this._notebookKernelService.getMatchingKernel(this._editor.textModel);
		this._notebookKernelCount.set(all.length);
		this._interruptibleKernel.set((selected?.type === NotebookKernelType.Resolved && selected.implementsInterrupt) ?? false);
		this._notebookKernelSelected.set(Boolean(selected));
		this._notebookKernel.set(selected?.id ?? '');
	}

	private _updateForNotebookOptions(): void {
		const layout = this._editor.notebookOptions.getLayoutConfiguration();
		this._useConsolidatedOutputButton.set(layout.consolidatedOutputButton);
		this._cellToolbarLocation.set(this._editor.notebookOptions.computeCellToolbarLocation(this._editor.textModel?.viewType));
	}
}
