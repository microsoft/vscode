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
import { USUAL_WORD_SEPARATORS } from '../../../common/core/wordHelper.js';
import { ILanguageFeaturesService } from '../../../common/services/languageFeatures.js';
import { DocumentHighlightKind } from '../../../common/languages.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../../base/common/map.js';
class TextualDocumentHighlightProvider {
    constructor() {
        this.selector = { language: '*' };
    }
    provideDocumentHighlights(model, position, token) {
        const result = [];
        const word = model.getWordAtPosition({
            lineNumber: position.lineNumber,
            column: position.column
        });
        if (!word) {
            return Promise.resolve(result);
        }
        if (model.isDisposed()) {
            return;
        }
        const matches = model.findMatches(word.word, true, false, true, USUAL_WORD_SEPARATORS, false);
        return matches.map(m => ({
            range: m.range,
            kind: DocumentHighlightKind.Text
        }));
    }
    provideMultiDocumentHighlights(primaryModel, position, otherModels, token) {
        const result = new ResourceMap();
        const word = primaryModel.getWordAtPosition({
            lineNumber: position.lineNumber,
            column: position.column
        });
        if (!word) {
            return Promise.resolve(result);
        }
        for (const model of [primaryModel, ...otherModels]) {
            if (model.isDisposed()) {
                continue;
            }
            const matches = model.findMatches(word.word, true, false, true, USUAL_WORD_SEPARATORS, false);
            const highlights = matches.map(m => ({
                range: m.range,
                kind: DocumentHighlightKind.Text
            }));
            if (highlights) {
                result.set(model.uri, highlights);
            }
        }
        return result;
    }
}
let TextualMultiDocumentHighlightFeature = class TextualMultiDocumentHighlightFeature extends Disposable {
    constructor(languageFeaturesService) {
        super();
        this._register(languageFeaturesService.documentHighlightProvider.register('*', new TextualDocumentHighlightProvider()));
        this._register(languageFeaturesService.multiDocumentHighlightProvider.register('*', new TextualDocumentHighlightProvider()));
    }
};
TextualMultiDocumentHighlightFeature = __decorate([
    __param(0, ILanguageFeaturesService)
], TextualMultiDocumentHighlightFeature);
export { TextualMultiDocumentHighlightFeature };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGV4dHVhbEhpZ2hsaWdodFByb3ZpZGVyLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvZWRpdG9yL2NvbnRyaWIvd29yZEhpZ2hsaWdodGVyL2Jyb3dzZXIvdGV4dHVhbEhpZ2hsaWdodFByb3ZpZGVyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLG9DQUFvQyxDQUFDO0FBQzNFLE9BQU8sRUFBRSx3QkFBd0IsRUFBRSxNQUFNLDhDQUE4QyxDQUFDO0FBQ3hGLE9BQU8sRUFBcUIscUJBQXFCLEVBQTZFLE1BQU0sOEJBQThCLENBQUM7QUFJbkssT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ2xFLE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQUk3RCxNQUFNLGdDQUFnQztJQUF0QztRQUVDLGFBQVEsR0FBbUIsRUFBRSxRQUFRLEVBQUUsR0FBRyxFQUFFLENBQUM7SUF5RDlDLENBQUM7SUF2REEseUJBQXlCLENBQUMsS0FBaUIsRUFBRSxRQUFrQixFQUFFLEtBQXdCO1FBQ3hGLE1BQU0sTUFBTSxHQUF3QixFQUFFLENBQUM7UUFFdkMsTUFBTSxJQUFJLEdBQUcsS0FBSyxDQUFDLGlCQUFpQixDQUFDO1lBQ3BDLFVBQVUsRUFBRSxRQUFRLENBQUMsVUFBVTtZQUMvQixNQUFNLEVBQUUsUUFBUSxDQUFDLE1BQU07U0FDdkIsQ0FBQyxDQUFDO1FBRUgsSUFBSSxDQUFDLElBQUksRUFBRSxDQUFDO1lBQ1gsT0FBTyxPQUFPLENBQUMsT0FBTyxDQUFDLE1BQU0sQ0FBQyxDQUFDO1FBQ2hDLENBQUM7UUFFRCxJQUFJLEtBQUssQ0FBQyxVQUFVLEVBQUUsRUFBRSxDQUFDO1lBQ3hCLE9BQU87UUFDUixDQUFDO1FBRUQsTUFBTSxPQUFPLEdBQUcsS0FBSyxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsSUFBSSxFQUFFLElBQUksRUFBRSxLQUFLLEVBQUUsSUFBSSxFQUFFLHFCQUFxQixFQUFFLEtBQUssQ0FBQyxDQUFDO1FBQzlGLE9BQU8sT0FBTyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUM7WUFDeEIsS0FBSyxFQUFFLENBQUMsQ0FBQyxLQUFLO1lBQ2QsSUFBSSxFQUFFLHFCQUFxQixDQUFDLElBQUk7U0FDaEMsQ0FBQyxDQUFDLENBQUM7SUFDTCxDQUFDO0lBRUQsOEJBQThCLENBQUMsWUFBd0IsRUFBRSxRQUFrQixFQUFFLFdBQXlCLEVBQUUsS0FBd0I7UUFFL0gsTUFBTSxNQUFNLEdBQUcsSUFBSSxXQUFXLEVBQXVCLENBQUM7UUFFdEQsTUFBTSxJQUFJLEdBQUcsWUFBWSxDQUFDLGlCQUFpQixDQUFDO1lBQzNDLFVBQVUsRUFBRSxRQUFRLENBQUMsVUFBVTtZQUMvQixNQUFNLEVBQUUsUUFBUSxDQUFDLE1BQU07U0FDdkIsQ0FBQyxDQUFDO1FBQ0gsSUFBSSxDQUFDLElBQUksRUFBRSxDQUFDO1lBQ1gsT0FBTyxPQUFPLENBQUMsT0FBTyxDQUFDLE1BQU0sQ0FBQyxDQUFDO1FBQ2hDLENBQUM7UUFHRCxLQUFLLE1BQU0sS0FBSyxJQUFJLENBQUMsWUFBWSxFQUFFLEdBQUcsV0FBVyxDQUFDLEVBQUUsQ0FBQztZQUNwRCxJQUFJLEtBQUssQ0FBQyxVQUFVLEVBQUUsRUFBRSxDQUFDO2dCQUN4QixTQUFTO1lBQ1YsQ0FBQztZQUVELE1BQU0sT0FBTyxHQUFHLEtBQUssQ0FBQyxXQUFXLENBQUMsSUFBSSxDQUFDLElBQUksRUFBRSxJQUFJLEVBQUUsS0FBSyxFQUFFLElBQUksRUFBRSxxQkFBcUIsRUFBRSxLQUFLLENBQUMsQ0FBQztZQUM5RixNQUFNLFVBQVUsR0FBRyxPQUFPLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQztnQkFDcEMsS0FBSyxFQUFFLENBQUMsQ0FBQyxLQUFLO2dCQUNkLElBQUksRUFBRSxxQkFBcUIsQ0FBQyxJQUFJO2FBQ2hDLENBQUMsQ0FBQyxDQUFDO1lBRUosSUFBSSxVQUFVLEVBQUUsQ0FBQztnQkFDaEIsTUFBTSxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsR0FBRyxFQUFFLFVBQVUsQ0FBQyxDQUFDO1lBQ25DLENBQUM7UUFDRixDQUFDO1FBRUQsT0FBTyxNQUFNLENBQUM7SUFDZixDQUFDO0NBRUQ7QUFFTSxJQUFNLG9DQUFvQyxHQUExQyxNQUFNLG9DQUFxQyxTQUFRLFVBQVU7SUFDbkUsWUFDMkIsdUJBQWlEO1FBRTNFLEtBQUssRUFBRSxDQUFDO1FBQ1IsSUFBSSxDQUFDLFNBQVMsQ0FBQyx1QkFBdUIsQ0FBQyx5QkFBeUIsQ0FBQyxRQUFRLENBQUMsR0FBRyxFQUFFLElBQUksZ0NBQWdDLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDeEgsSUFBSSxDQUFDLFNBQVMsQ0FBQyx1QkFBdUIsQ0FBQyw4QkFBOEIsQ0FBQyxRQUFRLENBQUMsR0FBRyxFQUFFLElBQUksZ0NBQWdDLEVBQUUsQ0FBQyxDQUFDLENBQUM7SUFDOUgsQ0FBQztDQUNELENBQUE7QUFSWSxvQ0FBb0M7SUFFOUMsV0FBQSx3QkFBd0IsQ0FBQTtHQUZkLG9DQUFvQyxDQVFoRCJ9