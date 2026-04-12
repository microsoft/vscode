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
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { hashAsync } from '../../../../../../base/common/hash.js';
import { Disposable, MutableDisposable } from '../../../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../../../base/common/network.js';
import { URI } from '../../../../../../base/common/uri.js';
import { generateUuid } from '../../../../../../base/common/uuid.js';
import { ILanguageService } from '../../../../../../editor/common/languages/language.js';
import { IModelService } from '../../../../../../editor/common/services/model.js';
import { ITextModelService } from '../../../../../../editor/common/services/resolverService.js';
import { EditorModel } from '../../../../../common/editor/editorModel.js';
/**
 * Parses unified diff format into before/after content.
 * Supports standard unified diff format with - and + prefixes.
 */
export function parseUnifiedDiff(diffText) {
    const lines = diffText.split('\n');
    const beforeLines = [];
    const afterLines = [];
    for (const line of lines) {
        if (line.startsWith('- ')) {
            beforeLines.push(line.substring(2));
        }
        else if (line.startsWith('-')) {
            beforeLines.push(line.substring(1));
        }
        else if (line.startsWith('+ ')) {
            afterLines.push(line.substring(2));
        }
        else if (line.startsWith('+')) {
            afterLines.push(line.substring(1));
        }
        else if (line.startsWith(' ')) {
            // Context line - appears in both
            const content = line.substring(1);
            beforeLines.push(content);
            afterLines.push(content);
        }
        else if (!line.startsWith('@@') && !line.startsWith('---') && !line.startsWith('+++') && !line.startsWith('diff ')) {
            // Regular line without prefix - treat as context
            beforeLines.push(line);
            afterLines.push(line);
        }
    }
    return {
        before: beforeLines.join('\n'),
        after: afterLines.join('\n')
    };
}
/**
 * Simple diff editor model for inline diffs in markdown code blocks
 */
class SimpleDiffEditorModel extends EditorModel {
    constructor(_original, _modified) {
        super();
        this._original = _original;
        this._modified = _modified;
        this.original = this._original.object.textEditorModel;
        this.modified = this._modified.object.textEditorModel;
    }
    dispose() {
        super.dispose();
        this._original.dispose();
        this._modified.dispose();
    }
}
/**
 * Renders a diff block from markdown content.
 * This is a lightweight wrapper that uses CodeCompareBlockPart for the actual rendering.
 */
let MarkdownDiffBlockPart = class MarkdownDiffBlockPart extends Disposable {
    constructor(data, diffEditorPool, currentWidth, modelService, textModelService, languageService) {
        super();
        this.modelService = modelService;
        this.textModelService = textModelService;
        this.languageService = languageService;
        this.modelRef = this._register(new MutableDisposable());
        this.comparePart = this._register(diffEditorPool.get());
        // Create in-memory models for the diff
        const originalUri = URI.from({
            scheme: Schemas.vscodeChatCodeBlock,
            path: `/chat-diff-original-${data.codeBlockIndex}-${generateUuid()}`,
        });
        const modifiedUri = URI.from({
            scheme: Schemas.vscodeChatCodeBlock,
            path: `/chat-diff-modified-${data.codeBlockIndex}-${generateUuid()}`,
        });
        const languageSelection = this.languageService.createById(data.languageId);
        // Create the models
        this._register(this.modelService.createModel(data.beforeContent, languageSelection, originalUri, false));
        this._register(this.modelService.createModel(data.afterContent, languageSelection, modifiedUri, false));
        const modelsPromise = Promise.all([
            this.textModelService.createModelReference(originalUri),
            this.textModelService.createModelReference(modifiedUri)
        ]).then(([originalRef, modifiedRef]) => {
            return new SimpleDiffEditorModel(originalRef, modifiedRef);
        });
        const compareData = {
            element: data.element,
            isReadOnly: data.isReadOnly,
            horizontalPadding: data.horizontalPadding,
            edit: {
                uri: data.codeBlockResource || modifiedUri,
                edits: [],
                kind: 'textEditGroup',
                done: true
            },
            diffData: modelsPromise.then(async (model) => {
                this.modelRef.value = model;
                const diffData = {
                    original: model.original,
                    modified: model.modified,
                    originalSha1: await hashAsync(model.original.getValue()),
                };
                return diffData;
            })
        };
        this.comparePart.object.render(compareData, currentWidth, CancellationToken.None);
        this.element = this.comparePart.object.element;
    }
    layout(width) {
        this.comparePart.object.layout(width);
    }
    reset() {
        this.modelRef.clear();
    }
};
MarkdownDiffBlockPart = __decorate([
    __param(3, IModelService),
    __param(4, ITextModelService),
    __param(5, ILanguageService)
], MarkdownDiffBlockPart);
export { MarkdownDiffBlockPart };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdERpZmZCbG9ja1BhcnQuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9jaGF0L2Jyb3dzZXIvd2lkZ2V0L2NoYXRDb250ZW50UGFydHMvY2hhdERpZmZCbG9ja1BhcnQudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sK0NBQStDLENBQUM7QUFDbEYsT0FBTyxFQUFFLFNBQVMsRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBQ2xFLE9BQU8sRUFBRSxVQUFVLEVBQWMsaUJBQWlCLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUN2RyxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sMENBQTBDLENBQUM7QUFDbkUsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQzNELE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUNyRSxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSx1REFBdUQsQ0FBQztBQUV6RixPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0sbURBQW1ELENBQUM7QUFDbEYsT0FBTyxFQUE0QixpQkFBaUIsRUFBRSxNQUFNLDZEQUE2RCxDQUFDO0FBQzFILE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSw2Q0FBNkMsQ0FBQztBQU0xRTs7O0dBR0c7QUFDSCxNQUFNLFVBQVUsZ0JBQWdCLENBQUMsUUFBZ0I7SUFDaEQsTUFBTSxLQUFLLEdBQUcsUUFBUSxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsQ0FBQztJQUNuQyxNQUFNLFdBQVcsR0FBYSxFQUFFLENBQUM7SUFDakMsTUFBTSxVQUFVLEdBQWEsRUFBRSxDQUFDO0lBRWhDLEtBQUssTUFBTSxJQUFJLElBQUksS0FBSyxFQUFFLENBQUM7UUFDMUIsSUFB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