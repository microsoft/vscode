/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from '../../../../../../base/browser/dom.js';
import { FastDomNode } from '../../../../../../base/browser/fastDomNode.js';
import { renderMarkdown } from '../../../../../../base/browser/markdownRenderer.js';
import { Action } from '../../../../../../base/common/actions.js';
import { IMarkdownString } from '../../../../../../base/common/htmlContent.js';
import { Disposable, DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { MarshalledId } from '../../../../../../base/common/marshallingIds.js';
import * as nls from '../../../../../../nls.js';
import { getActionBarActions } from '../../../../../../platform/actions/browser/menuEntryActionViewItem.js';
import { WorkbenchToolBar } from '../../../../../../platform/actions/browser/toolbar.js';
import { IMenuService, MenuId } from '../../../../../../platform/actions/common/actions.js';
import { IContextKeyService } from '../../../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { IOpenerService } from '../../../../../../platform/opener/common/opener.js';
import { IQuickInputService, IQuickPickItem } from '../../../../../../platform/quickinput/common/quickInput.js';
import { ThemeIcon } from '../../../../../../base/common/themables.js';
import { IExtensionsWorkbenchService } from '../../../../extensions/common/extensions.js';
import { ICellOutputViewModel, ICellViewModel, IInsetRenderOutput, INotebookEditorDelegate, JUPYTER_EXTENSION_ID, RenderOutputType } from '../../notebookBrowser.js';
import { mimetypeIcon } from '../../notebookIcons.js';
import { CellContentPart } from '../cellPart.js';
import { CodeCellRenderTemplate } from '../notebookRenderingCommon.js';
import { CodeCellViewModel } from '../../viewModel/codeCellViewModel.js';
import { NotebookTextModel } from '../../../common/model/notebookTextModel.js';
import { CellUri, IOrderedMimeType, NotebookCellExecutionState, NotebookCellOutputsSplice, RENDERER_NOT_AVAILABLE, isTextStreamMime } from '../../../common/notebookCommon.js';
import { INotebookExecutionStateService } from '../../../common/notebookExecutionStateService.js';
import { INotebookKernel } from '../../../common/notebookKernelService.js';
import { INotebookService } from '../../../common/notebookService.js';
import { COPY_OUTPUT_COMMAND_ID } from '../../controller/cellOutputActions.js';
import { autorun, observableValue } from '../../../../../../base/common/observable.js';
import { NOTEBOOK_CELL_HAS_HIDDEN_OUTPUTS, NOTEBOOK_CELL_IS_FIRST_OUTPUT } from '../../../common/notebookContextKeys.js';
import { TEXT_BASED_MIMETYPES } from '../../viewModel/cellOutputTextHelper.js';

interface IMimeTypeRenderer extends IQuickPickItem {
	index: number;
}

interface IRenderResult {
	initRenderIsSynchronous: false;
}

// DOM structure
//
//  #output
//  |
//  |  #output-inner-container
//  |                        |  #cell-output-toolbar
//  |                        |  #output-element
//  |                        |  #output-element
//  |                        |  #output-element
//  |  #output-inner-container
//  |                        |  #cell-output-toolbar
//  |                        |  #output-element
//  |  #output-inner-container
//  |                        |  #cell-output-toolbar
//  |                        |  #output-element
class CellOutputElement extends Disposable {
	private readonly toolbarDisposables = this._register(new DisposableStore());

	innerContainer?: HTMLElement;
	renderedOutputContainer!: HTMLElement;
	renderResult?: IInsetRenderOutput;

	private readonly contextKeyService: IContextKeyService;
	private toolbarAttached = false;

	constructor(
		private notebookEditor: INotebookEditorDelegate,
		private viewCell: CodeCellViewModel,
		private cellOutputContainer: CellOutputContainer,
		private outputContainer: FastDomNode<HTMLElement>,
		readonly output: ICellOutputViewModel,
		@INotebookService private readonly notebookService: INotebookService,
		@IQuickInputService private readonly quickInputService: IQuickInputService,
		@IContextKeyService parentContextKeyService: IContextKeyService,
		@IMenuService private readonly menuService: IMenuService,
		@IExtensionsWorkbenchService private readonly extensionsWorkbenchService: IExtensionsWorkbenchService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {
		super();

		this.contextKeyService = parentContextKeyService;

		this._register(this.output.model.onDidChangeData(() => {
			this.rerender();
		}));

		this._register(this.output.onDidResetRenderer(() => {
			this.rerender();
		}));
	}

	detach() {
		this.renderedOutputContainer?.remove();

		let count = 0;
		if (this.innerContainer) {
			for (let i = 0; i < this.innerContainer.childNodes.length; i++) {
				if ((this.innerContainer.childNodes[i] as HTMLElement).className === 'rendered-output') {
					count++;
				}

				if (count > 1) {
					break;
				}
			}

			if (count === 0) {
				this.innerContainer.remove();
			}
		}

		this.notebookEditor.removeInset(this.output);
	}

	updateDOMTop(top: number) {
		if (this.innerContainer) {
			this.innerContainer.style.top = `${top}px`;
		}
	}

	rerender() {
		if (
			this.notebookEditor.hasModel() &&
			this.innerContainer &&
			this.renderResult &&
			this.renderResult.type === RenderOutputType.Extension
		) {
			// Output rendered by extension renderer got an update
			const [mimeTypes, pick] = this.output.resolveMimeTypes(this.notebookEditor.textModel, this.notebookEditor.activeKernel?.preloadProvides);
			const pickedMimeType = mimeTypes[pick];
			if (pickedMimeType.mimeType === this.renderResult.mimeType && pickedMimeType.rendererId === this.renderResult.renderer.id) {
				// Same mimetype, same renderer, call the extension renderer to update
				const index = this.viewCell.outputsViewModels.indexOf(this.output);
				this.notebookEditor.updateOutput(this.viewCell, this.renderResult, this.viewCell.getOutputOffset(index));
				return;
			}
		}

		if (!this.innerContainer) {
			// init rendering didn't happen
			const currOutputIndex = this.cellOutputContainer.renderedOutputEntries.findIndex(entry => entry.element === this);
			const previousSibling = currOutputIndex > 0 && !!(this.cellOutputContainer.renderedOutputEntries[currOutputIndex - 1].element.innerContainer?.parentElement)
				? this.cellOutputContainer.renderedOutputEntries[currOutputIndex - 1].element.innerContainer
				: undefined;
			this.render(previousSibling);
		} else {
			// Another mimetype or renderer is picked, we need to clear the current output and re-render
			const nextElement = this.innerContainer.nextElementSibling;
			this.toolbarDisposables.clear();
			const element = this.innerContainer;
			if (element) {
				element.remove();
				this.notebookEditor.removeInset(this.output);
			}

			this.render(nextElement as HTMLElement);
		}

		this._relayoutCell();
	}

	// insert after previousSibling
	private _generateInnerOutputContainer(previousSibling: HTMLElement | undefined, pickedMimeTypeRenderer: IOrderedMimeType) {
		this.innerContainer = DOM.$('.output-inner-container');

		if (previousSibling && previousSibling.nextElementSibling) {
			this.outputContainer.domNode.insertBefore(this.innerContainer, previousSibling.nextElementSibling);
		} else {
			this.outputContainer.domNode.appendChild(this.innerContainer);
		}

		this.innerContainer.setAttribute('output-mime-type', pickedMimeTypeRenderer.mimeType);
		return this.innerContainer;
	}

	render(previousSibling: HTMLElement | undefined): IRenderResult | undefined {
		const index = this.viewCell.outputsViewModels.indexOf(this.output);

		if (this.viewCell.isOutputCollapsed || !this.notebookEditor.hasModel()) {
			this.cellOutputContainer.flagAsStale();
			return undefined;
		}

		const notebookUri = CellUri.parse(this.viewCell.uri)?.notebook;
		if (!notebookUri) {
			return undefined;
		}

		const notebookTextModel = this.notebookEditor.textModel;

		const [mimeTypes, pick] = this.output.resolveMimeTypes(notebookTextModel, this.notebookEditor.activeKernel?.preloadProvides);

		if (!mimeTypes.find(mimeType => mimeType.isTrusted) || mimeTypes.length === 0) {
			this.viewCell.updateOutputHeight(index, 0, 'CellOutputElement#noMimeType');
			return undefined;
		}

		const selectedPresentation = mimeTypes[pick];
		let renderer = this.notebookService.getRendererInfo(selectedPresentation.rendererId);
		if (!renderer && selectedPresentation.mimeType.indexOf('text/') > -1) {
			renderer = this.notebookService.getRendererInfo('vscode.builtin-renderer');
		}

		const innerContainer = this._generateInnerOutputContainer(previousSibling, selectedPresentation);
		if (index === 0 || this.output.visible.get()) {
			this._attachToolbar(innerContainer, notebookTextModel, this.notebookEditor.activeKernel, index, mimeTypes);
		} else {
			this._register(autorun((reader) => {
				const visible = reader.readObservable(this.output.visible);
				if (visible && !this.toolbarAttached) {
					this._attachToolbar(innerContainer, notebookTextModel, this.notebookEditor.activeKernel, index, mimeTypes);
				} else if (!visible) {
					this.toolbarDisposables.clear();
				}
				this.cellOutputContainer.checkForHiddenOutputs();
			}));
			this.cellOutputContainer.hasHiddenOutputs.set(true, undefined);
		}

		this.renderedOutputContainer = DOM.append(innerContainer, DOM.$('.rendered-output'));


		this.renderResult = renderer
			? { type: RenderOutputType.Extension, renderer, source: this.output, mimeType: selectedPresentation.mimeType }
			: this._renderMissingRenderer(this.output, selectedPresentation.mimeType);

		this.output.pickedMimeType = selectedPresentation;

		if (!this.renderResult) {
			this.viewCell.updateOutputHeight(index, 0, 'CellOutputElement#renderResultUndefined');
			return undefined;
		}

		this.notebookEditor.createOutput(this.viewCell, this.renderResult, this.viewCell.getOutputOffset(index), false);
		innerContainer.classList.add('background');

		return { initRenderIsSynchronous: false };
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
			htmlContent: p.outerHTML + a.outerHTML
		};
	}

	private _renderMessage(viewModel: ICellOutputViewModel, message: string): IInsetRenderOutput {
		const el = DOM.$('p', undefined, message);
		return { type: RenderOutputType.Html, source: viewModel, htmlContent: el.outerHTML };
	}

	private shouldEnableCopy(mimeTypes: readonly IOrderedMimeType[]) {
		if (!mimeTypes.find(mimeType => TEXT_BASED_MIMETYPES.indexOf(mimeType.mimeType) || mimeType.mimeType.startsWith('image/'))) {
			return false;
		}

		if (isTextStreamMime(mimeTypes[0].mimeType)) {
			const cellViewModel = this.output.cellViewModel as ICellViewModel;
			const index = cellViewModel.outputsViewModels.indexOf(this.output);
			if (index > 0) {
				const previousOutput = cellViewModel.model.outputs[index - 1];
				// if the previous output was also a stream, the copy command will be in that output instead
				return !isTextStreamMime(previousOutput.outputs[0].mime);
			}
		}

		return true;
	}

	private async _attachToolbar(outputItemDiv: HTMLElement, notebookTextModel: NotebookTextModel, kernel: INotebookKernel | undefined, index: number, mimeTypes: readonly IOrderedMimeType[]) {
		const hasMultipleMimeTypes = mimeTypes.filter(mimeType => mimeType.isTrusted).length > 1;
		const isCopyEnabled = this.shouldEnableCopy(mimeTypes);
		if (index > 0 && !hasMultipleMimeTypes && !isCopyEnabled) {
			// nothing to put in the toolbar
			return;
		}

		if (!this.notebookEditor.hasModel()) {
			return;
		}

		outputItemDiv.style.position = 'relative';
		const mimeTypePicker = DOM.$('.cell-output-toolbar');

		outputItemDiv.appendChild(mimeTypePicker);

		const toolbar = this.toolbarDisposables.add(this.instantiationService.createInstance(WorkbenchToolBar, mimeTypePicker, {
			renderDropdownAsChildElement: false
		}));
		toolbar.context = {
			ui: true,
			cell: this.output.cellViewModel as ICellViewModel,
			outputViewModel: this.output,
			notebookEditor: this.notebookEditor,
			$mid: MarshalledId.NotebookCellActionContext
		};

		// TODO: This could probably be a real registered action, but it has to talk to this output element
		const pickAction = this.toolbarDisposables.add(new Action('notebook.output.pickMimetype', nls.localize('pickMimeType', "Change Presentation"), ThemeIcon.asClassName(mimetypeIcon), undefined,
			async _context => this._pickActiveMimeTypeRenderer(outputItemDiv, notebookTextModel, kernel, this.output)));

		const menuContextKeyService = this.toolbarDisposables.add(this.contextKeyService.createScoped(outputItemDiv));
		const hasHiddenOutputs = NOTEBOOK_CELL_HAS_HIDDEN_OUTPUTS.bindTo(menuContextKeyService);
		const isFirstCellOutput = NOTEBOOK_CELL_IS_FIRST_OUTPUT.bindTo(menuContextKeyService);
		isFirstCellOutput.set(index === 0);
		this.toolbarDisposables.add(autorun((reader) => { hasHiddenOutputs.set(reader.readObservable(this.cellOutputContainer.hasHiddenOutputs)); }));
		const menu = this.toolbarDisposables.add(this.menuService.createMenu(MenuId.NotebookOutputToolbar, menuContextKeyService));

		const updateMenuToolbar = () => {
			let { secondary } = getActionBarActions(menu!.getActions({ shouldForwardArgs: true }), () => false);
			if (!isCopyEnabled) {
				secondary = secondary.filter((action) => action.id !== COPY_OUTPUT_COMMAND_ID);
			}
			if (hasMultipleMimeTypes) {
				secondary = [pickAction, ...secondary];
			}

			toolbar.setActions([], secondary);
		};
		updateMenuToolbar();
		this.toolbarDisposables.add(menu.onDidChange(updateMenuToolbar));
	}

	private async _pickActiveMimeTypeRenderer(outputItemDiv: HTMLElement, notebookTextModel: NotebookTextModel, kernel: INotebookKernel | undefined, viewModel: ICellOutputViewModel) {
		const [mimeTypes, currIndex] = viewModel.resolveMimeTypes(notebookTextModel, kernel?.preloadProvides);

		const items: IMimeTypeRenderer[] = [];
		const unsupportedItems: IMimeTypeRenderer[] = [];
		mimeTypes.forEach((mimeType, index) => {
			if (mimeType.isTrusted) {
				const arr = mimeType.rendererId === RENDERER_NOT_AVAILABLE ?
					unsupportedItems :
					items;
				arr.push({
					label: mimeType.mimeType,
					id: mimeType.mimeType,
					index: index,
					picked: index === currIndex,
					detail: this._generateRendererInfo(mimeType.rendererId),
					description: index === currIndex ? nls.localize('curruentActiveMimeType', "Currently Active") : undefined
				});
			}
		});

		if (unsupportedItems.some(m => JUPYTER_RENDERER_MIMETYPES.includes(m.id!))) {
			unsupportedItems.push({
				label: nls.localize('installJupyterPrompt', "Install additional renderers from the marketplace"),
				id: 'installRenderers',
				index: mimeTypes.length
			});
		}

		const disposables = new DisposableStore();
		const picker = disposables.add(this.quickInputService.createQuickPick({ useSeparators: true }));
		picker.items = [
			...items,
			{ type: 'separator' },
			...unsupportedItems
		];
		picker.activeItems = items.filter(item => !!item.picked);
		picker.placeholder = items.length !== mimeTypes.length
			? nls.localize('promptChooseMimeTypeInSecure.placeHolder', "Select mimetype to render for current output")
			: nls.localize('promptChooseMimeType.placeHolder', "Select mimetype to render for current output");

		const pick = await new Promise<IMimeTypeRenderer | undefined>(resolve => {
			disposables.add(picker.onDidAccept(() => {
				resolve(picker.selectedItems.length === 1 ? (picker.selectedItems[0] as IMimeTypeRenderer) : undefined);
				disposables.dispose();
			}));
			picker.show();
		});

		if (pick === undefined || pick.index === currIndex) {
			return;
		}

		if (pick.id === 'installRenderers') {
			this._showJupyterExtension();
			return;
		}

		// user chooses another mimetype
		const nextElement = outputItemDiv.nextElementSibling;
		this.toolbarDisposables.clear();
		const element = this.innerContainer;
		if (element) {
			element.remove();
			this.notebookEditor.removeInset(viewModel);
		}

		viewModel.pickedMimeType = mimeTypes[pick.index];
		this.viewCell.updateOutputMinHeight(this.viewCell.layoutInfo.outputTotalHeight);

		const { mimeType, rendererId } = mimeTypes[pick.index];
		this.notebookService.updateMimePreferredRenderer(notebookTextModel.viewType, mimeType, rendererId, mimeTypes.map(m => m.mimeType));
		this.render(nextElement as HTMLElement);
		this._validateFinalOutputHeight(false);
		this._relayoutCell();
	}

	private async _showJupyterExtension() {
		await this.extensionsWorkbenchService.openSearch(`@id:${JUPYTER_EXTENSION_ID}`);
	}

	private _generateRendererInfo(renderId: string): string {
		const renderInfo = this.notebookService.getRendererInfo(renderId);

		if (renderInfo) {
			const displayName = renderInfo.displayName !== '' ? renderInfo.displayName : renderInfo.id;
			return `${displayName} (${renderInfo.extensionId.value})`;
		}

		return nls.localize('unavailableRenderInfo', "renderer not available");
	}

	private _outputHeightTimer: any = null;

	private _validateFinalOutputHeight(synchronous: boolean) {
		if (this._outputHeightTimer !== null) {
			clearTimeout(this._outputHeightTimer);
		}

		if (synchronous) {
			this.viewCell.unlockOutputHeight();
		} else {
			this._outputHeightTimer = setTimeout(() => {
				this.viewCell.unlockOutputHeight();
			}, 1000);
		}
	}

	private _relayoutCell() {
		this.notebookEditor.layoutNotebookCell(this.viewCell, this.viewCell.layoutInfo.totalHeight);
	}

	override dispose() {
		if (this._outputHeightTimer) {
			this.viewCell.unlockOutputHeight();
			clearTimeout(this._outputHeightTimer);
		}

		super.dispose();
	}
}

class OutputEntryViewHandler {
	constructor(
		readonly model: ICellOutputViewModel,
		readonly element: CellOutputElement
	) {

	}
}

const enum CellOutputUpdateContext {
	Execution = 1,
	Other = 2
}

export class CellOutputContainer extends CellContentPart {
	private _outputEntries: OutputEntryViewHandler[] = [];
	private _hasStaleOutputs: boolean = false;

	hasHiddenOutputs = observableValue<boolean>('hasHiddenOutputs', false);
	checkForHiddenOutputs() {
		if (this._outputEntries.find(entry => { return entry.model.visible; })) {
			this.hasHiddenOutputs.set(true, undefined);
		} else {
			this.hasHiddenOutputs.set(false, undefined);
		}
	}

	get renderedOutputEntries() {
		return this._outputEntries;
	}

	constructor(
		private notebookEditor: INotebookEditorDelegate,
		private viewCell: CodeCellViewModel,
		private readonly templateData: CodeCellRenderTemplate,
		private options: { limit: number },
		@IOpenerService private readonly openerService: IOpenerService,
		@INotebookExecutionStateService private readonly _notebookExecutionStateService: INotebookExecutionStateService,
		@IInstantiationService private readonly instantiationService: IInstantiationService
	) {
		super();

		this._register(viewCell.onDidStartExecution(() => {
			viewCell.updateOutputMinHeight(viewCell.layoutInfo.outputTotalHeight);
		}));

		this._register(viewCell.onDidStopExecution(() => {
			this._validateFinalOutputHeight(false);
		}));

		this._register(viewCell.onDidChangeOutputs(splice => {
			const executionState = this._notebookExecutionStateService.getCellExecution(viewCell.uri);
			const context = executionState ? CellOutputUpdateContext.Execution : CellOutputUpdateContext.Other;
			this._updateOutputs(splice, context);
		}));

		this._register(viewCell.onDidChangeLayout(() => {
			this.updateInternalLayoutNow(viewCell);
		}));
	}

	override updateInternalLayoutNow(viewCell: CodeCellViewModel) {
		this.templateData.outputContainer.setTop(viewCell.layoutInfo.outputContainerOffset);
		this.templateData.outputShowMoreContainer.setTop(viewCell.layoutInfo.outputShowMoreContainerOffset);

		this._outputEntries.forEach(entry => {
			const index = this.viewCell.outputsViewModels.indexOf(entry.model);
			if (index >= 0) {
				const top = this.viewCell.getOutputOffsetInContainer(index);
				entry.element.updateDOMTop(top);
			}
		});
	}

	render() {
		try {
			this._doRender();
		} finally {
			// TODO@rebornix, this is probably not necessary at all as cell layout change would send the update request.
			this._relayoutCell();
		}
	}

	/**
	 * Notify that an output may have been swapped out without the model getting rendered.
	 */
	flagAsStale() {
		this._hasStaleOutputs = true;
	}

	private _doRender() {
		if (this.viewCell.outputsViewModels.length > 0) {
			if (this.viewCell.layoutInfo.outputTotalHeight !== 0) {
				this.viewCell.updateOutputMinHeight(this.viewCell.layoutInfo.outputTotalHeight);
			}

			DOM.show(this.templateData.outputContainer.domNode);
			for (let index = 0; index < Math.min(this.options.limit, this.viewCell.outputsViewModels.length); index++) {
				const currOutput = this.viewCell.outputsViewModels[index];
				const entry = this.instantiationService.createInstance(CellOutputElement, this.notebookEditor, this.viewCell, this, this.templateData.outputContainer, currOutput);
				this._outputEntries.push(new OutputEntryViewHandler(currOutput, entry));
				entry.render(undefined);
			}

			if (this.viewCell.outputsViewModels.length > this.options.limit) {
				DOM.show(this.templateData.outputShowMoreContainer.domNode);
				this.viewCell.updateOutputShowMoreContainerHeight(46);
			}

			this._validateFinalOutputHeight(false);
		} else {
			// noop
			DOM.hide(this.templateData.outputContainer.domNode);
		}

		this.templateData.outputShowMoreContainer.domNode.innerText = '';
		if (this.viewCell.outputsViewModels.length > this.options.limit) {
			this.templateData.outputShowMoreContainer.domNode.appendChild(this._generateShowMoreElement(this.templateData.templateDisposables));
		} else {
			DOM.hide(this.templateData.outputShowMoreContainer.domNode);
			this.viewCell.updateOutputShowMoreContainerHeight(0);
		}
	}

	viewUpdateShowOutputs(initRendering: boolean): void {
		if (this._hasStaleOutputs) {
			this._hasStaleOutputs = false;
			this._outputEntries.forEach(entry => {
				entry.element.rerender();
			});
		}

		for (let index = 0; index < this._outputEntries.length; index++) {
			const viewHandler = this._outputEntries[index];
			const outputEntry = viewHandler.element;
			if (outputEntry.renderResult) {
				this.notebookEditor.createOutput(this.viewCell, outputEntry.renderResult as IInsetRenderOutput, this.viewCell.getOutputOffset(index), false);
			} else {
				outputEntry.render(undefined);
			}
		}

		this._relayoutCell();
	}

	viewUpdateHideOuputs(): void {
		for (let index = 0; index < this._outputEntries.length; index++) {
			this.notebookEditor.hideInset(this._outputEntries[index].model);
		}
	}

	private _outputHeightTimer: any = null;

	private _validateFinalOutputHeight(synchronous: boolean) {
		if (this._outputHeightTimer !== null) {
			clearTimeout(this._outputHeightTimer);
		}

		const executionState = this._notebookExecutionStateService.getCellExecution(this.viewCell.uri);

		if (synchronous) {
			this.viewCell.unlockOutputHeight();
		} else if (executionState?.state !== NotebookCellExecutionState.Executing) {
			this._outputHeightTimer = setTimeout(() => {
				this.viewCell.unlockOutputHeight();
			}, 200);
		}
	}

	private _updateOutputs(splice: NotebookCellOutputsSplice, context: CellOutputUpdateContext = CellOutputUpdateContext.Other) {
		const previousOutputHeight = this.viewCell.layoutInfo.outputTotalHeight;

		// for cell output update, we make sure the cell does not shrink before the new outputs are rendered.
		this.viewCell.updateOutputMinHeight(previousOutputHeight);

		if (this.viewCell.outputsViewModels.length) {
			DOM.show(this.templateData.outputContainer.domNode);
		} else {
			DOM.hide(this.templateData.outputContainer.domNode);
		}

		this.viewCell.spliceOutputHeights(splice.start, splice.deleteCount, splice.newOutputs.map(_ => 0));
		this._renderNow(splice, context);
	}

	private _renderNow(splice: NotebookCellOutputsSplice, context: CellOutputUpdateContext) {
		if (splice.start >= this.options.limit) {
			// splice items out of limit
			return;
		}

		const firstGroupEntries = this._outputEntries.slice(0, splice.start);
		const deletedEntries = this._outputEntries.slice(splice.start, splice.start + splice.deleteCount);
		const secondGroupEntries = this._outputEntries.slice(splice.start + splice.deleteCount);
		let newlyInserted = this.viewCell.outputsViewModels.slice(splice.start, splice.start + splice.newOutputs.length);

		// [...firstGroup, ...deletedEntries, ...secondGroupEntries]  [...restInModel]
		// [...firstGroup, ...newlyInserted, ...secondGroupEntries, restInModel]
		if (firstGroupEntries.length + newlyInserted.length + secondGroupEntries.length > this.options.limit) {
			// exceeds limit again
			if (firstGroupEntries.length + newlyInserted.length > this.options.limit) {
				[...deletedEntries, ...secondGroupEntries].forEach(entry => {
					entry.element.detach();
					entry.element.dispose();
				});

				newlyInserted = newlyInserted.slice(0, this.options.limit - firstGroupEntries.length);
				const newlyInsertedEntries = newlyInserted.map(insert => {
					return new OutputEntryViewHandler(insert, this.instantiationService.createInstance(CellOutputElement, this.notebookEditor, this.viewCell, this, this.templateData.outputContainer, insert));
				});

				this._outputEntries = [...firstGroupEntries, ...newlyInsertedEntries];

				// render newly inserted outputs
				for (let i = firstGroupEntries.length; i < this._outputEntries.length; i++) {
					this._outputEntries[i].element.render(undefined);
				}
			} else {
				// part of secondGroupEntries are pushed out of view
				// now we have to be creative as secondGroupEntries might not use dedicated containers
				const elementsPushedOutOfView = secondGroupEntries.slice(this.options.limit - firstGroupEntries.length - newlyInserted.length);
				[...deletedEntries, ...elementsPushedOutOfView].forEach(entry => {
					entry.element.detach();
					entry.element.dispose();
				});

				// exclusive
				const reRenderRightBoundary = firstGroupEntries.length + newlyInserted.length;

				const newlyInsertedEntries = newlyInserted.map(insert => {
					return new OutputEntryViewHandler(insert, this.instantiationService.createInstance(CellOutputElement, this.notebookEditor, this.viewCell, this, this.templateData.outputContainer, insert));
				});

				this._outputEntries = [...firstGroupEntries, ...newlyInsertedEntries, ...secondGroupEntries.slice(0, this.options.limit - firstGroupEntries.length - newlyInserted.length)];

				for (let i = firstGroupEntries.length; i < reRenderRightBoundary; i++) {
					const previousSibling = i - 1 >= 0 && this._outputEntries[i - 1] && !!(this._outputEntries[i - 1].element.innerContainer?.parentElement) ? this._outputEntries[i - 1].element.innerContainer : undefined;
					this._outputEntries[i].element.render(previousSibling);
				}
			}
		} else {
			// after splice, it doesn't exceed
			deletedEntries.forEach(entry => {
				entry.element.detach();
				entry.element.dispose();
			});

			const reRenderRightBoundary = firstGroupEntries.length + newlyInserted.length;

			const newlyInsertedEntries = newlyInserted.map(insert => {
				return new OutputEntryViewHandler(insert, this.instantiationService.createInstance(CellOutputElement, this.notebookEditor, this.viewCell, this, this.templateData.outputContainer, insert));
			});

			let outputsNewlyAvailable: OutputEntryViewHandler[] = [];

			if (firstGroupEntries.length + newlyInsertedEntries.length + secondGroupEntries.length < this.viewCell.outputsViewModels.length) {
				const last = Math.min(this.options.limit, this.viewCell.outputsViewModels.length);
				outputsNewlyAvailable = this.viewCell.outputsViewModels.slice(firstGroupEntries.length + newlyInsertedEntries.length + secondGroupEntries.length, last).map(output => {
					return new OutputEntryViewHandler(output, this.instantiationService.createInstance(CellOutputElement, this.notebookEditor, this.viewCell, this, this.templateData.outputContainer, output));
				});
			}

			this._outputEntries = [...firstGroupEntries, ...newlyInsertedEntries, ...secondGroupEntries, ...outputsNewlyAvailable];

			for (let i = firstGroupEntries.length; i < reRenderRightBoundary; i++) {
				const previousSibling = i - 1 >= 0 && this._outputEntries[i - 1] && !!(this._outputEntries[i - 1].element.innerContainer?.parentElement) ? this._outputEntries[i - 1].element.innerContainer : undefined;
				this._outputEntries[i].element.render(previousSibling);
			}

			for (let i = 0; i < outputsNewlyAvailable.length; i++) {
				this._outputEntries[firstGroupEntries.length + newlyInserted.length + secondGroupEntries.length + i].element.render(undefined);
			}
		}

		if (this.viewCell.outputsViewModels.length > this.options.limit) {
			DOM.show(this.templateData.outputShowMoreContainer.domNode);
			if (!this.templateData.outputShowMoreContainer.domNode.hasChildNodes()) {
				this.templateData.outputShowMoreContainer.domNode.appendChild(this._generateShowMoreElement(this.templateData.templateDisposables));
			}
			this.viewCell.updateOutputShowMoreContainerHeight(46);
		} else {
			DOM.hide(this.templateData.outputShowMoreContainer.domNode);
		}

		this._relayoutCell();
		// if it's clearing all outputs, or outputs are all rendered synchronously
		// shrink immediately as the final output height will be zero.
		// if it's rerun, then the output clearing might be temporary, so we don't shrink immediately
		this._validateFinalOutputHeight(context === CellOutputUpdateContext.Other && this.viewCell.outputsViewModels.length === 0);
	}

	private _generateShowMoreElement(disposables: DisposableStore): HTMLElement {
		const md: IMarkdownString = {
			value: `There are more than ${this.options.limit} outputs, [show more (open the raw output data in a text editor) ...](command:workbench.action.openLargeOutput)`,
			isTrusted: true,
			supportThemeIcons: true
		};

		const rendered = renderMarkdown(md, {
			actionHandler: {
				callback: (content) => {
					if (content === 'command:workbench.action.openLargeOutput') {
						this.openerService.open(CellUri.generateCellOutputUri(this.notebookEditor.textModel!.uri));
					}

					return;
				},
				disposables
			}
		});
		disposables.add(rendered);

		rendered.element.classList.add('output-show-more');
		return rendered.element;
	}

	private _relayoutCell() {
		this.notebookEditor.layoutNotebookCell(this.viewCell, this.viewCell.layoutInfo.totalHeight);
	}

	override dispose() {
		this.viewCell.updateOutputMinHeight(0);

		if (this._outputHeightTimer) {
			clearTimeout(this._outputHeightTimer);
		}

		this._outputEntries.forEach(entry => {
			entry.element.dispose();
		});

		super.dispose();
	}
}

const JUPYTER_RENDERER_MIMETYPES = [
	'application/geo+json',
	'application/vdom.v1+json',
	'application/vnd.dataresource+json',
	'application/vnd.plotly.v1+json',
	'application/vnd.vega.v2+json',
	'application/vnd.vega.v3+json',
	'application/vnd.vega.v4+json',
	'application/vnd.vega.v5+json',
	'application/vnd.vegalite.v1+json',
	'application/vnd.vegalite.v2+json',
	'application/vnd.vegalite.v3+json',
	'application/vnd.vegalite.v4+json',
	'application/x-nteract-model-debug+json',
	'image/svg+xml',
	'text/latex',
	'text/vnd.plotly.v1+html',
	'application/vnd.jupyter.widget-view+json',
	'application/vnd.code.notebook.error'
];
