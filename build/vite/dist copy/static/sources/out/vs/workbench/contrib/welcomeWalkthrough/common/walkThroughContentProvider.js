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
import { ITextModelService } from '../../../../editor/common/services/resolverService.js';
import { IModelService } from '../../../../editor/common/services/model.js';
import { ILanguageService } from '../../../../editor/common/languages/language.js';
import * as marked from '../../../../base/common/marked/marked.js';
import { Schemas } from '../../../../base/common/network.js';
import { Range } from '../../../../editor/common/core/range.js';
import { createTextBufferFactory } from '../../../../editor/common/model/textModel.js';
import { assertReturnsDefined } from '../../../../base/common/types.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
class WalkThroughContentProviderRegistry {
    constructor() {
        this.providers = new Map();
    }
    registerProvider(moduleId, provider) {
        this.providers.set(moduleId, provider);
    }
    getProvider(moduleId) {
        return this.providers.get(moduleId);
    }
}
export const walkThroughContentRegistry = new WalkThroughContentProviderRegistry();
export async function moduleToContent(instantiationService, resource) {
    if (!resource.query) {
        throw new Error('Walkthrough: invalid resource');
    }
    const query = JSON.parse(resource.query);
    if (!query.moduleId) {
        throw new Error('Walkthrough: invalid resource');
    }
    const provider = walkThroughContentRegistry.getProvider(query.moduleId);
    if (!provider) {
        throw new Error(`Walkthrough: no provider registered for ${query.moduleId}`);
    }
    return instantiationService.invokeFunction(provider);
}
let WalkThroughSnippetContentProvider = class WalkThroughSnippetContentProvider {
    static { this.ID = 'workbench.contrib.walkThroughSnippetContentProvider'; }
    constructor(textModelResolverService, languageService, modelService, instantiationService) {
        this.textModelResolverService = textModelResolverService;
        this.languageService = languageService;
        this.modelService = modelService;
        this.instantiationService = instantiationService;
        this.loads = new Map();
        this.textModelResolverService.registerTextModelContentProvider(Schemas.walkThroughSnippet, this);
    }
    async textBufferFactoryFromResource(resource) {
        let ongoing = this.loads.get(resource.toString());
        if (!ongoing) {
            ongoing = moduleToContent(this.instantiationService, resource)
                .then(content => createTextBufferFactory(content))
                .finally(() => this.loads.delete(resource.toString()));
            this.loads.set(resource.toString(), ongoing);
        }
        return ongoing;
    }
    async provideTextContent(resource) {
        const factory = await this.textBufferFactoryFromResource(resource.with({ fragment: '' }));
        let codeEditorModel = this.modelService.getModel(resource);
        if (!codeEditorModel) {
            const j = parseInt(resource.fragment);
            let i = 0;
            const renderer = new marked.marked.Renderer();
            renderer.code = ({ text, lang }) => {
                i++;
                const languageId = typeof lang === 'string' ? this.languageService.getLanguageIdByLanguageName(lang) || '' : '';
                const languageSelection = this.languageService.createById(languageId);
                // Create all models for this resource in one go... we'll need them all and we don't want to re-parse markdown each time
                const model = this.modelService.createModel(text, languageSelection, resource.with({ fragment: `${i}.${lang}` }));
                if (i === j) {
                    codeEditorModel = model;
                }
                return '';
            };
            const textBuffer = factory.create(1 /* DefaultEndOfLine.LF */).textBuffer;
            const lineCount = textBuffer.getLineCount();
            const range = new Range(1, 1, lineCount, textBuffer.getLineLength(lineCount) + 1);
            const markdown = textBuffer.getValueInRange(range, 0 /* EndOfLinePreference.TextDefined */);
            marked.marked(markdown, { renderer });
        }
        return assertReturnsDefined(codeEditorModel);
    }
};
WalkThroughSnippetContentProvider = __decorate([
    __param(0, ITextModelService),
    __param(1, ILanguageService),
    __param(2, IModelService),
    __param(3, IInstantiationService)
], WalkThroughSnippetContentProvider);
export { WalkThroughSnippetContentProvider };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoid2Fsa1Rocm91Z2hDb250ZW50UHJvdmlkZXIuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi93ZWxjb21lV2Fsa3Rocm91Z2gvY29tbW9uL3dhbGtUaHJvdWdoQ29udGVudFByb3ZpZGVyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBR2hHLE9BQU8sRUFBRSxpQkFBaUIsRUFBNkIsTUFBTSx1REFBdUQsQ0FBQztBQUNySCxPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0sNkNBQTZDLENBQUM7QUFFNUUsT0FBTyxFQUFFLGdCQUFnQixFQUFFLE1BQU0saURBQWlELENBQUM7QUFFbkYsT0FBTyxLQUFLLE1BQU0sTUFBTSwwQ0FBMEMsQ0FBQztBQUNuRSxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sb0NBQW9DLENBQUM7QUFDN0QsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQ2hFLE9BQU8sRUFBRSx1QkFBdUIsRUFBRSxNQUFNLDhDQUE4QyxDQUFDO0FBQ3ZGLE9BQU8sRUFBRSxvQkFBb0IsRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQ3hFLE9BQU8sRUFBRSxxQkFBcUIsRUFBb0IsTUFBTSw0REFBNEQsQ0FBQztBQU1ySCxNQUFNLGtDQUFrQztJQUF4QztRQUVrQixjQUFTLEdBQUcsSUFBSSxHQUFHLEVBQXVDLENBQUM7SUFTN0UsQ0FBQztJQVBBLGdCQUFnQixDQUFDLFFBQWdCLEVBQUUsUUFBcUM7UUFDdkUsSUFBSSxDQUFDLFNBQVMsQ0FBQyxHQUFHLENBQUMsUUFBUSxFQUFFLFFBQVEsQ0FBQyxDQUFDO0lBQ3hDLENBQUM7SUFFRCxXQUFXLENBQUMsUUFBZ0I7UUFDM0IsT0FBTyxJQUFJLENBQUMsU0FBUyxDQUFDLEdBQUcsQ0FBQyxRQUFRLENBQUMsQ0FBQztJQUNyQyxD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