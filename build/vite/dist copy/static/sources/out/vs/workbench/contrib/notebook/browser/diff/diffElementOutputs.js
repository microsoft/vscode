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
import * as DOM from '../../../../../base/browser/dom.js';
import * as nls from '../../../../../nls.js';
import { Disposable, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { SideBySideDiffElementViewModel } from './diffElementViewModel.js';
import { DiffSide } from './notebookDiffEditorBrowser.js';
import { INotebookService } from '../../common/notebookService.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { mimetypeIcon } from '../notebookIcons.js';
import { StandardKeyboardEvent } from '../../../../../base/browser/keyboardEvent.js';
import { IQuickInputService } from '../../../../../platform/quickinput/common/quickInput.js';
export class OutputElement extends Disposable {
    constructor(_notebookEditor, _notebookTextModel, _notebookService, _quickInputService, _diffElementViewModel, _diffSide, _nestedCell, _outputContainer, output) {
        super();
        this._notebookEditor = _notebookEditor;
        this._notebookTextModel = _notebookTextModel;
        this._notebookService = _notebookService;
        this._quickInputService = _quickInputService;
        this._diffElementViewModel = _diffElementViewModel;
        this._diffSide = _diffSide;
        this._nestedCell = _nestedCell;
        this._outputContainer = _outputContainer;
        this.output = output;
        this.resizeListener = this._register(new DisposableStore());
    }
    render(index, beforeElement) {
        const outputItemDiv = document.createElement('div');
        let result = undefined;
        const [mimeTypes, pick] = this.output.resolveMimeTypes(this._notebookTextModel, undefined);
        const pickedMimeTypeRenderer = this.output.pickedMimeType || mimeTypes[pick];
        if (mimeTypes.length > 1) {
            outputItemDiv.style.position = 'relative';
            const mimeTypePicker = DOM.$('.multi-mimetype-output');
            mimeTypePicker.classList.add(...ThemeIcon.asClassNameArray(mimetypeIcon));
            mimeTypePicker.tabIndex = 0;
            mimeTypePicker.title = nls.localize('mimeTypePicker', "Choose a different output mimetype, available mimetypes: {0}", mimeTypes.map(mimeType => mimeType.mimeType).join(', '));
            outputItemDiv.appendChild(mimeTypePicker);
            this.resizeListener.add(DOM.addStandardDisposableListener(mimeTypePicker, 'mousedown', async (e) => {
                if (e.leftButton) {
                    e.preventDefault();
                    e.stopPropagation();
                    await this.pickActiveMimeTypeRenderer(this._notebookTextModel, this.output);
                }
            }));
            this.resizeListener.add((DOM.addDisposableListener(mimeTypePicker, DOM.EventType.KEY_DOWN, async (e) => {
                const event = new StandardKeyboardEvent(e);
                if ((event.equals(3 /* KeyCode.Enter */) || event.equals(10 /* KeyCode.Space */))) {
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
                ? { type: 1 /* RenderOutputType.Extension */, renderer, source: this.output, mimeType: pickedMimeTypeRenderer.mimeType }
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
        }
        else {
            this._outputContainer.appendChild(outputItemDiv);
        }
        this._notebookEditor.createOutput(this._diffElementViewModel, this._nestedCell, result, () => this.getOutputOffsetInCell(index), this._diffElementViewModel instanceof SideBySideDiffElementViewModel
            ? this._diffSide
            : this._diffElementViewModel.type === 'insert' ? DiffSide.Modified : DiffSide.Original);
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
    _renderMessage(viewModel, message) {
        const el = DOM.$('p', undefined, message);
        return { type: 0 /* RenderOutputType.Html */, source: viewModel, htmlContent: el.outerHTML };
    }
    async pickActiveMimeTypeRenderer(notebookTextModel, viewModel) {
        const [mimeTypes, currIndex] = viewModel.resolveMimeTypes(notebookTextModel, undefined);
        const items = mimeTypes.filter(mimeType => mimeType.isTrusted).map((mimeType, index) => ({
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
        const pick = await new Promise(resolve => {
            disposables.add(picker.onDidAccept(() => {
                resolve(picker.selectedItems.length === 1 ? picker.selectedItems[0].index : undefined);
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
                this._notebookEditor.removeInset(this._diffElementViewModel, this._nestedCell, viewModel, this._diffSide);
            }
            viewModel.pickedMimeType = mimeTypes[pick];
            this.render(index, nextElement);
        }
    }
    generateRendererInfo(renderId) {
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
    updateHeight(index, height) {
        this._diffElementViewModel.updateOutputHeight(this._diffSide, index, height);
    }
    getOutputOffsetInContainer(index) {
        return this._diffElementViewModel.getOutputOffsetInContainer(this._diffSide, index);
    }
    getOutputOffsetInCell(index) {
        return this._diffElementViewModel.getOutputOffsetInCell(this._diffSide, index);
    }
}
let OutputContainer = class OutputContainer extends Disposable {
    constructor(_editor, _notebookTextModel, _diffElementViewModel, _nestedCellViewModel, _diffSide, _outputContainer, _notebookService, _quickInputService) {
        super();
        this._editor = _editor;
        this._notebookTextModel = _notebookTextModel;
        this._diffElementViewModel = _diffElementViewModel;
        this._nestedCellViewModel = _nestedCellViewModel;
        this._diffSide = _diffSide;
        this._outputContainer = _outputContainer;
        this._notebookService = _notebookService;
        this._quickInputService = _quickInputService;
        this._outputEntries = new Map();
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
    _updateOutputs(splice) {
        const removedKeys = [];
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
        let prevElement = undefined;
        const outputsToRender = this._nestedCellViewModel.outputsViewModels;
        outputsToRender.reverse().forEach(output => {
            if (this._outputEntries.has(output)) {
                // already exist
                prevElement = this._outputEntries.get(output).domNode;
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
    _renderOutput(currOutput, index, beforeElement) {
        if (!this._outputEntries.has(currOutput)) {
            this._outputEntries.set(currOutput, new OutputElement(this._editor, this._notebookTextModel, this._notebookService, this._quickInputService, this._diffElementViewModel, this._diffSide, this._nestedCellViewModel, this._outputContainer, currOutput));
        }
        const renderElement = this._outputEntries.get(currOutput);
        renderElement.render(index, beforeElement);
    }
};
OutputContainer = __decorate([
    __param(6, INotebookService),
    __param(7, IQuickInputService)
], OutputContainer);
export { OutputContainer };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZGlmZkVsZW1lbnRPdXRwdXRzLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvbm90ZWJvb2svYnJvd3Nlci9kaWZmL2RpZmZFbGVtZW50T3V0cHV0cy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEtBQUssR0FBRyxNQUFNLG9DQUFvQyxDQUFDO0FBQzFELE9BQU8sS0FBSyxHQUFHLE1BQU0sdUJBQXVCLENBQUM7QUFDN0MsT0FBTyxFQUFFLFVBQVUsRUFBRSxlQUFlLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUN0RixPQUFPLEVBQWdDLDhCQUE4QixFQUFFLE1BQU0sMkJBQTJCLENBQUM7QUFDekcsT0FBTyxFQUFFLFFBQVEsRUFBMkIsTUFBTSxnQ0FBZ0MsQ0FBQztBQUluRixPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSxpQ0FBaUMsQ0FBQztBQUVuRSxPQUFPLEVBQUUsU0FBUyxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDcEUsT0FBTyxFQUFFLFlBQVksRUFBRSxNQUFNLHFCQUFxQixDQUFDO0FBQ25ELE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLDhDQUE4QyxDQUFDO0FBRXJGLE9BQU8sRUFBRSxrQkFBa0IsRUFBa0IsTUFBTSx5REFBeUQsQ0FBQztBQU03RyxNQUFNLE9BQU8sYUFBYyxTQUFRLFVBQVU7SUFLNUMsWUFDUyxlQUF3QyxFQUN4QyxrQkFBcUMsRUFDckMsZ0JBQWtDLEVBQ2xDLGtCQUFzQyxFQUN0QyxxQkFBbUQsRUFDbkQsU0FBbUIsRUFDbkIsV0FBb0MsRUFDcEMsZ0JBQTZCLEVBQzVCLE1BQTRCO1FBRXJDLEtBQUssRUFBRSxDQUFDO1FBVkEsb0JBQWUsR0FBZixlQUFlLENBQXlCO1FBQ3hDLHVCQUFrQixHQUFsQixrQkFBa0IsQ0FBbUI7UUFDckMs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