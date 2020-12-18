/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { NotebookDiffEditorEventDispatcher } from 'vs/workbench/contrib/notebook/browser/viewModel/eventDispatcher';
import { Emitter } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import { CellDiffViewModelLayoutChangeEvent, DiffSide, DIFF_CELL_MARGIN } from 'vs/workbench/contrib/notebook/browser/diff/notebookDiffEditorBrowser';
import { IGenericCellViewModel, NotebookLayoutInfo } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import { DiffEditorWidget } from 'vs/editor/browser/widget/diffEditorWidget';
import { NotebookTextModel } from 'vs/workbench/contrib/notebook/common/model/notebookTextModel';
import { hash } from 'vs/base/common/hash';
import { format } from 'vs/base/common/jsonFormatter';
import { applyEdits } from 'vs/base/common/jsonEdit';
import { NotebookCellMetadata } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { DiffNestedCellViewModel } from 'vs/workbench/contrib/notebook/browser/diff/diffNestedCellViewModel';
import { URI } from 'vs/base/common/uri';

export enum PropertyFoldingState {
	Expanded,
	Collapsed
}

export abstract class DiffElementViewModelBase extends Disposable {
	public metadataFoldingState: PropertyFoldingState;
	public outputFoldingState: PropertyFoldingState;
	protected _layoutInfoEmitter = new Emitter<CellDiffViewModelLayoutChangeEvent>();
	onDidLayoutChange = this._layoutInfoEmitter.event;
	protected _stateChangeEmitter = new Emitter<{ renderOutput: boolean; }>();
	onDidStateChange = this._stateChangeEmitter.event;


	protected _layoutInfo!: {
		width: number;
		editorHeight: number;
		editorMargin: number;
		metadataStatusHeight: number;
		metadataHeight: number;
		outputStatusHeight: number;
		outputHeight: number;
		bodyMargin: number;
	};

	set outputHeight(height: number) {
		this._layoutInfo.outputHeight = height;
		this._fireLayoutChangeEvent({ outputEditor: true, outputView: true });
	}

	get outputHeight() {
		return this._layoutInfo.outputHeight;
	}

	set outputStatusHeight(height: number) {
		this._layoutInfo.outputStatusHeight = height;
		this._fireLayoutChangeEvent({});
	}

	get outputStatusHeight() {
		return this._layoutInfo.outputStatusHeight;
	}

	set editorHeight(height: number) {
		this._layoutInfo.editorHeight = height;
		this._fireLayoutChangeEvent({ editorHeight: true });
	}

	get editorHeight() {
		return this._layoutInfo.editorHeight;
	}

	set editorMargin(height: number) {
		this._layoutInfo.editorMargin = height;
		this._fireLayoutChangeEvent({});
	}

	get editorMargin() {
		return this._layoutInfo.editorMargin;
	}

	get metadataStatusHeight() {
		return this._layoutInfo.metadataStatusHeight;
	}

	set metadataHeight(height: number) {
		this._layoutInfo.metadataHeight = height;
		this._fireLayoutChangeEvent({ metadataEditor: true });
	}

	get metadataHeight() {
		return this._layoutInfo.metadataHeight;
	}

	private _renderOutput = true;

	set renderOutput(value: boolean) {
		this._renderOutput = value;
		this._stateChangeEmitter.fire({ renderOutput: this._renderOutput });
	}

	get renderOutput() {
		return this._renderOutput;
	}

	get totalHeight() {
		return this._layoutInfo.editorHeight
			+ this._layoutInfo.editorMargin
			+ this._layoutInfo.metadataHeight
			+ this._layoutInfo.metadataStatusHeight
			+ this._layoutInfo.outputHeight
			+ this._layoutInfo.outputStatusHeight
			+ this._layoutInfo.bodyMargin;
	}

	constructor(
		readonly documentTextModel: NotebookTextModel,
		readonly original: DiffNestedCellViewModel | undefined,
		readonly modified: DiffNestedCellViewModel | undefined,
		readonly type: 'unchanged' | 'insert' | 'delete' | 'modified',
		readonly editorEventDispatcher: NotebookDiffEditorEventDispatcher
	) {
		super();
		this._layoutInfo = {
			width: 0,
			editorHeight: 0,
			editorMargin: 0,
			metadataHeight: 0,
			metadataStatusHeight: 25,
			outputHeight: 0,
			outputStatusHeight: 25,
			bodyMargin: 32
		};


		this.metadataFoldingState = PropertyFoldingState.Collapsed;
		this.outputFoldingState = PropertyFoldingState.Collapsed;

		this._register(this.editorEventDispatcher.onDidChangeLayout(e => {
			this._layoutInfoEmitter.fire({ outerWidth: true });
		}));
	}
	private _fireLayoutChangeEvent(state: { outerWidth?: boolean, editorHeight?: boolean, metadataEditor?: boolean, outputEditor?: boolean, outputView?: boolean }) {
		this._layoutInfoEmitter.fire(state);
	}

	abstract checkIfOutputsModified(): boolean;
	abstract checkMetadataIfModified(): boolean;
	abstract layoutChange(): void;
	abstract getCellByUri(cellUri: URI): IGenericCellViewModel;
	abstract getOutputOffsetInCell(diffSide: DiffSide, index: number): number;
	abstract getOutputOffsetInContainer(diffSide: DiffSide, index: number): number;
	abstract updateOutputHeight(diffSide: DiffSide, index: number, height: number): void;
	abstract getNestedCellViewModel(diffSide: DiffSide): DiffNestedCellViewModel;

	getComputedCellContainerWidth(layoutInfo: NotebookLayoutInfo, diffEditor: boolean, fullWidth: boolean) {
		if (fullWidth) {
			return layoutInfo.width - 2 * DIFF_CELL_MARGIN + (diffEditor ? DiffEditorWidget.ENTIRE_DIFF_OVERVIEW_WIDTH : 0) - 2;
		}

		return (layoutInfo.width - 2 * DIFF_CELL_MARGIN + (diffEditor ? DiffEditorWidget.ENTIRE_DIFF_OVERVIEW_WIDTH : 0)) / 2 - 18 - 2;
	}
}

export class SideBySideDiffElementViewModel extends DiffElementViewModelBase {
	constructor(
		readonly documentTextModel: NotebookTextModel,
		readonly original: DiffNestedCellViewModel,
		readonly modified: DiffNestedCellViewModel,
		readonly type: 'unchanged' | 'modified',
		readonly editorEventDispatcher: NotebookDiffEditorEventDispatcher
	) {
		super(
			documentTextModel,
			original,
			modified,
			type,
			editorEventDispatcher);

		this.metadataFoldingState = PropertyFoldingState.Collapsed;
		this.outputFoldingState = PropertyFoldingState.Collapsed;

		if (this.checkMetadataIfModified()) {
			this.metadataFoldingState = PropertyFoldingState.Expanded;
		}

		if (this.checkIfOutputsModified()) {
			this.outputFoldingState = PropertyFoldingState.Expanded;
		}

		this._register(this.original.onDidChangeOutputLayout(() => {
			this.layoutChange();
		}));

		this._register(this.modified.onDidChangeOutputLayout(() => {
			this.layoutChange();
		}));
	}

	layoutChange() {
		let outputHeight = this.outputFoldingState === PropertyFoldingState.Collapsed ? 0 : this.getOutputTotalHeight();
		this._layoutInfo = {
			width: this._layoutInfo.width,
			editorHeight: this._layoutInfo.editorHeight,
			editorMargin: this._layoutInfo.editorMargin,
			metadataHeight: this._layoutInfo.metadataHeight,
			metadataStatusHeight: this._layoutInfo.metadataStatusHeight,
			outputHeight: outputHeight,
			outputStatusHeight: this._layoutInfo.outputStatusHeight,
			bodyMargin: this._layoutInfo.bodyMargin
		};

		this._layoutInfoEmitter.fire({});
	}

	checkIfOutputsModified() {
		return !this.documentTextModel.transientOptions.transientOutputs && hash(this.original?.outputs ?? []) !== hash(this.modified?.outputs ?? []);
	}

	checkMetadataIfModified(): boolean {
		return hash(getFormatedMetadataJSON(this.documentTextModel, this.original?.metadata || {}, this.original?.language)) !== hash(getFormatedMetadataJSON(this.documentTextModel, this.modified?.metadata ?? {}, this.modified?.language));
	}

	updateOutputHeight(diffSide: DiffSide, index: number, height: number) {
		if (diffSide === DiffSide.Original) {
			this.original.updateOutputHeight(index, height);
		} else {
			this.modified.updateOutputHeight(index, height);
		}
	}

	getOutputOffsetInContainer(diffSide: DiffSide, index: number) {
		if (diffSide === DiffSide.Original) {
			return this.original.getOutputOffset(index);
		} else {
			return this.modified.getOutputOffset(index);
		}
	}

	getOutputOffsetInCell(diffSide: DiffSide, index: number) {
		const offsetInOutputsContainer = this.getOutputOffsetInContainer(diffSide, index);

		return this._layoutInfo.editorHeight
			+ this._layoutInfo.editorMargin
			+ this._layoutInfo.metadataHeight
			+ this._layoutInfo.metadataStatusHeight
			+ this._layoutInfo.outputStatusHeight
			+ this._layoutInfo.bodyMargin / 2
			+ offsetInOutputsContainer;
	}

	getOutputTotalHeight() {
		if (this.renderOutput) {
			return Math.max(this.original.getOutputTotalHeight(), this.modified.getOutputTotalHeight());
		} else {
			return this._layoutInfo.outputHeight;
		}
	}

	getNestedCellViewModel(diffSide: DiffSide): DiffNestedCellViewModel {
		throw new Error('Method not implemented.');
	}

	getCellByUri(cellUri: URI): IGenericCellViewModel {
		if (cellUri.toString() === this.original.uri.toString()) {
			return this.original;
		} else {
			return this.modified;
		}
	}
}

export class SingleSideDiffElementViewModel extends DiffElementViewModelBase {
	get cellViewModel() {
		return this.type === 'insert' ? this.modified! : this.original!;
	}

	constructor(
		readonly documentTextModel: NotebookTextModel,
		readonly original: DiffNestedCellViewModel | undefined,
		readonly modified: DiffNestedCellViewModel | undefined,
		readonly type: 'insert' | 'delete',
		readonly editorEventDispatcher: NotebookDiffEditorEventDispatcher
	) {
		super(documentTextModel, original, modified, type, editorEventDispatcher);
		this._register(this.cellViewModel!.onDidChangeOutputLayout(() => {
			this.layoutChange();
		}));
	}

	getNestedCellViewModel(diffSide: DiffSide): DiffNestedCellViewModel {
		return this.type === 'insert' ? this.modified! : this.original!;
	}

	layoutChange() {
		let outputHeight = this.outputFoldingState === PropertyFoldingState.Collapsed ? 0 : this.getOutputTotalHeight();
		this._layoutInfo = {
			width: this._layoutInfo.width,
			editorHeight: this._layoutInfo.editorHeight,
			editorMargin: this._layoutInfo.editorMargin,
			metadataHeight: this._layoutInfo.metadataHeight,
			metadataStatusHeight: this._layoutInfo.metadataStatusHeight,
			outputHeight: outputHeight,
			outputStatusHeight: this._layoutInfo.outputStatusHeight,
			bodyMargin: this._layoutInfo.bodyMargin
		};

		this._layoutInfoEmitter.fire({});
	}


	checkIfOutputsModified(): boolean {
		return false;
	}

	checkMetadataIfModified(): boolean {
		return false;
	}

	updateOutputHeight(diffSide: DiffSide, index: number, height: number) {
		this.cellViewModel?.updateOutputHeight(index, height);
	}

	getOutputOffsetInContainer(diffSide: DiffSide, index: number) {
		return this.cellViewModel!.getOutputOffset(index);
	}

	getOutputOffsetInCell(diffSide: DiffSide, index: number) {
		const offsetInOutputsContainer = this.cellViewModel!.getOutputOffset(index);

		return this._layoutInfo.editorHeight
			+ this._layoutInfo.editorMargin
			+ this._layoutInfo.metadataHeight
			+ this._layoutInfo.metadataStatusHeight
			+ this._layoutInfo.outputStatusHeight
			+ this._layoutInfo.bodyMargin / 2
			+ offsetInOutputsContainer;
	}

	getOutputTotalHeight() {
		return this.cellViewModel?.getOutputTotalHeight() ?? 0;
	}

	getCellByUri(cellUri: URI): IGenericCellViewModel {
		return this.cellViewModel!;
	}
}

export function getFormatedMetadataJSON(documentTextModel: NotebookTextModel, metadata: NotebookCellMetadata, language?: string) {
	let filteredMetadata: { [key: string]: any } = {};

	if (documentTextModel) {
		const transientMetadata = documentTextModel.transientOptions.transientMetadata;

		const keys = new Set([...Object.keys(metadata)]);
		for (let key of keys) {
			if (!(transientMetadata[key as keyof NotebookCellMetadata])
			) {
				filteredMetadata[key] = metadata[key as keyof NotebookCellMetadata];
			}
		}
	} else {
		filteredMetadata = metadata;
	}

	const content = JSON.stringify({
		language,
		...filteredMetadata
	});

	const edits = format(content, undefined, {});
	const metadataSource = applyEdits(content, edits);

	return metadataSource;
}
