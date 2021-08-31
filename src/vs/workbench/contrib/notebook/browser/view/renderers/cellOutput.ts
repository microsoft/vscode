/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from 'vs/base/browser/dom';
import { renderMarkdown } from 'vs/base/browser/markdownRenderer';
import { ToolBar } from 'vs/base/browser/ui/toolbar/toolbar';
import { Action, IAction } from 'vs/base/common/actions';
import { IMarkdownString } from 'vs/base/common/htmlContent';
import { Disposable, DisposableStore, MutableDisposable } from 'vs/base/common/lifecycle';
import { MarshalledId } from 'vs/base/common/marshalling';
import { Schemas } from 'vs/base/common/network';
import * as nls from 'vs/nls';
import { createAndFillInActionBarActions } from 'vs/platform/actions/browser/menuEntryActionViewItem';
import { IMenuService, MenuId } from 'vs/platform/actions/common/actions';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { IQuickInputService, IQuickPickItem } from 'vs/platform/quickinput/common/quickInput';
import { ThemeIcon } from 'vs/platform/theme/common/themeService';
import { IExtensionsViewPaneContainer, VIEWLET_ID as EXTENSION_VIEWLET_ID } from 'vs/workbench/contrib/extensions/common/extensions';
import { INotebookCellActionContext } from 'vs/workbench/contrib/notebook/browser/controller/coreActions';
import { CodeCellRenderTemplate, ICellOutputViewModel, ICellViewModel, IInsetRenderOutput, INotebookEditor, IRenderOutput, JUPYTER_EXTENSION_ID, RenderOutputType } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import { mimetypeIcon } from 'vs/workbench/contrib/notebook/browser/notebookIcons';
import { getResizesObserver } from 'vs/workbench/contrib/notebook/browser/view/renderers/cellWidgets';
import { CodeCellViewModel } from 'vs/workbench/contrib/notebook/browser/viewModel/codeCellViewModel';
import { NotebookTextModel } from 'vs/workbench/contrib/notebook/common/model/notebookTextModel';
import { BUILTIN_RENDERER_ID, CellUri, IOrderedMimeType, NotebookCellOutputsSplice, RENDERER_NOT_AVAILABLE } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { INotebookKernel } from 'vs/workbench/contrib/notebook/common/notebookKernelService';
import { INotebookService } from 'vs/workbench/contrib/notebook/common/notebookService';
import { IViewletService } from 'vs/workbench/services/viewlet/browser/viewlet';


interface IMimeTypeRenderer extends IQuickPickItem {
	index: number;
}

interface IRenderResult {
	initRenderIsSynchronous: boolean;
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
export class CellOutputElement extends Disposable {
	private readonly _renderDisposableStore = this._register(new DisposableStore());
	private readonly _actionsDisposable = this._register(new MutableDisposable());

	innerContainer!: HTMLElement;
	renderedOutputContainer!: HTMLElement;
	renderResult?: IRenderOutput;

	public useDedicatedDOM: boolean = true;

	get domOffsetHeight() {
		if (this.useDedicatedDOM) {
			return this.innerContainer.offsetHeight;
		} else {
			return 0;
		}
	}

	private readonly contextKeyService: IContextKeyService;

	constructor(
		private notebookEditor: INotebookEditor,
		private viewCell: CodeCellViewModel,
		private outputContainer: HTMLElement,
		readonly output: ICellOutputViewModel,
		@INotebookService private readonly notebookService: INotebookService,
		@IQuickInputService private readonly quickInputService: IQuickInputService,
		@IContextMenuService private readonly contextMenuService: IContextMenuService,
		@IKeybindingService private readonly keybindingService: IKeybindingService,
		@IContextKeyService parentContextKeyService: IContextKeyService,
		@IMenuService private readonly menuService: IMenuService,
		@IViewletService private readonly viewletService: IViewletService,
	) {
		super();

		this.contextKeyService = parentContextKeyService;

		this._register(this.output.model.onDidChangeData(() => {
			this.updateOutputData();
		}));
	}

	detach() {
		if (this.renderedOutputContainer) {
			this.renderedOutputContainer.parentElement?.removeChild(this.renderedOutputContainer);
		}

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
				this.innerContainer.parentElement?.removeChild(this.innerContainer);
			}
		}

		this.notebookEditor.removeInset(this.output);

		if (this.renderResult && this.renderResult.type === RenderOutputType.Mainframe) {
			this.renderResult.disposable?.dispose();
		}
	}

	updateDOMTop(top: number) {
		if (this.useDedicatedDOM) {
			if (this.innerContainer) {
				this.innerContainer.style.top = `${top}px`;
			}
		}
	}

	updateOutputData() {
		// update the content inside the domNode, do not need to worry about streaming
		if (!this.innerContainer) {
			return;
		}

		// user chooses another mimetype
		const nextElement = this.innerContainer.nextElementSibling;
		this._renderDisposableStore.clear();
		const element = this.innerContainer;
		if (element) {
			element.parentElement?.removeChild(element);
			this.notebookEditor.removeInset(this.output);
		}

		// this.output.pickedMimeType = pick;
		this.render(nextElement as HTMLElement);
		this._relayoutCell();
	}

	// insert after previousSibling
	private _generateInnerOutputContainer(previousSibling: HTMLElement | undefined, pickedMimeTypeRenderer: IOrderedMimeType) {
		if (this.output.supportAppend()) {
			// current output support append
			if (previousSibling) {
				if (this._divSupportAppend(previousSibling as HTMLElement | null, pickedMimeTypeRenderer.mimeType)) {
					this.useDedicatedDOM = false;
					this.innerContainer = previousSibling as HTMLElement;
				} else {
					this.useDedicatedDOM = true;
					this.innerContainer = DOM.$('.output-inner-container');
					if (previousSibling.nextElementSibling) {
						this.outputContainer.insertBefore(this.innerContainer, previousSibling.nextElementSibling);
					} else {
						this.outputContainer.appendChild(this.innerContainer);
					}
				}
			} else {
				// no previousSibling, append it to the very last
				if (this._divSupportAppend(this.outputContainer.lastChild as HTMLElement | null, pickedMimeTypeRenderer.mimeType)) {
					// last element allows append
					this.useDedicatedDOM = false;
					this.innerContainer = this.outputContainer.lastChild as HTMLElement;
				} else {
					this.useDedicatedDOM = true;
					this.innerContainer = DOM.$('.output-inner-container');
					this.outputContainer.appendChild(this.innerContainer);
				}
			}
		} else {
			this.useDedicatedDOM = true;
			this.innerContainer = DOM.$('.output-inner-container');

			if (previousSibling && previousSibling.nextElementSibling) {
				this.outputContainer.insertBefore(this.innerContainer, previousSibling.nextElementSibling);
			} else if (this.useDedicatedDOM) {
				this.outputContainer.appendChild(this.innerContainer);
			}
		}

		this.innerContainer.setAttribute('output-mime-type', pickedMimeTypeRenderer.mimeType);
	}

	render(previousSibling?: HTMLElement): IRenderResult | undefined {
		const index = this.viewCell.outputsViewModels.indexOf(this.output);

		if (this.viewCell.metadata.outputCollapsed || !this.notebookEditor.hasModel()) {
			return undefined;
		}

		const notebookUri = CellUri.parse(this.viewCell.uri)?.notebook;
		if (!notebookUri) {
			return undefined;
		}

		const notebookTextModel = this.notebookEditor.viewModel.notebookDocument;

		const [mimeTypes, pick] = this.output.resolveMimeTypes(notebookTextModel, this.notebookEditor.activeKernel?.preloadProvides);

		if (!mimeTypes.find(mimeType => mimeType.isTrusted) || mimeTypes.length === 0) {
			this.viewCell.updateOutputHeight(index, 0, 'CellOutputElement#noMimeType');
			return undefined;
		}

		const pickedMimeTypeRenderer = mimeTypes[pick];

		// generate an innerOutputContainer only when needed, for text streaming, it will reuse the previous element's container
		this._generateInnerOutputContainer(previousSibling, pickedMimeTypeRenderer);
		this._attachToolbar(this.innerContainer, notebookTextModel, this.notebookEditor.activeKernel, index, mimeTypes);

		this.renderedOutputContainer = DOM.append(this.innerContainer, DOM.$('.rendered-output'));

		if (pickedMimeTypeRenderer.rendererId !== BUILTIN_RENDERER_ID) {
			const renderer = this.notebookService.getRendererInfo(pickedMimeTypeRenderer.rendererId);
			this.renderResult = renderer
				? { type: RenderOutputType.Extension, renderer, source: this.output, mimeType: pickedMimeTypeRenderer.mimeType }
				: this.notebookEditor.getOutputRenderer().render(this.output, this.renderedOutputContainer, pickedMimeTypeRenderer.mimeType, notebookUri);
		} else {
			this.renderResult = this.notebookEditor.getOutputRenderer().render(this.output, this.renderedOutputContainer, pickedMimeTypeRenderer.mimeType, notebookUri);
		}

		this.output.pickedMimeType = pickedMimeTypeRenderer;

		if (!this.renderResult) {
			this.viewCell.updateOutputHeight(index, 0, 'CellOutputElement#renderResultUndefined');
			return undefined;
		}

		if (this.renderResult.type !== RenderOutputType.Mainframe) {
			this.notebookEditor.createOutput(this.viewCell, this.renderResult, this.viewCell.getOutputOffset(index));
			this.innerContainer.classList.add('background');
		} else {
			this.innerContainer.classList.add('foreground', 'output-element');
			this.innerContainer.style.position = 'absolute';
		}

		if (this.renderResult.type === RenderOutputType.Html || this.renderResult.type === RenderOutputType.Extension) {
			// the output is rendered in the webview, which has resize listener internally
			// no-op
			return { initRenderIsSynchronous: false };
		}

		if (!this.useDedicatedDOM) {
			// we only support text streaming, which is sync.
			return { initRenderIsSynchronous: true };
		}

		// let's use resize listener for them
		const offsetHeight = this.renderResult?.initHeight !== undefined ? this.renderResult?.initHeight : Math.ceil(this.innerContainer.offsetHeight);
		const dimension = {
			width: this.viewCell.layoutInfo.editorWidth,
			height: offsetHeight
		};
		this._bindResizeListener(dimension);
		this.viewCell.updateOutputHeight(index, offsetHeight, 'CellOutputElement#renderResultInitHeight');
		const top = this.viewCell.getOutputOffsetInContainer(index);
		this.innerContainer.style.top = `${top}px`;
		return { initRenderIsSynchronous: true };
	}

	private _bindResizeListener(dimension: DOM.IDimension) {
		const elementSizeObserver = getResizesObserver(this.innerContainer, dimension, () => {
			if (this.outputContainer && document.body.contains(this.outputContainer)) {
				const height = this.innerContainer.offsetHeight;

				if (dimension.height === height) {
					return;
				}

				const currIndex = this.viewCell.outputsViewModels.indexOf(this.output);
				if (currIndex < 0) {
					return;
				}

				dimension = {
					width: this.viewCell.layoutInfo.editorWidth,
					height: height
				};

				this._validateFinalOutputHeight(true);
				this.viewCell.updateOutputHeight(currIndex, height, 'CellOutputElement#outputResize');
				this._relayoutCell();
			}
		});

		elementSizeObserver.startObserving();
		this._renderDisposableStore.add(elementSizeObserver);
	}

	private _divSupportAppend(element: HTMLElement | null, mimeType: string) {
		if (element) {
			return element.getAttribute('output-mime-type') === mimeType;
		}

		return false;
	}

	private async _attachToolbar(outputItemDiv: HTMLElement, notebookTextModel: NotebookTextModel, kernel: INotebookKernel | undefined, index: number, mimeTypes: readonly IOrderedMimeType[]) {
		const hasMultipleMimeTypes = mimeTypes.filter(mimeType => mimeType.isTrusted).length <= 1;
		if (index > 0 && hasMultipleMimeTypes) {
			return;
		}

		if (!this.notebookEditor.hasModel()) {
			return;
		}

		const useConsolidatedButton = this.notebookEditor.notebookOptions.getLayoutConfiguration().consolidatedOutputButton;

		outputItemDiv.style.position = 'relative';
		const mimeTypePicker = DOM.$('.cell-output-toolbar');

		outputItemDiv.appendChild(mimeTypePicker);

		const toolbar = this._renderDisposableStore.add(new ToolBar(mimeTypePicker, this.contextMenuService, {
			getKeyBinding: action => this.keybindingService.lookupKeybinding(action.id),
			renderDropdownAsChildElement: false
		}));
		toolbar.context = <INotebookCellActionContext>{
			ui: true,
			cell: this.output.cellViewModel as ICellViewModel,
			notebookEditor: this.notebookEditor,
			$mid: MarshalledId.NotebookCellActionContext
		};

		// TODO: This could probably be a real registered action, but it has to talk to this output element
		const pickAction = new Action('notebook.output.pickMimetype', nls.localize('pickMimeType', "Choose Output Mimetype"), ThemeIcon.asClassName(mimetypeIcon), undefined,
			async _context => this._pickActiveMimeTypeRenderer(notebookTextModel, kernel, this.output));
		if (index === 0 && useConsolidatedButton) {
			const menu = this._renderDisposableStore.add(this.menuService.createMenu(MenuId.NotebookOutputToolbar, this.contextKeyService));
			const updateMenuToolbar = () => {
				const primary: IAction[] = [];
				const secondary: IAction[] = [];
				const result = { primary, secondary };

				this._actionsDisposable.value = createAndFillInActionBarActions(menu, { shouldForwardArgs: true }, result, () => false);
				toolbar.setActions([], [pickAction, ...secondary]);
			};
			updateMenuToolbar();
			this._renderDisposableStore.add(menu.onDidChange(updateMenuToolbar));
		} else {
			toolbar.setActions([pickAction]);
		}
	}

	private async _pickActiveMimeTypeRenderer(notebookTextModel: NotebookTextModel, kernel: INotebookKernel | undefined, viewModel: ICellOutputViewModel) {
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

		const picker = this.quickInputService.createQuickPick();
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
			picker.onDidAccept(() => {
				resolve(picker.selectedItems.length === 1 ? (picker.selectedItems[0] as IMimeTypeRenderer) : undefined);
				picker.dispose();
			});
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
		const nextElement = this.innerContainer.nextElementSibling;
		this._renderDisposableStore.clear();
		const element = this.innerContainer;
		if (element) {
			element.parentElement?.removeChild(element);
			this.notebookEditor.removeInset(viewModel);
		}

		viewModel.pickedMimeType = mimeTypes[pick.index];
		this.viewCell.updateOutputMinHeight(this.viewCell.layoutInfo.outputTotalHeight);

		const { mimeType, rendererId } = mimeTypes[pick.index];
		this.notebookService.updateMimePreferredRenderer(mimeType, rendererId);
		this.render(nextElement as HTMLElement);
		this._validateFinalOutputHeight(false);
		this._relayoutCell();
	}

	private async _showJupyterExtension() {
		const viewlet = await this.viewletService.openViewlet(EXTENSION_VIEWLET_ID, true);
		const view = viewlet?.getViewPaneContainer() as IExtensionsViewPaneContainer | undefined;
		view?.search(`@id:${JUPYTER_EXTENSION_ID}`);
	}

	private _generateRendererInfo(renderId: string | undefined): string {
		if (renderId === undefined || renderId === BUILTIN_RENDERER_ID) {
			return nls.localize('builtinRenderInfo', "built-in");
		}

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
			this.viewCell.updateOutputMinHeight(0);
			this.viewCell.layoutChange({ outputHeight: true }, 'CellOutputElement#_validateFinalOutputHeight_sync');
		} else {
			this._outputHeightTimer = setTimeout(() => {
				this.viewCell.updateOutputMinHeight(0);
				this.viewCell.layoutChange({ outputHeight: true }, 'CellOutputElement#_validateFinalOutputHeight_async_1000');
			}, 1000);
		}
	}

	private _relayoutCell() {
		this.notebookEditor.layoutNotebookCell(this.viewCell, this.viewCell.layoutInfo.totalHeight);
	}

	override dispose() {
		this.viewCell.updateOutputMinHeight(0);

		if (this._outputHeightTimer) {
			clearTimeout(this._outputHeightTimer);
		}

		if (this.renderResult && this.renderResult.type === RenderOutputType.Mainframe) {
			this.renderResult.disposable?.dispose();
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

export class CellOutputContainer extends Disposable {
	private _outputEntries: OutputEntryViewHandler[] = [];

	get renderedOutputEntries() {
		return this._outputEntries;
	}

	constructor(
		private notebookEditor: INotebookEditor,
		private viewCell: CodeCellViewModel,
		private readonly templateData: CodeCellRenderTemplate,
		private options: { limit: number; },
		@IOpenerService private readonly openerService: IOpenerService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {
		super();

		this._register(viewCell.onDidChangeOutputs(splice => {
			this._updateOutputs(splice);
		}));

		this._register(viewCell.onDidChangeLayout(() => {
			this._outputEntries.forEach(entry => {
				const index = viewCell.outputsViewModels.indexOf(entry.model);
				if (index >= 0) {
					const top = this.viewCell.getOutputOffsetInContainer(index);
					entry.element.updateDOMTop(top);
				}
			});
		}));
	}

	render(editorHeight: number) {
		if (this.viewCell.outputsViewModels.length > 0) {
			if (this.viewCell.layoutInfo.totalHeight !== 0 && this.viewCell.layoutInfo.editorHeight > editorHeight) {
				this.viewCell.updateOutputMinHeight(this.viewCell.layoutInfo.outputTotalHeight);
				this._relayoutCell();
			}

			DOM.show(this.templateData.outputContainer);
			for (let index = 0; index < Math.min(this.options.limit, this.viewCell.outputsViewModels.length); index++) {
				const currOutput = this.viewCell.outputsViewModels[index];
				const entry = this.instantiationService.createInstance(CellOutputElement, this.notebookEditor, this.viewCell, this.templateData.outputContainer, currOutput);
				this._outputEntries.push(new OutputEntryViewHandler(currOutput, entry));
				entry.render();
			}

			this.viewCell.editorHeight = editorHeight;
			if (this.viewCell.outputsViewModels.length > this.options.limit) {
				DOM.show(this.templateData.outputShowMoreContainer);
				this.viewCell.updateOutputShowMoreContainerHeight(46);
			}

			this._relayoutCell();
			this._validateFinalOutputHeight(false);
		} else {
			// noop
			this.viewCell.editorHeight = editorHeight;
			this._relayoutCell();
			DOM.hide(this.templateData.outputContainer);
		}

		this.templateData.outputShowMoreContainer.innerText = '';
		if (this.viewCell.outputsViewModels.length > this.options.limit) {
			this.templateData.outputShowMoreContainer.appendChild(this._generateShowMoreElement(this.templateData.disposables));
		} else {
			DOM.hide(this.templateData.outputShowMoreContainer);
			this.viewCell.updateOutputShowMoreContainerHeight(0);
		}
	}

	viewUpdateShowOutputs(): void {
		for (let index = 0; index < this._outputEntries.length; index++) {
			const viewHandler = this._outputEntries[index];
			const outputEntry = viewHandler.element;
			if (outputEntry.renderResult) {
				if (outputEntry.renderResult.type !== RenderOutputType.Mainframe) {
					this.notebookEditor.createOutput(this.viewCell, outputEntry.renderResult as IInsetRenderOutput, this.viewCell.getOutputOffset(index));
				} else {
					this.viewCell.updateOutputHeight(index, outputEntry.domOffsetHeight, 'CellOutputContainer#viewUpdateShowOutputs');
				}
			} else {
				outputEntry.render();
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

		if (synchronous) {
			this.viewCell.updateOutputMinHeight(0);
			this.viewCell.layoutChange({ outputHeight: true }, 'CellOutputContainer#_validateFinalOutputHeight_sync');
		} else {
			this._outputHeightTimer = setTimeout(() => {
				this.viewCell.updateOutputMinHeight(0);
				this.viewCell.layoutChange({ outputHeight: true }, 'CellOutputContainer#_validateFinalOutputHeight_async_1000');
			}, 1000);
		}
	}

	private _updateOutputs(splice: NotebookCellOutputsSplice) {
		const previousOutputHeight = this.viewCell.layoutInfo.outputTotalHeight;

		// for cell output update, we make sure the cell does not shrink before the new outputs are rendered.
		this.viewCell.updateOutputMinHeight(previousOutputHeight);

		if (this.viewCell.outputsViewModels.length) {
			DOM.show(this.templateData.outputContainer);
		} else {
			DOM.hide(this.templateData.outputContainer);
		}

		this.viewCell.spliceOutputHeights(splice.start, splice.deleteCount, splice.newOutputs.map(_ => 0));
		this._renderNow(splice);
	}

	private _renderNow(splice: NotebookCellOutputsSplice) {
		if (splice.start >= this.options.limit) {
			// splice items out of limit
			return;
		}

		const firstGroupEntries = this._outputEntries.slice(0, splice.start);
		const deletedEntries = this._outputEntries.slice(splice.start, splice.start + splice.deleteCount);
		const secondGroupEntries = this._outputEntries.slice(splice.start + splice.deleteCount);
		let newlyInserted = this.viewCell.outputsViewModels.slice(splice.start, splice.start + splice.newOutputs.length);

		let outputHasDynamicHeight = false;

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
					return new OutputEntryViewHandler(insert, this.instantiationService.createInstance(CellOutputElement, this.notebookEditor, this.viewCell, this.templateData.outputContainer, insert));
				});

				this._outputEntries = [...firstGroupEntries, ...newlyInsertedEntries];

				// render newly inserted outputs
				for (let i = firstGroupEntries.length; i < this._outputEntries.length; i++) {
					const renderResult = this._outputEntries[i].element.render();
					if (renderResult) {
						outputHasDynamicHeight = outputHasDynamicHeight || !renderResult.initRenderIsSynchronous;
					}
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
				let reRenderRightBoundary = firstGroupEntries.length + newlyInserted.length;

				for (let j = 0; j < secondGroupEntries.length; j++) {
					const entry = secondGroupEntries[j];
					if (!entry.element.useDedicatedDOM) {
						entry.element.detach();
						entry.element.dispose();
						secondGroupEntries[j] = new OutputEntryViewHandler(entry.model, this.instantiationService.createInstance(CellOutputElement, this.notebookEditor, this.viewCell, this.templateData.outputContainer, entry.model));
						reRenderRightBoundary++;
					} else {
						break;
					}
				}

				const newlyInsertedEntries = newlyInserted.map(insert => {
					return new OutputEntryViewHandler(insert, this.instantiationService.createInstance(CellOutputElement, this.notebookEditor, this.viewCell, this.templateData.outputContainer, insert));
				});

				this._outputEntries = [...firstGroupEntries, ...newlyInsertedEntries, ...secondGroupEntries.slice(0, this.options.limit - firstGroupEntries.length - newlyInserted.length)];

				for (let i = firstGroupEntries.length; i < reRenderRightBoundary; i++) {
					const previousSibling = i - 1 >= 0 && this._outputEntries[i - 1] && this._outputEntries[i - 1].element.innerContainer.parentElement !== null ? this._outputEntries[i - 1].element.innerContainer : undefined;
					const renderResult = this._outputEntries[i].element.render(previousSibling);
					if (renderResult) {
						outputHasDynamicHeight = outputHasDynamicHeight || !renderResult.initRenderIsSynchronous;
					}
				}
			}
		} else {
			// after splice, it doesn't exceed
			deletedEntries.forEach(entry => {
				entry.element.detach();
				entry.element.dispose();
			});

			let reRenderRightBoundary = firstGroupEntries.length + newlyInserted.length;

			for (let j = 0; j < secondGroupEntries.length; j++) {
				const entry = secondGroupEntries[j];
				if (!entry.element.useDedicatedDOM) {
					entry.element.detach();
					entry.element.dispose();
					secondGroupEntries[j] = new OutputEntryViewHandler(entry.model, this.instantiationService.createInstance(CellOutputElement, this.notebookEditor, this.viewCell, this.templateData.outputContainer, entry.model));
					reRenderRightBoundary++;
				} else {
					break;
				}
			}

			const newlyInsertedEntries = newlyInserted.map(insert => {
				return new OutputEntryViewHandler(insert, this.instantiationService.createInstance(CellOutputElement, this.notebookEditor, this.viewCell, this.templateData.outputContainer, insert));
			});

			let outputsNewlyAvailable: OutputEntryViewHandler[] = [];

			if (firstGroupEntries.length + newlyInsertedEntries.length + secondGroupEntries.length < this.viewCell.outputsViewModels.length) {
				const last = Math.min(this.options.limit, this.viewCell.outputsViewModels.length);
				outputsNewlyAvailable = this.viewCell.outputsViewModels.slice(firstGroupEntries.length + newlyInsertedEntries.length + secondGroupEntries.length, last).map(output => {
					return new OutputEntryViewHandler(output, this.instantiationService.createInstance(CellOutputElement, this.notebookEditor, this.viewCell, this.templateData.outputContainer, output));
				});
			}

			this._outputEntries = [...firstGroupEntries, ...newlyInsertedEntries, ...secondGroupEntries, ...outputsNewlyAvailable];

			// if (firstGroupEntries.length + newlyInserted.length === this._outputEntries.length) {
			// 	// inserted at the very end
			// 	for (let i = firstGroupEntries.length; i < this._outputEntries.length; i++) {
			// 		const renderResult = this._outputEntries[i].entry.render();
			// 		if (renderResult) {
			// 			outputHasDynamicHeight = outputHasDynamicHeight || !renderResult.initRenderIsSynchronous;
			// 		}
			// 	}
			// } else {
			for (let i = firstGroupEntries.length; i < reRenderRightBoundary; i++) {
				const previousSibling = i - 1 >= 0 && this._outputEntries[i - 1] && this._outputEntries[i - 1].element.innerContainer.parentElement !== null ? this._outputEntries[i - 1].element.innerContainer : undefined;
				const renderResult = this._outputEntries[i].element.render(previousSibling);
				if (renderResult) {
					outputHasDynamicHeight = outputHasDynamicHeight || !renderResult.initRenderIsSynchronous;
				}
			}

			for (let i = 0; i < outputsNewlyAvailable.length; i++) {
				const renderResult = this._outputEntries[firstGroupEntries.length + newlyInserted.length + secondGroupEntries.length + i].element.render();
				if (renderResult) {
					outputHasDynamicHeight = outputHasDynamicHeight || !renderResult.initRenderIsSynchronous;
				}
			}
			// }
		}

		if (this.viewCell.outputsViewModels.length > this.options.limit) {
			DOM.show(this.templateData.outputShowMoreContainer);
			if (!this.templateData.outputShowMoreContainer.hasChildNodes()) {
				this.templateData.outputShowMoreContainer.appendChild(this._generateShowMoreElement(this.templateData.disposables));
			}
			this.viewCell.updateOutputShowMoreContainerHeight(46);
		} else {
			DOM.hide(this.templateData.outputShowMoreContainer);
		}

		const editorHeight = this.templateData.editor.getContentHeight();
		this.viewCell.editorHeight = editorHeight;

		this._relayoutCell();
		// if it's clearing all outputs, or outputs are all rendered synchronously
		// shrink immediately as the final output height will be zero.
		this._validateFinalOutputHeight(!outputHasDynamicHeight || this.viewCell.outputsViewModels.length === 0);
	}

	private _generateShowMoreElement(disposables: DisposableStore): HTMLElement {
		const md: IMarkdownString = {
			value: `There are more than ${this.options.limit} outputs, [show more (open the raw output data in a text editor) ...](command:workbench.action.openLargeOutput)`,
			isTrusted: true,
			supportThemeIcons: true
		};

		const element = renderMarkdown(md, {
			actionHandler: {
				callback: (content) => {
					if (content === 'command:workbench.action.openLargeOutput') {
						this.openerService.open(CellUri.generateCellUri(this.notebookEditor.viewModel!.uri, this.viewCell.handle, Schemas.vscodeNotebookCellOutput));
					}

					return;
				},
				disposables
			}
		});

		element.classList.add('output-show-more');
		return element;
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
