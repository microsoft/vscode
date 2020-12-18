/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from 'vs/base/browser/dom';
import { Disposable, DisposableStore } from 'vs/base/common/lifecycle';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { DiffElementViewModelBase, SideBySideDiffElementViewModel } from 'vs/workbench/contrib/notebook/browser/diff/diffElementViewModel';
import { DiffSide, INotebookTextDiffEditor } from 'vs/workbench/contrib/notebook/browser/diff/notebookDiffEditorBrowser';
import { ICellOutputViewModel, IRenderOutput, outputHasDynamicHeight, RenderOutputType } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import { getResizesObserver } from 'vs/workbench/contrib/notebook/browser/view/renderers/cellWidgets';
import { NotebookTextModel } from 'vs/workbench/contrib/notebook/common/model/notebookTextModel';
import { BUILTIN_RENDERER_ID } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { INotebookService } from 'vs/workbench/contrib/notebook/common/notebookService';
import { ITextFileService } from 'vs/workbench/services/textfile/common/textfiles';
import { DiffNestedCellViewModel } from 'vs/workbench/contrib/notebook/browser/diff/diffNestedCellViewModel';

export class OutputElement extends Disposable {
	readonly resizeListener = new DisposableStore();
	domNode!: HTMLElement;
	renderResult?: IRenderOutput;

	constructor(
		private _notebookEditor: INotebookTextDiffEditor,
		private _notebookTextModel: NotebookTextModel,
		private _notebookService: INotebookService,
		private _diffElementViewModel: DiffElementViewModelBase,
		private _diffSide: DiffSide,
		private _nestedCell: DiffNestedCellViewModel,
		private _outputContainer: HTMLElement,
		readonly output: ICellOutputViewModel
	) {
		super();
	}

	render(index: number, beforeElement?: HTMLElement) {
		const outputItemDiv = document.createElement('div');
		let result: IRenderOutput | undefined = undefined;

		if (this.output.isDisplayOutput()) {
			const [mimeTypes, pick] = this.output.resolveMimeTypes(this._notebookTextModel);
			const pickedMimeTypeRenderer = mimeTypes[pick];
			const innerContainer = DOM.$('.output-inner-container');
			DOM.append(outputItemDiv, innerContainer);


			if (pickedMimeTypeRenderer.rendererId !== BUILTIN_RENDERER_ID) {
				const renderer = this._notebookService.getRendererInfo(pickedMimeTypeRenderer.rendererId);
				result = renderer
					? { type: RenderOutputType.Extension, renderer, source: this.output, mimeType: pickedMimeTypeRenderer.mimeType }
					: this._notebookEditor.getOutputRenderer().render(this.output, innerContainer, pickedMimeTypeRenderer.mimeType, this._notebookTextModel.uri,);
			} else {
				result = this._notebookEditor.getOutputRenderer().render(this.output, innerContainer, pickedMimeTypeRenderer.mimeType, this._notebookTextModel.uri);
			}

			this.output.pickedMimeType = pick;
		} else {
			// for text and error, there is no mimetype
			const innerContainer = DOM.$('.output-inner-container');
			DOM.append(outputItemDiv, innerContainer);

			result = this._notebookEditor.getOutputRenderer().render(this.output, innerContainer, undefined, this._notebookTextModel.uri);
		}

		this.domNode = outputItemDiv;
		this.renderResult = result;

		if (!result) {
			// this.viewCell.updateOutputHeight(index, 0);
			return;
		}

		if (beforeElement) {
			this._outputContainer.insertBefore(outputItemDiv, beforeElement);
		} else {
			this._outputContainer.appendChild(outputItemDiv);
		}

		if (result.type !== RenderOutputType.None) {
			// this.viewCell.selfSizeMonitoring = true;
			this._notebookEditor.createInset(
				this._diffElementViewModel,
				this._nestedCell,
				result,
				() => this.getOutputOffsetInCell(index),
				this._diffElementViewModel instanceof SideBySideDiffElementViewModel
					? this._diffSide
					: this._diffElementViewModel.type === 'insert' ? DiffSide.Modified : DiffSide.Original
			);
		} else {
			outputItemDiv.classList.add('foreground', 'output-element');
			outputItemDiv.style.position = 'absolute';
		}

		if (outputHasDynamicHeight(result)) {
			// this.viewCell.selfSizeMonitoring = true;
			const clientHeight = outputItemDiv.clientHeight;
			// TODO, set an inital dimension to avoid force reflow
			// const dimension = {
			// 	width: this.cellViewModel.,
			// 	height: clientHeight
			// };

			const elementSizeObserver = getResizesObserver(outputItemDiv, undefined, () => {
				if (this._outputContainer && document.body.contains(this._outputContainer)) {
					const height = Math.ceil(elementSizeObserver.getHeight());

					if (clientHeight === height) {
						return;
					}

					const currIndex = this.getCellOutputCurrentIndex();
					if (currIndex < 0) {
						return;
					}

					this.updateHeight(currIndex, height);
				}
			});
			elementSizeObserver.startObserving();
			this.resizeListener.add(elementSizeObserver);
			this.updateHeight(index, clientHeight);
		} else if (result.type === RenderOutputType.None) { // no-op if it's a webview
			const clientHeight = Math.ceil(outputItemDiv.clientHeight);
			this.updateHeight(index, clientHeight);

			const top = this.getOutputOffsetInContainer(index);
			outputItemDiv.style.top = `${top}px`;
		}
	}

	getCellOutputCurrentIndex() {
		return this._diffElementViewModel.getNestedCellViewModel(this._diffSide).outputs.indexOf(this.output.model);
	}

	updateHeight(index: number, height: number) {
		this._diffElementViewModel.updateOutputHeight(this._diffSide, index, height);
	}

	getOutputOffsetInContainer(index: number) {
		return this._diffElementViewModel.getOutputOffsetInContainer(this._diffSide, index);
	}

	getOutputOffsetInCell(index: number) {
		return this._diffElementViewModel.getOutputOffsetInCell(this._diffSide, index);
	}
}

export class OutputContainer extends Disposable {
	private _outputEntries = new Map<ICellOutputViewModel, OutputElement>();
	constructor(
		private _editor: INotebookTextDiffEditor,
		private _notebookTextModel: NotebookTextModel,
		private _diffElementViewModel: DiffElementViewModelBase,
		private _nestedCellViewModel: DiffNestedCellViewModel,
		private _diffSide: DiffSide,
		private _outputContainer: HTMLElement,
		@INotebookService private _notebookService: INotebookService,
		// @IQuickInputService private readonly quickInputService: IQuickInputService,
		@IOpenerService readonly _openerService: IOpenerService,
		@ITextFileService readonly _textFileService: ITextFileService,

	) {
		super();

		// TODO, onDidChangeOutputs

		// viewCell.onDidChangeLayout
		// say the height of the cell editor changes

		this._register(this._diffElementViewModel.onDidLayoutChange(() => {
			this._outputEntries.forEach((value, key) => {
				const index = _nestedCellViewModel.outputs.indexOf(key.model);
				if (index >= 0) {
					const top = this._diffElementViewModel.getOutputOffsetInContainer(this._diffSide, index);
					value.domNode.style.top = `${top}px`;
				}
			});
		}));
	}

	render() {
		// TODO, outputs to render (should have a limit)
		for (let index = 0; index < this._nestedCellViewModel.outputsViewModels.length; index++) {
			const currOutput = this._nestedCellViewModel.outputsViewModels[index];

			// always add to the end
			this._renderOutput(currOutput, index, undefined);
		}
	}

	showOutputs() {
		for (let index = 0; index < this._nestedCellViewModel.outputsViewModels.length; index++) {
			const currOutput = this._nestedCellViewModel.outputsViewModels[index];

			if (currOutput.isDisplayOutput()) {
				// always add to the end
				this._editor.showInset(this._diffElementViewModel, currOutput.cellViewModel, currOutput, this._diffSide);
			}
		}
	}

	hideOutputs() {
		this._outputEntries.forEach((outputElement, cellOutputViewModel) => {
			if (cellOutputViewModel.isDisplayOutput()) {
				this._editor.hideInset(this._diffElementViewModel, this._nestedCellViewModel, cellOutputViewModel);
			}
		});
	}

	private _renderOutput(currOutput: ICellOutputViewModel, index: number, beforeElement?: HTMLElement) {
		if (!this._outputEntries.has(currOutput)) {
			this._outputEntries.set(currOutput, new OutputElement(this._editor, this._notebookTextModel, this._notebookService, this._diffElementViewModel, this._diffSide, this._nestedCellViewModel, this._outputContainer, currOutput));
		}

		const renderElement = this._outputEntries.get(currOutput)!;
		renderElement.render(index, beforeElement);
	}
}
