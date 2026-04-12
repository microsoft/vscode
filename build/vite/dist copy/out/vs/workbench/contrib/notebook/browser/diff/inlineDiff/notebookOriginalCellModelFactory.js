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
import { ReferenceCollection } from '../../../../../../base/common/lifecycle.js';
import { createDecorator, IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { CellKind } from '../../../common/notebookCommon.js';
import { URI } from '../../../../../../base/common/uri.js';
import { ILanguageService } from '../../../../../../editor/common/languages/language.js';
import { IModelService } from '../../../../../../editor/common/services/model.js';
export const INotebookOriginalCellModelFactory = createDecorator('INotebookOriginalCellModelFactory');
let OriginalNotebookCellModelReferenceCollection = class OriginalNotebookCellModelReferenceCollection extends ReferenceCollection {
    constructor(modelService, _languageService) {
        super();
        this.modelService = modelService;
        this._languageService = _languageService;
    }
    createReferencedObject(_key, uri, cellValue, language, cellKind) {
        const scheme = `${uri.scheme}-chat-edit`;
        const originalCellUri = URI.from({ scheme, fragment: uri.fragment, path: uri.path });
        const languageSelection = this._languageService.getLanguageIdByLanguageName(language) ? this._languageService.createById(language) : cellKind === CellKind.Markup ? this._languageService.createById('markdown') : null;
        return this.modelService.createModel(cellValue, languageSelection, originalCellUri);
    }
    destroyReferencedObject(_key, model) {
        model.dispose();
    }
};
OriginalNotebookCellModelReferenceCollection = __decorate([
    __param(0, IModelService),
    __param(1, ILanguageService)
], OriginalNotebookCellModelReferenceCollection);
export { OriginalNotebookCellModelReferenceCollection };
let OriginalNotebookCellModelFactory = class OriginalNotebookCellModelFactory {
    constructor(instantiationService) {
        this._data = instantiationService.createInstance(OriginalNotebookCellModelReferenceCollection);
    }
    getOrCreate(uri, cellValue, language, cellKind) {
        return this._data.acquire(uri.toString(), uri, cellValue, language, cellKind);
    }
};
OriginalNotebookCellModelFactory = __decorate([
    __param(0, IInstantiationService)
], OriginalNotebookCellModelFactory);
export { OriginalNotebookCellModelFactory };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibm90ZWJvb2tPcmlnaW5hbENlbGxNb2RlbEZhY3RvcnkuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9ub3RlYm9vay9icm93c2VyL2RpZmYvaW5saW5lRGlmZi9ub3RlYm9va09yaWdpbmFsQ2VsbE1vZGVsRmFjdG9yeS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQWMsbUJBQW1CLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUM3RixPQUFPLEVBQUUsZUFBZSxFQUFFLHFCQUFxQixFQUFFLE1BQU0sa0VBQWtFLENBQUM7QUFFMUgsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQzdELE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUMzRCxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSx1REFBdUQsQ0FBQztBQUN6RixPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0sbURBQW1ELENBQUM7QUFHbEYsTUFBTSxDQUFDLE1BQU0saUNBQWlDLEdBQUcsZUFBZSxDQUFvQyxtQ0FBbUMsQ0FBQyxDQUFDO0FBUWxJLElBQU0sNENBQTRDLEdBQWxELE1BQU0sNENBQTZDLFNBQVEsbUJBQStCO0lBQ2hHLFlBQTRDLFlBQTJCLEVBQ25DLGdCQUFrQztRQUVyRSxLQUFLLEVBQUUsQ0FBQztRQUhtQyxpQkFBWSxHQUFaLFlBQVksQ0FBZTtRQUNuQyxxQkFBZ0IsR0FBaEIsZ0JBQWdCLENBQWtCO0lBR3RFLENBQUM7SUFFa0Isc0JBQXNCLENBQUMsSUFBWSxFQUFFLEdBQVEsRUFBRSxTQUFpQixFQUFFLFFBQWdCLEVBQUUsUUFBa0I7UUFDeEgsTUFBTSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsTUFBTSxZQUFZLENBQUM7UUFDekMsTUFBTSxlQUFlLEdBQUcsR0FBRyxDQUFDLElBQUksQ0FBQyxFQUFFLE1BQU0sRUFBRSxRQUFRLEVBQUUsR0FBRyxDQUFDLFFBQVEsRUFBRSxJQUFJLEVBQUUsR0FBRyxDQUFDLElBQUksRUFBRSxDQUFDLENBQUM7UUFDckYsTUFBTSxpQkFBaUIsR0FBRyxJQUFJLENBQUMsZ0JBQWdCLENBQUMsMkJBQTJCLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxVQUFVLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQyxDQUFDLFFBQVEsS0FBSyxRQUFRLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsZ0JBQWdCLENBQUMsVUFBVSxDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUM7UUFDeE4sT0FBTyxJQUFJLENBQUMsWUFBWSxDQUFDLFdBQVcsQ0FBQyxTQUFTLEVBQUUsaUJBQWlCLEVBQUUsZUFBZSxDQUFDLENBQUM7SUFDckYsQ0FBQztJQUNrQix1QkFBdUIsQ0FBQyxJQUFZLEVBQUUsS0FBaUI7UUFDekUsS0FBSyxDQUFDLE9BQU8sRUFBRSxDQUFDO0lBQ2pCLENBQUM7Q0FDRCxDQUFBO0FBaEJZLDRDQUE0QztJQUMzQyxXQUFBLGFBQWEsQ0FBQTtJQUN4QixXQUFBLGdCQUFnQixDQUFBO0dBRk4sNENBQTRDLENBZ0J4RDs7QUFFTSxJQUFNLGdDQUFnQyxHQUF0QyxNQUFNLGdDQUFnQztJQUc1QyxZQUFtQyxvQkFBMkM7UUFDN0UsSUFBSSxDQUFDLEtBQUssR0FBRyxvQkFBb0IsQ0FBQyxjQUFjLENBQUMsNENBQTRDLENBQUMsQ0FBQztJQUNoRyxDQUFDO0lBRUQsV0FBVyxDQUFDLEdBQVEsRUFBRSxTQUFpQixFQUFFLFFBQWdCLEVBQUUsUUFBa0I7UUFDNUUsT0FBTyxJQUFJLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQyxHQUFHLENBQUMsUUFBUSxFQUFFLEVBQUUsR0FBRyxFQUFFLFNBQVMsRUFBRSxRQUFRLEVBQUUsUUFBUSxDQUFDLENBQUM7SUFDL0UsQ0FBQztDQUNELENBQUE7QUFWWSxnQ0FBZ0M7SUFHL0IsV0FBQSxxQkFBcUIsQ0FBQTtHQUh0QixnQ0FBZ0MsQ0FVNUMifQ==