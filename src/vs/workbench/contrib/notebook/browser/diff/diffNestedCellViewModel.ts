/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import { generateUuid } from 'vs/base/common/uuid';
import { PrefixSumComputer } from 'vs/editor/common/model/prefixSumComputer';
import { IDiffNestedCellViewModel } from 'vs/workbench/contrib/notebook/browser/diff/notebookDiffEditorBrowser';
import { ICellOutputViewModel, IGenericCellViewModel } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import { CellViewModelStateChangeEvent } from 'vs/workbench/contrib/notebook/browser/notebookViewEvents';
import { CellOutputViewModel } from 'vs/workbench/contrib/notebook/browser/viewModel/cellOutputViewModel';
import { NotebookCellTextModel } from 'vs/workbench/contrib/notebook/common/model/notebookCellTextModel';
import { INotebookService } from 'vs/workbench/contrib/notebook/common/notebookService';

export class DiffNestedCellViewModel extends Disposable implements IDiffNestedCellViewModel, IGenericCellViewModel {
	private _id: string;
	get id() {
		return this._id;
	}

	get outputs() {
		return this.textModel.outputs;
	}

	get language() {
		return this.textModel.language;
	}

	get metadata() {
		return this.textModel.metadata;
	}

	get uri() {
		return this.textModel.uri;
	}

	get handle() {
		return this.textModel.handle;
	}

	protected readonly _onDidChangeState: Emitter<CellViewModelStateChangeEvent> = this._register(new Emitter<CellViewModelStateChangeEvent>());

	private _hoveringOutput: boolean = false;
	public get outputIsHovered(): boolean {
		return this._hoveringOutput;
	}

	public set outputIsHovered(v: boolean) {
		this._hoveringOutput = v;
		this._onDidChangeState.fire({ outputIsHoveredChanged: true });
	}

	private _focusOnOutput: boolean = false;
	public get outputIsFocused(): boolean {
		return this._focusOnOutput;
	}

	public set outputIsFocused(v: boolean) {
		this._focusOnOutput = v;
		this._onDidChangeState.fire({ outputIsFocusedChanged: true });
	}

	private _focusInputInOutput: boolean = false;
	public get inputInOutputIsFocused(): boolean {
		return this._focusInputInOutput;
	}

	public set inputInOutputIsFocused(v: boolean) {
		this._focusInputInOutput = v;
	}

	private _outputViewModels: ICellOutputViewModel[];

	get outputsViewModels() {
		return this._outputViewModels;
	}

	protected _outputCollection: number[] = [];
	protected _outputsTop: PrefixSumComputer | null = null;

	protected readonly _onDidChangeOutputLayout = this._register(new Emitter<void>());
	readonly onDidChangeOutputLayout = this._onDidChangeOutputLayout.event;

	constructor(
		readonly textModel: NotebookCellTextModel,
		@INotebookService private _notebookService: INotebookService
	) {
		super();
		this._id = generateUuid();

		this._outputViewModels = this.textModel.outputs.map(output => new CellOutputViewModel(this, output, this._notebookService));
		this._register(this.textModel.onDidChangeOutputs((splice) => {
			this._outputCollection.splice(splice.start, splice.deleteCount, ...splice.newOutputs.map(() => 0));
			const removed = this._outputViewModels.splice(splice.start, splice.deleteCount, ...splice.newOutputs.map(output => new CellOutputViewModel(this, output, this._notebookService)));
			removed.forEach(vm => vm.dispose());

			this._outputsTop = null;
			this._onDidChangeOutputLayout.fire();
		}));
		this._outputCollection = new Array(this.textModel.outputs.length);
	}

	private _ensureOutputsTop() {
		if (!this._outputsTop) {
			const values = new Uint32Array(this._outputCollection.length);
			for (let i = 0; i < this._outputCollection.length; i++) {
				values[i] = this._outputCollection[i];
			}

			this._outputsTop = new PrefixSumComputer(values);
		}
	}

	getOutputOffset(index: number): number {
		this._ensureOutputsTop();

		if (index >= this._outputCollection.length) {
			throw new Error('Output index out of range!');
		}

		return this._outputsTop!.getPrefixSum(index - 1);
	}

	updateOutputHeight(index: number, height: number): void {
		if (index >= this._outputCollection.length) {
			throw new Error('Output index out of range!');
		}

		this._ensureOutputsTop();
		this._outputCollection[index] = height;
		if (this._outputsTop!.setValue(index, height)) {
			this._onDidChangeOutputLayout.fire();
		}
	}

	getOutputTotalHeight() {
		this._ensureOutputsTop();

		return this._outputsTop?.getTotalSum() ?? 0;
	}

	public override dispose(): void {
		super.dispose();

		this._outputViewModels.forEach(output => {
			output.dispose();
		});
	}
}
