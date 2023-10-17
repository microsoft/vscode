/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from 'vs/base/common/event';
import { hash } from 'vs/base/common/hash';
import { toFormattedString } from 'vs/base/common/jsonFormatter';
import { Disposable } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { DiffEditorWidget } from 'vs/editor/browser/widget/diffEditor/diffEditorWidget';
import { FontInfo } from 'vs/editor/common/config/fontInfo';
import * as editorCommon from 'vs/editor/common/editorCommon';
import { fixedEditorPadding } from 'vs/workbench/contrib/notebook/browser/diff/diffCellEditorOptions';
import { DiffNestedCellViewModel } from 'vs/workbench/contrib/notebook/browser/diff/diffNestedCellViewModel';
import { NotebookDiffEditorEventDispatcher, NotebookDiffViewEventType } from 'vs/workbench/contrib/notebook/browser/diff/eventDispatcher';
import { CellDiffViewModelLayoutChangeEvent, DIFF_CELL_MARGIN, DiffSide, IDiffElementLayoutInfo } from 'vs/workbench/contrib/notebook/browser/diff/notebookDiffEditorBrowser';
import { CellLayoutState, IGenericCellViewModel } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import { NotebookLayoutInfo } from 'vs/workbench/contrib/notebook/browser/notebookViewEvents';
import { NotebookTextModel } from 'vs/workbench/contrib/notebook/common/model/notebookTextModel';
import { ICellOutput, INotebookTextModel, IOutputDto, IOutputItemDto, NotebookCellMetadata } from 'vs/workbench/contrib/notebook/common/notebookCommon';

export enum PropertyFoldingState {
	Expanded,
	Collapsed
}

export const OUTPUT_EDITOR_HEIGHT_MAGIC = 1440;

type ILayoutInfoDelta0 = { [K in keyof IDiffElementLayoutInfo]?: number; };
interface ILayoutInfoDelta extends ILayoutInfoDelta0 {
	rawOutputHeight?: number;
	recomputeOutput?: boolean;
}

export abstract class DiffElementViewModelBase extends Disposable {
	public metadataFoldingState: PropertyFoldingState;
	public outputFoldingState: PropertyFoldingState;
	protected _layoutInfoEmitter = this._register(new Emitter<CellDiffViewModelLayoutChangeEvent>());
	onDidLayoutChange = this._layoutInfoEmitter.event;
	protected _stateChangeEmitter = this._register(new Emitter<{ renderOutput: boolean }>());
	onDidStateChange = this._stateChangeEmitter.event;
	protected _layoutInfo!: IDiffElementLayoutInfo;

	set rawOutputHeight(height: number) {
		this._layout({ rawOutputHeight: Math.min(OUTPUT_EDITOR_HEIGHT_MAGIC, height) });
	}

	get rawOutputHeight() {
		throw new Error('Use Cell.layoutInfo.rawOutputHeight');
	}

	set outputStatusHeight(height: number) {
		this._layout({ outputStatusHeight: height });
	}

	get outputStatusHeight() {
		throw new Error('Use Cell.layoutInfo.outputStatusHeight');
	}

	set outputMetadataHeight(height: number) {
		this._layout({ outputMetadataHeight: height });
	}

	get outputMetadataHeight() {
		throw new Error('Use Cell.layoutInfo.outputStatusHeight');
	}

	set editorHeight(height: number) {
		this._layout({ editorHeight: height });
	}

	get editorHeight() {
		throw new Error('Use Cell.layoutInfo.editorHeight');
	}

	set editorMargin(margin: number) {
		this._layout({ editorMargin: margin });
	}

	get editorMargin() {
		throw new Error('Use Cell.layoutInfo.editorMargin');
	}

	set metadataStatusHeight(height: number) {
		this._layout({ metadataStatusHeight: height });
	}

	get metadataStatusHeight() {
		throw new Error('Use Cell.layoutInfo.outputStatusHeight');
	}

	set metadataHeight(height: number) {
		this._layout({ metadataHeight: height });
	}

	get metadataHeight() {
		throw new Error('Use Cell.layoutInfo.metadataHeight');
	}

	private _renderOutput = true;

	set renderOutput(value: boolean) {
		this._renderOutput = value;
		this._layout({ recomputeOutput: true });
		this._stateChangeEmitter.fire({ renderOutput: this._renderOutput });
	}

	get renderOutput() {
		return this._renderOutput;
	}

	get layoutInfo(): IDiffElementLayoutInfo {
		return this._layoutInfo;
	}

	private _sourceEditorViewState: editorCommon.ICodeEditorViewState | editorCommon.IDiffEditorViewState | null = null;
	private _outputEditorViewState: editorCommon.ICodeEditorViewState | editorCommon.IDiffEditorViewState | null = null;
	private _metadataEditorViewState: editorCommon.ICodeEditorViewState | editorCommon.IDiffEditorViewState | null = null;

	constructor(
		readonly mainDocumentTextModel: INotebookTextModel,
		readonly original: DiffNestedCellViewModel | undefined,
		readonly modified: DiffNestedCellViewModel | undefined,
		readonly type: 'unchanged' | 'insert' | 'delete' | 'modified',
		readonly editorEventDispatcher: NotebookDiffEditorEventDispatcher,
		readonly initData: {
			metadataStatusHeight: number;
			outputStatusHeight: number;
			fontInfo: FontInfo | undefined;
		}
	) {
		super();
		const editorHeight = this._estimateEditorHeight(initData.fontInfo);
		this._layoutInfo = {
			width: 0,
			editorHeight: editorHeight,
			editorMargin: 0,
			metadataHeight: 0,
			metadataStatusHeight: 25,
			rawOutputHeight: 0,
			outputTotalHeight: 0,
			outputStatusHeight: 25,
			outputMetadataHeight: 0,
			bodyMargin: 32,
			totalHeight: 82 + editorHeight,
			layoutState: CellLayoutState.Uninitialized
		};

		this.metadataFoldingState = PropertyFoldingState.Collapsed;
		this.outputFoldingState = PropertyFoldingState.Collapsed;

		this._register(this.editorEventDispatcher.onDidChangeLayout(e => {
			this._layoutInfoEmitter.fire({ outerWidth: true });
		}));
	}

	layoutChange() {
		this._layout({ recomputeOutput: true });
	}

	private _estimateEditorHeight(fontInfo: FontInfo | undefined) {
		const lineHeight = fontInfo?.lineHeight ?? 17;

		switch (this.type) {
			case 'unchanged':
			case 'insert':
				{
					const lineCount = this.modified!.textModel.textBuffer.getLineCount();
					const editorHeight = lineCount * lineHeight + fixedEditorPadding.top + fixedEditorPadding.bottom;
					return editorHeight;
				}
			case 'delete':
			case 'modified':
				{
					const lineCount = this.original!.textModel.textBuffer.getLineCount();
					const editorHeight = lineCount * lineHeight + fixedEditorPadding.top + fixedEditorPadding.bottom;
					return editorHeight;
				}
		}
	}

	protected _layout(delta: ILayoutInfoDelta) {
		const width = delta.width !== undefined ? delta.width : this._layoutInfo.width;
		const editorHeight = delta.editorHeight !== undefined ? delta.editorHeight : this._layoutInfo.editorHeight;
		const editorMargin = delta.editorMargin !== undefined ? delta.editorMargin : this._layoutInfo.editorMargin;
		const metadataHeight = delta.metadataHeight !== undefined ? delta.metadataHeight : this._layoutInfo.metadataHeight;
		const metadataStatusHeight = delta.metadataStatusHeight !== undefined ? delta.metadataStatusHeight : this._layoutInfo.metadataStatusHeight;
		const rawOutputHeight = delta.rawOutputHeight !== undefined ? delta.rawOutputHeight : this._layoutInfo.rawOutputHeight;
		const outputStatusHeight = delta.outputStatusHeight !== undefined ? delta.outputStatusHeight : this._layoutInfo.outputStatusHeight;
		const bodyMargin = delta.bodyMargin !== undefined ? delta.bodyMargin : this._layoutInfo.bodyMargin;
		const outputMetadataHeight = delta.outputMetadataHeight !== undefined ? delta.outputMetadataHeight : this._layoutInfo.outputMetadataHeight;
		const outputHeight = (delta.recomputeOutput || delta.rawOutputHeight !== undefined || delta.outputMetadataHeight !== undefined) ? this._getOutputTotalHeight(rawOutputHeight, outputMetadataHeight) : this._layoutInfo.outputTotalHeight;

		const totalHeight = editorHeight
			+ editorMargin
			+ metadataHeight
			+ metadataStatusHeight
			+ outputHeight
			+ outputStatusHeight
			+ bodyMargin;

		const newLayout: IDiffElementLayoutInfo = {
			width: width,
			editorHeight: editorHeight,
			editorMargin: editorMargin,
			metadataHeight: metadataHeight,
			metadataStatusHeight: metadataStatusHeight,
			outputTotalHeight: outputHeight,
			outputStatusHeight: outputStatusHeight,
			bodyMargin: bodyMargin,
			rawOutputHeight: rawOutputHeight,
			outputMetadataHeight: outputMetadataHeight,
			totalHeight: totalHeight,
			layoutState: CellLayoutState.Measured
		};

		let somethingChanged = false;

		const changeEvent: CellDiffViewModelLayoutChangeEvent = {};

		if (newLayout.width !== this._layoutInfo.width) {
			changeEvent.width = true;
			somethingChanged = true;
		}

		if (newLayout.editorHeight !== this._layoutInfo.editorHeight) {
			changeEvent.editorHeight = true;
			somethingChanged = true;
		}

		if (newLayout.editorMargin !== this._layoutInfo.editorMargin) {
			changeEvent.editorMargin = true;
			somethingChanged = true;
		}

		if (newLayout.metadataHeight !== this._layoutInfo.metadataHeight) {
			changeEvent.metadataHeight = true;
			somethingChanged = true;
		}

		if (newLayout.metadataStatusHeight !== this._layoutInfo.metadataStatusHeight) {
			changeEvent.metadataStatusHeight = true;
			somethingChanged = true;
		}

		if (newLayout.outputTotalHeight !== this._layoutInfo.outputTotalHeight) {
			changeEvent.outputTotalHeight = true;
			somethingChanged = true;
		}

		if (newLayout.outputStatusHeight !== this._layoutInfo.outputStatusHeight) {
			changeEvent.outputStatusHeight = true;
			somethingChanged = true;
		}

		if (newLayout.bodyMargin !== this._layoutInfo.bodyMargin) {
			changeEvent.bodyMargin = true;
			somethingChanged = true;
		}

		if (newLayout.outputMetadataHeight !== this._layoutInfo.outputMetadataHeight) {
			changeEvent.outputMetadataHeight = true;
			somethingChanged = true;
		}

		if (newLayout.totalHeight !== this._layoutInfo.totalHeight) {
			changeEvent.totalHeight = true;
			somethingChanged = true;
		}

		if (somethingChanged) {
			this._layoutInfo = newLayout;
			this._fireLayoutChangeEvent(changeEvent);
		}
	}

	getHeight(lineHeight: number) {
		if (this._layoutInfo.layoutState === CellLayoutState.Uninitialized) {
			const editorHeight = this.estimateEditorHeight(lineHeight);
			return this._computeTotalHeight(editorHeight);
		} else {
			return this._layoutInfo.totalHeight;
		}
	}

	private _computeTotalHeight(editorHeight: number) {
		const totalHeight = editorHeight
			+ this._layoutInfo.editorMargin
			+ this._layoutInfo.metadataHeight
			+ this._layoutInfo.metadataStatusHeight
			+ this._layoutInfo.outputTotalHeight
			+ this._layoutInfo.outputStatusHeight
			+ this._layoutInfo.outputMetadataHeight
			+ this._layoutInfo.bodyMargin;

		return totalHeight;
	}

	private estimateEditorHeight(lineHeight: number | undefined = 20): number {
		const hasScrolling = false;
		const verticalScrollbarHeight = hasScrolling ? 12 : 0; // take zoom level into account
		// const editorPadding = this.viewContext.notebookOptions.computeEditorPadding(this.internalMetadata);
		const lineCount = Math.max(this.original?.textModel.textBuffer.getLineCount() ?? 1, this.modified?.textModel.textBuffer.getLineCount() ?? 1);
		return lineCount * lineHeight
			+ 24 // Top padding
			+ 12 // Bottom padding
			+ verticalScrollbarHeight;
	}

	private _getOutputTotalHeight(rawOutputHeight: number, metadataHeight: number) {
		if (this.outputFoldingState === PropertyFoldingState.Collapsed) {
			return 0;
		}

		if (this.renderOutput) {
			if (this.isOutputEmpty()) {
				// single line;
				return 24;
			}
			return this.getRichOutputTotalHeight() + metadataHeight;
		} else {
			return rawOutputHeight;
		}
	}

	private _fireLayoutChangeEvent(state: CellDiffViewModelLayoutChangeEvent) {
		this._layoutInfoEmitter.fire(state);
		this.editorEventDispatcher.emit([{ type: NotebookDiffViewEventType.CellLayoutChanged, source: this._layoutInfo }]);
	}

	abstract checkIfOutputsModified(): false | { reason: string | undefined };
	abstract checkMetadataIfModified(): false | { reason: string | undefined };
	abstract isOutputEmpty(): boolean;
	abstract getRichOutputTotalHeight(): number;
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

	getOutputEditorViewState(): editorCommon.ICodeEditorViewState | editorCommon.IDiffEditorViewState | null {
		return this._outputEditorViewState;
	}

	saveOutputEditorViewState(viewState: editorCommon.ICodeEditorViewState | editorCommon.IDiffEditorViewState | null) {
		this._outputEditorViewState = viewState;
	}

	getMetadataEditorViewState(): editorCommon.ICodeEditorViewState | editorCommon.IDiffEditorViewState | null {
		return this._metadataEditorViewState;
	}

	saveMetadataEditorViewState(viewState: editorCommon.ICodeEditorViewState | editorCommon.IDiffEditorViewState | null) {
		this._metadataEditorViewState = viewState;
	}

	getSourceEditorViewState(): editorCommon.ICodeEditorViewState | editorCommon.IDiffEditorViewState | null {
		return this._sourceEditorViewState;
	}

	saveSpirceEditorViewState(viewState: editorCommon.ICodeEditorViewState | editorCommon.IDiffEditorViewState | null) {
		this._sourceEditorViewState = viewState;
	}
}

export class SideBySideDiffElementViewModel extends DiffElementViewModelBase {
	get originalDocument() {
		return this.otherDocumentTextModel;
	}

	get modifiedDocument() {
		return this.mainDocumentTextModel;
	}

	override readonly original: DiffNestedCellViewModel;
	override readonly modified: DiffNestedCellViewModel;
	override readonly type: 'unchanged' | 'modified';

	constructor(
		mainDocumentTextModel: NotebookTextModel,
		readonly otherDocumentTextModel: NotebookTextModel,
		original: DiffNestedCellViewModel,
		modified: DiffNestedCellViewModel,
		type: 'unchanged' | 'modified',
		editorEventDispatcher: NotebookDiffEditorEventDispatcher,
		initData: {
			metadataStatusHeight: number;
			outputStatusHeight: number;
			fontInfo: FontInfo | undefined;
		}
	) {
		super(
			mainDocumentTextModel,
			original,
			modified,
			type,
			editorEventDispatcher,
			initData);

		this.original = original;
		this.modified = modified;
		this.type = type;

		this.metadataFoldingState = PropertyFoldingState.Collapsed;
		this.outputFoldingState = PropertyFoldingState.Collapsed;

		if (this.checkMetadataIfModified()) {
			this.metadataFoldingState = PropertyFoldingState.Expanded;
		}

		if (this.checkIfOutputsModified()) {
			this.outputFoldingState = PropertyFoldingState.Expanded;
		}

		this._register(this.original.onDidChangeOutputLayout(() => {
			this._layout({ recomputeOutput: true });
		}));

		this._register(this.modified.onDidChangeOutputLayout(() => {
			this._layout({ recomputeOutput: true });
		}));

		this._register(this.modified.textModel.onDidChangeContent(() => {
			if (mainDocumentTextModel.transientOptions.cellContentMetadata) {
				const cellMetadataKeys = [...Object.keys(mainDocumentTextModel.transientOptions.cellContentMetadata)];
				const modifiedMedataRaw = Object.assign({}, this.modified.metadata);
				const originalCellMetadata = this.original.metadata;
				for (const key of cellMetadataKeys) {
					modifiedMedataRaw[key] = originalCellMetadata[key];
				}

				this.modified.textModel.metadata = modifiedMedataRaw;
			}
		}));
	}

	checkIfOutputsModified() {
		if (this.mainDocumentTextModel.transientOptions.transientOutputs) {
			return false;
		}

		const ret = outputsEqual(this.original?.outputs ?? [], this.modified?.outputs ?? []);

		if (ret === OutputComparison.Unchanged) {
			return false;
		}

		return {
			reason: ret === OutputComparison.Metadata ? 'Output metadata is changed' : undefined,
			kind: ret
		};
	}

	checkMetadataIfModified() {
		const modified = hash(getFormattedMetadataJSON(this.mainDocumentTextModel, this.original?.metadata || {}, this.original?.language)) !== hash(getFormattedMetadataJSON(this.mainDocumentTextModel, this.modified?.metadata ?? {}, this.modified?.language));
		if (modified) {
			return { reason: undefined };
		} else {
			return false;
		}
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

	isOutputEmpty() {
		if (this.mainDocumentTextModel.transientOptions.transientOutputs) {
			return true;
		}

		if (this.checkIfOutputsModified()) {
			return false;
		}

		// outputs are not changed

		return (this.original?.outputs || []).length === 0;
	}

	getRichOutputTotalHeight() {
		return Math.max(this.original.getOutputTotalHeight(), this.modified.getOutputTotalHeight());
	}

	getNestedCellViewModel(diffSide: DiffSide): DiffNestedCellViewModel {
		return diffSide === DiffSide.Original ? this.original : this.modified;
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

	get originalDocument() {
		if (this.type === 'insert') {
			return this.otherDocumentTextModel;
		} else {
			return this.mainDocumentTextModel;
		}
	}

	get modifiedDocument() {
		if (this.type === 'insert') {
			return this.mainDocumentTextModel;
		} else {
			return this.otherDocumentTextModel;
		}
	}

	override readonly type: 'insert' | 'delete';

	constructor(
		mainDocumentTextModel: NotebookTextModel,
		readonly otherDocumentTextModel: NotebookTextModel,
		original: DiffNestedCellViewModel | undefined,
		modified: DiffNestedCellViewModel | undefined,
		type: 'insert' | 'delete',
		editorEventDispatcher: NotebookDiffEditorEventDispatcher,
		initData: {
			metadataStatusHeight: number;
			outputStatusHeight: number;
			fontInfo: FontInfo | undefined;
		}
	) {
		super(mainDocumentTextModel, original, modified, type, editorEventDispatcher, initData);
		this.type = type;

		this._register(this.cellViewModel!.onDidChangeOutputLayout(() => {
			this._layout({ recomputeOutput: true });
		}));
	}

	getNestedCellViewModel(diffSide: DiffSide): DiffNestedCellViewModel {
		return this.type === 'insert' ? this.modified! : this.original!;
	}


	checkIfOutputsModified(): false | { reason: string | undefined } {
		return false;
	}

	checkMetadataIfModified(): false | { reason: string | undefined } {
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

	isOutputEmpty() {
		if (this.mainDocumentTextModel.transientOptions.transientOutputs) {
			return true;
		}

		// outputs are not changed

		return (this.original?.outputs || this.modified?.outputs || []).length === 0;
	}

	getRichOutputTotalHeight() {
		return this.cellViewModel?.getOutputTotalHeight() ?? 0;
	}

	getCellByUri(cellUri: URI): IGenericCellViewModel {
		return this.cellViewModel!;
	}
}

export const enum OutputComparison {
	Unchanged = 0,
	Metadata = 1,
	Other = 2
}

export function outputEqual(a: ICellOutput, b: ICellOutput): OutputComparison {
	if (hash(a.metadata) === hash(b.metadata)) {
		return OutputComparison.Other;
	}

	// metadata not equal
	for (let j = 0; j < a.outputs.length; j++) {
		const aOutputItem = a.outputs[j];
		const bOutputItem = b.outputs[j];

		if (aOutputItem.mime !== bOutputItem.mime) {
			return OutputComparison.Other;
		}

		if (aOutputItem.data.buffer.length !== bOutputItem.data.buffer.length) {
			return OutputComparison.Other;
		}

		for (let k = 0; k < aOutputItem.data.buffer.length; k++) {
			if (aOutputItem.data.buffer[k] !== bOutputItem.data.buffer[k]) {
				return OutputComparison.Other;
			}
		}
	}

	return OutputComparison.Metadata;
}

function outputsEqual(original: ICellOutput[], modified: ICellOutput[]) {
	if (original.length !== modified.length) {
		return OutputComparison.Other;
	}

	const len = original.length;
	for (let i = 0; i < len; i++) {
		const a = original[i];
		const b = modified[i];

		if (hash(a.metadata) !== hash(b.metadata)) {
			return OutputComparison.Metadata;
		}

		if (a.outputs.length !== b.outputs.length) {
			return OutputComparison.Other;
		}

		for (let j = 0; j < a.outputs.length; j++) {
			const aOutputItem = a.outputs[j];
			const bOutputItem = b.outputs[j];

			if (aOutputItem.mime !== bOutputItem.mime) {
				return OutputComparison.Other;
			}

			if (aOutputItem.data.buffer.length !== bOutputItem.data.buffer.length) {
				return OutputComparison.Other;
			}

			for (let k = 0; k < aOutputItem.data.buffer.length; k++) {
				if (aOutputItem.data.buffer[k] !== bOutputItem.data.buffer[k]) {
					return OutputComparison.Other;
				}
			}
		}
	}

	return OutputComparison.Unchanged;
}

export function getFormattedMetadataJSON(documentTextModel: INotebookTextModel, metadata: NotebookCellMetadata, language?: string) {
	let filteredMetadata: { [key: string]: any } = {};

	if (documentTextModel) {
		const transientCellMetadata = documentTextModel.transientOptions.transientCellMetadata;

		const keys = new Set([...Object.keys(metadata)]);
		for (const key of keys) {
			if (!(transientCellMetadata[key as keyof NotebookCellMetadata])
			) {
				filteredMetadata[key] = metadata[key as keyof NotebookCellMetadata];
			}
		}
	} else {
		filteredMetadata = metadata;
	}

	const obj = {
		language,
		...filteredMetadata
	};

	const metadataSource = toFormattedString(obj, {});

	return metadataSource;
}

export function getStreamOutputData(outputs: IOutputItemDto[]) {
	if (!outputs.length) {
		return null;
	}

	const first = outputs[0];
	const mime = first.mime;
	const sameStream = !outputs.find(op => op.mime !== mime);

	if (sameStream) {
		return outputs.map(opit => opit.data.toString()).join('');
	} else {
		return null;
	}
}

export function getFormattedOutputJSON(outputs: IOutputDto[]) {
	if (outputs.length === 1) {
		const streamOutputData = getStreamOutputData(outputs[0].outputs);
		if (streamOutputData) {
			return streamOutputData;
		}
	}

	return JSON.stringify(outputs.map(output => {
		return ({
			metadata: output.metadata,
			outputItems: output.outputs.map(opit => ({
				mimeType: opit.mime,
				data: opit.data.toString()
			}))
		});
	}), undefined, '\t');
}
