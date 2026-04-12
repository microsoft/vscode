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
import { Event } from '../../../../base/common/event.js';
import { readHotReloadableExport } from '../../../../base/common/hotReloadHelpers.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { derived, observableValue, recomputeInitiallyAndOnChange } from '../../../../base/common/observable.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import './colors.js';
import { DiffEditorItemTemplate } from './diffEditorItemTemplate.js';
import { MultiDiffEditorViewModel } from './multiDiffEditorViewModel.js';
import { MultiDiffEditorWidgetImpl } from './multiDiffEditorWidgetImpl.js';
let MultiDiffEditorWidget = class MultiDiffEditorWidget extends Disposable {
    constructor(_element, _workbenchUIElementFactory, _instantiationService) {
        super();
        this._element = _element;
        this._workbenchUIElementFactory = _workbenchUIElementFactory;
        this._instantiationService = _instantiationService;
        this._dimension = observableValue(this, undefined);
        this._viewModel = observableValue(this, undefined);
        this._widgetImpl = derived(this, (reader) => {
            readHotReloadableExport(DiffEditorItemTemplate, reader);
            return reader.store.add(this._instantiationService.createInstance((readHotReloadableExport(MultiDiffEditorWidgetImpl, reader)), this._element, this._dimension, this._viewModel, this._workbenchUIElementFactory));
        });
        this._activeControl = derived(this, (reader) => this._widgetImpl.read(reader).activeControl.read(reader));
        this.onDidChangeActiveControl = Event.fromObservableLight(this._activeControl);
        this._register(recomputeInitiallyAndOnChange(this._widgetImpl));
    }
    reveal(resource, options) {
        this._widgetImpl.get().reveal(resource, options);
    }
    createViewModel(model) {
        return new MultiDiffEditorViewModel(model, this._instantiationService);
    }
    setViewModel(viewModel) {
        this._viewModel.set(viewModel, undefined);
    }
    layout(dimension) {
        this._dimension.set(dimension, undefined);
    }
    getActiveControl() {
        return this._activeControl.get();
    }
    getViewState() {
        return this._widgetImpl.get().getViewState();
    }
    setViewState(viewState) {
        this._widgetImpl.get().setViewState(viewState);
    }
    tryGetCodeEditor(resource) {
        return this._widgetImpl.get().tryGetCodeEditor(resource);
    }
    getRootElement() {
        return this._widgetImpl.get().getRootElement();
    }
    getContextKeyService() {
        return this._widgetImpl.get().getContextKeyService();
    }
    getScopedInstantiationService() {
        return this._widgetImpl.get().getScopedInstantiationService();
    }
    findDocumentDiffItem(resource) {
        return this._widgetImpl.get().findDocumentDiffItem(resource);
    }
    goToNextChange() {
        this._widgetImpl.get().goToNextChange();
    }
    goToPreviousChange() {
        this._widgetImpl.get().goToPreviousChange();
    }
};
MultiDiffEditorWidget = __decorate([
    __param(2, IInstantiationService)
], MultiDiffEditorWidget);
export { MultiDiffEditorWidget };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibXVsdGlEaWZmRWRpdG9yV2lkZ2V0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvZWRpdG9yL2Jyb3dzZXIvd2lkZ2V0L211bHRpRGlmZkVkaXRvci9tdWx0aURpZmZFZGl0b3JXaWRnZXQudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFHaEcsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQ3pELE9BQU8sRUFBRSx1QkFBdUIsRUFBRSxNQUFNLDZDQUE2QyxDQUFDO0FBQ3RGLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUNsRSxPQUFPLEVBQUUsT0FBTyxFQUFFLGVBQWUsRUFBRSw2QkFBNkIsRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBRWhILE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLDREQUE0RCxDQUFDO0FBTW5HLE9BQU8sYUFBYSxDQUFDO0FBQ3JCLE9BQU8sRUFBRSxzQkFBc0IsRUFBRSxNQUFNLDZCQUE2QixDQUFDO0FBRXJFLE9BQU8sRUFBRSx3QkFBd0IsRUFBRSxNQUFNLCtCQUErQixDQUFDO0FBQ3pFLE9BQU8sRUFBbUQseUJBQXlCLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQUdySCxJQUFNLHFCQUFxQixHQUEzQixNQUFNLHFCQUFzQixTQUFRLFVBQVU7SUFlcEQsWUFDa0IsUUFBcUIsRUFDckIsMEJBQXNELEVBQ2hELHFCQUE2RDtRQUVwRixLQUFLLEVBQUUsQ0FBQztRQUpTLGFBQVEsR0FBUixRQUFRLENBQWE7UUFDckIsK0JBQTBCLEdBQTFCLDBCQUEwQixDQUE0QjtRQUMvQiwwQkFBcUIsR0FBckIscUJBQXFCLENBQXVCO1FBakJwRSxlQUFVLEdBQUcsZUFBZSxDQUF3QixJQUFJLEVBQUUsU0FBUyxDQUFDLENBQUM7UUFDckUsZUFBVSxHQUFHLGVBQWUs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