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
import { Disposable, DisposableStore, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { ILanguageFeaturesService } from '../../../common/services/languageFeatures.js';
import { OutlineElement, OutlineGroup, OutlineModel } from '../../documentSymbols/browser/outlineModel.js';
import { createCancelablePromise, Delayer } from '../../../../base/common/async.js';
import { FoldingController, RangesLimitReporter } from '../../folding/browser/folding.js';
import { SyntaxRangeProvider } from '../../folding/browser/syntaxRangeProvider.js';
import { IndentRangeProvider } from '../../folding/browser/indentRangeProvider.js';
import { ILanguageConfigurationService } from '../../../common/languages/languageConfigurationRegistry.js';
import { onUnexpectedError } from '../../../../base/common/errors.js';
import { StickyElement, StickyModel, StickyRange } from './stickyScrollElement.js';
import { Iterable } from '../../../../base/common/iterator.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
var ModelProvider;
(function (ModelProvider) {
    ModelProvider["OUTLINE_MODEL"] = "outlineModel";
    ModelProvider["FOLDING_PROVIDER_MODEL"] = "foldingProviderModel";
    ModelProvider["INDENTATION_MODEL"] = "indentationModel";
})(ModelProvider || (ModelProvider = {}));
var Status;
(function (Status) {
    Status[Status["VALID"] = 0] = "VALID";
    Status[Status["INVALID"] = 1] = "INVALID";
    Status[Status["CANCELED"] = 2] = "CANCELED";
})(Status || (Status = {}));
let StickyModelProvider = class StickyModelProvider extends Disposable {
    constructor(_editor, onProviderUpdate, _languageConfigurationService, _languageFeaturesService) {
        super();
        this._editor = _editor;
        this._modelProviders = [];
        this._modelPromise = null;
        this._updateScheduler = this._register(new Delayer(300));
        this._updateOperation = this._register(new DisposableStore());
        switch (this._editor.getOption(131 /* EditorOption.stickyScroll */).defaultModel) {
            case ModelProvider.OUTLINE_MODEL:
                this._modelProviders.push(new StickyModelFromCandidateOutlineProvider(this._editor, _languageFeaturesService));
            // fall through
            case ModelProvider.FOLDING_PROVIDER_MODEL:
                this._modelProviders.push(new StickyModelFromCandidateSyntaxFoldingProvider(this._editor, onProviderUpdate, _languageFeaturesService));
            // fall through
            case ModelProvider.INDENTATION_MODEL:
                this._modelProviders.push(new StickyModelFromCandidateIndentationFoldingProvider(this._editor, _languageConfigurationService));
                break;
        }
    }
    dispose() {
        this._modelProviders.forEach(provider => provider.dispose());
        this._updateOperation.clear();
        this._cancelModelPromise();
        super.dispose();
    }
    _cancelModelPromise() {
        if (this._modelPromise) {
            this._modelPromise.cancel();
            this._modelPromise = null;
        }
    }
    async update(token) {
        this._updateOperation.clear();
        this._updateOperation.add({
            dispose: () => {
                this._cancelModelPromise();
                this._updateScheduler.cancel();
            }
        });
        this._cancelModelPromise();
        return await this._updateScheduler.trigger(async () => {
            for (const modelProvider of this._modelProviders) {
                const { statusPromise, modelPromise } = modelProvider.computeStickyModel(token);
                this._modelPromise = modelPromise;
                const status = await statusPromise;
                if (this._modelPromise !== modelPromise) {
                    return null;
                }
                switch (status) {
                    case Status.CANCELED:
                        this._updateOperation.clear();
                        return null;
                    case Status.VALID:
                        return modelProvider.stickyModel;
                }
            }
            return null;
        }).catch((error) => {
            onUnexpectedError(error);
            return null;
        });
    }
};
StickyModelProvider = __decorate([
    __param(2, IInstantiationService),
    __param(3, ILanguageFeaturesService)
], StickyModelProvider);
export { StickyModelProvider };
class StickyModelCandidateProvider extends Disposable {
    constructor(_editor) {
        super();
        this._editor = _editor;
        this._stickyModel = null;
    }
    get stickyModel() {
        return this._stickyModel;
    }
    _invalid() {
        this._stickyModel = null;
        return Status.INVALID;
    }
    computeStickyModel(token) {
        if (token.isCancellationRequested || !this.isProviderValid()) {
            return { statusPromise: this._invalid(), modelPromise: null };
        }
        const providerModelPromise = createCancelablePromise(token => this.createModelFromProvider(token));
        return {
            statusPromise: providerModelPromise.then(providerModel => {
                if (!this.isModelValid(providerModel)) {
                    return this._invalid();
                }
                if (token.isCancellationRequested) {
                    return Status.CANCELED;
                }
                this._stickyModel = this.createStickyModel(token, providerModel);
                return Status.VALID;
            }).then(undefined, (err) => {
                onUnexpectedError(err);
                return Status.CANCELED;
            }),
            modelPromise: providerModelPromise
        };
    }
    /**
     * Method which checks whether the model returned by the provider is valid and can be used to compute a sticky model.
     * This method by default returns true.
     * @param model model returned by the provider
     * @returns boolean indicating whether the model is valid
     */
    isModelValid(model) {
        return true;
    }
    /**
     * Method which checks whether the provider is valid before applying it to find the provider model.
     * This method by default returns true.
     * @returns boolean indicating whether the provider is valid
     */
    isProviderValid() {
        return true;
    }
}
let StickyModelFromCandidateOutlineProvider = class StickyModelFromCandidateOutlineProvider extends StickyModelCandidateProvider {
    constructor(_editor, _languageFeaturesService) {
        super(_editor);
        this._languageFeaturesService = _languageFeaturesService;
    }
    createModelFromProvider(token) {
        return OutlineModel.create(this._languageFeaturesService.documentSymbolProvider, this._editor.getModel(), token);
    }
    createStickyModel(token, model) {
        const { stickyOutlineElement, providerID } = this._stickyModelFromOutlineModel(model, this._stickyModel?.outlineProviderId);
        const textModel = this._editor.getModel();
        return new StickyModel(textModel.uri, textModel.getVersionId(), stickyOutlineElement, providerID);
    }
    isModelValid(model) {
        return model && model.children.size > 0;
    }
    _stickyModelFromOutlineModel(outlineModel, preferredProvider) {
        let outlineElements;
        // When several possible outline providers
        if (Iterable.first(outlineModel.children.values()) instanceof OutlineGroup) {
            const provider = Iterable.find(outlineModel.children.values(), outlineGroupOfModel => outlineGroupOfModel.id === preferredProvider);
            if (provider) {
                outlineElements = provider.children;
            }
            else {
                let tempID = '';
                let maxTotalSumOfRanges = -1;
                let optimalOutlineGroup = undefined;
                for (const [_key, outlineGroup] of outlineModel.children.entries()) {
                    const totalSumRanges = this._findSumOfRangesOfGroup(outlineGroup);
                    if (totalSumRanges > maxTotalSumOfRanges) {
                        optimalOutlineGroup = outlineGroup;
                        maxTotalSumOfRanges = totalSumRanges;
                        tempID = outlineGroup.id;
                    }
                }
                preferredProvider = tempID;
                outlineElements = optimalOutlineGroup.children;
            }
        }
        else {
            outlineElements = outlineModel.children;
        }
        const stickyChildren = [];
        const outlineElementsArray = Array.from(outlineElements.values()).sort((element1, element2) => {
            const range1 = new StickyRange(element1.symbol.range.startLineNumber, element1.symbol.range.endLineNumber);
            const range2 = new StickyRange(element2.symbol.range.startLineNumber, element2.symbol.range.endLineNumber);
            return this._comparator(range1, range2);
        });
        for (const outlineElement of outlineElementsArray) {
            stickyChildren.push(this._stickyModelFromOutlineElement(outlineElement, outlineElement.symbol.selectionRange.startLineNumber));
        }
        const stickyOutlineElement = new StickyElement(undefined, stickyChildren, undefined);
        return {
            stickyOutlineElement: stickyOutlineElement,
            providerID: preferredProvider
        };
    }
    _stickyModelFromOutlineElement(outlineElement, previousStartLine) {
        const children = [];
        for (const child of outlineElement.children.values()) {
            if (child.symbol.selectionRange.startLineNumber !== child.symbol.range.endLineNumber) {
                if (child.symbol.selectionRange.startLineNumber !== previousStartLine) {
                    children.push(this._stickyModelFromOutlineElement(child, child.symbol.selectionRange.startLineNumber));
                }
                else {
                    for (const subchild of child.children.values()) {
                        children.push(this._stickyModelFromOutlineElement(subchild, child.symbol.selectionRange.startLineNumber));
                    }
                }
            }
        }
        children.sort((child1, child2) => this._comparator(child1.range, child2.range));
        const range = new StickyRange(outlineElement.symbol.selectionRange.startLineNumber, outlineElement.symbol.range.endLineNumber);
        return new StickyElement(range, children, undefined);
    }
    _comparator(range1, range2) {
        if (range1.startLineNumber !== range2.startLineNumber) {
            return range1.startLineNumber - range2.startLineNumber;
        }
        else {
            return range2.endLineNumber - range1.endLineNumber;
        }
    }
    _findSumOfRangesOfGroup(outline) {
        let res = 0;
        for (const child of outline.children.values()) {
            res += this._findSumOfRangesOfGroup(child);
        }
        if (outline instanceof OutlineElement) {
            return res + outline.symbol.range.endLineNumber - outline.symbol.selectionRange.startLineNumber;
        }
        else {
            return res;
        }
    }
};
StickyModelFromCandidateOutlineProvider = __decorate([
    __param(1, ILanguageFeaturesService)
], StickyModelFromCandidateOutlineProvider);
class StickyModelFromCandidateFoldingProvider extends StickyModelCandidateProvider {
    constructor(editor) {
        super(editor);
        this._foldingLimitReporter = this._register(new RangesLimitReporter(editor));
    }
    createStickyModel(token, model) {
        const foldingElement = this._fromFoldingRegions(model);
        const textModel = this._editor.getModel();
        return new StickyModel(textModel.uri, textModel.getVersionId(), foldingElement, undefined);
    }
    isModelValid(model) {
        return model !== null;
    }
    _fromFoldingRegions(foldingRegions) {
        const length = foldingRegions.length;
        const orderedStickyElements = [];
        // The root sticky outline element
        const stickyOutlineElement = new StickyElement(undefined, [], undefined);
        for (let i = 0; i < length; i++) {
            // Finding the parent index of the current range
            const parentIndex = foldingRegions.getParentIndex(i);
            let parentNode;
            if (parentIndex !== -1) {
                // Access the reference of the parent node
                parentNode = orderedStickyElements[parentIndex];
            }
            else {
                // In that case the parent node is the root node
                parentNode = stickyOutlineElement;
            }
            const child = new StickyElement(new StickyRange(foldingRegions.getStartLineNumber(i), foldingRegions.getEndLineNumber(i) + 1), [], parentNode);
            parentNode.children.push(child);
            orderedStickyElements.push(child);
        }
        return stickyOutlineElement;
    }
}
let StickyModelFromCandidateIndentationFoldingProvider = class StickyModelFromCandidateIndentationFoldingProvider extends StickyModelFromCandidateFoldingProvider {
    constructor(editor, _languageConfigurationService) {
        super(editor);
        this._languageConfigurationService = _languageConfigurationService;
        this.provider = this._register(new IndentRangeProvider(editor.getModel(), this._languageConfigurationService, this._foldingLimitReporter));
    }
    async createModelFromProvider(token) {
        return this.provider.compute(token);
    }
};
StickyModelFromCandidateIndentationFoldingProvider = __decorate([
    __param(1, ILanguageConfigurationService)
], StickyModelFromCandidateIndentationFoldingProvider);
let StickyModelFromCandidateSyntaxFoldingProvider = class StickyModelFromCandidateSyntaxFoldingProvider extends StickyModelFromCandidateFoldingProvider {
    constructor(editor, onProviderUpdate, _languageFeaturesService) {
        super(editor);
        this._languageFeaturesService = _languageFeaturesService;
        this.provider = this._register(new MutableDisposable());
        this._register(this._languageFeaturesService.foldingRangeProvider.onDidChange(() => {
            this._updateProvider(editor, onProviderUpdate);
        }));
        this._updateProvider(editor, onProviderUpdate);
    }
    _updateProvider(editor, onProviderUpdate) {
        const selectedProviders = FoldingController.getFoldingRangeProviders(this._languageFeaturesService, editor.getModel());
        if (selectedProviders.length === 0) {
            return;
        }
        this.provider.value = new SyntaxRangeProvider(editor.getModel(), selectedProviders, onProviderUpdate, this._foldingLimitReporter, undefined);
    }
    isProviderValid() {
        return this.provider !== undefined;
    }
    async createModelFromProvider(token) {
        return this.provider.value?.compute(token) ?? null;
    }
};
StickyModelFromCandidateSyntaxFoldingProvider = __decorate([
    __param(2, ILanguageFeaturesService)
], StickyModelFromCandidateSyntaxFoldingProvider);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3RpY2t5U2Nyb2xsTW9kZWxQcm92aWRlci5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL2VkaXRvci9jb250cmliL3N0aWNreVNjcm9sbC9icm93c2VyL3N0aWNreVNjcm9sbE1vZGVsUHJvdmlkZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLFVBQVUsRUFBRSxlQUFlLEVBQWUsaUJBQWlCLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUVuSCxPQUFPLEVBQUUsd0JBQXdCLEVBQUUsTUFBTSw4Q0FBOEMsQ0FBQztBQUN4RixPQUFPLEVBQUUsY0FBYyxFQUFFLFlBQVksRUFBRSxZQUFZLEVBQUUsTUFBTSwrQ0FBK0MsQ0FBQztBQUUzRyxPQUFPLEVBQXFCLHVCQUF1QixFQUFFLE9BQU8sRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQ3ZHLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxtQkFBbUIsRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQzFGLE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLDhDQUE4QyxDQUFDO0FBQ25GLE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLDhDQUE4QyxDQUFDO0FBQ25GLE9BQU8sRUFBRSw2QkFBNkIsRUFBRSxNQUFNLDREQUE0RCxDQUFDO0FBRTNHLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQ3RFLE9BQU8sRUFBRSxhQUFhLEVBQUUsV0FBVyxFQUFFLFdBQVcsRUFBRSxNQUFNLDBCQUEwQixDQUFDO0FBQ25GLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUMvRCxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSw0REFBNEQsQ0FBQztBQUduRyxJQUFLLGFBSUo7QUFKRCxXQUFLLGFBQWE7SUFDakIsK0NBQThCLENBQUE7SUFDOUIsZ0VBQStDLENBQUE7SUFDL0MsdURBQXNDLENBQUE7QUFDdkMsQ0FBQyxFQUpJLGFBQWEsS0FBYixhQUFhLFFBSWpCO0FBRUQsSUFBSyxNQUlKO0FBSkQsV0FBSyxNQUFNO0lBQ1YscUNBQUssQ0FBQTtJQUNMLHlDQUFPLENBQUE7SUFDUCwyQ0FBUSxDQUFBO0FBQ1QsQ0FBQyxFQUpJLE1BQU0sS0FBTixNQUFNLFFBSVY7QUFZTSxJQUFNLG1CQUFtQixHQUF6QixNQUFNLG1CQUFvQixTQUFRLFVBQVU7SUFPbEQsWUFDa0IsT0FBMEIsRUFDM0MsZ0JBQTRCLEVBQ0wsNkJBQTRELEVBQ3pELHdCQUFrRDtRQUU1RSxLQUFLLEVBQUUsQ0FBQztRQUxTLFlBQU8sR0FBUCxPQUFPLENBQW1CO1FBTnBDLG9CQUFlLEdBQXlDLEVBQUUsQ0FBQztRQUMzRCxrQkFBYSxHQUF5QyxJQUFJLENBQUM7UUFDM0QscUJBQWdCLEdBQWdDLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxPQUFPLENBQXFCLEdBQUcsQ0FBQyxDQUFDLENBQUM7UUFDNUYscUJBQWdCLEdBQW9CLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxlQUFlLEVBQUUsQ0FBQyxDQUFDO1FBVTFGLFFBQVEsSUFBSSxDQUFDLE9BQU8sQ0FBQyxTQUFTLHFDQUEyQixDQUFDLFlBQVksRUFBRSxDQUFDO1lBQ3hFLEtBQUssYUFBYSxDQUFDLGFBQWE7Z0JBQy9CLElBQUksQ0FBQyxlQUFlLENBQUMsSUFBSSxDQUFDLElBQUksdUNBQXVDLENBQUMsSUFBSSxDQUFDLE9BQU8sRUFBRSx3QkFBd0IsQ0FBQyxDQUFDLENBQUM7WUFDaEgsZUFBZTtZQUNmLEtBQUssYUFBYSxDQUFDLHNCQUFzQjtnQkFDeEMsSUFBSSxDQUFDLGVBQWUsQ0FBQyxJQUFJLENBQUMsSUFBSSw2Q0FBNkMsQ0FBQyxJQUFJLENBQUMsT0FBTyxFQUFFLGdCQUFnQixFQUFFLHdCQUF3QixDQUFDLENBQUMsQ0FBQztZQUN4SSxlQUFlO1lBQ2YsS0FBSyxhQUFhLENBQUMsaUJBQWlCO2dCQUNuQyxJQUFJLENBQUMsZUFBZSxDQUFDLElBQUksQ0FBQyxJQUFJLGtEQUFrRCxDQUFDLElBQUksQ0FBQyxPQUFPLEVBQUUsNkJBQTZCLENBQUMsQ0FBQyxDQUFDO2dCQUMvSCxNQUFNO1FBQ1IsQ0FBQztJQUNGLENBQUM7SUFFZSxPQUFPO1FBQ3RCLElBQUksQ0FBQyxlQUFlLENBQUMsT0FBTyxDQUFDLFFBQVEsQ0FBQyxFQUFFLENBQUMsUUFBUSxDQUFDLE9BQU8sRUFBRSxDQUFDLENBQUM7UUFDN0QsSUFBSSxDQUFDLGdCQUFnQixDQUFDLEtBQUssRUFBRSxDQUFDO1FBQzlCLElBQUksQ0FBQyxtQkFBbUIsRUFBRSxDQUFDO1FBQzNCLEtBQUssQ0FBQyxPQUFPLEVBQUUsQ0FBQztJQUNqQixDQUFDO0lBRU8sbUJBQW1CO1FBQzFCLElBQUksSUFBSSxDQUFDLGFBQWEsRUFBRSxDQUFDO1lBQ3hCLElBQUksQ0FBQyxhQUFhLENBQUMsTUFBTSxFQUFFLENBQUM7WUFDNUIsSUFBSSxDQUFDLGFBQWEsR0FBRyxJQUFJLENBQUM7UUFDM0IsQ0FBQztJQUNGLENBQUM7SUFFTSxLQUFLLENBQUMsTUFBTSxDQUFDLEtBQXdCO1FBRTNDLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxLQUFLLEVBQUUsQ0FBQztRQUM5QixJQUFJLENBQUMsZ0JBQWdCLENBQUMsR0FBRyxDQUFDO1lBQ3pCLE9BQU8sRUFBRSxHQUFHLEVBQUU7Z0JBQ2IsSUFBSSxDQUFDLG1CQUFtQixFQUFFLENBQUM7Z0JBQzNCLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxNQUFNLEVBQUUsQ0FBQztZQUNoQyxDQUFDO1NBQ0QsQ0FBQyxDQUFDO1FBQ0gsSUFBSSxDQUFDLG1CQUFtQixFQUFFLENBQUM7UUFFM0IsT0FBTyxNQUFNLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxPQUFPLENBQUMsS0FBSyxJQUFJLEVBQUU7WUFFckQsS0FBSyxNQUFNLGFBQWEsSUFBSSxJQUFJLENBQUMsZUFBZSxFQUFFLENBQUM7Z0JBQ2xELE1BQU0sRUFBRSxhQUFhLEVBQUUsWUFBWSxFQUFFLEdBQUcsYUFBYSxDQUFDLGtCQUFrQixDQUFDLEtBQUssQ0FBQyxDQUFDO2dCQUNoRixJQUFJLENBQUMsYUFBYSxHQUFHLFlBQVksQ0FBQztnQkFDbEMsTUFBTSxNQUFNLEdBQUcsTUFBTSxhQUFhLENBQUM7Z0JBQ25DLElBQUksSUFBSSxDQUFDLGFBQWEsS0FBSyxZQUFZLEVBQUUsQ0FBQztvQkFDekMsT0FBTyxJQUFJLENBQUM7Z0JBQ2IsQ0FBQztnQkFDRCxRQUFRLE1BQU0sRUFBRSxDQUFDO29CQUNoQixLQUFLLE1BQU0sQ0FBQyxRQUFRO3dCQUNuQixJQUFJLENBQUMsZ0JBQWdCLENBQUMsS0FBSyxFQUFFLENBQUM7d0JBQzlCLE9BQU8sSUFBSSxDQUFDO29CQUNiLEtBQUssTUFBTSxDQUFDLEtBQUs7d0JBQ2hCLE9BQU8sYUFBYSxDQUFDLFdBQVcsQ0FBQztnQkFDbkMsQ0FBQztZQUNGLENBQUM7WUFDRCxPQUFPLElBQUksQ0FBQztRQUNiLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDLEtBQUssRUFBRSxFQUFFO1lBQ2xCLGlCQUFpQixDQUFDLEtBQUssQ0FBQyxDQUFDO1lBQ3pCLE9BQU8sSUFBSSxDQUFDO1FBQ2IsQ0FBQyxDQUFDLENBQUM7SUFDSixDQUFDO0NBQ0QsQ0FBQTtBQTVFWSxtQkFBbUI7SUFVN0IsV0FBQSxxQkFBcUIsQ0FBQTtJQUNyQixXQUFBLHdCQUF3QixDQUFBO0dBWGQsbUJBQW1CLENBNEUvQjs7QUFhRCxNQUFlLDRCQUFnQyxTQUFRLFVBQVU7SUFJaEUsWUFBK0IsT0FBMEI7UUFDeEQsS0FBSyxFQUFFLENBQUM7UUFEc0IsWUFBTyxHQUFQLE9BQU8sQ0FBbUI7UUFGL0MsaUJBQVksR0FBdUIsSUFBSSxDQUFDO0lBSWxELENBQUM7SUFFRCxJQUFJLFdBQVc7UUFDZCxPQUFPLElBQUksQ0FBQyxZQUFZLENBQUM7SUFDMUIsQ0FBQztJQUVPLFFBQVE7UUFDZixJQUFJLENBQUMsWUFBWSxHQUFHLElBQUksQ0FBQztRQUN6QixPQUFPLE1BQU0sQ0FBQyxPQUFPLENBQUM7SUFDdkIsQ0FBQztJQUVNLGtCQUFrQixDQUFDLEtBQXdCO1FBQ2pELElBQUksS0FBSyxDQUFDLHVCQUF1QixJQUFJLENBQUMsSUFBSSxDQUFDLGVBQWUsRUFBRSxFQUFFLENBQUM7WUFDOUQsT0FBTyxFQUFFLGFBQWEsRUFBRSxJQUFJLENBQUMsUUFBUSxFQUFFLEVBQUUsWUFBWSxFQUFFLElBQUksRUFBRSxDQUFDO1FBQy9ELENBQUM7UUFDRCxNQUFNLG9CQUFvQixHQUFHLHVCQUF1QixDQUFDLEtBQUssQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLHVCQUF1QixDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUM7UUFFbkcsT0FBTztZQUNOLGFBQWEsRUFBRSxvQkFBb0IsQ0FBQyxJQUFJLENBQUMsYUFBYSxDQUFDLEVBQUU7Z0JBQ3hELElBQUksQ0FBQyxJQUFJLENBQUMsWUFBWSxDQUFDLGFBQWEsQ0FBQyxFQUFFLENBQUM7b0JBQ3ZDLE9BQU8sSUFBSSxDQUFDLFFBQVEsRUFBRSxDQUFDO2dCQUV4QixDQUFDO2dCQUNELElBQUksS0FBSyxDQUFDLHVCQUF1QixFQUFFLENBQUM7b0JBQ25DLE9BQU8sTUFBTSxDQUFDLFFBQVEsQ0FBQztnQkFDeEIsQ0FBQztnQkFDRCxJQUFJLENBQUMsWUFBWSxHQUFHLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxLQUFLLEVBQUUsYUFBYSxDQUFDLENBQUM7Z0JBQ2pFLE9BQU8sTUFBTSxDQUFDLEtBQUssQ0FBQztZQUNyQixDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsU0FBUyxFQUFFLENBQUMsR0FBRyxFQUFFLEVBQUU7Z0JBQzFCLGlCQUFpQixDQUFDLEdBQUcsQ0FBQyxDQUFDO2dCQUN2QixPQUFPLE1BQU0sQ0FBQyxRQUFRLENBQUM7WUFDeEIsQ0FBQyxDQUFDO1lBQ0YsWUFBWSxFQUFFLG9CQUFvQjtTQUNsQyxDQUFDO0lBQ0gsQ0FBQztJQUVEOzs7OztPQUtHO0lBQ08sWUFBWSxDQUFDLEtBQVE7UUFDOUIsT0FBTyxJQUFJLENBQUM7SUFDYixDQUFDO0lBRUQ7Ozs7T0FJRztJQUNPLGVBQWU7UUFDeEIsT0FBTyxJQUFJLENBQUM7SUFDYixDQUFDO0NBZ0JEO0FBRUQsSUFBTSx1Q0FBdUMsR0FBN0MsTUFBTSx1Q0FBd0MsU0FBUSw0QkFBMEM7SUFFL0YsWUFBWSxPQUEwQixFQUE2Qyx3QkFBa0Q7UUFDcEksS0FBSyxDQUFDLE9BQU8sQ0FBQyxDQUFDO1FBRG1FLDZCQUF3QixHQUF4Qix3QkFBd0IsQ0FBMEI7SUFFckksQ0FBQztJQUVTLHVCQUF1QixDQUFDLEtBQXdCO1FBQ3pELE9BQU8sWUFBWSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsd0JBQXdCLENBQUMsc0JBQXNCLEVBQUUsSUFBSSxDQUFDLE9BQU8sQ0FBQyxRQUFRLEVBQUUsRUFBRSxLQUFLLENBQUMsQ0FBQztJQUNsSCxDQUFDO0lBRVMsaUJBQWlCLENBQUMsS0FBd0IsRUFBRSxLQUFtQjtRQUN4RSxNQUFNLEVBQUUsb0JBQW9CLEVBQUUsVUFBVSxFQUFFLEdBQUcsSUFBSSxDQUFDLDRCQUE0QixDQUFDLEtBQUssRUFBRSxJQUFJLENBQUMsWUFBWSxFQUFFLGlCQUFpQixDQUFDLENBQUM7UUFDNUgsTUFBTSxTQUFTLEdBQUcsSUFBSSxDQUFDLE9BQU8sQ0FBQyxRQUFRLEVBQUUsQ0FBQztRQUMxQyxPQUFPLElBQUksV0FBVyxDQUFDLFNBQVMsQ0FBQyxHQUFHLEVBQUUsU0FBUyxDQUFDLFlBQVksRUFBRSxFQUFFLG9CQUFvQixFQUFFLFVBQVUsQ0FBQyxDQUFDO0lBQ25HLENBQUM7SUFFa0IsWUFBWSxDQUFDLEtBQW1CO1FBQ2xELE9BQU8sS0FBSyxJQUFJLEtBQUssQ0FBQyxRQUFRLENBQUMsSUFBSSxHQUFHLENBQUMsQ0FBQztJQUN6QyxDQUFDO0lBRU8sNEJBQTRCLENBQUMsWUFBMEIsRUFBRSxpQkFBcUM7UUFFckcsSUFBSSxlQUE0QyxDQUFDO1FBQ2pELDBDQUEwQztRQUMxQyxJQUFJLFFBQVEsQ0FBQyxLQUFLLENBQUMsWUFBWSxDQUFDLFFBQVEsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxZQUFZLFlBQVksRUFBRSxDQUFDO1lBQzVFLE1BQU0sUUFBUSxHQUFHLFFBQVEsQ0FBQyxJQUFJLENBQUMsWUFBWSxDQUFDLFFBQVEsQ0FBQyxNQUFNLEVBQUUsRUFBRSxtQkFBbUIsQ0FBQyxFQUFFLENBQUMsbUJBQW1CLENBQUMsRUFBRSxLQUFLLGlCQUFpQixDQUFDLENBQUM7WUFDcEksSUFBSSxRQUFRLEVBQUUsQ0FBQztnQkFDZCxlQUFlLEdBQUcsUUFBUSxDQUFDLFFBQVEsQ0FBQztZQUNyQyxDQUFDO2lCQUFNLENBQUM7Z0JBQ1AsSUFBSSxNQUFNLEdBQUcsRUFBRSxDQUFDO2dCQUNoQixJQUFJLG1CQUFtQixHQUFHLENBQUMsQ0FBQyxDQUFDO2dCQUM3QixJQUFJLG1CQUFtQixHQUE4QyxTQUFTLENBQUM7Z0JBQy9FLEtBQUssTUFBTSxDQUFDLElBQUksRUFBRSxZQUFZLENBQUMsSUFBSSxZQUFZLENBQUMsUUFBUSxDQUFDLE9BQU8sRUFBRSxFQUFFLENBQUM7b0JBQ3BFLE1BQU0sY0FBYyxHQUFHLElBQUksQ0FBQyx1QkFBdUIsQ0FBQyxZQUFZLENBQUMsQ0FBQztvQkFDbEUsSUFBSSxjQUFjLEdBQUcsbUJBQW1CLEVBQUUsQ0FBQzt3QkFDMUMsbUJBQW1CLEdBQUcsWUFBWSxDQUFDO3dCQUNuQyxtQkFBbUIsR0FBRyxjQUFjLENBQUM7d0JBQ3JDLE1BQU0sR0FBRyxZQUFZLENBQUMsRUFBRSxDQUFDO29CQUMxQixDQUFDO2dCQUNGLENBQUM7Z0JBQ0QsaUJBQWlCLEdBQUcsTUFBTSxDQUFDO2dCQUMzQixlQUFlLEdBQUcsbUJBQW9CLENBQUMsUUFBUSxDQUFDO1lBQ2pELENBQUM7UUFDRixDQUFDO2FBQU0sQ0FBQztZQUNQLGVBQWUsR0FBRyxZQUFZLENBQUMsUUFBdUMsQ0FBQztRQUN4RSxDQUFDO1FBQ0QsTUFBTSxjQUFjLEdBQW9CLEVBQUUsQ0FBQztRQUMzQyxNQUFNLG9CQUFvQixHQUFHLEtBQUssQ0FBQyxJQUFJLENBQUMsZUFBZSxDQUFDLE1BQU0sRUFBRSxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsUUFBUSxFQUFFLFFBQVEsRUFBRSxFQUFFO1lBQzdGLE1BQU0sTUFBTSxHQUFnQixJQUFJLFdBQVcsQ0FBQyxRQUFRLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyxlQUFlLEVBQUUsUUFBUSxDQUFDLE1BQU0sQ0FBQyxLQUFLLENBQUMsYUFBYSxDQUFDLENBQUM7WUFDeEgsTUFBTSxNQUFNLEdBQWdCLElBQUksV0FBVyxDQUFDLFFBQVEsQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLGVBQWUsRUFBRSxRQUFRLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyxhQUFhLENBQUMsQ0FBQztZQUN4SCxPQUFPLElBQUksQ0FBQyxXQUFXLENBQUMsTUFBTSxFQUFFLE1BQU0sQ0FBQyxDQUFDO1FBQ3pDLENBQUMsQ0FBQyxDQUFDO1FBQ0gsS0FBSyxNQUFNLGNBQWMsSUFBSSxvQkFBb0IsRUFBRSxDQUFDO1lBQ25ELGNBQWMsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLDhCQUE4QixDQUFDLGNBQWMsRUFBRSxjQUFjLENBQUMsTUFBTSxDQUFDLGNBQWMsQ0FBQyxlQUFlLENBQUMsQ0FBQyxDQUFDO1FBQ2hJLENBQUM7UUFDRCxNQUFNLG9CQUFvQixHQUFHLElBQUksYUFBYSxDQUFDLFNBQVMsRUFBRSxjQUFjLEVBQUUsU0FBUyxDQUFDLENBQUM7UUFFckYsT0FBTztZQUNOLG9CQUFvQixFQUFFLG9CQUFvQjtZQUMxQyxVQUFVLEVBQUUsaUJBQWlCO1NBQzdCLENBQUM7SUFDSCxDQUFDO0lBRU8sOEJBQThCLENBQUMsY0FBOEIsRUFBRSxpQkFBeUI7UUFDL0YsTUFBTSxRQUFRLEdBQW9CLEVBQUUsQ0FBQztRQUNyQyxLQUFLLE1BQU0sS0FBSyxJQUFJLGNBQWMsQ0FBQyxRQUFRLENBQUMsTUFBTSxFQUFFLEVBQUUsQ0FBQztZQUN0RCxJQUFJLEtBQUssQ0FBQyxNQUFNLENBQUMsY0FBYyxDQUFDLGVBQWUsS0FBSyxLQUFLLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyxhQUFhLEVBQUUsQ0FBQztnQkFDdEYsSUFBSSxLQUFLLENBQUMsTUFBTSxDQUFDLGNBQWMsQ0FBQyxlQUFlLEtBQUssaUJBQWlCLEVBQUUsQ0FBQztvQkFDdkUsUUFBUSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsOEJBQThCLENBQUMsS0FBSyxFQUFFLEtBQUssQ0FBQyxNQUFNLENBQUMsY0FBYyxDQUFDLGVBQWUsQ0FBQyxDQUFDLENBQUM7Z0JBQ3hHLENBQUM7cUJBQU0sQ0FBQztvQkFDUCxLQUFLLE1BQU0sUUFBUSxJQUFJLEtBQUssQ0FBQyxRQUFRLENBQUMsTUFBTSxFQUFFLEVBQUUsQ0FBQzt3QkFDaEQsUUFBUSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsOEJBQThCLENBQUMsUUFBUSxFQUFFLEtBQUssQ0FBQyxNQUFNLENBQUMsY0FBYyxDQUFDLGVBQWUsQ0FBQyxDQUFDLENBQUM7b0JBQzNHLENBQUM7Z0JBQ0YsQ0FBQztZQUNGLENBQUM7UUFDRixDQUFDO1FBQ0QsUUFBUSxDQUFDLElBQUksQ0FBQyxDQUFDLE1BQU0sRUFBRSxNQUFNLEVBQUUsRUFBRSxDQUFDLElBQUksQ0FBQyxXQUFXLENBQUMsTUFBTSxDQUFDLEtBQU0sRUFBRSxNQUFNLENBQUMsS0FBTSxDQUFDLENBQUMsQ0FBQztRQUNsRixNQUFNLEtBQUssR0FBRyxJQUFJLFdBQVcsQ0FBQyxjQUFjLENBQUMsTUFBTSxDQUFDLGNBQWMsQ0FBQyxlQUFlLEVBQUUsY0FBYyxDQUFDLE1BQU0sQ0FBQyxLQUFLLENBQUMsYUFBYSxDQUFDLENBQUM7UUFDL0gsT0FBTyxJQUFJLGFBQWEsQ0FBQyxLQUFLLEVBQUUsUUFBUSxFQUFFLFNBQVMsQ0FBQyxDQUFDO0lBQ3RELENBQUM7SUFFTyxXQUFXLENBQUMsTUFBbUIsRUFBRSxNQUFtQjtRQUMzRCxJQUFJLE1BQU0sQ0FBQyxlQUFlLEtBQUssTUFBTSxDQUFDLGVBQWUsRUFBRSxDQUFDO1lBQ3ZELE9BQU8sTUFBTSxDQUFDLGVBQWUsR0FBRyxNQUFNLENBQUMsZUFBZSxDQUFDO1FBQ3hELENBQUM7YUFBTSxDQUFDO1lBQ1AsT0FBTyxNQUFNLENBQUMsYUFBYSxHQUFHLE1BQU0sQ0FBQyxhQUFhLENBQUM7UUFDcEQsQ0FBQztJQUNGLENBQUM7SUFFTyx1QkFBdUIsQ0FBQyxPQUFzQztRQUNyRSxJQUFJLEdBQUcsR0FBRyxDQUFDLENBQUM7UUFDWixLQUFLLE1BQU0sS0FBSyxJQUFJLE9BQU8sQ0FBQyxRQUFRLENBQUMsTUFBTSxFQUFFLEVBQUUsQ0FBQztZQUMvQyxHQUFHLElBQUksSUFBSSxDQUFDLHVCQUF1QixDQUFDLEtBQUssQ0FBQyxDQUFDO1FBQzVDLENBQUM7UUFDRCxJQUFJLE9BQU8sWUFBWSxjQUFjLEVBQUUsQ0FBQztZQUN2QyxPQUFPLEdBQUcsR0FBRyxPQUFPLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyxhQUFhLEdBQUcsT0FBTyxDQUFDLE1BQU0sQ0FBQyxjQUFjLENBQUMsZUFBZSxDQUFDO1FBQ2pHLENBQUM7YUFBTSxDQUFDO1lBQ1AsT0FBTyxHQUFHLENBQUM7UUFDWixDQUFDO0lBQ0YsQ0FBQztDQUNELENBQUE7QUFwR0ssdUNBQXVDO0lBRUgsV0FBQSx3QkFBd0IsQ0FBQTtHQUY1RCx1Q0FBdUMsQ0FvRzVDO0FBRUQsTUFBZSx1Q0FBd0MsU0FBUSw0QkFBbUQ7SUFJakgsWUFBWSxNQUF5QjtRQUNwQyxLQUFLLENBQUMsTUFBTSxDQUFDLENBQUM7UUFDZCxJQUFJLENBQUMscUJBQXFCLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLG1CQUFtQixDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUM7SUFDOUUsQ0FBQztJQUVTLGlCQUFpQixDQUFDLEtBQXdCLEVBQUUsS0FBcUI7UUFDMUUsTUFBTSxjQUFjLEdBQUcsSUFBSSxDQUFDLG1CQUFtQixDQUFDLEtBQUssQ0FBQyxDQUFDO1FBQ3ZELE1BQU0sU0FBUyxHQUFHLElBQUksQ0FBQyxPQUFPLENBQUMsUUFBUSxFQUFFLENBQUM7UUFDMUMsT0FBTyxJQUFJLFdBQVcsQ0FBQyxTQUFTLENBQUMsR0FBRyxFQUFFLFNBQVMsQ0FBQyxZQUFZLEVBQUUsRUFBRSxjQUFjLEVBQUUsU0FBUyxDQUFDLENBQUM7SUFDNUYsQ0FBQztJQUVrQixZQUFZLENBQUMsS0FBcUI7UUFDcEQsT0FBTyxLQUFLLEtBQUssSUFBSSxDQUFDO0lBQ3ZCLENBQUM7SUFHTyxtQkFBbUIsQ0FBQyxjQUE4QjtRQUN6RCxNQUFNLE1BQU0sR0FBRyxjQUFjLENBQUMsTUFBTSxDQUFDO1FBQ3JDLE1BQU0scUJBQXFCLEdBQW9CLEVBQUUsQ0FBQztRQUVsRCxrQ0FBa0M7UUFDbEMsTUFBTSxvQkFBb0IsR0FBRyxJQUFJLGFBQWEsQ0FDN0MsU0FBUyxFQUNULEVBQUUsRUFDRixTQUFTLENBQ1QsQ0FBQztRQUVGLEtBQUssSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsR0FBRyxNQUFNLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQztZQUNqQyxnREFBZ0Q7WUFDaEQsTUFBTSxXQUFXLEdBQUcsY0FBYyxDQUFDLGNBQWMsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUVyRCxJQUFJLFVBQVUsQ0FBQztZQUNmLElBQUksV0FBVyxLQUFLLENBQUMsQ0FBQyxFQUFFLENBQUM7Z0JBQ3hCLDBDQUEwQztnQkFDMUMsVUFBVSxHQUFHLHFCQUFxQixDQUFDLFdBQVcsQ0FBQyxDQUFDO1lBQ2pELENBQUM7aUJBQU0sQ0FBQztnQkFDUCxnREFBZ0Q7Z0JBQ2hELFVBQVUsR0FBRyxvQkFBb0IsQ0FBQztZQUNuQyxDQUFDO1lBRUQsTUFBTSxLQUFLLEdBQUcsSUFBSSxhQUFhLENBQzlCLElBQUksV0FBVyxDQUFDLGNBQWMsQ0FBQyxrQkFBa0IsQ0FBQyxDQUFDLENBQUMsRUFBRSxjQUFjLENBQUMsZ0JBQWdCLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLEVBQzdGLEVBQUUsRUFDRixVQUFVLENBQ1YsQ0FBQztZQUNGLFVBQVUsQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFDO1lBQ2hDLHFCQUFxQixDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQztRQUNuQyxDQUFDO1FBQ0QsT0FBTyxvQkFBb0IsQ0FBQztJQUM3QixDQUFDO0NBQ0Q7QUFFRCxJQUFNLGtEQUFrRCxHQUF4RCxNQUFNLGtEQUFtRCxTQUFRLHVDQUF1QztJQUl2RyxZQUNDLE1BQXlCLEVBQ3VCLDZCQUE0RDtRQUM1RyxLQUFLLENBQUMsTUFBTSxDQUFDLENBQUM7UUFEa0Msa0NBQTZCLEdBQTdCLDZCQUE2QixDQUErQjtRQUc1RyxJQUFJLENBQUMsUUFBUSxHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxtQkFBbUIsQ0FBQyxNQUFNLENBQUMsUUFBUSxFQUFFLEVBQUUsSUFBSSxDQUFDLDZCQUE2QixFQUFFLElBQUksQ0FBQyxxQkFBcUIsQ0FBQyxDQUFDLENBQUM7SUFDNUksQ0FBQztJQUVrQixLQUFLLENBQUMsdUJBQXVCLENBQUMsS0FBd0I7UUFDeEUsT0FBTyxJQUFJLENBQUMsUUFBUSxDQUFDLE9BQU8sQ0FBQyxLQUFLLENBQUMsQ0FBQztJQUNyQyxDQUFDO0NBQ0QsQ0FBQTtBQWZLLGtEQUFrRDtJQU1yRCxXQUFBLDZCQUE2QixDQUFBO0dBTjFCLGtEQUFrRCxDQWV2RDtBQUVELElBQU0sNkNBQTZDLEdBQW5ELE1BQU0sNkNBQThDLFNBQVEsdUNBQXVDO0lBSWxHLFlBQ0MsTUFBeUIsRUFDekIsZ0JBQTRCLEVBQ0Ysd0JBQW1FO1FBRTdGLEtBQUssQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUY2Qiw2QkFBd0IsR0FBeEIsd0JBQXdCLENBQTBCO1FBTDdFLGFBQVEsR0FBMkMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLGlCQUFpQixFQUF1QixDQUFDLENBQUM7UUFRaEksSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsd0JBQXdCLENBQUMsb0JBQW9CLENBQUMsV0FBVyxDQUFDLEdBQUcsRUFBRTtZQUNsRixJQUFJLENBQUMsZUFBZSxDQUFDLE1BQU0sRUFBRSxnQkFBZ0IsQ0FBQyxDQUFDO1FBQ2hELENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDSixJQUFJLENBQUMsZUFBZSxDQUFDLE1BQU0sRUFBRSxnQkFBZ0IsQ0FBQyxDQUFDO0lBQ2hELENBQUM7SUFFTyxlQUFlLENBQUMsTUFBeUIsRUFBRSxnQkFBNEI7UUFDOUUsTUFBTSxpQkFBaUIsR0FBRyxpQkFBaUIsQ0FBQyx3QkFBd0IsQ0FBQyxJQUFJLENBQUMsd0JBQXdCLEVBQUUsTUFBTSxDQUFDLFFBQVEsRUFBRSxDQUFDLENBQUM7UUFDdkgsSUFBSSxpQkFBaUIsQ0FBQyxNQUFNLEtBQUssQ0FBQyxFQUFFLENBQUM7WUFDcEMsT0FBTztRQUNSLENBQUM7UUFDRCxJQUFJLENBQUMsUUFBUSxDQUFDLEtBQUssR0FBRyxJQUFJLG1CQUFtQixDQUFDLE1BQU0sQ0FBQyxRQUFRLEVBQUUsRUFBRSxpQkFBaUIsRUFBRSxnQkFBZ0IsRUFBRSxJQUFJLENBQUMscUJBQXFCLEVBQUUsU0FBUyxDQUFDLENBQUM7SUFDOUksQ0FBQztJQUVrQixlQUFlO1FBQ2pDLE9BQU8sSUFBSSxDQUFDLFFBQVEsS0FBSyxTQUFTLENBQUM7SUFDcEMsQ0FBQztJQUVrQixLQUFLLENBQUMsdUJBQXVCLENBQUMsS0FBd0I7UUFDeEUsT0FBTyxJQUFJLENBQUMsUUFBUSxDQUFDLEtBQUssRUFBRSxPQUFPLENBQUMsS0FBSyxDQUFDLElBQUksSUFBSSxDQUFDO0lBQ3BELENBQUM7Q0FDRCxDQUFBO0FBL0JLLDZDQUE2QztJQU9oRCxXQUFBLHdCQUF3QixDQUFBO0dBUHJCLDZDQUE2QyxDQStCbEQifQ==