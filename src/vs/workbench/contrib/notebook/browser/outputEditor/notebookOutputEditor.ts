/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from '../../../../../base/browser/dom.js';
import * as nls from '../../../../../nls.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../../base/common/network.js';
import { URI } from '../../../../../base/common/uri.js';
import { generateUuid } from '../../../../../base/common/uuid.js';
import { IEditorOptions } from '../../../../../platform/editor/common/editor.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IStorageService } from '../../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { IThemeService } from '../../../../../platform/theme/common/themeService.js';
import { IUriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentity.js';
import { EditorPane } from '../../../../browser/parts/editor/editorPane.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../common/contributions.js';
import { IEditorOpenContext } from '../../../../common/editor.js';
import { IEditorGroup } from '../../../../services/editor/common/editorGroupsService.js';
import { IEditorResolverService, RegisteredEditorPriority } from '../../../../services/editor/common/editorResolverService.js';
import { CellUri, NOTEBOOK_OUTPUT_EDITOR_ID } from '../../common/notebookCommon.js';
import { INotebookService } from '../../common/notebookService.js';
import { CellEditState, IBaseCellEditorOptions, ICellOutputViewModel, ICommonCellInfo, IGenericCellViewModel, IInsetRenderOutput, INotebookEditorCreationOptions, RenderOutputType } from '../notebookBrowser.js';
import { getDefaultNotebookCreationOptions } from '../notebookEditorWidget.js';
import { NotebookOptions } from '../notebookOptions.js';
import { BackLayerWebView, INotebookDelegateForWebview } from '../view/renderers/backLayerWebView.js';
import { NotebookOutputEditorInput } from './notebookOutputEditorInput.js';
import { FontInfo } from '../../../../../editor/common/config/fontInfo.js';
import { createBareFontInfoFromRawSettings } from '../../../../../editor/common/config/fontInfoFromSettings.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IEditorOptions as ICodeEditorOptions } from '../../../../../editor/common/config/editorOptions.js';
import { FontMeasurements } from '../../../../../editor/browser/config/fontMeasurements.js';
import { PixelRatio } from '../../../../../base/browser/pixelRatio.js';
import { NotebookViewModel } from '../viewModel/notebookViewModelImpl.js';
import { NotebookEventDispatcher } from '../viewModel/eventDispatcher.js';
import { ViewContext } from '../viewModel/viewContext.js';

export class NoopCellEditorOptions extends Disposable implements IBaseCellEditorOptions {
	private static fixedEditorOptions: ICodeEditorOptions = {
		scrollBeyondLastLine: false,
		scrollbar: {
			verticalScrollbarSize: 14,
			horizontal: 'auto',
			useShadows: true,
			verticalHasArrows: false,
			horizontalHasArrows: false,
			alwaysConsumeMouseWheel: false
		},
		renderLineHighlightOnlyWhenFocus: true,
		overviewRulerLanes: 0,
		lineDecorationsWidth: 0,
		folding: true,
		fixedOverflowWidgets: true,
		minimap: { enabled: false },
		renderValidationDecorations: 'on',
		lineNumbersMinChars: 3
	};

	private readonly _onDidChange = this._register(new Emitter<void>());
	readonly onDidChange: Event<void> = this._onDidChange.event;
	private _value: ICodeEditorOptions;

	get value(): Readonly<ICodeEditorOptions> {
		return this._value;
	}

	constructor() {
		super();
		this._value = Object.freeze({
			...NoopCellEditorOptions.fixedEditorOptions,
			padding: { top: 12, bottom: 12 },
			readOnly: true
		});
	}
}

export class NotebookOutputEditor extends EditorPane implements INotebookDelegateForWebview {

	static readonly ID: string = NOTEBOOK_OUTPUT_EDITOR_ID;

	creationOptions: INotebookEditorCreationOptions = getDefaultNotebookCreationOptions();

	private _rootElement!: HTMLElement;
	private _outputWebview: BackLayerWebView<ICommonCellInfo> | null = null;

	private _fontInfo: FontInfo | undefined;

	private _notebookOptions: NotebookOptions;
	private _notebookViewModel: NotebookViewModel | undefined;

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
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@INotebookService private readonly notebookService: INotebookService,

	) {
		super(NotebookOutputEditor.ID, group, telemetryService, themeService, storageService);
		this._notebookOptions = this.instantiationService.createInstance(NotebookOptions, this.window, false, undefined);
		this._register(this._notebookOptions);
	}

	protected createEditor(parent: HTMLElement): void {
		this._rootElement = DOM.append(parent, DOM.$('.notebook-output-editor'));
	}

	private get fontInfo() {
		if (!this._fontInfo) {
			this._fontInfo = this.createFontInfo();
		}

		return this._fontInfo;
	}

	private createFontInfo() {
		const editorOptions = this.configurationService.getValue<ICodeEditorOptions>('editor');
		return FontMeasurements.readFontInfo(this.window, createBareFontInfoFromRawSettings(editorOptions, PixelRatio.getInstance(this.window).value));
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

	private _generateFontFamily(): string {
		return this.fontInfo.fontFamily ?? `"SF Mono", Monaco, Menlo, Consolas, "Ubuntu Mono", "Liberation Mono", "DejaVu Sans Mono", "Courier New", monospace`;
	}

	override getTitle(): string {
		if (this.input) {
			return this.input.getName();
		}

		return nls.localize('notebookOutputEditor', "Notebook Output Editor");
	}

	override async setInput(input: NotebookOutputEditorInput, options: IEditorOptions | undefined, context: IEditorOpenContext, token: CancellationToken): Promise<void> {
		await super.setInput(input, options, context, token);

		const model = await input.resolve();
		if (!model) {
			throw new Error('Invalid notebook output editor input');
		}

		const resolvedNotebookEditorModel = model.resolvedNotebookEditorModel;

		await this._createOriginalWebview(generateUuid(), resolvedNotebookEditorModel.viewType, URI.from({ scheme: Schemas.vscodeNotebookCellOutput, path: '', query: 'openIn=notebookOutputEditor' }));

		const notebookTextModel = resolvedNotebookEditorModel.notebook;
		const eventDispatcher = this._register(new NotebookEventDispatcher());
		const editorOptions = this._register(new NoopCellEditorOptions());
		const viewContext = new ViewContext(
			this._notebookOptions,
			eventDispatcher,
			_language => editorOptions
		);

		this._notebookViewModel = this.instantiationService.createInstance(NotebookViewModel, notebookTextModel.viewType, notebookTextModel, viewContext, null, { isReadOnly: true });

		const cellViewModel = this._notebookViewModel.getCellByHandle(model.cell.handle);
		if (!cellViewModel) {
			throw new Error('Invalid NotebookOutputEditorInput, no matching cell view model');
		}

		const cellOutputViewModel = cellViewModel.outputsViewModels.find(outputViewModel => outputViewModel.model.outputId === model.outputId);
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

		const cellInfo: ICommonCellInfo = {
			cellId: cellViewModel.id,
			cellHandle: model.cell.handle,
			cellUri: model.cell.uri,
		};

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

	scheduleOutputHeightAck(cellInfo: ICommonCellInfo, outputId: string, height: number): void {
		DOM.scheduleAtNextAnimationFrame(this.window, () => {
			this._outputWebview?.ackHeight([{ cellId: cellInfo.cellId, outputId, height }]);
		}, 10);
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
		return this._notebookViewModel?.getCellByHandle(cellInfo.cellHandle) as IGenericCellViewModel;
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
		@IEditorResolverService editorResolverService: IEditorResolverService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IUriIdentityService private readonly uriIdentityService: IUriIdentityService,) {
		editorResolverService.registerEditor(
			`${Schemas.vscodeNotebookCellOutput}:/**`,
			{
				id: 'notebookOutputEditor',
				label: 'Notebook Output Editor',
				priority: RegisteredEditorPriority.default
			},
			{
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
					if (!outputUriData || !outputUriData.notebook || outputUriData.cellIndex === undefined || outputUriData.outputIndex === undefined || !outputUriData.outputId) {
						throw new Error('Invalid output uri for notebook output editor');
					}

					const notebookUri = this.uriIdentityService.asCanonicalUri(outputUriData.notebook);
					const cellIndex = outputUriData.cellIndex;
					const outputId = outputUriData.outputId;
					const outputIndex = outputUriData.outputIndex;

					const editorInput = this.instantiationService.createInstance(NotebookOutputEditorInput, notebookUri, cellIndex, outputId, outputIndex);
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
