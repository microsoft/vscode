/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vs/base/common/lifecycle';
import { ITextModel } from 'vs/editor/common/model';
import { Emitter } from 'vs/base/common/event';
import * as UUID from 'vs/base/common/uuid';
import { MarkdownRenderer } from 'vs/workbench/contrib/notebook/browser/renderers/mdRenderer';
import { ICell, NotebookCellOutputsSplice, IOutput } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ITextModelService } from 'vs/editor/common/services/resolverService';
import { PrefixSumComputer } from 'vs/editor/common/viewModel/prefixSumComputer';

export class CellViewModel extends Disposable {

	private _mdRenderer: MarkdownRenderer | null = null;
	private _html: HTMLElement | null = null;
	private _dynamicHeight: number | null = null;
	protected readonly _onDidDispose = new Emitter<void>();
	readonly onDidDispose = this._onDidDispose.event;
	protected readonly _onDidChangeEditingState = new Emitter<void>();
	readonly onDidChangeEditingState = this._onDidChangeEditingState.event;
	protected readonly _onDidChangeOutputs = new Emitter<NotebookCellOutputsSplice[]>();
	readonly onDidChangeOutputs = this._onDidChangeOutputs.event;
	private _outputCollection: number[] = [];
	protected _outputsTop: PrefixSumComputer | null = null;


	get cellType() {
		return this.cell.cell_type;
	}
	get lineCount() {
		return this.cell.source.length;
	}
	get outputs() {
		return this.cell.outputs;
	}
	get isEditing(): boolean {
		return this._isEditing;
	}
	set isEditing(newState: boolean) {
		this._isEditing = newState;
		this._onDidChangeEditingState.fire();
	}

	set dynamicHeight(height: number | null) {
		this._dynamicHeight = height;
	}

	get dynamicHeight(): number | null {
		return this._dynamicHeight;
	}


	private _editorHeight = 0;
	set editorHeight(height: number) {
		this._editorHeight = height;
	}

	get editorHeight(): number {
		return this._editorHeight;
	}

	private _textModel?: ITextModel;
	readonly id: string = UUID.generateUuid();

	constructor(
		readonly viewType: string,
		readonly notebookHandle: number,
		readonly cell: ICell,
		private _isEditing: boolean,
		@IInstantiationService private readonly _instaService: IInstantiationService,
		@ITextModelService private readonly _modelService: ITextModelService,
	) {
		super();
		if (this.cell.onDidChangeOutputs) {
			this._register(this.cell.onDidChangeOutputs((splices) => {
				this._outputCollection = new Array(this.cell.outputs.length);
				this._outputsTop = null;
				this._onDidChangeOutputs.fire(splices);
			}));
		}

		this._outputCollection = new Array(this.cell.outputs.length);
	}
	hasDynamicHeight() {
		if (this._dynamicHeight !== null) {
			return false;
		}

		if (this.cellType === 'code') {
			// if (this.outputs && this.outputs.length > 0) {
			// 	// if it contains output, it will be marked as dynamic height
			// 	// thus when it's being rendered, the list view will `probeHeight`
			// 	// inside which, we will check domNode's height directly instead of doing another `renderElement` with height undefined.
			// 	return true;
			// }
			// else {
			// 	return false;
			// }

			// we don't want code cell to be dynamic, because when it's dynamic, there is always a chance that List View needs to run `renderElement(height: undefined)`
			// to check its actual size, however that's what we want to avoid as we might end up with rendering outputs twice (creating duplicated outputs in webview)
			// let's see how resizing and relayout works
			return false;
		}

		return true;
	}

	getHeight(lineHeight: number) {
		if (this._dynamicHeight) {
			return this._dynamicHeight;
		}
		if (this.cellType === 'markdown') {
			return 100;
		}
		else {
			return this.lineCount * lineHeight + 16;
		}
	}
	setText(strs: string[]) {
		this.cell.source = strs;
		this._html = null;
	}
	save() {
		if (this._textModel && (this.cell.isDirty || this.isEditing)) {
			let cnt = this._textModel.getLineCount();
			this.cell.source = this._textModel.getLinesContent().map((str, index) => str + (index !== cnt - 1 ? '\n' : ''));
		}
	}
	getText(): string {
		return this.cell.source.join('\n');
	}

	getHTML(): HTMLElement | null {
		if (this.cellType === 'markdown') {
			if (this._html) {
				return this._html;
			}
			let renderer = this.getMarkdownRenderer();
			this._html = renderer.render({ value: this.getText(), isTrusted: true }).element;
			return this._html;
		}
		return null;
	}

	async resolveTextModel(): Promise<ITextModel> {
		if (!this._textModel) {
			const ref = await this._modelService.createModelReference(this.cell.uri);
			this._textModel = ref.object.textEditorModel;
			this._register(ref);
			this._register(this._textModel.onDidChangeContent(() => {
				this.cell.isDirty = true;
			}));
		}
		return this._textModel;
	}

	getMarkdownRenderer() {
		if (!this._mdRenderer) {
			this._mdRenderer = this._instaService.createInstance(MarkdownRenderer);
		}
		return this._mdRenderer;
	}

	updateOutputHeight(index: number, height: number) {
		if (index >= this._outputCollection.length) {
			throw new Error('Output index out of range!');
		}

		this._outputCollection[index] = height;
		this._ensureOutputsTop();
		this._outputsTop!.changeValue(index, height);
	}

	getOutputOffset(index: number): number {
		if (index >= this._outputCollection.length) {
			throw new Error('Output index out of range!');
		}

		this._ensureOutputsTop();

		return this._outputsTop!.getAccumulatedValue(index - 1);
	}

	getOutputHeight(output: IOutput): number | undefined {
		let index = this.cell.outputs.indexOf(output);

		if (index < 0) {
			return undefined;
		}

		if (index < this._outputCollection.length) {
			return this._outputCollection[index];
		}

		return undefined;
	}

	getOutputTotalHeight(): number {
		this._ensureOutputsTop();

		return this._outputsTop!.getTotalValue();
	}

	spliceOutputHeights(start: number, deleteCnt: number, heights: number[]) {
		this._ensureOutputsTop();

		this._outputsTop!.removeValues(start, deleteCnt);
		if (heights.length) {
			const values = new Uint32Array(heights.length);
			for (let i = 0; i < heights.length; i++) {
				values[i] = heights[i];
			}

			this._outputsTop!.insertValues(start, values);
		}
	}

	protected _ensureOutputsTop(): void {
		if (!this._outputsTop) {
			const values = new Uint32Array(this._outputCollection.length);
			for (let i = 0; i < this._outputCollection.length; i++) {
				values[i] = this._outputCollection[i];
			}

			this._outputsTop = new PrefixSumComputer(values);
		}
	}
}
