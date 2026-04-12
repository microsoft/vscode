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
import { coalesce } from '../../../../../base/common/arrays.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Emitter } from '../../../../../base/common/event.js';
import { Disposable, DisposableResourceMap } from '../../../../../base/common/lifecycle.js';
import { ResourceMap, ResourceSet } from '../../../../../base/common/map.js';
import { equals } from '../../../../../base/common/objects.js';
import { autorun, observableSignalFromEvent } from '../../../../../base/common/observable.js';
import { isEqual } from '../../../../../base/common/resources.js';
import { convertLegacyChatSessionTiming, IChatService } from '../../common/chatService/chatService.js';
import { chatModelToChatDetail } from '../../common/chatService/chatServiceImpl.js';
import { IChatSessionsService, localChatSessionType } from '../../common/chatSessionsService.js';
import { getChatSessionType } from '../../common/model/chatUri.js';
import { getInProgressSessionDescription } from '../chatSessions/chatSessionDescription.js';
import { chatResponseStateToSessionStatus, getSessionStatusForModel } from '../chatSessions/chatSessions.contribution.js';
let LocalAgentsSessionsController = class LocalAgentsSessionsController extends Disposable {
    static { this.ID = 'workbench.contrib.localAgentsSessionsController'; }
    constructor(chatService, chatSessionsService) {
        super();
        this.chatService = chatService;
        this.chatSessionsService = chatSessionsService;
        this.chatSessionType = localChatSessionType;
        this._onDidChangeChatSessionItems = this._register(new Emitter());
        this.onDidChangeChatSessionItems = this._onDidChangeChatSessionItems.event;
        this._modelListeners = this._register(new DisposableResourceMap());
        this._isDisposed = false;
        this._items = new ResourceMap();
        this._register(this.chatSessionsService.registerChatSessionItemController(this.chatSessionType, this));
        this.registerListeners();
    }
    dispose() {
        this._isDisposed = true;
        super.dispose();
    }
    get items() {
        return Array.from(this._items.values());
    }
    async refresh(token) {
        const newItems = await this.provideChatSessionItems(token);
        this._items.clear();
        for (const item of newItems) {
            this._items.set(item.resource, item);
        }
    }
    registerListeners() {
        const addModelListeners = async (model) => {
            if (getChatSessionType(model.sessionResource) !== this.chatSessionType) {
                return;
            }
            await this.refresh(CancellationToken.None);
            if (this._isDisposed) {
                return;
            }
            this.tryUpdateLiveSessionItem(model);
            const requestChangeListener = model.lastRequestObs.map(last => last?.response && observableSignalFromEvent('chatSessions.modelRequestChangeListener', last.response.onDidChange));
            const modelChangeListener = observableSignalFromEvent('chatSessions.modelChangeListener', model.onDidChange);
            this._modelListeners.set(model.sessionResource, autorun(reader => {
                requestChangeListener.read(reader)?.read(reader);
                modelChangeListener.read(reader);
                this.tryUpdateLiveSessionItem(model);
            }));
        };
        this._register(this.chatService.onDidCreateModel(model => addModelListeners(model)));
        for (const model of this.chatService.chatModels.get()) {
            addModelListeners(model);
        }
        this._register(this.chatService.onDidDisposeSession(e => {
            for (const sessionResource of e.sessionResources) {
                this._modelListeners.deleteAndDispose(sessionResource);
            }
            const removedSessionResources = e.sessionResources.filter(resource => getChatSessionType(resource) === this.chatSessionType);
            if (removedSessionResources.length) {
                this._onDidChangeChatSessionItems.fire({ removed: removedSessionResources });
            }
        }));
    }
    async tryUpdateLiveSessionItem(model) {
        const existing = this._items.get(model.sessionResource);
        if (!existing) {
            return;
        }
        const updated = new LocalChatSessionItem(await chatModelToChatDetail(model), model);
        if (existing.isEqual(updated)) {
            return;
        }
        this._items.set(existing.resource, updated);
        this._onDidChangeChatSessionItems.fire({ addedOrUpdated: [updated] });
    }
    async provideChatSessionItems(token) {
        const sessions = [];
        const sessionsByResource = new ResourceSet();
        for (const sessionDetail of await this.chatService.getLiveSessionItems()) {
            const editorSession = this.toChatSessionItem(sessionDetail);
            if (!editorSession) {
                continue;
            }
            sessionsByResource.add(sessionDetail.sessionResource);
            sessions.push(editorSession);
        }
        if (!token.isCancellationRequested) {
            const history = await this.getHistoryItems();
            sessions.push(...history.filter(historyItem => !sessionsByResource.has(historyItem.resource)));
        }
        return sessions;
    }
    async getHistoryItems() {
        try {
            const historyItems = await this.chatService.getHistorySessionItems();
            return coalesce(historyItems.map(history => this.toChatSessionItem(history)));
        }
        catch (error) {
            return [];
        }
    }
    toChatSessionItem(chat) {
        const model = this.chatService.getSession(chat.sessionResource);
        if (model) {
            if (!model.hasRequests) {
                return undefined; // ignore sessions without requests
            }
        }
        else if (chat.isActive) {
            // Sessions that are active but don't have a chat model are ultimately untitled with no requests
            return undefined;
        }
        return new LocalChatSessionItem(chat, model);
    }
};
LocalAgentsSessionsController = __decorate([
    __param(0, IChatService),
    __param(1, IChatSessionsService)
], LocalAgentsSessionsController);
export { LocalAgentsSessionsController };
class LocalChatSessionItem {
    constructor(chatDetail, model) {
        this.iconPath = Codicon.chatSparkle;
        this.resource = chatDetail.sessionResource;
        this.label = chatDetail.title;
        this.description = model ? getInProgressSessionDescription(model) : undefined;
        this.status = (model && getSessionStatusForModel(model)) ?? chatResponseStateToSessionStatus(chatDetail.lastResponseState);
        this.timing = convertLegacyChatSessionTiming(chatDetail.timing);
        this.changes = chatDetail.stats ? {
            insertions: chatDetail.stats.added,
            deletions: chatDetail.stats.removed,
            files: chatDetail.stats.fileCount,
        } : undefined;
    }
    isEqual(other) {
        return isEqual(this.resource, other.resource)
            && this.label === other.label
            && this.description === other.description
            && this.status === other.status
            && this.timing.created === other.timing.created
            && this.timing.lastRequestStarted === other.timing.lastRequestStarted
            && this.timing.lastRequestEnded === other.timing.lastRequestEnded
            && equals(this.changes, other.changes);
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibG9jYWxBZ2VudFNlc3Npb25zQ29udHJvbGxlci5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci9hZ2VudFNlc3Npb25zL2xvY2FsQWdlbnRTZXNzaW9uc0NvbnRyb2xsZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ2hFLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLDRDQUE0QyxDQUFDO0FBQy9FLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUNqRSxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDOUQsT0FBTyxFQUFFLFVBQVUsRUFBRSxxQkFBcUIsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQzVGLE9BQU8sRUFBRSxXQUFXLEVBQUUsV0FBVyxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDN0UsT0FBTyxFQUFFLE1BQU0sRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBQy9ELE9BQU8sRUFBRSxPQUFPLEVBQUUseUJBQXlCLEVBQUUsTUFBTSwwQ0FBMEMsQ0FBQztBQUM5RixPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFHbEUsT0FBTyxFQUFFLDhCQUE4QixFQUFlLFlBQVksRUFBc0IsTUFBTSx5Q0FBeUMsQ0FBQztBQUN4SSxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSw2Q0FBNkMsQ0FBQztBQUNwRixPQUFPLEVBQTJGLG9CQUFvQixFQUFFLG9CQUFvQixFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFFMUwsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sK0JBQStCLENBQUM7QUFDbkUsT0FBTyxFQUFFLCtCQUErQixF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