/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var NotebookOutputEditor_1;
import * as DOM from '../../../../../base/browser/dom.js';
import * as nls from '../../../../../nls.js';
import { Emitter } from '../../../../../base/common/event.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../../base/common/network.js';
import { URI } from '../../../../../base/common/uri.js';
import { generateUuid } from '../../../../../base/common/uuid.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IStorageService } from '../../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { IThemeService } from '../../../../../platform/theme/common/themeService.js';
import { IUriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentity.js';
import { EditorPane } from '../../../../browser/parts/editor/editorPane.js';
import { registerWorkbenchContribution2 } from '../../../../common/contributions.js';
import { IEditorResolverService, RegisteredEditorPriority } from '../../../../services/editor/common/editorResolverService.js';
import { CellUri, NOTEBOOK_OUTPUT_EDITOR_ID } from '../../common/notebookCommon.js';
import { INotebookService } from '../../common/notebookService.js';
import { getDefaultNotebookCreationOptions } from '../notebookEditorWidget.js';
import { NotebookOptions } from '../notebookOptions.js';
import { BackLayerWebView } from '../view/renderers/backLayerWebView.js';
import { NotebookOutputEditorInput } from './notebookOutputEditorInput.js';
import { createBareFontInfoFromRawSettings } from '../../../../../editor/common/config/fontInfoFromSettings.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { FontMeasurements } from '../../../../../editor/browser/config/fontMeasurements.js';
import { PixelRatio } from '../../../../../base/browser/pixelRatio.js';
import { NotebookViewModel } from '../viewModel/notebookViewModelImpl.js';
import { NotebookEventDispatcher } from '../viewModel/eventDispatcher.js';
import { ViewContext } from '../viewModel/viewContext.js';
export class NoopCellEditorOptions extends Disposable {
    static { this.fixedEditorOptions = {
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
    }; }
    get value() {
        return this._value;
    }
    constructor() {
        super();
        this._onDidChange = this._register(new Emitter());
        this.onDidChange = this._onDidChange.event;
        this._value = Object.freeze({
            ...NoopCellEditorOptions.fixedEditorOptions,
            padding: { top: 12, bottom: 12 },
            readOnly: true
        });
    }
}
let NotebookOutputEditor = class NotebookOutputEditor extends EditorPane {
    static { NotebookOutputEditor_1 = this; }
    static { this.ID = NOTEBOOK_OUTPUT_EDITOR_ID; }
    get isDisposed() {
        return this._isDisposed;
    }
    constructor(group, instantiationService, themeService, telemetryService, storageService, configurationService, notebookService) {
        super(NotebookOutputEditor_1.ID, group, telemetryService, themeService, storageService);
        this.instantiationService = instantiationService;
        this.configurationService = configurationService;
        this.notebookService = notebookService;
        this.creationOptions = getDefaultNotebookCreationOptions();
        this._outputWebview = null;
        this._isDisposed = false;
        this._notebookOptions = this.instantiationService.createInstance(NotebookOptions, this.window, false, undefined);
        this._register(this._notebookOptions);
    }
    createEditor(parent) {
        this._rootElement = DOM.append(parent, DOM.$('.notebook-output-editor'));
    }
    get fontInfo() {
        if (!this._fontInfo) {
            this._fontInfo = this.createFontInfo();
        }
        return this._fontInfo;
    }
    createFontInfo() {
        const editorOptions = this.configurationService.getValue('editor');
        return FontMeasurements.readFontInfo(this.window, createBareFontInfoFromRawSettings(editorOptions, PixelRatio.getInstance(this.window).value));
    }
    async _createOriginalWebview(id, viewType, resource) {
        this._outputWebview?.dispose();
        this._outputWebview = this.instantiationService.createInstance(BackLayerWebView, this, id, viewType, resource, {
            ...this._notebookOptions.computeDiffWebviewOptions(),
            fontFamily: this._generateFontFamily()
        }, undefined);
        // attach the webview container to the DOM tree first
        DOM.append(this._rootElement, this._outputWebview.element);
        this._outputWebview.createWebview(this.window);
        this._outputWebview.element.style.width = `calc(100% - 16px)`;
        this._outputWebview.element.style.left = `16px`;
    }
    _generateFontFamily() {
        return this.fontInfo.fontFamily ?? `"SF Mono", Monaco, Menlo, Consolas, "Ubuntu Mono", "Liberation Mono", "DejaVu Sans Mono", "Courier New", monospace`;
    }
    getTitle() {
        if (this.input) {
            return this.input.getName();
        }
        return nls.localize('notebookOutputEditor', "Notebook Output Editor");
    }
    async setInput(input, options, context, token) {
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
        const viewContext = new ViewContext(this._notebookOptions, eventDispatcher, _language => editorOptions);
        this._notebookViewModel = this.instantiationService.createInstance(NotebookViewModel, notebookTextModel.viewType, notebookTextModel, viewContext, null, { isReadOnly: true });
        const cellViewModel = this._notebookViewModel.getCellByHandle(model.cell.handle);
        if (!cellViewModel) {
            throw new Error('Invalid NotebookOutputEditorInput, no matching cell view model');
        }
        const cellOutputViewModel = cellViewModel.outputsViewModels.find(outputViewModel => outputViewModel.model.outputId === model.outputId);
        if (!cellOutputViewModel) {
            throw new Error('Invalid NotebookOutputEditorInput, no matching cell output view model');
        }
        let result = undefined;
        const [mimeTypes, pick] = cellOutputViewModel.resolveMimeTypes(notebookTextModel, undefined);
        const pickedMimeTypeRenderer = cellOutputViewModel.pickedMimeType || mimeTypes[pick];
        if (mimeTypes.length !== 0) {
            const renderer = this.notebookService.getRendererInfo(pickedMimeTypeRenderer.rendererId);
            result = renderer
                ? { type: 1 /* RenderOutputType.Extension */, renderer, source: cellOutputViewModel, mimeType: pickedMimeTypeRenderer.mimeType }
                : this._renderMissingRenderer(cellOutputViewModel, pickedMimeTypeRenderer.mimeType);
        }
        if (!result) {
            throw new Error('No InsetRenderInfo for output');
        }
        const cellInfo = {
            cellId: cellViewModel.id,
            cellHandle: model.cell.handle,
            cellUri: model.cell.uri,
        };
        this._outputWebview?.createOutput(cellInfo, result, 0, 0);
    }
    _renderMissingRenderer(viewModel, preferredMimeType) {
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
    _renderMessage(viewModel, message) {
        const el = DOM.$('p', undefined, message);
        return { type: 0 /* RenderOutputType.Html */, source: viewModel, htmlContent: el.outerHTML };
    }
    _renderSearchForMimetype(viewModel, mimeType) {
        const query = `@tag:notebookRenderer ${mimeType}`;
        const p = DOM.$('p', undefined, `No renderer could be found for mimetype "${mimeType}", but one might be available on the Marketplace.`);
        const a = DOM.$('a', { href: `command:workbench.extensions.search?%22${query}%22`, class: 'monaco-button monaco-text-button', tabindex: 0, role: 'button', style: 'padding: 8px; text-decoration: none; color: rgb(255, 255, 255); background-color: rgb(14, 99, 156); max-width: 200px;' }, `Search Marketplace`);
        return {
            type: 0 /* RenderOutputType.Html */,
            source: viewModel,
            htmlContent: p.outerHTML + a.outerHTML,
        };
    }
    scheduleOutputHeightAck(cellInfo, outputId, height) {
        DOM.scheduleAtNextAnimationFrame(this.window, () => {
            this._outputWebview?.ackHeight([{ cellId: cellInfo.cellId, outputId, height }]);
        }, 10);
    }
    async focusNotebookCell(cell, focus) {
    }
    async focusNextNotebookCell(cell, focus) {
    }
    toggleNotebookCellSelection(cell) {
        throw new Error('Not implemented.');
    }
    getCellById(cellId) {
        throw new Error('Not implemented');
    }
    getCellByInfo(cellInfo) {
        return this._notebookViewModel?.getCellByHandle(cellInfo.cellHandle);
    }
    layout(dimension, position) {
    }
    setScrollTop(scrollTop) {
    }
    triggerScroll(event) {
    }
    getOutputRenderer() {
    }
    updateOutputHeight(cellInfo, output, height, isInit, source) {
    }
    updateMarkupCellHeight(cellId, height, isInit) {
    }
    setMarkupCellEditState(cellId, editState) {
    }
    didResizeOutput(cellId) {
    }
    didStartDragMarkupCell(cellId, event) {
    }
    didDragMarkupCell(cellId, event) {
    }
    didDropMarkupCell(cellId, event) {
    }
    didEndDragMarkupCell(cellId) {
    }
    updatePerformanceMetadata(cellId, executionId, duration, rendererId) {
    }
    didFocusOutputInputChange(inputFocused) {
    }
    dispose() {
        this._isDisposed = true;
        super.dispose();
    }
};
NotebookOutputEditor = NotebookOutputEditor_1 = __decorate([
    __param(1, IInstantiationService),
    __param(2, IThemeService),
    __param(3, ITelemetryService),
    __param(4, IStorageService),
    __param(5, IConfigurationService),
    __param(6, INotebookService)
], NotebookOutputEditor);
export { NotebookOutputEditor };
let NotebookOutputEditorContribution = class NotebookOutputEditorContribution {
    static { this.ID = 'workbench.contribution.notebookOutputEditorContribution'; }
    constructor(editorResolverService, instantiationService, uriIdentityService) {
        this.instantiationService = instantiationService;
        this.uriIdentityService = uriIdentityService;
        editorResolverService.registerEditor(`${Schemas.vscodeNotebookCellOutput}:/**`, {
            id: 'notebookOutputEditor',
            label: 'Notebook Output Editor',
            priority: RegisteredEditorPriority.default
        }, {
            canSupportResource: (resource) => {
                if (resource.scheme === Schemas.vscodeNotebookCellOutput) {
                    const params = new URLSearchParams(resource.query);
                    return params.get('openIn') === 'notebookOutputEditor';
                }
                return false;
            }
        }, {
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
        });
    }
};
NotebookOutputEditorContribution = __decorate([
    __param(0, IEditorResolverService),
    __param(1, IInstantiationService),
    __param(2, IUriIdentityService)
], NotebookOutputEditorContribution);
export { NotebookOutputEditorContribution };
registerWorkbenchContribution2(NotebookOutputEditorContribution.ID, NotebookOutputEditorContribution, 2 /* WorkbenchPhase.BlockRestore */);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibm90ZWJvb2tPdXRwdXRFZGl0b3IuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9ub3RlYm9vay9icm93c2VyL291dHB1dEVkaXRvci9ub3RlYm9va091dHB1dEVkaXRvci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxLQUFLLEdBQUcsTUFBTSxvQ0FBb0MsQ0FBQztBQUMxRCxPQUFPLEtBQUssR0FBRyxNQUFNLHVCQUF1QixDQUFDO0FBRTdDLE9BQU8sRUFBRSxPQUFPLEVBQVMsTUFBTSxxQ0FBcUMsQ0FBQztBQUNyRSxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDckUsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBQ2hFLE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUN4RCxPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0sb0NBQW9DLENBQUM7QUFFbEUsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sK0RBQStELENBQUM7QUFDdEcsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLG1EQUFtRCxDQUFDO0FBQ3BGLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLHVEQUF1RCxDQUFDO0FBQzFGLE9BQU8sRUFBRSxhQUFhLEVBQUUsTUFBTSxzREFBc0QsQ0FBQztBQUNyRixPQUFPLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSwyREFBMkQsQ0FBQztBQUNoRyxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0sZ0RBQWdELENBQUM7QUFDNUUsT0FBTyxFQUEwQiw4QkFBOEIsRUFBa0IsTUFBTSxxQ0FBcUMsQ0FBQztBQUc3SCxPQUFPLEVBQUUsc0JBQXNCLEVBQUUsd0JBQXdCLEVBQUUsTUFBTSw2REFBNkQsQ0FBQztBQUMv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