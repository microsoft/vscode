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
import { CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../../../base/common/map.js';
import { observableValue } from '../../../../../base/common/observable.js';
import { basename } from '../../../../../base/common/resources.js';
import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';
import { registerSingleton } from '../../../../../platform/instantiation/common/extensions.js';
import { ILanguageModelsService } from '../../common/languageModels.js';
import * as nls from '../../../../../nls.js';
export const IChatEditingExplanationModelManager = createDecorator('chatEditingExplanationModelManager');
/**
 * Gets the text content for a change
 */
function getChangeTexts(change, diffInfo) {
    const originalLines = [];
    const modifiedLines = [];
    // Get original text
    for (let i = change.original.startLineNumber; i < change.original.endLineNumberExclusive; i++) {
        const line = diffInfo.originalModel.getLineContent(i);
        originalLines.push(line);
    }
    // Get modified text
    for (let i = change.modified.startLineNumber; i < change.modified.endLineNumberExclusive; i++) {
        const line = diffInfo.modifiedModel.getLineContent(i);
        modifiedLines.push(line);
    }
    return {
        originalText: originalLines.join('\n'),
        modifiedText: modifiedLines.join('\n')
    };
}
let ChatEditingExplanationModelManager = class ChatEditingExplanationModelManager extends Disposable {
    constructor(_languageModelsService) {
        super();
        this._languageModelsService = _languageModelsService;
        this._state = observableValue(this, new ResourceMap());
        this.state = this._state;
    }
    _updateUriState(uri, uriState) {
        const current = this._state.get();
        const newState = new ResourceMap(current);
        newState.set(uri, uriState);
        this._state.set(newState, undefined);
    }
    _updateUriStatePartial(uri, partial) {
        const current = this._state.get();
        const existing = current.get(uri);
        if (existing) {
            const newState = new ResourceMap(current);
            newState.set(uri, { ...existing, ...partial });
            this._state.set(newState, undefined);
        }
    }
    _removeUris(uris) {
        const current = this._state.get();
        const newState = new ResourceMap(current);
        for (const uri of uris) {
            newState.delete(uri);
        }
        this._state.set(newState, undefined);
    }
    generateExplanations(diffInfos, chatSessionResource, token) {
        const uris = diffInfos.map(d => d.modifiedModel.uri);
        const cts = new CancellationTokenSource(token);
        // Set loading state for all URIs with diffInfo and chatSessionResource
        for (const diffInfo of diffInfos) {
            this._updateUriState(diffInfo.modifiedModel.uri, {
                progress: 'loading',
                explanations: [],
                diffInfo,
                chatSessionResource,
            });
        }
        const completed = this._doGenerateExplanations(diffInfos, cts.token);
        return {
            uris,
            completed,
            dispose: () => {
                cts.dispose(true);
                this._removeUris(uris);
            }
        };
    }
    async _doGenerateExplanations(diffInfos, cancellationToken) {
        // Filter out empty diffs and fire empty events for them
        const nonEmptyDiffs = [];
        for (const diffInfo of diffInfos) {
            if (diffInfo.changes.length === 0 || diffInfo.identical) {
                this._updateUriStatePartial(diffInfo.modifiedModel.uri, {
                    progress: 'complete',
                    explanations: [],
                });
            }
            else {
                nonEmptyDiffs.push(diffInfo);
            }
        }
        if (nonEmptyDiffs.length === 0) {
            return;
        }
        const fileChanges = nonEmptyDiffs.map(diffInfo => {
            const uri = diffInfo.modifiedModel.uri;
            const fileName = basename(uri);
            const changes = diffInfo.changes.map(change => {
                const { originalText, modifiedText } = getChangeTexts(change, diffInfo);
                return {
                    startLineNumber: change.modified.startLineNumber,
                    endLineNumber: change.modified.endLineNumberExclusive - 1,
                    originalText,
                    modifiedText,
                };
            });
            return { uri, fileName, changes };
        });
        // Total number of changes across all files
        const totalChanges = fileChanges.reduce((sum, f) => sum + f.changes.length, 0);
        try {
            // Select a model for understanding all changes together
            const models = await this._languageModelsService.selectLanguageModels({ vendor: 'copilot', id: 'copilot-fast' });
            if (!models.length) {
                for (const fileData of fileChanges) {
                    this._updateUriStatePartial(fileData.uri, {
                        progress: 'error',
                        explanations: [],
                        errorMessage: nls.localize('noModelAvailable', "No language model available"),
                    });
                }
                return;
            }
            if (cancellationToken.isCancellationRequested) {
                return;
            }
            // Build a prompt with all changes from all files
            let changeIndex = 0;
            const changesDescription = fileChanges.map(fileData => {
                return fileData.changes.map(data => {
                    const desc = `=== CHANGE ${changeIndex} (File: ${fileData.fileName}, Lines ${data.startLineNumber}-${data.endLineNumber}) ===
BEFORE:
${data.originalText || '(empty)'}

AFTER:
${data.modifiedText || '(empty)'}`;
                    changeIndex++;
                    return desc;
                }).join('\n\n');
            }).join('\n\n');
            const fileCount = fileChanges.length;
            const prompt = `Analyze these ${totalChanges} code changes across ${fileCount} file${fileCount > 1 ? 's' : ''} and provide a brief explanation for each one.
These changes are part of a single coherent modification, so consider how they relate to each other.

${changesDescription}

Respond with a JSON array containing exactly ${totalChanges} objects, one for each change in order.
Each object should have an "explanation" field with a brief sentence (max 15 words) explaining what changed and why.
Be specific about the actual code changes. Return ONLY valid JSON, no markdown.

Example response format:
[{"explanation": "Added null check to prevent crash"}, {"explanation": "Renamed variable for clarity"}]`;
            const response = await this._languageModelsService.sendChatRequest(models[0], undefined, [{ role: 1 /* ChatMessageRole.User */, content: [{ type: 'text', value: prompt }] }], {}, cancellationToken);
            let responseText = '';
            for await (const part of response.stream) {
                if (cancellationToken.isCancellationRequested) {
                    return;
                }
                if (Array.isArray(part)) {
                    for (const p of part) {
                        if (p.type === 'text') {
                            responseText += p.value;
                        }
                    }
                }
                else if (part.type === 'text') {
                    responseText += part.value;
                }
            }
            await response.result;
            if (cancellationToken.isCancellationRequested) {
                return;
            }
            // Parse the JSON response
            let parsed = [];
            try {
                // Handle potential markdown wrapping
                let jsonText = responseText.trim();
                if (jsonText.startsWith('```')) {
                    jsonText = jsonText.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
                }
                parsed = JSON.parse(jsonText);
            }
            catch {
                // JSON parsing failed - will use default messages
            }
            // Map explanations back to files
            let parsedIndex = 0;
            for (const fileData of fileChanges) {
                const explanations = [];
                for (const data of fileData.changes) {
                    const parsedExplanation = parsed[parsedIndex]?.explanation?.trim() || nls.localize('codeWasModified', "Code was modified.");
                    explanations.push({
                        uri: fileData.uri,
                        startLineNumber: data.startLineNumber,
                        endLineNumber: data.endLineNumber,
                        originalText: data.originalText,
                        modifiedText: data.modifiedText,
                        explanation: parsedExplanation,
                    });
                    parsedIndex++;
                }
                this._updateUriStatePartial(fileData.uri, {
                    progress: 'complete',
                    explanations,
                });
            }
        }
        catch (e) {
            if (!cancellationToken.isCancellationRequested) {
                const errorMessage = e instanceof Error ? e.message : nls.localize('explanationFailed', "Failed to generate explanations");
                for (const fileData of fileChanges) {
                    this._updateUriStatePartial(fileData.uri, {
                        progress: 'error',
                        explanations: [],
                        errorMessage,
                    });
                }
            }
        }
    }
};
ChatEditingExplanationModelManager = __decorate([
    __param(0, ILanguageModelsService)
], ChatEditingExplanationModelManager);
export { ChatEditingExplanationModelManager };
registerSingleton(IChatEditingExplanationModelManager, ChatEditingExplanationModelManager, 1 /* InstantiationType.Delayed */);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdEVkaXRpbmdFeHBsYW5hdGlvbk1vZGVsTWFuYWdlci5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci9jaGF0RWRpdGluZy9jaGF0RWRpdGluZ0V4cGxhbmF0aW9uTW9kZWxNYW5hZ2VyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBcUIsdUJBQXVCLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUN4RyxPQUFPLEVBQUUsVUFBVSxFQUFlLE1BQU0seUNBQXlDLENBQUM7QUFDbEYsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQ2hFLE9BQU8sRUFBZSxlQUFlLEVBQUUsTUFBTSwwQ0FBMEMsQ0FBQztBQUN4RixPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFJbkUsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLCtEQUErRCxDQUFDO0FBQ2hHLE9BQU8sRUFBcUIsaUJBQWlCLEVBQUUsTUFBTSw0REFBNEQsQ0FBQztBQUNsSCxPQUFPLEVBQW1CLHNCQUFzQixFQUFFLE1BQU0sZ0NBQWdDLENBQUM7QUFDekYsT0FBTyxLQUFLLEdBQUcsTUFBTSx1QkFBdUIsQ0FBQztBQXVEN0MsTUFBTSxDQUFDLE1BQU0sbUNBQW1DLEdBQUcsZUFBZSxDQUFzQyxvQ0FBb0MsQ0FBQyxDQUFDO0FBNkI5STs7R0FFRztBQUNILFNBQVMsY0FBYyxDQUFDLE1BQW1ELEVBQUUsUUFBOEI7SUFDMUcsTUFBTSxhQUFhLEdBQWEsRUFBRSxDQUFDO0lBQ25DLE1BQU0sYUFBYSxHQUFhLEVBQUUsQ0FBQztJQUVuQyxvQkFBb0I7SUFDcEIsS0FBSyxJQUFJLENBQUMsR0FBRyxNQUFNLENBQUMsUUFBUSxDQUFDLGVBQWUsRUFBRSxDQUFDLEdB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