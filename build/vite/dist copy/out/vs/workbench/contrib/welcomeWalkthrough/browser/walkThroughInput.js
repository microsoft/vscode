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
var WalkThroughInput_1;
import * as marked from '../../../../base/common/marked/marked.js';
import { Schemas } from '../../../../base/common/network.js';
import { isEqual } from '../../../../base/common/resources.js';
import { ITextModelService } from '../../../../editor/common/services/resolverService.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { EditorInput } from '../../../common/editor/editorInput.js';
import { EditorModel } from '../../../common/editor/editorModel.js';
import { markedGfmHeadingIdPlugin } from '../../markdown/browser/markedGfmHeadingIdPlugin.js';
import { moduleToContent } from '../common/walkThroughContentProvider.js';
class WalkThroughModel extends EditorModel {
    constructor(mainRef, snippetRefs) {
        super();
        this.mainRef = mainRef;
        this.snippetRefs = snippetRefs;
    }
    get main() {
        return this.mainRef;
    }
    get snippets() {
        return this.snippetRefs.map(snippet => snippet.object);
    }
    dispose() {
        this.snippetRefs.forEach(ref => ref.dispose());
        super.dispose();
    }
}
let WalkThroughInput = WalkThroughInput_1 = class WalkThroughInput extends EditorInput {
    get capabilities() {
        return 8 /* EditorInputCapabilities.Singleton */ | super.capabilities;
    }
    get resource() { return this.options.resource; }
    constructor(options, instantiationService, textModelResolverService) {
        super();
        this.options = options;
        this.instantiationService = instantiationService;
        this.textModelResolverService = textModelResolverService;
        this.promise = null;
        this.maxTopScroll = 0;
        this.maxBottomScroll = 0;
    }
    get typeId() {
        return this.options.typeId;
    }
    getName() {
        return this.options.name;
    }
    getDescription() {
        return this.options.description || '';
    }
    getTelemetryFrom() {
        return this.options.telemetryFrom;
    }
    getTelemetryDescriptor() {
        const descriptor = super.getTelemetryDescriptor();
        descriptor['target'] = this.getTelemetryFrom();
        /* __GDPR__FRAGMENT__
            "EditorTelemetryDescriptor" : {
                "target" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" }
            }
        */
        return descriptor;
    }
    get onReady() {
        return this.options.onReady;
    }
    get layout() {
        return this.options.layout;
    }
    resolve() {
        if (!this.promise) {
            this.promise = moduleToContent(this.instantiationService, this.options.resource)
                .then(content => {
                if (this.resource.path.endsWith('.html')) {
                    return new WalkThroughModel(content, []);
                }
                const snippets = [];
                let i = 0;
                const renderer = new marked.marked.Renderer();
                renderer.code = ({ lang }) => {
                    i++;
                    const resource = this.options.resource.with({ scheme: Schemas.walkThroughSnippet, fragment: `${i}.${lang}` });
                    snippets.push(this.textModelResolverService.createModelReference(resource));
                    return `<div id="snippet-${resource.fragment}" class="walkThroughEditorContainer" ></div>`;
                };
                const m = new marked.Marked({ renderer }, markedGfmHeadingIdPlugin());
                content = m.parse(content, { async: false });
                return Promise.all(snippets)
                    .then(refs => new WalkThroughModel(content, refs));
            });
        }
        return this.promise;
    }
    matches(otherInput) {
        if (super.matches(otherInput)) {
            return true;
        }
        if (otherInput instanceof WalkThroughInput_1) {
            return isEqual(otherInput.options.resource, this.options.resource);
        }
        return false;
    }
    dispose() {
        if (this.promise) {
            this.promise.then(model => model.dispose());
            this.promise = null;
        }
        super.dispose();
    }
    relativeScrollPosition(topScroll, bottomScroll) {
        this.maxTopScroll = Math.max(this.maxTopScroll, topScroll);
        this.maxBottomScroll = Math.max(this.maxBottomScroll, bottomScroll);
    }
};
WalkThroughInput = WalkThroughInput_1 = __decorate([
    __param(1, IInstantiationService),
    __param(2, ITextModelService)
], WalkThroughInput);
export { WalkThroughInput };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoid2Fsa1Rocm91Z2hJbnB1dC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL3dlbGNvbWVXYWxrdGhyb3VnaC9icm93c2VyL3dhbGtUaHJvdWdoSW5wdXQudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7O0FBSWhHLE9BQU8sS0FBSyxNQUFNLE1BQU0sMENBQTBDLENBQUM7QUFDbkUsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLG9DQUFvQyxDQUFDO0FBQzdELE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUUvRCxPQUFPLEVBQW9CLGlCQUFpQixFQUFFLE1BQU0sdURBQXVELENBQUM7QUFDNUcsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sNERBQTRELENBQUM7QUFFbkcsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBQ3BFLE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUNwRSxPQUFPLEVBQUUsd0JBQXdCLEVBQUUsTUFBTSxvREFBb0QsQ0FBQztBQUM5RixPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFFMUUsTUFBTSxnQkFBaUIsU0FBUSxXQUFXO0lBRXpDLFlBQ1MsT0FBZSxFQUNmLFdBQTJDO1FBRW5ELEtBQUssRUFBRSxDQUFDO1FBSEEsWUFBTyxHQUFQLE9BQU8sQ0FBUTtRQUNmLGdCQUFXLEdBQVgsV0FBVyxDQUFnQztJQUdwRCxDQUFDO0lBRUQsSUFBSSxJQUFJO1FBQ1AsT0FBTyxJQUFJLENBQUMsT0FBTyxDQUFDO0lBQ3JCLENBQUM7SUFFRCxJQUFJLFFBQVE7UUFDWCxPQUFPLElBQUksQ0FBQyxXQUFXLENBQUMsR0FBRyxDQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUMsT0FBTyxDQUFDLE1BQU0s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