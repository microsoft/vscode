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
var RangeHighlightDecorations_1;
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { ModelDecorationOptions } from '../../../../../editor/common/model/textModel.js';
import { IModelService } from '../../../../../editor/common/services/model.js';
/**
 * Can add a range highlight decoration to a model.
 * It will automatically remove it when the model has its decorations changed.
 */
let RangeHighlightDecorations = class RangeHighlightDecorations {
    static { RangeHighlightDecorations_1 = this; }
    constructor(_modelService) {
        this._modelService = _modelService;
        this._decorationId = null;
        this._model = null;
        this._modelDisposables = new DisposableStore();
    }
    removeHighlightRange() {
        if (this._model && this._decorationId) {
            const decorationId = this._decorationId;
            this._model.changeDecorations((accessor) => {
                accessor.removeDecoration(decorationId);
            });
        }
        this._decorationId = null;
    }
    highlightRange(resource, range, ownerId = 0) {
        let model;
        if (URI.isUri(resource)) {
            model = this._modelService.getModel(resource);
        }
        else {
            model = resource;
        }
        if (model) {
            this.doHighlightRange(model, range);
        }
    }
    doHighlightRange(model, range) {
        this.removeHighlightRange();
        model.changeDecorations((accessor) => {
            this._decorationId = accessor.addDecoration(range, RangeHighlightDecorations_1._RANGE_HIGHLIGHT_DECORATION);
        });
        this.setModel(model);
    }
    setModel(model) {
        if (this._model !== model) {
            this.clearModelListeners();
            this._model = model;
            this._modelDisposables.add(this._model.onDidChangeDecorations((e) => {
                this.clearModelListeners();
                this.removeHighlightRange();
                this._model = null;
            }));
            this._modelDisposables.add(this._model.onWillDispose(() => {
                this.clearModelListeners();
                this.removeHighlightRange();
                this._model = null;
            }));
        }
    }
    clearModelListeners() {
        this._modelDisposables.clear();
    }
    dispose() {
        if (this._model) {
            this.removeHighlightRange();
            this._model = null;
        }
        this._modelDisposables.dispose();
    }
    static { this._RANGE_HIGHLIGHT_DECORATION = ModelDecorationOptions.register({
        description: 'search-range-highlight',
        stickiness: 1 /* TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges */,
        className: 'rangeHighlight',
        isWholeLine: true
    }); }
};
RangeHighlightDecorations = RangeHighlightDecorations_1 = __decorate([
    __param(0, IModelService)
], RangeHighlightDecorations);
export { RangeHighlightDecorations };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicmFuZ2VEZWNvcmF0aW9ucy5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL3NlYXJjaC9icm93c2VyL3NlYXJjaFRyZWVNb2RlbC9yYW5nZURlY29yYXRpb25zLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQWUsZUFBZSxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDdkYsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBRXhELE9BQU8sRUFBRSxzQkFBc0IsRUFBRSxNQUFNLGlEQUFpRCxDQUFDO0FBQ3pGLE9BQU8sRUFBRSxhQUFhLEVBQUUsTUFBTSxnREFBZ0QsQ0FBQztBQUcvRTs7O0dBR0c7QUFFSSxJQUFNLHlCQUF5QixHQUEvQixNQUFNLHlCQUF5Qjs7SUFNckMsWUFDZ0IsYUFBNkM7UUFBNUIsa0JBQWEsR0FBYixhQUFhLENBQWU7UUFMckQsa0JBQWEsR0FBa0IsSUFBSSxDQUFDO1FBQ3BDLFdBQU0sR0FBc0IsSUFBSSxDQUFDO1FBQ3hCLHNCQUFpQixHQUFHLElBQUksZUFBZSxFQUFFLENBQUM7SUFLM0QsQ0FBQztJQUVELG9CQUFvQjtRQUNuQixJQUFJLElBQUksQ0FBQyxNQUFNLElBQUksSUFBSSxDQUFDLGFBQWEsRUFBRSxDQUFDO1lBQ3ZDLE1BQU0sWUFBWSxHQUFHLElBQUksQ0FBQyxhQUFhLENBQUM7WUFDeEMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDLFFBQVEsRUFBRSxFQUFFO2dCQUMxQyxRQUFRLENBQUMsZ0JBQWdCLENBQUMsWUFBWSxDQUFDLENBQUM7WUFDekMsQ0FBQyxDQUFDLENBQUM7UUFDSixDQUFDO1FBQ0QsSUFBSSxDQUFDLGFBQWEsR0FBRyxJQUFJLENBQUM7SUFDM0IsQ0FBQztJQUVELGNBQWMs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