/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from '../../../../../base/browser/dom.js';
import * as nls from '../../../../../nls.js';
import { Disposable, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { DiffElementCellViewModelBase, SideBySideDiffElementViewModel } from './diffElementViewModel.js';
import { DiffSide, INotebookTextDiffEditor } from './notebookDiffEditorBrowser.js';
import { ICellOutputViewModel, IInsetRenderOutput, RenderOutputType } from '../notebookBrowser.js';
import { NotebookTextModel } from '../../common/model/notebookTextModel.js';
import { NotebookCellOutputsSplice } from '../../common/notebookCommon.js';
import { INotebookService } from '../../common/notebookService.js';
import { DiffNestedCellViewModel } from './diffNestedCellViewModel.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { mimetypeIcon } from '../notebookIcons.js';
import { StandardKeyboardEvent } from '../../../../../base/browser/keyboardEvent.js';
import { KeyCode } from '../../../../../base/common/keyCodes.js';
import { IQuickInputService, IQuickPickItem } from '../../../../../platform/quickinput/common/quickInput.js';

interface IMimeTypeRenderer extends IQuickPickItem {
	index: number;
}

export class OutputElement extends Disposable {
	readonly resizeListener = this._register(new DisposableStore());
	domNode!: HTMLElement;
	renderResult?: IInsetRenderOutput;

	constructor(
		private _notebookEditor: INotebookTextDiffEditor,
		private _notebookTextModel: NotebookTextModel,
		private _notebookService: INotebookService,
		private _quickInputService: IQuickInputService,
		private _diffElementViewModel: DiffElementCellViewModelBase,
		private _diffSide: DiffSide,
		private _nestedCell: DiffNestedCellViewModel,
		private _outputContainer: HTMLElement,
		readonly output: ICellOutputViewModel
	) {
		super();
	}

	render(index: number, beforeElement?: HTMLElement) {
		const outputItemDiv = document.createElement('div');
		let result: IInsetRenderOutput | undefined = undefined;

		const [mimeTypes, pick] = this.output.resolveMimeTypes(this._notebookTextModel, undefined);
		const pickedMimeTypeRenderer = this.output.pickedMimeType || mimeTypes[pick];
		if (mimeTypes.length > 1) {
			outputItemDiv.style.position = 'relative';
			const mimeTypePicker = DOM.$('.multi-mimetype-output');
			mimeTypePicker.classList.add(...ThemeIcon.asClassNameArray(mimetypeIcon));
			mimeTypePicker.tabIndex = 0;
			mimeTypePicker.title = nls.localize('mimeTypePicker', "Choose a different output mimetype, available mimetypes: {0}", mimeTypes.map(mimeType => mimeType.mimeType).join(', '));
			outputItemDiv.appendChild(mimeTypePicker);
			this.resizeListener.add(DOM.addStandardDisposableListener(mimeTypePicker, 'mousedown', async e => {
				if (e.leftButton) {
					e.preventDefault();
					e.stopPropagation();
					await this.pickActiveMimeTypeRenderer(this._notebookTextModel, this.output);
				}
			}));

			this.resizeListener.add((DOM.addDisposableListener(mimeTypePicker, DOM.EventType.KEY_DOWN, async e => {
				const event = new StandardKeyboardEvent(e);
				if ((event.equals(KeyCode.Enter) || event.equals(KeyCode.Space))) {
					e.preventDefault();
					e.stopPropagation();
					await this.pickActiveMimeTypeRenderer(this._notebookTextModel, this.output);
				}
			})));
		}

		const innerContainer = DOM.$('.output-inner-container');
		DOM.append(outputItemDiv, innerContainer);


		if (mimeTypes.length !== 0) {
			const renderer = this._notebookService.getRendererInfo(pickedMimeTypeRenderer.rendererId);
			result = renderer
				? { type: RenderOutputType.Extension, renderer, source: this.output, mimeType: pickedMimeTypeRenderer.mimeType }
				: this._renderMissingRenderer(this.output, pickedMimeTypeRenderer.mimeType);

			this.output.pickedMimeType = pickedMimeTypeRenderer;
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

		this._notebookEditor.createOutput(
			this._diffElementViewModel,
			this._nestedCell,
			result,
			() => this.getOutputOffsetInCell(index),
			this._diffElementViewModel instanceof SideBySideDiffElementViewModel
				? this._diffSide
				: this._diffElementViewModel.type === 'insert' ? DiffSide.Modified : DiffSide.Original
		);
	}

	private _renderMissingRenderer(viewModel: ICellOutputViewModel, preferredMimeType: string | undefined): IInsetRenderOutput {
		if (!viewModel.model.outputs.length) {
			return this._renderMessage(viewModel, nls.localize('empty', "Cell has no output"));
		}

		if (!preferredMimeType) {
			const mimeTypes = viewModel.model.outputs.map(op => op.mime);
			const mimeTypesMessage = mimeTypes.join(', ');
			return this._renderMessage(viewModel, nls.localize('noRenderer.2', "No renderer could be found for output. It has the following mimetypes: {0}", mimeTypesMessage));
		}

		return this._renderSearchForMimetype(viewModel, preferredMimeType);
	}

	private _renderSearchForMimetype(viewModel: ICellOutputViewModel, mimeType: string): IInsetRenderOutput {
		const query = `@tag:notebookRenderer ${mimeType}`;

		const p = DOM.$('p', undefined, `No renderer could be found for mimetype "${mimeType}", but one might be available on the Marketplace.`);
		const a = DOM.$('a', { href: `command:workbench.extensions.search?%22${query}%22`, class: 'monaco-button monaco-text-button', tabindex: 0, role: 'button', style: 'padding: 8px; text-decoration: none; color: rgb(255, 255, 255); background-color: rgb(14, 99, 156); max-width: 200px;' }, `Search Marketplace`);

		return {
			type: RenderOutputType.Html,
			source: viewModel,
			htmlContent: p.outerHTML + a.outerHTML,
		};
	}

	private _renderMessage(viewModel: ICellOutputViewModel, message: string): IInsetRenderOutput {
		const el = DOM.$('p', undefined, message);
		return { type: RenderOutputType.Html, source: viewModel, htmlContent: el.outerHTML };
	}

	private async pickActiveMimeTypeRenderer(notebookTextModel: NotebookTextModel, viewModel: ICellOutputViewModel) {
		const [mimeTypes, currIndex] = viewModel.resolveMimeTypes(notebookTextModel, undefined);

		const items = mimeTypes.filter(mimeType => mimeType.isTrusted).map((mimeType, index): IMimeTypeRenderer => ({
			label: mimeType.mimeType,
			id: mimeType.mimeType,
			index: index,
			picked: index === currIndex,
			detail: this.generateRendererInfo(mimeType.rendererId),
			description: index === currIndex ? nls.localize('curruentActiveMimeType', "Currently Active") : undefined
		}));

		const disposables = new DisposableStore();
		const picker = disposables.add(this._quickInputService.createQuickPick());
		picker.items = items;
		picker.activeItems = items.filter(item => !!item.picked);
		picker.placeholder = items.length !== mimeTypes.length
			? nls.localize('promptChooseMimeTypeInSecure.placeHolder', "Select mimetype to render for current output. Rich mimetypes are available only when the notebook is trusted")
			: nls.localize('promptChooseMimeType.placeHolder', "Select mimetype to render for current output");

		const pick = await new Promise<number | undefined>(resolve => {
			disposables.add(picker.onDidAccept(() => {
				resolve(picker.selectedItems.length === 1 ? (picker.selectedItems[0] as IMimeTypeRenderer).index : undefined);
				disposables.dispose();
			}));
			picker.show();
		});

		if (pick === undefined) {
			return;
		}

		if (pick !== currIndex) {
			// user chooses another mimetype
			const index = this._nestedCell.outputsViewModels.indexOf(viewModel);
			const nextElement = this.domNode.nextElementSibling;
			this.resizeListener.clear();
			const element = this.domNode;
			if (element) {
				element.remove();
				this._notebookEditor.removeInset(
					this._diffElementViewModel,
					this._nestedCell,
					viewModel,
					this._diffSide
				);
			}

			viewModel.pickedMimeType = mimeTypes[pick];
			this.render(index, nextElement as HTMLElement);
		}
	}

	private generateRendererInfo(renderId: string): string {
		const renderInfo = this._notebookService.getRendererInfo(renderId);

		if (renderInfo) {
			const displayName = renderInfo.displayName !== '' ? renderInfo.displayName : renderInfo.id;
			return `${displayName} (${renderInfo.extensionId.value})`;
		}

		return nls.localize('builtinRenderInfo', "built-in");
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
		private _diffElementViewModel: DiffElementCellViewModelBase,
		private _nestedCellViewModel: DiffNestedCellViewModel,
		private _diffSide: DiffSide,
		private _outputContainer: HTMLElement,
		@INotebookService private _notebookService: INotebookService,
		@IQuickInputService private readonly _quickInputService: IQuickInputService,
	) {
		super();
		this._register(this._diffElementViewModel.onDidLayoutChange(() => {
			this._outputEntries.forEach((value, key) => {
				const index = _nestedCellViewModel.outputs.indexOf(key.model);
				if (index >= 0) {
					const top = this._diffElementViewModel.getOutputOffsetInContainer(this._diffSide, index);
					value.domNode.style.top = `${top}px`;
				}
			});
		}));

		this._register(this._nestedCellViewModel.textModel.onDidChangeOutputs(splice => {
			this._updateOutputs(splice);
		}));
	}

	private _updateOutputs(splice: NotebookCellOutputsSplice) {
		const removedKeys: ICellOutputViewModel[] = [];

		this._outputEntries.forEach((value, key) => {
			if (this._nestedCellViewModel.outputsViewModels.indexOf(key) < 0) {
				// already removed
				removedKeys.push(key);
				// remove element from DOM
				value.domNode.remove();
				this._editor.removeInset(this._diffElementViewModel, this._nestedCellViewModel, key, this._diffSide);
			}
		});

		removedKeys.forEach(key => {
			this._outputEntries.get(key)?.dispose();
			this._outputEntries.delete(key);
		});

		let prevElement: HTMLElement | undefined = undefined;
		const outputsToRender = this._nestedCellViewModel.outputsViewModels;

		outputsToRender.reverse().forEach(output => {
			if (this._outputEntries.has(output)) {
				// already exist
				prevElement = this._outputEntries.get(output)!.domNode;
				return;
			}

			// newly added element
			const currIndex = this._nestedCellViewModel.outputsViewModels.indexOf(output);
			this._renderOutput(output, currIndex, prevElement);
			prevElement = this._outputEntries.get(output)?.domNode;
		});
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
			// always add to the end
			this._editor.showInset(this._diffElementViewModel, currOutput.cellViewModel, currOutput, this._diffSide);
		}
	}

	hideOutputs() {
		this._outputEntries.forEach((outputElement, cellOutputViewModel) => {
			this._editor.hideInset(this._diffElementViewModel, this._nestedCellViewModel, cellOutputViewModel);
		});
	}

	private _renderOutput(currOutput: ICellOutputViewModel, index: number, beforeElement?: HTMLElement) {
		if (!this._outputEntries.has(currOutput)) {
			this._outputEntries.set(currOutput, new OutputElement(this._editor, this._notebookTextModel, this._notebookService, this._quickInputService, this._diffElementViewModel, this._diffSide, this._nestedCellViewModel, this._outputContainer, currOutput));
		}

		const renderElement = this._outputEntries.get(currOutput)!;
		renderElement.render(index, beforeElement);
	}
}
