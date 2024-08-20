/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore, IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { NotebookDiffEditorInput } from 'vs/workbench/contrib/notebook/common/notebookDiffEditorInput';
import { NotebookDiffViewModel } from 'vs/workbench/contrib/notebook/browser/diff/notebookDiffViewModel';
import { INotebookEditorWorkerService } from 'vs/workbench/contrib/notebook/common/services/notebookWorkerService';
import { NotebookDiffEditorEventDispatcher } from 'vs/workbench/contrib/notebook/browser/diff/eventDispatcher';
import { CancellationTokenSource } from 'vs/base/common/cancellation';
import { getFormattedOutputJSON, SideBySideDiffElementViewModel, type DiffElementCellViewModelBase } from 'vs/workbench/contrib/notebook/browser/diff/diffElementViewModel';
import { IMultiDiffSourceResolverService, MultiDiffEditorItem, type IMultiDiffSourceResolver, type IResolvedMultiDiffSource } from 'vs/workbench/contrib/multiDiffEditor/browser/multiDiffSourceResolverService';
// import { ICodeEditorService } from 'vs/editor/browser/services/codeEditorService';
// import { IWebviewService } from 'vs/workbench/contrib/webview/browser/webview';
import { ResourceMap } from 'vs/base/common/map';
import { Schemas } from 'vs/base/common/network';
import type { URI } from 'vs/base/common/uri';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { createDecorator, IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import type { IResourceDiffEditorInput } from 'vs/workbench/common/editor';
import { CellUri, type IResolvedNotebookEditorModel } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { INotebookService } from 'vs/workbench/contrib/notebook/common/notebookService';
import { Event } from 'vs/base/common/event';
import { ILanguageService } from 'vs/editor/common/languages/language';
import { IModelService } from 'vs/editor/common/services/model';
import { INotebookEditorModelResolverService } from 'vs/workbench/contrib/notebook/common/notebookEditorModelResolverService';
import type { ITextModel } from 'vs/editor/common/model';
import { ITextModelService } from 'vs/editor/common/services/resolverService';
import { ILabelService } from 'vs/platform/label/common/label';
import { ICodeEditorService } from 'vs/editor/browser/services/codeEditorService';
// import { IWebviewService } from 'vs/workbench/contrib/webview/browser/webview';
import type { IActiveCodeEditor, ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { EditorViewZone } from 'vs/workbench/contrib/notebook/browser/diff/notebookDiffOutputWebView';
import type { BackLayerWebView } from 'vs/workbench/contrib/notebook/browser/view/renderers/backLayerWebView';
import { RenderOutputType, type ICellOutputViewModel, type IGenericCellViewModel, type IInsetRenderOutput, type INotebookEditorCreationOptions } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import { BackLayerWebViewPerCell } from 'vs/workbench/contrib/notebook/browser/view/renderers/backLayerWebViewPerCell';
import { getDefaultNotebookCreationOptions } from 'vs/workbench/contrib/notebook/browser/notebookEditorWidget';
import type { IMouseWheelEvent } from 'vs/base/browser/mouseEvent';
import { NotebookOptions } from 'vs/workbench/contrib/notebook/browser/notebookOptions';
import { mainWindow } from 'vs/base/browser/window';
import type { FontInfo } from 'vs/editor/common/config/fontInfo';
import { INotebookRendererMessagingService } from 'vs/workbench/contrib/notebook/common/notebookRendererMessagingService';
import { generateUuid } from 'vs/base/common/uuid';
import { CellOutputViewModel } from 'vs/workbench/contrib/notebook/browser/viewModel/cellOutputViewModel';
import { ThemeIcon } from 'vs/base/common/themables';
import { $ } from 'vs/base/browser/dom';
import * as DOM from 'vs/base/browser/dom';
import * as nls from 'vs/nls';
import { mimetypeIcon } from 'vs/workbench/contrib/notebook/browser/notebookIcons';
import { DiffSide, type IDiffCellInfo } from 'vs/workbench/contrib/notebook/browser/diff/notebookDiffEditorBrowser';
import { IEditorGroupsService, type IEditorGroup } from 'vs/workbench/services/editor/common/editorGroupsService';
import { MultiDiffEditor } from 'vs/workbench/contrib/multiDiffEditor/browser/multiDiffEditor';
import type { DiffNestedCellViewModel } from 'vs/workbench/contrib/notebook/browser/diff/diffNestedCellViewModel';

export const ID_NOTEBOOK_MULTI_DIFF_SOURCE_RESOLVER_SERVICE = 'notebookDiffSourceResolverService';
export const INotebookDiffSourceResolverService = createDecorator<INotebookDiffSourceResolverService>(ID_NOTEBOOK_MULTI_DIFF_SOURCE_RESOLVER_SERVICE);

export interface INotebookDiffSourceResolverService {
	readonly _serviceBrand: undefined;
	add(uri: URI, diffEditorInput: IResourceDiffEditorInput & { id: string }): IDisposable;
}


export const NotebookMultiDiffEditorScheme = 'multi-cell-notebook-diff-editor';
export class NotebookDiffSourceResolverService extends Disposable implements IMultiDiffSourceResolver, INotebookDiffSourceResolverService {
	declare readonly _serviceBrand: undefined;
	constructor(
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@INotebookEditorWorkerService private readonly notebookEditorWorkerService: INotebookEditorWorkerService,
		@INotebookService private readonly notebookService: INotebookService,
		@IMultiDiffSourceResolverService multiDiffSourceResolverService: IMultiDiffSourceResolverService,
		@ICodeEditorService private readonly _editorService: ICodeEditorService,
		// @IWebviewService private readonly _webviewService: IWebviewService,
		@ILanguageService private readonly languageService: ILanguageService,
		@IModelService private readonly modelService: IModelService,
		@INotebookEditorModelResolverService private readonly _notebookModelResolverService: INotebookEditorModelResolverService,
		@ITextModelService textModelService: ITextModelService,
		@ILabelService private readonly _labelService: ILabelService,
		@INotebookRendererMessagingService private readonly notebookRendererMessaging: INotebookRendererMessagingService,
		@IEditorGroupsService private readonly _editorGroupService: IEditorGroupsService,
	) {
		super();
		this._register(multiDiffSourceResolverService.registerResolver(this));
		this._register(textModelService.registerTextModelContentProvider(Schemas.vscodeNotebookCellOutputDiff, {
			provideTextContent: this.provideOutputTextContent.bind(this)
		}));
		this._register(this._labelService.registerFormatter({
			scheme: Schemas.vscodeNotebookCellMetadataDiff,
			formatting: {
				label: 'Metadata',
				separator: '/'
			}
		}));

		this._register(this._labelService.registerFormatter({
			scheme: Schemas.vscodeNotebookCellOutputDiff,
			formatting: {
				label: 'Output',
				separator: '/'
			}
		}));

	}

	private readonly mappedInputs = new ResourceMap<IResourceDiffEditorInput & { id: string } & { disposables: DisposableStore }>();
	add(uri: URI, diffEditorInput: IResourceDiffEditorInput & { id: string }): IDisposable {
		const disposables = new DisposableStore();
		this.mappedInputs.set(uri, { ...diffEditorInput, disposables });
		return toDisposable(() => { this.mappedInputs.delete(uri); disposables.dispose(); });
	}

	canHandleUri(uri: URI): boolean {
		return this.mappedInputs.has(uri);
	}
	async resolveDiffSource(uri: URI): Promise<IResolvedMultiDiffSource> {
		const data = this.mappedInputs.get(uri);
		if (!data) {
			throw new Error('No data found');
		}
		const { modified, label, description, original, id: notebookProviderInfoId, disposables } = data;
		const nbInput = disposables.add(NotebookDiffEditorInput.create(this.instantiationService, modified.resource!, label, description, original.resource!, notebookProviderInfoId));
		const model = disposables.add(await nbInput.resolve());
		const eventDispatcher = disposables.add(new NotebookDiffEditorEventDispatcher());
		const vm = disposables.add(new NotebookDiffViewModel(model, this.notebookEditorWorkerService, this.instantiationService, this._configurationService, eventDispatcher, this.notebookService, undefined, true));
		const token = disposables.add(new CancellationTokenSource()).token;
		await vm.computeDiff(token);
		const modifiedModel = model.modified;

		// let metadataUri: URI | undefined = undefined;
		const mappings = new ResourceMap<{ diffElementCellViewModel: DiffElementCellViewModelBase; cellViewModel: IGenericCellViewModel, diffNestedCellViewModel: DiffNestedCellViewModel; created?: boolean }>();
		const resources = vm.items.filter(v => v.type === 'modified').map(v => {
			const item = v as SideBySideDiffElementViewModel;
			const items = [new MultiDiffEditorItem(item.original.uri, item.modified.uri, undefined)];
			if (item.checkMetadataIfModified()) {
				const originalMetadata = CellUri.generateCellPropertyUri(original.resource!, item.original.handle, Schemas.vscodeNotebookCellMetadataDiff);
				const modifiedMetadata = CellUri.generateCellPropertyUri(modified.resource!, item.modified.handle, Schemas.vscodeNotebookCellMetadataDiff);
				items.push(new MultiDiffEditorItem(originalMetadata, modifiedMetadata, item.modified.uri));
				// metadataUri = modifiedMetadata;
			}
			if (item.checkIfOutputsModified()) {
				const originalOutput = CellUri.generateCellPropertyUri(original.resource!, item.original.handle, Schemas.vscodeNotebookCellOutputDiff);
				const modifiedOutput = CellUri.generateCellPropertyUri(modified.resource!, item.modified.handle, Schemas.vscodeNotebookCellOutputDiff);
				// // const originalModel = this.modelService.createModel(originalOutputsSource, mode, originalOutput, true);
				// // const modifiedModel = this.modelService.createModel(modifiedOutputsSource, mode, modifiedOutput, true);

				mappings.set(originalOutput, { diffElementCellViewModel: item, cellViewModel: item.getCellByUri(item.original.uri), diffNestedCellViewModel: item.original });
				mappings.set(modifiedOutput, { diffElementCellViewModel: item, cellViewModel: item.getCellByUri(item.modified.uri), diffNestedCellViewModel: item.modified },);
				items.push(new MultiDiffEditorItem(originalOutput, modifiedOutput, item.modified.uri));
			}
			return items;
		}).flat();

		// let found = false;
		const tryCreatingWebView = (e: ICodeEditor) => {
			// if (found) {
			// 	return;
			// }
			console.log(resources, e);
			// const editor = this._editorService.listCodeEditors().find(editor => editor.getModel()?.uri.scheme === Schemas.vscodeNotebookCellOutputDiff);
			// if (!editor) {
			// 	return;
			// }
			// found = true;
			const editor = e;
			if (!editor.hasModel()) {
				return;
			}
			// editor.updateOptions(({ lineHeight: 0, glyphMargin: false, fontSize: 0 }));
			// const container = editor.getContainerDomNode();
			const info = mappings.get(editor.getModel()!.uri);
			if (!info || info.created) {
				return;
			}
			editor.getDomNode().style.display = 'none';
			info.created = true;
			// mappings.get(editor.getModel()!.uri)
			// const webview = disposables.add(this._webviewService.createWebviewElement({
			// 	title: undefined,
			// 	options: {
			// 		enableFindWidget: false,
			// 	},
			// 	contentOptions: { allowScripts: true },
			// 	extension: { id: { value: 'ms-toolsai.jupyter', _lower: 'ms-toolsai.jupyter' } }
			// }));
			// const webviewZone = disposables.add(new EditorWebviewZone(editor as IActiveCodeEditor, 0, 15, webview));
			// webviewZone.webview.setHtml('<html><body><button>Hello World!</button></body></html>');


			// const item = vm.items.find(v => v.type === 'modified') as SideBySideDiffElementViewModel;
			// const cellViewModel = item.getCellByUri(item.modified.uri);
			// if (!item.modified.outputs.length) {
			// 	return;
			// }
			const item = info.diffElementCellViewModel;
			const cellViewModel = info.cellViewModel;
			if (!info.cellViewModel.outputsViewModels.length) {
				return;
			}
			const outputViewModel = info.cellViewModel.outputsViewModels[0];
			// const outputViewModel = new CellOutputViewModel(cellViewModel, output, this.notebookService);
			const multiDiffEditor = this._editorGroupService.groups.find(g => {
				if (g.activeEditorPane?.getId() === MultiDiffEditor.ID) {
					return true;
				}
				return false;
			});

			const widget = disposables.add(new OutputViewZoneWidget(editor as IActiveCodeEditor, 0, 15,
				this.instantiationService, cellViewModel, undefined, this.notebookRendererMessaging,
				modifiedModel, outputViewModel, this.notebookService,
				item, multiDiffEditor!
			));
			widget.render(0);
		};

		this._editorService.onCodeEditorAdd(e => {
			if (e.getModel()) {
				tryCreatingWebView(e);
			} else {
				e.onDidChangeModel(model => {
					console.error(model);
					tryCreatingWebView(e);
				});
			}
		});

		return {
			resources: {
				value: resources,
				onDidChange: Event.None
			}
		};
	}
	async provideOutputTextContent(resource: URI): Promise<ITextModel | null> {
		const existing = this.modelService.getModel(resource);
		if (existing) {
			return existing;
		}

		const data = CellUri.parseCellPropertyUri(resource, Schemas.vscodeNotebookCellOutputDiff);
		if (!data) {
			return null;
		}

		const ref = await this._notebookModelResolverService.resolve(data.notebook);
		const cell = ref.object.notebook.cells.find(cell => cell.handle === data.handle);

		if (!cell) {
			ref.dispose();
			return null;
		}

		// const mode = this.languageService.createById('json');
		// const model = this.modelService.createModel(getFormattedOutputJSON(cell.outputs || []), mode, resource, true);
		// const cellModelListener = Event.any(cell.onDidChangeOutputs ?? Event.None, cell.onDidChangeOutputItems ?? Event.None)(() => {
		// 	model.setValue(getFormattedOutputJSON(cell.outputs || []));
		// });

		// const once = model.onWillDispose(() => {
		// 	once.dispose();
		// 	cellModelListener.dispose();
		// 	ref.dispose();
		// });

		// return model;

		// return null;
		const mode = this.languageService.createById('json');
		const model = this.modelService.createModel('', mode, resource, true);
		const cellModelListener = Event.any(cell.onDidChangeOutputs ?? Event.None, cell.onDidChangeOutputItems ?? Event.None)(() => {
			model.setValue('');
		});

		const once = model.onWillDispose(() => {
			once.dispose();
			cellModelListener.dispose();
			ref.dispose();
		});

		return model;
	}
}

class OutputViewZoneWidget extends Disposable {
	private _domNode: HTMLElement;
	private _viewZone: EditorViewZone;
	private _webview: BackLayerWebView<IDiffCellInfo> | null = null;
	private _webviewResolvePromise: Promise<BackLayerWebView<IDiffCellInfo> | null> | null = null;
	private readonly creationOptions: INotebookEditorCreationOptions;
	private readonly options: NotebookOptions;
	private readonly _uuid = generateUuid();
	private readonly _localStore: DisposableStore = this._register(new DisposableStore());
	/**
	 * EditorId
	 */
	public getId(): string {
		return this._uuid;
	}
	get viewModel() {
		return this.modifiedModel;
	}

	get textModel() {
		return this.modifiedModel.notebook;
	}

	get isReadOnly() {
		// return this.modifiedModel.isReadonly() ?? false;
		return true;
	}
	get window() { return DOM.getWindowById(this.group.windowId, true).window; }
	constructor(
		editor: IActiveCodeEditor,
		line: number,
		height: number,
		private readonly instantiationService: IInstantiationService,
		private readonly cellViewModel: IGenericCellViewModel,
		private _fontInfo: FontInfo | undefined,
		@INotebookRendererMessagingService private readonly notebookRendererMessaging: INotebookRendererMessagingService,
		private readonly modifiedModel: IResolvedNotebookEditorModel,
		readonly output: ICellOutputViewModel,
		readonly _notebookService: INotebookService,
		readonly cellDiffViewModel: DiffElementCellViewModelBase,
		readonly group: IEditorGroup,
	) {
		super();
		this._domNode = document.createElement('div');
		// this._domNode.style.backgroundColor = 'lightgreen';
		this._domNode.style.height = '0px';
		this._domNode.style.width = '100%';
		// this._domNode.innerText = 'Hello World';
		this._viewZone = this._register(new EditorViewZone(editor, line, height));
		this._viewZone.domNode.appendChild(this._domNode);

		this.creationOptions = getDefaultNotebookCreationOptions();
		this.options = this.instantiationService.createInstance(NotebookOptions, this.creationOptions?.codeWindow ?? mainWindow, true, undefined);
	}

	override dispose() {
		this._viewZone.dispose();
		super.dispose();
	}


	async render(index: number, beforeElement?: HTMLElement) {
		const outputItemDiv = document.createElement('div');
		let result: IInsetRenderOutput | undefined = undefined;

		const [mimeTypes, pick] = this.output.resolveMimeTypes(this.textModel, undefined);
		const pickedMimeTypeRenderer = mimeTypes[pick];
		if (mimeTypes.length > 1) {
			// outputItemDiv.style.position = 'relative';
			const mimeTypePicker = $('.multi-mimetype-output');
			mimeTypePicker.classList.add(...ThemeIcon.asClassNameArray(mimetypeIcon));
			mimeTypePicker.tabIndex = 0;
			mimeTypePicker.title = nls.localize('mimeTypePicker', "Choose a different output mimetype, available mimetypes: {0}", mimeTypes.map(mimeType => mimeType.mimeType).join(', '));
			outputItemDiv.appendChild(mimeTypePicker);
			// this.resizeListener.add(addStandardDisposableListener(mimeTypePicker, 'mousedown', async e => {
			// 	if (e.leftButton) {
			// 		e.preventDefault();
			// 		e.stopPropagation();
			// 		await this.pickActiveMimeTypeRenderer(this.textModel, this.output);
			// 	}
			// }));

			// this.resizeListener.add((DOM.addDisposableListener(mimeTypePicker, DOM.EventType.KEY_DOWN, async e => {
			// 	const event = new StandardKeyboardEvent(e);
			// 	if ((event.equals(KeyCode.Enter) || event.equals(KeyCode.Space))) {
			// 		e.preventDefault();
			// 		e.stopPropagation();
			// 		await this.pickActiveMimeTypeRenderer(this.textModel, this.output);
			// 	}
			// })));
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

		// this.domNode = outputItemDiv;
		// this.renderResult = result;

		if (!result) {
			// this.viewCell.updateOutputHeight(index, 0);
			return;
		}

		// if (beforeElement) {
		// 	this._outputContainer.insertBefore(outputItemDiv, beforeElement);
		// } else {
		// 	this._outputContainer.appendChild(outputItemDiv);
		// }

		const webView = await this._resolveWebview();
		if (!webView) {
			return;
		}
		await webView.createOutput({ diffElement: this.cellDiffViewModel, cellHandle: this.cellViewModel.handle, cellId: this.cellViewModel.id, cellUri: this.cellViewModel.uri }, result, 0, 0);
		// this._notebookEditor.createOutput(
		// 	this._diffElementViewModel,
		// 	this._nestedCell,
		// 	result,
		// 	() => this.getOutputOffsetInCell(index),
		// 	this._diffElementViewModel instanceof SideBySideDiffElementViewModel
		// 		? this._diffSide
		// 		: this._diffElementViewModel.type === 'insert' ? DiffSide.Modified : DiffSide.Original
		// );
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


	private async _resolveWebview(): Promise<BackLayerWebView<IDiffCellInfo> | null> {
		if (this._webviewResolvePromise) {
			return this._webviewResolvePromise;
		}

		if (!this._webview) {
			this._ensureWebview(this.getId(), 'jupyter-notebook', this.textModel.uri);
		}

		this._webviewResolvePromise = (async () => {
			if (!this._webview) {
				throw new Error('Notebook output webview object is not created successfully.');
			}

			await this._webview.createWebview(this.creationOptions.codeWindow ?? mainWindow);
			if (!this._webview.webview) {
				throw new Error('Notebook output webview element was not created successfully.');
			}

			this._localStore.add(this._webview.webview.onDidBlur(() => {
				// this._outputFocus.set(false);
				// this._webviewFocused = false;

				// this.updateEditorFocus();
				// this.updateCellFocusMode();
			}));

			this._localStore.add(this._webview.webview.onDidFocus(() => {
				// this._outputFocus.set(true);
				// this.updateEditorFocus();
				// this._webviewFocused = true;
			}));

			this._localStore.add(this._webview.onMessage(e => {
				// this._onDidReceiveMessage.fire(e);
			}));

			return this._webview;
		})();

		return this._webviewResolvePromise;
	}
	private _ensureWebview(id: string, viewType: string, resource: URI) {
		if (this._webview) {
			return;
		}

		const that = this;

		this._webview = this.instantiationService.createInstance(BackLayerWebViewPerCell, {
			get creationOptions() { return that.creationOptions; },
			setScrollTop(scrollTop: number) {
				console.log(scrollTop);
			},
			triggerScroll(event: IMouseWheelEvent) {
				console.log(event);
			},
			getCellByInfo: (info) => {
				console.log(info);
				return that.cellViewModel;
			},
			getCellById: (id) => {
				console.log(id);
				return that.cellViewModel;
			},
			toggleNotebookCellSelection: (cell, selectFromPrevious) => {
				console.log(cell, selectFromPrevious);
			},
			focusNotebookCell: async (cell, focus, options) => {
				console.log(cell, focus, options);
			},
			focusNextNotebookCell: async (cell, focus) => {
				console.log(cell, focus);
			},
			updateOutputHeight: (cellInfo, output, height, isInit) => {
				console.log(cellInfo, output, height, isInit);
				that.updateOutputHeight(cellInfo as IDiffCellInfo, output, height, isInit);
			},
			scheduleOutputHeightAck: (cellInfo, output, height) => {
				console.log(cellInfo, output, height);
				that.scheduleOutputHeightAck(cellInfo as IDiffCellInfo, output, height);
			},
			updateMarkupCellHeight: (cellInfo, height) => {
				console.log(cellInfo, height);
			},
			setMarkupCellEditState: (cellInfo, editState) => {
				console.log(cellInfo, editState);
			},
			didStartDragMarkupCell: (cellInfo) => {
				console.log(cellInfo);
			},
			didDragMarkupCell: (cellInfo, screenY) => {
				console.log(cellInfo, screenY);
			},
			didDropMarkupCell: (cellId, event) => {
				console.log(cellId, event);
			},
			didEndDragMarkupCell: (cellId) => {
				console.log(cellId);
			},
			didResizeOutput: (cellId) => {
				console.log(cellId);
			},
			updatePerformanceMetadata: (cellId, executionId, duration, rendererId) => {
				console.log(cellId, executionId, duration, rendererId);
			},
			didFocusOutputInputChange: (inputFocused) => {
				console.log(inputFocused);

			}
		}, id, viewType, resource, {
			...this.options.computeDiffWebviewOptions(),
			fontFamily: this._generateFontFamily()
		}, this.notebookRendererMessaging.getScoped(this._uuid)) as BackLayerWebViewPerCell<IDiffCellInfo>;

		this._webview.element.style.width = '100%';

		// attach the webview container to the DOM tree first
		// this._list.attachWebview(this._webview.element);
		this._domNode.appendChild(this._webview.element);
	}
	private _generateFontFamily() {
		return this._fontInfo?.fontFamily ?? `"SF Mono", Monaco, Menlo, Consolas, "Ubuntu Mono", "Liberation Mono", "DejaVu Sans Mono", "Courier New", monospace`;
	}

	updateOutputHeight(cellInfo: IDiffCellInfo, output: ICellOutputViewModel, outputHeight: number, isInit: boolean): void {
		const diffElement = cellInfo.diffElement;
		const cell = this.cellViewModel;
		const outputIndex = cell.outputsViewModels.indexOf(output);

		// if (diffElement instanceof SideBySideDiffElementViewModel) {
		// 	const info = CellUri.parse(cellInfo.cellUri);
		// 	if (!info) {
		// 		return;
		// 	}

		// 	diffElement.updateOutputHeight(info.notebook.toString() === this._model?.original.resource.toString() ? DiffSide.Original : DiffSide.Modified, outputIndex, outputHeight);
		// } else {
		// 	diffElement.updateOutputHeight(diffElement.type === 'insert' ? DiffSide.Modified : DiffSide.Original, outputIndex, outputHeight);
		// }
		diffElement.updateOutputHeight(DiffSide.Modified, outputIndex, outputHeight);

		// if (isInit) {
		// 	this._onDidDynamicOutputRendered.fire({ cell, output });
		// }
	}

	scheduleOutputHeightAck(cellInfo: IDiffCellInfo, outputId: string, height: number) {
		// const diffElement = cellInfo.diffElement;
		// // const activeWebview = diffSide === DiffSide.Modified ? this._modifiedWebview : this._originalWebview;
		// let diffSide = DiffSide.Original;

		// if (diffElement instanceof SideBySideDiffElementViewModel) {
		// 	const info = CellUri.parse(cellInfo.cellUri);
		// 	if (!info) {
		// 		return;
		// 	}

		// 	diffSide = info.notebook.toString() === this._model?.original.resource.toString() ? DiffSide.Original : DiffSide.Modified;
		// } else {
		// 	diffSide = diffElement.type === 'insert' ? DiffSide.Modified : DiffSide.Original;
		// }

		// const webview = diffSide === DiffSide.Modified ? this._modifiedWebview : this._originalWebview;

		DOM.scheduleAtNextAnimationFrame(this.window, () => {
			this._webview!.ackHeight([{ cellId: cellInfo.cellId, outputId, height }]);
			this._viewZone.changeHeight(height);
		}, 10);
	}

}
