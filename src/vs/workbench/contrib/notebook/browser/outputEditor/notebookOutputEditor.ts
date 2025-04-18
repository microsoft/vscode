/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from '../../../../../base/browser/dom.js';
import * as nls from '../../../../../nls.js';

import { getDefaultNotebookCreationOptions } from '../notebookEditorWidget.js';
import { EditorPane } from '../../../../browser/parts/editor/editorPane.js';
import { BackLayerWebView, INotebookDelegateForWebview } from '../view/renderers/backLayerWebView.js';
import { CellEditState, ICellOutputViewModel, ICommonCellInfo, IGenericCellViewModel, IInsetRenderOutput, INotebookEditorCreationOptions, RenderOutputType } from '../notebookBrowser.js';
import { CellUri, NOTEBOOK_OUTPUT_EDITOR_ID } from '../../common/notebookCommon.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IStorageService } from '../../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { IThemeService } from '../../../../../platform/theme/common/themeService.js';
import { IEditorGroup } from '../../../../services/editor/common/editorGroupsService.js';
import { NotebookTextDiffEditor } from '../diff/notebookDiffEditor.js';
import { NotebookOptions } from '../notebookOptions.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../common/contributions.js';
import { IEditorResolverService, RegisteredEditorPriority } from '../../../../services/editor/common/editorResolverService.js';
import { INotebookEditorModelResolverService } from '../../common/notebookEditorModelResolverService.js';
import { INotebookService } from '../../common/notebookService.js';
import { URI } from '../../../../../base/common/uri.js';
import { Schemas } from '../../../../../base/common/network.js';
import { NotebookOutputEditorInput } from './notebookOutputEditorInput.js';
import { IEditorOpenContext } from '../../../../common/editor.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { IEditorOptions } from '../../../../../platform/editor/common/editor.js';
import { generateUuid } from '../../../../../base/common/uuid.js';
import { IUriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentity.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { INotebookEditorService } from '../services/notebookEditorService.js';


export class NotebookOutputEditor extends EditorPane implements INotebookDelegateForWebview {

	static readonly ID: string = NOTEBOOK_OUTPUT_EDITOR_ID;


	creationOptions: INotebookEditorCreationOptions = getDefaultNotebookCreationOptions();

	private _rootElement!: HTMLElement;
	// private _dimension: DOM.Dimension | undefined = undefined;
	private _outputWebview: BackLayerWebView<ICommonCellInfo> | null = null;


	private readonly _notebookOptions: NotebookOptions;
	get notebookOptions() {
		return this._notebookOptions;
	}

	private _isDisposed: boolean = false;
	get isDisposed() {
		return this._isDisposed;
	}

	constructor(
		group: IEditorGroup,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IThemeService themeService: IThemeService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IStorageService storageService: IStorageService,
		@IEditorService editorService: IEditorService,
		@INotebookEditorService private readonly notebookEditorService: INotebookEditorService,
		@INotebookService private readonly notebookService: INotebookService,
	) {
		super(NotebookTextDiffEditor.ID, group, telemetryService, themeService, storageService);
		this._notebookOptions = this.instantiationService.createInstance(NotebookOptions, this.window, false, undefined);
		this._register(this._notebookOptions);
	}

	createEditor(parent: HTMLElement): void {
		this._rootElement = DOM.append(parent, DOM.$('.notebook-output-editor'));
	}

	private async _createOriginalWebview(id: string, viewType: string, resource: URI): Promise<void> {
		this._outputWebview?.dispose();

		this._outputWebview = this.instantiationService.createInstance(BackLayerWebView, this, id, viewType, resource, {
			...this._notebookOptions.computeDiffWebviewOptions(),
			fontFamily: this._generateFontFamily()
		}, undefined) as BackLayerWebView<ICommonCellInfo>;

		// attach the webview container to the DOM tree first
		DOM.append(this._rootElement, this._outputWebview.element);

		this._outputWebview.createWebview(this.window);
		this._outputWebview.element.style.width = `calc(100% - 16px)`;
		this._outputWebview.element.style.left = `16px`;

	}

	_generateFontFamily(): string {
		return `"SF Mono", Monaco, Menlo, Consolas, "Ubuntu Mono", "Liberation Mono", "DejaVu Sans Mono", "Courier New", monospace`;
	}


	override async setInput(input: NotebookOutputEditorInput, options: IEditorOptions | undefined, context: IEditorOpenContext, token: CancellationToken): Promise<void> {
		await this._createOriginalWebview(generateUuid(), input.notebookViewType, URI.from({ scheme: Schemas.vscodeNotebookCellOutput, path: '', query: 'openIn=notebookOutputEditor' }));

		const resolvedNotebookModel = input.getNotebookRef().object;
		const notebookTextModel = resolvedNotebookModel.notebook;

		const outputUriData = CellUri.parseCellOutputUri(input.outputDataUri);
		if (!outputUriData || !outputUriData.notebook || !outputUriData.cellId) {
			throw new Error('Invalid output uri for notebook output editor');
		}

		const cellTextModel = notebookTextModel.cells.find(cellTextModel => cellTextModel.outputs.some(output => output.outputId === outputUriData.outputId)); // || output.alternativeOutputId === outputId));
		if (!cellTextModel) {
			throw new Error('Invalid cell output uri, no matching cell');
		}


		const cellInfo: ICommonCellInfo = {
			cellId: outputUriData.cellId,
			cellHandle: cellTextModel.handle,
			cellUri: cellTextModel.uri,
		};


		const notebookEditor = this.notebookEditorService.retrieveExistingWidgetFromURI(input.notebookUri)?.value;
		if (!notebookEditor) {
			throw new Error('Invalid notebook editor, no matching notebook editor');
		}

		const cellOutputViewModel = notebookEditor.getCellByInfo(cellInfo).outputsViewModels.find(outputViewModel => outputViewModel.model.outputId === outputUriData.outputId);
		if (!cellOutputViewModel) {
			throw new Error('Invalid NotebookOutputEditorInput, no matching cell output view model');
		}

		let result: IInsetRenderOutput | undefined = undefined;

		const [mimeTypes, pick] = cellOutputViewModel.resolveMimeTypes(notebookTextModel, undefined);
		const pickedMimeTypeRenderer = cellOutputViewModel.pickedMimeType || mimeTypes[pick];

		if (mimeTypes.length !== 0) {
			const renderer = this.notebookService.getRendererInfo(pickedMimeTypeRenderer.rendererId);
			result = renderer
				? { type: RenderOutputType.Extension, renderer, source: cellOutputViewModel, mimeType: pickedMimeTypeRenderer.mimeType }
				: this._renderMissingRenderer(cellOutputViewModel, pickedMimeTypeRenderer.mimeType);

		}

		if (!result) {
			throw new Error('No InsetRenderInfo for output');
		}

		this._outputWebview?.createOutput(cellInfo, result, 0, 0);
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

	private _renderMessage(viewModel: ICellOutputViewModel, message: string): IInsetRenderOutput {
		const el = DOM.$('p', undefined, message);
		return { type: RenderOutputType.Html, source: viewModel, htmlContent: el.outerHTML };
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

	async focusNotebookCell(cell: IGenericCellViewModel, focus: 'output' | 'editor' | 'container'): Promise<void> {

	}

	async focusNextNotebookCell(cell: IGenericCellViewModel, focus: 'output' | 'editor' | 'container'): Promise<void> {

	}

	toggleNotebookCellSelection(cell: IGenericCellViewModel) {
		throw new Error('Not implemented.');
	}

	getCellById(cellId: string): IGenericCellViewModel | undefined {
		throw new Error('Not implemented');
	}

	getCellByInfo(cellInfo: ICommonCellInfo): IGenericCellViewModel {
		throw new Error('Not implemented');
	}

	layout(dimension: DOM.Dimension, position: DOM.IDomPosition): void {

	}

	setScrollTop(scrollTop: number): void {

	}

	triggerScroll(event: any): void {

	}

	getOutputRenderer(): any {

	}

	updateOutputHeight(cellInfo: ICommonCellInfo, output: ICellOutputViewModel, height: number, isInit: boolean, source?: string): void {

	}

	scheduleOutputHeightAck(cellInfo: ICommonCellInfo, outputId: string, height: number): void {

	}

	updateMarkupCellHeight(cellId: string, height: number, isInit: boolean): void {

	}

	setMarkupCellEditState(cellId: string, editState: CellEditState): void {

	}

	didResizeOutput(cellId: string): void {

	}

	didStartDragMarkupCell(cellId: string, event: { dragOffsetY: number }): void {

	}

	didDragMarkupCell(cellId: string, event: { dragOffsetY: number }): void {

	}

	didDropMarkupCell(cellId: string, event: { dragOffsetY: number; ctrlKey: boolean; altKey: boolean }): void {

	}

	didEndDragMarkupCell(cellId: string): void {

	}

	updatePerformanceMetadata(cellId: string, executionId: string, duration: number, rendererId: string): void {

	}

	didFocusOutputInputChange(inputFocused: boolean): void {

	}

	override dispose() {
		this._isDisposed = true;
		super.dispose();
	}
}

export class NotebookOutputEditorContribution implements IWorkbenchContribution {

	static readonly ID = 'workbench.contribution.notebookOutputEditorContribution';

	constructor(
		@INotebookService notebookService: INotebookService,
		@IEditorResolverService editorResolverService: IEditorResolverService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IUriIdentityService private readonly uriIdentityService: IUriIdentityService,
		@INotebookEditorModelResolverService private readonly notebookEditorModelResolverService: INotebookEditorModelResolverService,
	) {
		editorResolverService.registerEditor(
			`${Schemas.vscodeNotebookCellOutput}:/**`,
			{
				id: 'notebookOutputEditor',
				label: 'Notebook Output Editor',
				priority: RegisteredEditorPriority.exclusive
			},
			{
				// We want to support all notebook types which could have any file extension,
				// so we just check if the resource corresponds to a notebook
				canSupportResource: (resource: URI) => {
					if (resource.scheme === Schemas.vscodeNotebookCellOutput) {
						const params = new URLSearchParams(resource.query);
						return params.get('openIn') === 'notebookOutputEditor';
					}
					return false;
				}
			},
			{
				createEditorInput: async ({ resource, options }) => {
					const outputUriData = CellUri.parseCellOutputUri(resource);
					if (!outputUriData || !outputUriData.notebook || !outputUriData.cellId) {
						throw new Error('Invalid output uri for notebook output editor');
					}


					const notebookUri = this.uriIdentityService.asCanonicalUri(outputUriData.notebook);
					const notebook = await this.notebookEditorModelResolverService.resolve(notebookUri);

					const editorInput = this.instantiationService.createInstance(NotebookOutputEditorInput, notebook, resource);
					return {
						editor: editorInput,
						options: options
					};
				}
			}
		);
	}
}

registerWorkbenchContribution2(NotebookOutputEditorContribution.ID, NotebookOutputEditorContribution, WorkbenchPhase.BlockRestore);
