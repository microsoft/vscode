/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from 'vs/base/browser/dom';
import * as nls from 'vs/nls';
import { StandardKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { KeyCode } from 'vs/base/common/keyCodes';
import { Disposable, DisposableStore } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { IQuickPickItem, IQuickInputService } from 'vs/platform/quickinput/common/quickInput';
import { CodeCellRenderTemplate, ICellOutputViewModel, IInsetRenderOutput, INotebookEditor, IRenderOutput, outputHasDynamicHeight, RenderOutputType } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import { getResizesObserver } from 'vs/workbench/contrib/notebook/browser/view/renderers/cellWidgets';
import { CodeCellViewModel } from 'vs/workbench/contrib/notebook/browser/viewModel/codeCellViewModel';
import { BUILTIN_RENDERER_ID, CellUri, NotebookCellOutputsSplice, IOrderedMimeType } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { INotebookService } from 'vs/workbench/contrib/notebook/common/notebookService';
import { IMarkdownString } from 'vs/base/common/htmlContent';
import { renderMarkdown } from 'vs/base/browser/markdownRenderer';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { ITextFileService } from 'vs/workbench/services/textfile/common/textfiles';
import { format } from 'vs/base/common/jsonFormatter';
import { applyEdits } from 'vs/base/common/jsonEdit';
import { ThemeIcon } from 'vs/platform/theme/common/themeService';
import { mimetypeIcon } from 'vs/workbench/contrib/notebook/browser/notebookIcons';
import { NotebookTextModel } from 'vs/workbench/contrib/notebook/common/model/notebookTextModel';

const OUTPUT_COUNT_LIMIT = 500;

interface IMimeTypeRenderer extends IQuickPickItem {
	index: number;
}

export class CellOutputElement extends Disposable {
	readonly resizeListener = new DisposableStore();
	domNode!: HTMLElement;
	renderResult?: IRenderOutput;

	public useDedicatedDOM: boolean = true;

	get domClientHeight() {
		if (this.useDedicatedDOM) {
			return this.domNode.clientHeight;
		} else {
			return 0;
		}
	}

	constructor(
		private notebookEditor: INotebookEditor,
		private notebookService: INotebookService,
		private quickInputService: IQuickInputService,
		private viewCell: CodeCellViewModel,
		private outputContainer: HTMLElement,
		readonly output: ICellOutputViewModel
	) {
		super();

		this._register(this.output.model.onDidChangeData(() => {
			this.updateOutputRendering();
		}));
	}

	detach() {
		this.domNode.parentElement?.removeChild(this.domNode);
	}

	updateDOMTop(top: number) {
		if (this.useDedicatedDOM) {
			this.domNode.style.top = `${top}px`;
		}
	}

	updateOutputRendering() {
		// user chooses another mimetype
		const index = this.viewCell.outputsViewModels.indexOf(this.output);
		const nextElement = this.domNode.nextElementSibling;
		this.resizeListener.clear();
		const element = this.domNode;
		if (element) {
			element.parentElement?.removeChild(element);
			this.notebookEditor.removeInset(this.output);
		}

		// this.output.pickedMimeType = pick;
		this.render(index, nextElement as HTMLElement);
		this.relayoutCell();
	}


	render(index: number, beforeElement?: HTMLElement) {
		if (this.viewCell.metadata.outputCollapsed || !this.notebookEditor.hasModel()) {
			return;
		}

		const notebookTextModel = this.notebookEditor.viewModel.notebookDocument;

		let renderResult: IRenderOutput | undefined = undefined;

		// Reuse output item div
		this.useDedicatedDOM = !(!beforeElement && this.output.supportAppend() && this.previousDivSupportAppend());
		this.domNode = this.useDedicatedDOM ? DOM.$('.output-inner-container') : this.outputContainer.lastChild as HTMLElement;

		if (this.output.supportAppend()) {
			this.domNode.classList.add('support-append');
		}

		const [mimeTypes, pick] = this.output.resolveMimeTypes(notebookTextModel);
		if (mimeTypes.length > 1) {
			this.attachMimetypeSwitcher(this.domNode, notebookTextModel, mimeTypes);
		}

		if (mimeTypes.length !== 0) {
			const pickedMimeTypeRenderer = mimeTypes[pick];

			if (pickedMimeTypeRenderer.rendererId !== BUILTIN_RENDERER_ID) {
				const renderer = this.notebookService.getRendererInfo(pickedMimeTypeRenderer.rendererId);
				renderResult = renderer
					? { type: RenderOutputType.Extension, renderer, source: this.output, mimeType: pickedMimeTypeRenderer.mimeType }
					: this.notebookEditor.getOutputRenderer().render(this.output, this.domNode, pickedMimeTypeRenderer.mimeType, this.getNotebookUri(),);
			} else {
				renderResult = this.notebookEditor.getOutputRenderer().render(this.output, this.domNode, pickedMimeTypeRenderer.mimeType, this.getNotebookUri(),);
			}

			this.output.pickedMimeType = pick;
		}

		this.renderResult = renderResult;

		if (!renderResult) {
			this.viewCell.updateOutputHeight(index, 0);
			return;
		}

		if (beforeElement) {
			this.outputContainer.insertBefore(this.domNode, beforeElement);
		} else if (this.useDedicatedDOM) {
			this.outputContainer.appendChild(this.domNode);
		}

		if (renderResult.type !== RenderOutputType.Mainframe) {
			this.notebookEditor.createInset(this.viewCell, renderResult, this.viewCell.getOutputOffset(index));
			this.domNode.classList.add('background');
		} else {
			this.domNode.classList.add('foreground', 'output-element');
			this.domNode.style.position = 'absolute';
		}

		if (outputHasDynamicHeight(renderResult)) {
			const clientHeight = this.domNode.clientHeight;
			const dimension = {
				width: this.viewCell.layoutInfo.editorWidth,
				height: clientHeight
			};
			const elementSizeObserver = getResizesObserver(this.domNode, dimension, () => {
				if (this.outputContainer && document.body.contains(this.outputContainer)) {
					const height = Math.ceil(elementSizeObserver.getHeight()) + 8;

					if (clientHeight === height) {
						return;
					}

					const currIndex = this.viewCell.outputsViewModels.indexOf(this.output);
					if (currIndex < 0) {
						return;
					}

					this.viewCell.updateOutputHeight(currIndex, height);
					this.relayoutCell();
				}
			});
			elementSizeObserver.startObserving();
			this.resizeListener.add(elementSizeObserver);
			this.viewCell.updateOutputHeight(index, clientHeight);
		} else if (renderResult.type === RenderOutputType.Mainframe) { // no-op if it's a webview
			if (this.useDedicatedDOM) {
				const clientHeight = Math.ceil(this.domNode.clientHeight);
				this.viewCell.updateOutputHeight(index, clientHeight);

				const top = this.viewCell.getOutputOffsetInContainer(index);
				this.domNode.style.top = `${top}px`;
			}
		}
	}

	private previousDivSupportAppend() {
		return this.outputContainer.lastChild && (<HTMLElement>this.outputContainer.lastChild).classList.contains('support-append');
	}

	private async attachMimetypeSwitcher(outputItemDiv: HTMLElement, notebookTextModel: NotebookTextModel, mimeTypes: readonly IOrderedMimeType[]) {
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
				await this.pickActiveMimeTypeRenderer(notebookTextModel, this.output);
			}
		}));

		this.resizeListener.add((DOM.addDisposableListener(mimeTypePicker, DOM.EventType.KEY_DOWN, async e => {
			const event = new StandardKeyboardEvent(e);
			if ((event.equals(KeyCode.Enter) || event.equals(KeyCode.Space))) {
				e.preventDefault();
				e.stopPropagation();
				await this.pickActiveMimeTypeRenderer(notebookTextModel, this.output);
			}
		})));
	}

	private async pickActiveMimeTypeRenderer(notebookTextModel: NotebookTextModel, viewModel: ICellOutputViewModel) {
		const [mimeTypes, currIndex] = viewModel.resolveMimeTypes(notebookTextModel);

		const items = mimeTypes.filter(mimeType => mimeType.isTrusted).map((mimeType, index): IMimeTypeRenderer => ({
			label: mimeType.mimeType,
			id: mimeType.mimeType,
			index: index,
			picked: index === currIndex,
			detail: this.generateRendererInfo(mimeType.rendererId),
			description: index === currIndex ? nls.localize('curruentActiveMimeType', "Currently Active") : undefined
		}));

		const picker = this.quickInputService.createQuickPick();
		picker.items = items;
		picker.activeItems = items.filter(item => !!item.picked);
		picker.placeholder = items.length !== mimeTypes.length
			? nls.localize('promptChooseMimeTypeInSecure.placeHolder', "Select mimetype to render for current output. Rich mimetypes are available only when the notebook is trusted")
			: nls.localize('promptChooseMimeType.placeHolder', "Select mimetype to render for current output");

		const pick = await new Promise<number | undefined>(resolve => {
			picker.onDidAccept(() => {
				resolve(picker.selectedItems.length === 1 ? (picker.selectedItems[0] as IMimeTypeRenderer).index : undefined);
				picker.dispose();
			});
			picker.show();
		});

		if (pick === undefined) {
			return;
		}

		if (pick !== currIndex) {
			// user chooses another mimetype
			const index = this.viewCell.outputsViewModels.indexOf(viewModel);
			const nextElement = this.domNode.nextElementSibling;
			this.resizeListener.clear();
			const element = this.domNode;
			if (element) {
				element.parentElement?.removeChild(element);
				this.notebookEditor.removeInset(viewModel);
			}

			viewModel.pickedMimeType = pick;
			this.render(index, nextElement as HTMLElement);
			this.relayoutCell();
		}
	}

	private getNotebookUri(): URI | undefined {
		return CellUri.parse(this.viewCell.uri)?.notebook;
	}

	private generateRendererInfo(renderId: string | undefined): string {
		if (renderId === undefined || renderId === BUILTIN_RENDERER_ID) {
			return nls.localize('builtinRenderInfo', "built-in");
		}

		const renderInfo = this.notebookService.getRendererInfo(renderId);

		if (renderInfo) {
			const displayName = renderInfo.displayName !== '' ? renderInfo.displayName : renderInfo.id;
			return `${displayName} (${renderInfo.extensionId.value})`;
		}

		return nls.localize('builtinRenderInfo', "built-in");
	}

	private relayoutCell() {
		this.notebookEditor.layoutNotebookCell(this.viewCell, this.viewCell.layoutInfo.totalHeight);
	}
}

export class CellOutputContainer extends Disposable {
	private outputEntries = new Map<ICellOutputViewModel, CellOutputElement>();

	constructor(
		private notebookEditor: INotebookEditor,
		private viewCell: CodeCellViewModel,
		private templateData: CodeCellRenderTemplate,
		@INotebookService private notebookService: INotebookService,
		@IQuickInputService private readonly quickInputService: IQuickInputService,
		@IOpenerService readonly openerService: IOpenerService,
		@ITextFileService readonly textFileService: ITextFileService,
	) {
		super();

		this._register(viewCell.onDidChangeOutputs(splices => {
			this._updateOutputs(splices);
		}));

		this._register(viewCell.onDidChangeLayout(() => {
			this.outputEntries.forEach((value, key) => {
				const index = viewCell.outputsViewModels.indexOf(key);
				if (index >= 0) {
					const top = this.viewCell.getOutputOffsetInContainer(index);
					value.updateDOMTop(top);
				}
			});
		}));
	}

	render(editorHeight: number) {
		if (this.viewCell.outputsViewModels.length > 0) {
			let layoutCache = false;
			if (this.viewCell.layoutInfo.totalHeight !== 0 && this.viewCell.layoutInfo.editorHeight > editorHeight) {
				layoutCache = true;
				this._relayoutCell();
			}

			this.templateData.outputContainer.style.display = 'block';
			const outputsToRender = this._calcuateOutputsToRender();
			for (let index = 0; index < outputsToRender.length; index++) {
				const currOutput = this.viewCell.outputsViewModels[index];

				// always add to the end
				this._renderOutput(currOutput, index, undefined);
			}

			this.viewCell.editorHeight = editorHeight;
			if (this.viewCell.outputsViewModels.length > OUTPUT_COUNT_LIMIT) {
				this.templateData.outputShowMoreContainer.style.display = 'block';
				this.viewCell.updateOutputShowMoreContainerHeight(46);
			}

			if (layoutCache) {
				this._relayoutCellDebounced();
			} else {
				this._relayoutCell();
			}
		} else {
			// noop
			this.viewCell.editorHeight = editorHeight;
			this._relayoutCell();
			this.templateData.outputContainer.style.display = 'none';
		}

		this.templateData.outputShowMoreContainer.innerText = '';
		this.templateData.outputShowMoreContainer.appendChild(this._generateShowMoreElement());
		// this.templateData.outputShowMoreContainer.style.top = `${this.viewCell.layoutInfo.outputShowMoreContainerOffset}px`;

		if (this.viewCell.outputsViewModels.length < OUTPUT_COUNT_LIMIT) {
			this.templateData.outputShowMoreContainer.style.display = 'none';
			this.viewCell.updateOutputShowMoreContainerHeight(0);
		}
	}

	viewUpdateShowOutputs(): void {
		for (let index = 0; index < this.viewCell.outputsViewModels.length; index++) {
			const currOutput = this.viewCell.outputsViewModels[index];

			const renderedOutput = this.outputEntries.get(currOutput);
			if (renderedOutput && renderedOutput.renderResult) {
				if (renderedOutput.renderResult.type !== RenderOutputType.Mainframe) {
					this.notebookEditor.createInset(this.viewCell, renderedOutput.renderResult as IInsetRenderOutput, this.viewCell.getOutputOffset(index));
				} else {
					this.viewCell.updateOutputHeight(index, renderedOutput.domClientHeight);
				}
			} else {
				// Wasn't previously rendered, render it now
				this._renderOutput(currOutput, index);
			}
		}

		this._relayoutCell();
	}

	viewUpdateHideOuputs(): void {
		for (const e of this.outputEntries.keys()) {
			this.notebookEditor.hideInset(e);
		}
	}

	onCellWidthChange(): void {
		this.viewCell.outputsViewModels.forEach((o, i) => {
			const renderedOutput = this.outputEntries.get(o);
			if (renderedOutput && renderedOutput.renderResult && renderedOutput.renderResult.type === RenderOutputType.Mainframe && !renderedOutput.renderResult.hasDynamicHeight) {
				this.viewCell.updateOutputHeight(i, renderedOutput.domClientHeight);
			}
		});
	}

	private _calcuateOutputsToRender(): ICellOutputViewModel[] {
		const outputs = this.viewCell.outputsViewModels.slice(0, Math.min(OUTPUT_COUNT_LIMIT, this.viewCell.outputsViewModels.length));
		if (!this.notebookEditor.viewModel!.metadata.trusted) {
			// not trusted
			const secureOutput = outputs.filter(output => {
				const mimeTypes = output.model.outputs.map(op => op.mime);

				if (mimeTypes.indexOf('application/x.notebook.stream') >= 0
					|| mimeTypes.indexOf('application/x.notebook.error-traceback') >= 0
					|| mimeTypes.indexOf('text/plain') >= 0
					|| mimeTypes.indexOf('text/markdown') >= 0
					|| mimeTypes.indexOf('application/json') >= 0
					|| mimeTypes.includes('image/png')) {
					return true;
				}

				return false;
			});

			return secureOutput;
		}

		return outputs;
	}

	private _updateOutputs(splices: NotebookCellOutputsSplice[]) {
		if (!splices.length) {
			return;
		}

		const previousOutputHeight = this.viewCell.layoutInfo.outputTotalHeight;

		if (this.viewCell.outputsViewModels.length) {
			this.templateData.outputContainer.style.display = 'block';
		} else {
			this.templateData.outputContainer.style.display = 'none';
		}

		const reversedSplices = splices.reverse();

		reversedSplices.forEach(splice => {
			this.viewCell.spliceOutputHeights(splice[0], splice[1], splice[2].map(_ => 0));
		});

		const removedKeys: ICellOutputViewModel[] = [];

		this.outputEntries.forEach((value, key) => {
			if (this.viewCell.outputsViewModels.indexOf(key) < 0) {
				// already removed
				removedKeys.push(key);
				// remove element from DOM
				value.detach();
				this.notebookEditor.removeInset(key);
			}
		});

		removedKeys.forEach(key => {
			this.outputEntries.get(key)?.dispose();
			this.outputEntries.delete(key);
		});

		let prevElement: HTMLElement | undefined = undefined;
		const outputsToRender = this._calcuateOutputsToRender();

		outputsToRender.reverse().forEach(output => {
			if (this.outputEntries.has(output)) {
				// already exist
				prevElement = this.outputEntries.get(output)!.domNode;
				return;
			}

			// newly added element
			const currIndex = this.viewCell.outputsViewModels.indexOf(output);
			this._renderOutput(output, currIndex, prevElement);
			prevElement = this.outputEntries.get(output)?.domNode;
		});

		if (this.viewCell.outputsViewModels.length > OUTPUT_COUNT_LIMIT) {
			this.templateData.outputShowMoreContainer.style.display = 'block';
			this.viewCell.updateOutputShowMoreContainerHeight(46);
		} else {
			this.templateData.outputShowMoreContainer.style.display = 'none';
		}

		const editorHeight = this.templateData.editor.getContentHeight();
		this.viewCell.editorHeight = editorHeight;

		if (previousOutputHeight === 0 || this.viewCell.outputsViewModels.length === 0) {
			// first execution or removing all outputs
			this._relayoutCell();
		} else {
			this._relayoutCellDebounced();
		}
	}

	private _renderOutput(currOutput: ICellOutputViewModel, index: number, beforeElement?: HTMLElement) {
		if (!this.outputEntries.has(currOutput)) {
			this.outputEntries.set(currOutput, new CellOutputElement(this.notebookEditor, this.notebookService, this.quickInputService, this.viewCell, this.templateData.outputContainer, currOutput));
		}

		this.outputEntries.get(currOutput)!.render(index, beforeElement);
	}

	private _generateShowMoreElement(): any {
		const md: IMarkdownString = {
			value: `There are more than ${OUTPUT_COUNT_LIMIT} outputs, [show more (open the raw output data in a text editor) ...](command:workbench.action.openLargeOutput)`,
			isTrusted: true,
			supportThemeIcons: true
		};

		const element = renderMarkdown(md, {
			actionHandler: {
				callback: (content) => {
					if (content === 'command:workbench.action.openLargeOutput') {
						const content = JSON.stringify(this.viewCell.outputsViewModels.map(output => {
							return output.toRawJSON();
						}));
						const edits = format(content, undefined, {});
						const metadataSource = applyEdits(content, edits);

						return this.textFileService.untitled.resolve({
							associatedResource: undefined,
							mode: 'json',
							initialValue: metadataSource
						}).then(model => {
							const resource = model.resource;
							this.openerService.open(resource);
						});
					}

					return;
				},
				disposeables: new DisposableStore()
			}
		});

		element.classList.add('output-show-more');
		return element;
	}

	private _relayoutCell() {
		if (this._timer !== null) {
			clearTimeout(this._timer);
		}

		this.notebookEditor.layoutNotebookCell(this.viewCell, this.viewCell.layoutInfo.totalHeight);
	}

	private _timer: number | null = null;

	private _relayoutCellDebounced() {
		if (this._timer !== null) {
			clearTimeout(this._timer);
		}

		this._timer = setTimeout(() => {
			this.notebookEditor.layoutNotebookCell(this.viewCell, this.viewCell.layoutInfo.totalHeight);
			this._timer = null;
		}, 200) as unknown as number | null;
	}

	dispose() {
		this.outputEntries.forEach((value) => {
			value.dispose();
		});

		super.dispose();
	}
}
