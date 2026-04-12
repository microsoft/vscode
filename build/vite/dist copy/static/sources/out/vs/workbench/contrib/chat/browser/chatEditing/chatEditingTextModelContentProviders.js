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
var ChatEditingTextModelContentProvider_1;
import { Schemas } from '../../../../../base/common/network.js';
import { URI } from '../../../../../base/common/uri.js';
import { IModelService } from '../../../../../editor/common/services/model.js';
let ChatEditingTextModelContentProvider = class ChatEditingTextModelContentProvider {
    static { ChatEditingTextModelContentProvider_1 = this; }
    static { this.scheme = Schemas.chatEditingModel; }
    static getFileURI(chatSessionResource, documentId, path) {
        return URI.from({
            scheme: ChatEditingTextModelContentProvider_1.scheme,
            path,
            query: JSON.stringify({ kind: 'doc', documentId, chatSessionResource }),
        });
    }
    constructor(_chatEditingService, _modelService) {
        this._chatEditingService = _chatEditingService;
        this._modelService = _modelService;
    }
    async provideTextContent(resource) {
        const existing = this._modelService.getModel(resource);
        if (existing && !existing.isDisposed()) {
            return existing;
        }
        const data = JSON.parse(resource.query);
        const session = this._chatEditingService.getEditingSession(URI.revive(data.chatSessionResource));
        const entry = session?.entries.get().find(candidate => candidate.entryId === data.documentId);
        if (!entry) {
            return null;
        }
        return this._modelService.getModel(entry.originalURI);
    }
};
ChatEditingTextModelContentProvider = ChatEditingTextModelContentProvider_1 = __decorate([
    __param(1, IModelService)
], ChatEditingTextModelContentProvider);
export { ChatEditingTextModelContentProvider };
let ChatEditingSnapshotTextModelContentProvider = class ChatEditingSnapshotTextModelContentProvider {
    static getSnapshotFileURI(chatSessionResource, requestId, undoStop, path, scheme) {
        return URI.from({
            scheme: Schemas.chatEditingSnapshotScheme,
            path,
            query: JSON.stringify({ session: chatSessionResource, requestId: requestId ?? '', undoStop: undoStop ?? '', scheme }),
        });
    }
    constructor(_chatEditingService, _modelService) {
        this._chatEditingService = _chatEditingService;
        this._modelService = _modelService;
    }
    async provideTextContent(resource) {
        const existing = this._modelService.getModel(resource);
        if (existing && !existing.isDisposed()) {
            return existing;
        }
        const data = JSON.parse(resource.query);
        const session = this._chatEditingService.getEditingSession(URI.revive(data.session));
        if (!session || !data.requestId) {
            return null;
        }
        return session.getSnapshotModel(data.requestId, data.undoStop || undefined, resource);
    }
};
ChatEditingSnapshotTextModelContentProvider = __decorate([
    __param(1, IModelService)
], ChatEditingSnapshotTextModelContentProvider);
export { ChatEditingSnapshotTextModelContentProvider };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdEVkaXRpbmdUZXh0TW9kZWxDb250ZW50UHJvdmlkZXJzLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9icm93c2VyL2NoYXRFZGl0aW5nL2NoYXRFZGl0aW5nVGV4dE1vZGVsQ29udGVudFByb3ZpZGVycy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBQ2hFLE9BQU8sRUFBRSxHQUFHLEVBQWlCLE1BQU0sbUNBQW1DLENBQUM7QUFFdkUsT0FBTyxFQUFFLGFBQWEsRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBTXhFLElBQU0sbUNBQW1DLEdBQXpDLE1BQU0sbUNBQW1DOzthQUN4QixXQUFNLEdBQUcsT0FBTyxDQUFDLGdCQUFnQixBQUEzQixDQUE0QjtJQUVsRCxNQUFNLENBQUMsVUFBVSxDQUFDLG1CQUF3QixFQUFFLFVBQWtCLEVBQUUsSUFBWTtRQUNsRixPQUFPLEdBQUcsQ0FBQyxJQUFJLENBQUM7WUFDZixNQUFNLEVBQUUscUNBQW1DLENBQUMsTUFBTTtZQUNsRCxJQUFJO1lBQ0osS0FBSyxFQUFFLElBQUksQ0FBQyxTQUFTLENBQUMsRUFBRSxJQUFJLEVBQUUsS0FBSyxFQUFFLFVBQVUsRUFBRSxtQkFBbUIsRUFBaUQsQ0FBQztTQUN0SCxDQUFDLENBQUM7SUFDSixDQUFDO0lBRUQsWUFDa0IsbUJBQXdDLEVBQ3pCLGFBQTRCO1FBRDNDLHdCQUFtQixHQUFuQixtQkFBbUIsQ0FBcUI7UUFDekIsa0JBQWEsR0FBYixhQUFhLENBQWU7SUFDekQsQ0FBQztJQUVMLEtBQUssQ0FBQyxrQkFBa0IsQ0FBQyxRQUFhO1FBQ3JDLE1BQU0sUUFBUSxHQUFHLElBQUksQ0FBQyxhQUFhLENBQUMsUUFBUSxDQUFD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