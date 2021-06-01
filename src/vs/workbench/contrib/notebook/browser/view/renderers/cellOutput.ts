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
import { INotebookCellActionContext } from 'vs/workbench/contrib/notebook/browser/contrib/coreActions';
import { CodeCellRenderTemplate, ICellOutputViewModel, ICellViewModel, IInsetRenderOutput, INotebookEditor, IRenderOutput, RenderOutputType } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import { mimetypeIcon } from 'vs/workbench/contrib/notebook/browser/notebookIcons';
import { getResizesObserver } from 'vs/workbench/contrib/notebook/browser/view/renderers/cellWidgets';
import { CodeCellViewModel } from 'vs/workbench/contrib/notebook/browser/viewModel/codeCellViewModel';
import { NotebookTextModel } from 'vs/workbench/contrib/notebook/common/model/notebookTextModel';
import { BUILTIN_RENDERER_ID, CellUri, INotebookKernel, IOrderedMimeType, NotebookCellOutputsSplice } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { INotebookService } from 'vs/workbench/contrib/notebook/common/notebookService';

const OUTPUT_COUNT_LIMIT = 500;

interface IMimeTypeRenderer extends IQuickPickItem {
	index: number;
}

interface IRenderResult {
	initRenderIsSynchronous: boolean;
}

export class CellOutputElement extends Disposable {
	private readonly _renderDisposableStore = this._register(new DisposableStore());
	private readonly _actionsDisposable = this._register(new MutableDisposable());

	domNode!: HTMLElement;
	renderResult?: IRenderOutput;

	public useDedicatedDOM: boolean = true;

	get domOffsetHeight() {
		if (this.useDedicatedDOM) {
			return this.domNode.offsetHeight;
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
	) {
		super();

		this.contextKeyService = this._register(parentContextKeyService.createScoped(this.outputContainer));

		this._register(this.output.model.onDidChangeData(() => {
			this.updateOutputRendering();
		}));
	}

	detach() {
		if (this.domNode) {
			this.domNode.parentElement?.removeChild(this.domNode);
		}
	}

	updateDOMTop(top: number) {
		if (this.useDedicatedDOM) {
			if (this.domNode) {
				this.domNode.style.top = `${top}px`;
			}
		}
	}

	updateOutputRendering() {
		if (!this.domNode) {
			return;
		}

		// user chooses another mimetype
		const index = this.viewCell.outputsViewModels.indexOf(this.output);
		const nextElement = this.domNode.nextElementSibling;
		this._renderDisposableStore.clear();
		const element = this.domNode;
		if (element) {
			element.parentElement?.removeChild(element);
			this.notebookEditor.removeInset(this.output);
		}

		// this.output.pickedMimeType = pick;
		this.render(index, nextElement as HTMLElement);
		this.relayoutCell();
	}

	render(index: number, beforeElement?: HTMLElement): IRenderResult | undefined {
		if (this.viewCell.metadata.outputCollapsed || !this.notebookEditor.hasModel()) {
			return undefined;
		}

		const notebookTextModel = this.notebookEditor.viewModel.notebookDocument;

		const [mimeTypes, pick] = this.output.resolveMimeTypes(notebookTextModel, this.notebookEditor.activeKernel?.preloadProvides);

		if (!mimeTypes.find(mimeType => mimeType.isTrusted) || mimeTypes.length === 0) {
			this.viewCell.updateOutputHeight(index, 0, 'CellOutputElement#noMimeType');
			return undefined;
		}

		const pickedMimeTypeRenderer = mimeTypes[pick];
		// Reuse output item div
		this.useDedicatedDOM = !(!beforeElement && this.output.supportAppend() && this.previousDivSupportAppend(pickedMimeTypeRenderer.mimeType));
		this.domNode = this.useDedicatedDOM ? DOM.$('.output-inner-container') : this.outputContainer.lastChild as HTMLElement;
		this.domNode.setAttribute('output-mime-type', pickedMimeTypeRenderer.mimeType);

		this.attachToolbar(this.domNode, notebookTextModel, this.notebookEditor.activeKernel, index, mimeTypes);

		const notebookUri = CellUri.parse(this.viewCell.uri)?.notebook;
		if (!notebookUri) {
			return undefined;
		}

		if (pickedMimeTypeRenderer.rendererId !== BUILTIN_RENDERER_ID) {
			const renderer = this.notebookService.getRendererInfo(pickedMimeTypeRenderer.rendererId);
			this.renderResult = renderer
				? { type: RenderOutputType.Extension, renderer, source: this.output, mimeType: pickedMimeTypeRenderer.mimeType }
				: this.notebookEditor.getOutputRenderer().render(this.output, this.domNode, pickedMimeTypeRenderer.mimeType, notebookUri);
		} else {
			this.renderResult = this.notebookEditor.getOutputRenderer().render(this.output, this.domNode, pickedMimeTypeRenderer.mimeType, notebookUri);
		}

		this.output.pickedMimeType = pickedMimeTypeRenderer;

		if (!this.renderResult) {
			this.viewCell.updateOutputHeight(index, 0, 'CellOutputElement#renderResultUndefined');
			return undefined;
		}

		if (beforeElement) {
			this.outputContainer.insertBefore(this.domNode, beforeElement);
		} else if (this.useDedicatedDOM) {
			this.outputContainer.appendChild(this.domNode);
		}

		if (this.renderResult.type !== RenderOutputType.Mainframe) {
			this.notebookEditor.createOutput(this.viewCell, this.renderResult, this.viewCell.getOutputOffset(index));
			this.domNode.classList.add('background');
		} else {
			this.domNode.classList.add('foreground', 'output-element');
			this.domNode.style.position = 'absolute';
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
		const offsetHeight = this.renderResult?.initHeight !== undefined ? this.renderResult?.initHeight : Math.ceil(this.domNode.offsetHeight);
		const dimension = {
			width: this.viewCell.layoutInfo.editorWidth,
			height: offsetHeight
		};
		this.bindResizeListener(dimension);
		this.viewCell.updateOutputHeight(index, offsetHeight, 'CellOutputElement#renderResultInitHeight');
		const top = this.viewCell.getOutputOffsetInContainer(index);
		this.domNode.style.top = `${top}px`;
		return { initRenderIsSynchronous: true };
	}

	private bindResizeListener(dimension: DOM.IDimension) {
		const elementSizeObserver = getResizesObserver(this.domNode, dimension, () => {
			if (this.outputContainer && document.body.contains(this.outputContainer)) {
				const height = this.domNode.offsetHeight;

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
				this.relayoutCell();
			}
		});

		elementSizeObserver.startObserving();
		this._renderDisposableStore.add(elementSizeObserver);
	}

	private previousDivSupportAppend(mimeType: string) {
		const lastChild = this.outputContainer.lastChild as HTMLElement | null;

		if (lastChild) {
			return lastChild.getAttribute('output-mime-type') === mimeType;
		}

		return false;
	}

	private async attachToolbar(outputItemDiv: HTMLElement, notebookTextModel: NotebookTextModel, kernel: INotebookKernel | undefined, index: number, mimeTypes: readonly IOrderedMimeType[]) {
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
			renderDropdownAsChildElement: true
		}));
		toolbar.context = <INotebookCellActionContext>{
			ui: true,
			cell: this.output.cellViewModel as ICellViewModel,
			notebookEditor: this.notebookEditor,
			$mid: 12
		};

		// TODO: This could probably be a real registered action, but it has to talk to this output element
		const pickAction = new Action('notebook.output.pickMimetype', nls.localize('pickMimeType', "Choose a different output mimetype"), ThemeIcon.asClassName(mimetypeIcon), undefined,
			async _context => this.pickActiveMimeTypeRenderer(notebookTextModel, kernel, this.output));
		if (index === 0 && useConsolidatedButton) {
			const menu = this.menuService.createMenu(MenuId.NotebookOutputToolbar, this.contextKeyService);
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

	private async pickActiveMimeTypeRenderer(notebookTextModel: NotebookTextModel, kernel: INotebookKernel | undefined, viewModel: ICellOutputViewModel) {
		const [mimeTypes, currIndex] = viewModel.resolveMimeTypes(notebookTextModel, kernel?.preloadProvides);

		let items: IMimeTypeRenderer[] = [];
		mimeTypes.forEach((mimeType, index) => {
			if (mimeType.isTrusted) {
				items.push({
					label: mimeType.mimeType,
					id: mimeType.mimeType,
					index: index,
					picked: index === currIndex,
					detail: this.generateRendererInfo(mimeType.rendererId),
					description: index === currIndex ? nls.localize('curruentActiveMimeType', "Currently Active") : undefined
				});
			}
		});

		const picker = this.quickInputService.createQuickPick();
		picker.items = items;
		picker.activeItems = items.filter(item => !!item.picked);
		picker.placeholder = items.length !== mimeTypes.length
			? nls.localize('promptChooseMimeTypeInSecure.placeHolder', "Select mimetype to render for current output. Rich mimetypes are available only when the notebook is trusted")
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

		// user chooses another mimetype
		const index = this.viewCell.outputsViewModels.indexOf(viewModel);
		const nextElement = this.domNode.nextElementSibling;
		this._renderDisposableStore.clear();
		const element = this.domNode;
		if (element) {
			element.parentElement?.removeChild(element);
			this.notebookEditor.removeInset(viewModel);
		}

		viewModel.pickedMimeType = mimeTypes[pick.index];
		this.viewCell.updateOutputMinHeight(this.viewCell.layoutInfo.outputTotalHeight);

		const { mimeType, rendererId } = mimeTypes[pick.index];
		this.notebookService.updateMimePreferredRenderer(mimeType, rendererId);
		this.render(index, nextElement as HTMLElement);
		this._validateFinalOutputHeight(false);
		this.relayoutCell();
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

	private relayoutCell() {
		this.notebookEditor.layoutNotebookCell(this.viewCell, this.viewCell.layoutInfo.totalHeight);
	}

	override dispose() {
		this.viewCell.updateOutputMinHeight(0);

		if (this._outputHeightTimer) {
			clearTimeout(this._outputHeightTimer);
		}

		super.dispose();
	}
}

export class CellOutputContainer extends Disposable {
	private outputEntries = new Map<ICellOutputViewModel, CellOutputElement>();

	constructor(
		private notebookEditor: INotebookEditor,
		private viewCell: CodeCellViewModel,
		private templateData: CodeCellRenderTemplate,
		@IOpenerService private readonly openerService: IOpenerService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
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
			if (this.viewCell.layoutInfo.totalHeight !== 0 && this.viewCell.layoutInfo.editorHeight > editorHeight) {
				this.viewCell.updateOutputMinHeight(this.viewCell.layoutInfo.outputTotalHeight);
				this._relayoutCell();
			}

			DOM.show(this.templateData.outputContainer);
			const outputsToRender = this._calcuateOutputsToRender();
			for (let index = 0; index < outputsToRender.length; index++) {
				const currOutput = this.viewCell.outputsViewModels[index];

				// always add to the end
				this._renderOutput(currOutput, index, undefined);
			}

			this.viewCell.editorHeight = editorHeight;
			if (this.viewCell.outputsViewModels.length > OUTPUT_COUNT_LIMIT) {
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
		if (this.viewCell.outputsViewModels.length > OUTPUT_COUNT_LIMIT) {
			this.templateData.outputShowMoreContainer.appendChild(this._generateShowMoreElement());
		} else {
			DOM.hide(this.templateData.outputShowMoreContainer);
			this.viewCell.updateOutputShowMoreContainerHeight(0);
		}
	}

	viewUpdateShowOutputs(): void {
		for (let index = 0; index < this.viewCell.outputsViewModels.length; index++) {
			const currOutput = this.viewCell.outputsViewModels[index];

			const renderedOutput = this.outputEntries.get(currOutput);
			if (renderedOutput && renderedOutput.renderResult) {
				if (renderedOutput.renderResult.type !== RenderOutputType.Mainframe) {
					this.notebookEditor.createOutput(this.viewCell, renderedOutput.renderResult as IInsetRenderOutput, this.viewCell.getOutputOffset(index));
				} else {
					this.viewCell.updateOutputHeight(index, renderedOutput.domOffsetHeight, 'CellOutputContainer#viewUpdateShowOutputs');
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

	private _calcuateOutputsToRender(): ICellOutputViewModel[] {
		return this.viewCell.outputsViewModels.slice(0, Math.min(OUTPUT_COUNT_LIMIT, this.viewCell.outputsViewModels.length));
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

	private _updateOutputs(splices: NotebookCellOutputsSplice[]) {
		if (!splices.length) {
			return;
		}

		const previousOutputHeight = this.viewCell.layoutInfo.outputTotalHeight;

		// for cell output update, we make sure the cell does not shrink before the new outputs are rendered.
		this.viewCell.updateOutputMinHeight(previousOutputHeight);

		if (this.viewCell.outputsViewModels.length) {
			DOM.show(this.templateData.outputContainer);
		} else {
			DOM.hide(this.templateData.outputContainer);
		}

		const reversedSplices = splices.reverse();

		reversedSplices.forEach(splice => {
			this.viewCell.spliceOutputHeights(splice[0], splice[1], splice[2].map(_ => 0));
		});

		const removedOutputs: ICellOutputViewModel[] = [];

		this.outputEntries.forEach((value, key) => {
			if (this.viewCell.outputsViewModels.indexOf(key) < 0) {
				removedOutputs.push(key);
				// remove element from DOM
				value.detach();
				this.notebookEditor.removeInset(key);
			}
		});

		removedOutputs.forEach(key => {
			this.outputEntries.get(key)?.dispose();
			this.outputEntries.delete(key);
		});

		let prevElement: HTMLElement | undefined = undefined;
		const outputsToRender = this._calcuateOutputsToRender();

		let outputHasDynamicHeight = false;
		outputsToRender.reverse().forEach(output => {
			if (this.outputEntries.has(output)) {
				// already exist
				prevElement = this.outputEntries.get(output)!.domNode;
				return;
			}

			// newly added element
			const currIndex = this.viewCell.outputsViewModels.indexOf(output);
			const renderResult = this._renderOutput(output, currIndex, prevElement);
			if (renderResult) {
				outputHasDynamicHeight = outputHasDynamicHeight || !renderResult.initRenderIsSynchronous;
			}

			prevElement = this.outputEntries.get(output)?.domNode;
		});

		if (this.viewCell.outputsViewModels.length > OUTPUT_COUNT_LIMIT) {
			DOM.show(this.templateData.outputShowMoreContainer);
			if (!this.templateData.outputShowMoreContainer.hasChildNodes()) {
				this.templateData.outputShowMoreContainer.appendChild(this._generateShowMoreElement());
			}
			this.viewCell.updateOutputShowMoreContainerHeight(46);
		} else {
			DOM.hide(this.templateData.outputShowMoreContainer);
		}

		const editorHeight = this.templateData.editor.getContentHeight();
		this.viewCell.editorHeight = editorHeight;

		this._relayoutCell();
		// if it's clearing all outputs
		// or outputs are all rendered synchronously
		// shrink immediately as the final output height will be zero.
		this._validateFinalOutputHeight(!outputHasDynamicHeight || this.viewCell.outputsViewModels.length === 0);
	}

	private _renderOutput(currOutput: ICellOutputViewModel, index: number, beforeElement?: HTMLElement) {
		if (!this.outputEntries.has(currOutput)) {
			this.outputEntries.set(currOutput, this.instantiationService.createInstance(CellOutputElement, this.notebookEditor, this.viewCell, this.templateData.outputContainer, currOutput));
		}

		return this.outputEntries.get(currOutput)!.render(index, beforeElement);
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
						this.openerService.open(CellUri.generateCellUri(this.notebookEditor.viewModel!.uri, this.viewCell.handle, Schemas.vscodeNotebookCellOutput));
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
		this.notebookEditor.layoutNotebookCell(this.viewCell, this.viewCell.layoutInfo.totalHeight);
	}

	override dispose() {
		this.viewCell.updateOutputMinHeight(0);

		if (this._outputHeightTimer) {
			clearTimeout(this._outputHeightTimer);
		}

		this.outputEntries.forEach((value) => {
			value.dispose();
		});

		super.dispose();
	}
}
