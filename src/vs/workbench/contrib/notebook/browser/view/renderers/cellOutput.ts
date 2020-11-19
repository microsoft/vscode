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
import { INotebookEditor } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import { getResizesObserver } from 'vs/workbench/contrib/notebook/browser/view/renderers/cellWidgets';
import { CodeCellViewModel } from 'vs/workbench/contrib/notebook/browser/viewModel/codeCellViewModel';
import { ITransformedDisplayOutputDto, IRenderOutput, IProcessedOutput, RENDERER_NOT_AVAILABLE, BUILTIN_RENDERER_ID, RenderOutputType, outputHasDynamicHeight, CellUri, CellOutputKind } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { INotebookService } from 'vs/workbench/contrib/notebook/common/notebookService';

interface IMimeTypeRenderer extends IQuickPickItem {
	index: number;
}

export class OutputElement extends Disposable {

	// this isn't super proper but I couldn't find a view-model equivalent for output
	// and it seems as of today we use the domain model - and pragamtically enrich it
	// with UX properties
	private pickedMimeTypes = new WeakMap<ITransformedDisplayOutputDto, number>();

	readonly resizeListener = new DisposableStore();
	domNode!: HTMLElement;
	renderResult?: IRenderOutput;

	constructor(
		private notebookEditor: INotebookEditor,
		private notebookService: INotebookService,
		private quickInputService: IQuickInputService,
		private viewCell: CodeCellViewModel,
		private outputContainer: HTMLElement,
		readonly output: IProcessedOutput
	) {
		super();
	}

	render(index: number, beforeElement?: HTMLElement) {
		if (this.viewCell.metadata.outputCollapsed) {
			return;
		}

		const outputItemDiv = document.createElement('div');
		let result: IRenderOutput | undefined = undefined;

		if (this.output.outputKind === CellOutputKind.Rich) {
			const transformedDisplayOutput = this.output as ITransformedDisplayOutputDto;

			const mimeTypes = this.notebookService.getMimeTypeInfo(this.notebookEditor.textModel!, this.output);

			const pick = this.pickedMimeTypes.get(this.output) ?? Math.max(mimeTypes.findIndex(mimeType => mimeType.rendererId !== RENDERER_NOT_AVAILABLE), 0);

			if (mimeTypes.length > 1) {
				outputItemDiv.style.position = 'relative';
				const mimeTypePicker = DOM.$('.multi-mimetype-output');
				mimeTypePicker.classList.add('codicon', 'codicon-code');
				mimeTypePicker.tabIndex = 0;
				mimeTypePicker.title = nls.localize('mimeTypePicker', "Choose a different output mimetype, available mimetypes: {0}", mimeTypes.map(mimeType => mimeType.mimeType).join(', '));
				outputItemDiv.appendChild(mimeTypePicker);
				this.resizeListener.add(DOM.addStandardDisposableListener(mimeTypePicker, 'mousedown', async e => {
					if (e.leftButton) {
						e.preventDefault();
						e.stopPropagation();
						await this.pickActiveMimeTypeRenderer(transformedDisplayOutput);
					}
				}));

				this.resizeListener.add((DOM.addDisposableListener(mimeTypePicker, DOM.EventType.KEY_DOWN, async e => {
					const event = new StandardKeyboardEvent(e);
					if ((event.equals(KeyCode.Enter) || event.equals(KeyCode.Space))) {
						e.preventDefault();
						e.stopPropagation();
						await this.pickActiveMimeTypeRenderer(transformedDisplayOutput);
					}
				})));

			}
			const pickedMimeTypeRenderer = mimeTypes[pick];

			const innerContainer = DOM.$('.output-inner-container');
			DOM.append(outputItemDiv, innerContainer);


			if (pickedMimeTypeRenderer.rendererId !== BUILTIN_RENDERER_ID) {
				const renderer = this.notebookService.getRendererInfo(pickedMimeTypeRenderer.rendererId);
				result = renderer
					? { type: RenderOutputType.Extension, renderer, source: this.output, mimeType: pickedMimeTypeRenderer.mimeType }
					: this.notebookEditor.getOutputRenderer().render(this.output, innerContainer, pickedMimeTypeRenderer.mimeType, this.getNotebookUri(),);
			} else {
				result = this.notebookEditor.getOutputRenderer().render(this.output, innerContainer, pickedMimeTypeRenderer.mimeType, this.getNotebookUri(),);
			}
		} else {
			// for text and error, there is no mimetype
			const innerContainer = DOM.$('.output-inner-container');
			DOM.append(outputItemDiv, innerContainer);

			result = this.notebookEditor.getOutputRenderer().render(this.output, innerContainer, undefined, this.getNotebookUri(),);
		}

		this.domNode = outputItemDiv;
		this.renderResult = result;

		if (!result) {
			this.viewCell.updateOutputHeight(index, 0);
			return;
		}

		if (beforeElement) {
			this.outputContainer.insertBefore(outputItemDiv, beforeElement);
		} else {
			this.outputContainer.appendChild(outputItemDiv);
		}

		if (result.type !== RenderOutputType.None) {
			this.viewCell.selfSizeMonitoring = true;
			this.notebookEditor.createInset(this.viewCell, result as any, this.viewCell.getOutputOffset(index));
		} else {
			outputItemDiv.classList.add('foreground', 'output-element');
			outputItemDiv.style.position = 'absolute';
		}

		if (outputHasDynamicHeight(result)) {
			this.viewCell.selfSizeMonitoring = true;

			const clientHeight = outputItemDiv.clientHeight;
			const dimension = {
				width: this.viewCell.layoutInfo.editorWidth,
				height: clientHeight
			};
			const elementSizeObserver = getResizesObserver(outputItemDiv, dimension, () => {
				if (this.outputContainer && document.body.contains(this.outputContainer!)) {
					const height = Math.ceil(elementSizeObserver.getHeight());

					if (clientHeight === height) {
						return;
					}

					const currIndex = this.viewCell.outputs.indexOf(this.output);
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
		} else if (result.type === RenderOutputType.None) { // no-op if it's a webview
			const clientHeight = Math.ceil(outputItemDiv.clientHeight);
			this.viewCell.updateOutputHeight(index, clientHeight);

			const top = this.viewCell.getOutputOffsetInContainer(index);
			outputItemDiv.style.top = `${top}px`;
		}
	}

	async pickActiveMimeTypeRenderer(output: ITransformedDisplayOutputDto) {

		const mimeTypes = this.notebookService.getMimeTypeInfo(this.notebookEditor.textModel!, output);
		const currIndex = this.pickedMimeTypes.get(output) ?? 0;

		// const currIndex = output.pickedMimeTypeIndex;
		const items = mimeTypes.map((mimeType, index): IMimeTypeRenderer => ({
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
		picker.placeholder = nls.localize('promptChooseMimeType.placeHolder', "Select output mimetype to render for current output");

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
			const index = this.viewCell.outputs.indexOf(output);
			const nextElement = this.domNode.nextElementSibling;
			this.resizeListener.clear();
			const element = this.domNode;
			if (element) {
				element.parentElement?.removeChild(element);
				this.notebookEditor.removeInset(output);
			}

			this.pickedMimeTypes.set(output, pick);
			this.render(index, nextElement as HTMLElement);
			this.relayoutCell();
		}
	}

	private getNotebookUri(): URI | undefined {
		return CellUri.parse(this.viewCell.uri)?.notebook;
	}

	generateRendererInfo(renderId: string | undefined): string {
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

	relayoutCell() {
		this.notebookEditor.layoutNotebookCell(this.viewCell, this.viewCell.layoutInfo.totalHeight);
	}
}
