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
import { Emitter } from '../../../../../base/common/event.js';
import { Disposable, DisposableMap, toDisposable } from '../../../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../../../base/common/map.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { ITerminalService } from '../../../terminal/browser/terminal.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IStorageService } from '../../../../../platform/storage/common/storage.js';
import { IChatService } from '../../../chat/common/chatService/chatService.js';
import { TerminalChatContextKeys } from './terminalChat.js';
import { LocalChatSessionUri } from '../../../chat/common/model/chatUri.js';
import { isNumber, isString } from '../../../../../base/common/types.js';
var StorageKeys;
(function (StorageKeys) {
    StorageKeys["ToolSessionMappings"] = "terminalChat.toolSessionMappings";
    StorageKeys["CommandIdMappings"] = "terminalChat.commandIdMappings";
})(StorageKeys || (StorageKeys = {}));
/**
 * Used to manage chat tool invocations and the underlying terminal instances they create/use.
 */
let TerminalChatService = class TerminalChatService extends Disposable {
    constructor(_logService, _terminalService, _storageService, _contextKeyService, _chatService) {
        super();
        this._logService = _logService;
        this._terminalService = _terminalService;
        this._storageService = _storageService;
        this._contextKeyService = _contextKeyService;
        this._chatService = _chatService;
        this._terminalInstancesByToolSessionId = new Map();
        this._toolSessionIdByTerminalInstance = new Map();
        this._chatSessionResourceByTerminalInstance = new Map();
        this._terminalInstanceListenersByToolSessionId = this._register(new DisposableMap());
        this._chatSessionListenersByTerminalInstance = this._register(new DisposableMap());
        this._onDidContinueInBackground = this._register(new Emitter());
        this.onDidContinueInBackground = this._onDidContinueInBackground.event;
        this._onDidRegisterTerminalInstanceForToolSession = this._register(new Emitter());
        this.onDidRegisterTerminalInstanceWithToolSession = this._onDidRegisterTerminalInstanceForToolSession.event;
        this._activeProgressParts = new Set();
        /**
         * Pending mappings restored from storage that have not yet been matched to a live terminal
         * instance (we match by persistentProcessId when it becomes available after reconnection).
         * toolSessionId -> persistentProcessId
         */
        this._pendingRestoredMappings = new Map();
        /**
         * Tracks chat session resources that have auto approval enabled for all commands. This is a temporary
         * approval that lasts only for the duration of the session.
         */
        this._sessionAutoApprovalEnabled = new ResourceMap();
        /**
         * Tracks session-scoped auto-approve rules per chat session. These are temporary rules that
         * last only for the duration of the chat session (not persisted to disk).
         */
        this._sessionAutoApproveRules = new ResourceMap();
        this._hasToolTerminalContext = TerminalChatContextKeys.hasChatTerminals.bindTo(this._contextKeyService);
        this._hasHiddenToolTerminalContext = TerminalChatContextKeys.hasHiddenChatTerminals.bindTo(this._contextKeyService);
        this._restoreFromStorage();
        // Clear session auto-approve rules when chat sessions end
        this._register(this._chatService.onDidDisposeSession(e => {
            for (const resource of e.sessionResources) {
                this._sessionAutoApproveRules.delete(resource);
                this._sessionAutoApprovalEnabled.delete(resource);
            }
        }));
    }
    registerTerminalInstanceWithToolSession(terminalToolSessionId, instance) {
        if (!terminalToolSessionId) {
            this._logService.warn('Attempted to register a terminal instance with an undefined tool session ID');
            return;
        }
        this._terminalInstancesByToolSessionId.set(terminalToolSessionId, instance);
        this._toolSessionIdByTerminalInstance.set(instance, terminalToolSessionId);
        this._onDidRegisterTerminalInstanceForToolSession.fire(instance);
        this._terminalInstanceListenersByToolSessionId.set(terminalToolSessionId, instance.onDisposed(() => {
            this._terminalInstancesByToolSessionId.delete(terminalToolSessionId);
            this._toolSessionIdByTerminalInstance.delete(instance);
            this._terminalInstanceListenersByToolSessionId.deleteAndDispose(terminalToolSessionId);
            this._persistToStorage();
            this._updateHasToolTerminalContextKeys();
        }));
        this._register(this._chatService.onDidDisposeSession(e => {
            for (const resource of e.sessionResources) {
                if (LocalChatSessionUri.parseLocalSessionId(resource) === terminalToolSessionId) {
                    this._terminalInstancesByToolSessionId.delete(terminalToolSessionId);
                    this._toolSessionIdByTerminalInstance.delete(instance);
                    this._terminalInstanceListenersByToolSessionId.deleteAndDispose(terminalToolSessionId);
                    // Clean up session auto approval state
                    this._sessionAutoApprovalEnabled.delete(resource);
                    this._persistToStorage();
                    this._updateHasToolTerminalContextKeys();
                }
            }
        }));
        // Update context keys when terminal instances change (including when terminals are created, disposed, revealed, or hidden)
        this._register(this._terminalService.onDidChangeInstances(() => this._updateHasToolTerminalContextKeys()));
        if (isNumber(instance.shellLaunchConfig?.attachPersistentProcess?.id) || isNumber(instance.persistentProcessId)) {
            this._persistToStorage();
        }
        this._updateHasToolTerminalContextKeys();
    }
    async getTerminalInstanceByToolSessionId(terminalToolSessionId) {
        await this._terminalService.whenConnected;
        if (!terminalToolSessionId) {
            return undefined;
        }
        if (this._pendingRestoredMappings.has(terminalToolSessionId)) {
            const instance = this._terminalService.instances.find(i => i.shellLaunchConfig.attachPersistentProcess?.id === this._pendingRestoredMappings.get(terminalToolSessionId));
            if (instance) {
                this._tryAdoptRestoredMapping(instance);
                return instance;
            }
        }
        return this._terminalInstancesByToolSessionId.get(terminalToolSessionId);
    }
    getToolSessionTerminalInstances(hiddenOnly) {
        if (hiddenOnly) {
            const foregroundInstances = new Set(this._terminalService.foregroundInstances.map(i => i.instanceId));
            const uniqueInstances = new Set(this._terminalInstancesByToolSessionId.values());
            return Array.from(uniqueInstances).filter(i => !foregroundInstances.has(i.instanceId));
        }
        // Ensure unique instances in case multiple tool sessions map to the same terminal
        return Array.from(new Set(this._terminalInstancesByToolSessionId.values()));
    }
    getToolSessionIdForInstance(instance) {
        return this._toolSessionIdByTerminalInstance.get(instance);
    }
    registerTerminalInstanceWithChatSession(chatSessionResource, instance) {
        // If already registered with the same session, skip to avoid duplicate listeners
        const existingResource = this._chatSessionResourceByTerminalInstance.get(instance);
        if (existingResource && existingResource.toString() === chatSessionResource.toString()) {
            return;
        }
        // Clean up previous listener if the instance was registered with a different session
        this._chatSessionListenersByTerminalInstance.deleteAndDispose(instance);
        this._chatSessionResourceByTerminalInstance.set(instance, chatSessionResource);
        // Clean up when the instance is disposed
        const disposable = instance.onDisposed(() => {
            this._chatSessionResourceByTerminalInstance.delete(instance);
            this._chatSessionListenersByTerminalInstance.deleteAndDispose(instance);
        });
        this._chatSessionListenersByTerminalInstance.set(instance, disposable);
    }
    getChatSessionResourceForInstance(instance) {
        return this._chatSessionResourceByTerminalInstance.get(instance);
    }
    isBackgroundTerminal(terminalToolSessionId) {
        if (!terminalToolSessionId) {
            return false;
        }
        const instance = this._terminalInstancesByToolSessionId.get(terminalToolSessionId);
        if (!instance) {
            return false;
        }
        return this._terminalService.instances.includes(instance) && !this._terminalService.foregroundInstances.includes(instance);
    }
    registerProgressPart(part) {
        this._activeProgressParts.add(part);
        if (this._isAfter(part, this._mostRecentProgressPart)) {
            this._mostRecentProgressPart = part;
        }
        return toDisposable(() => {
            this._activeProgressParts.delete(part);
            if (this._focusedProgressPart === part) {
                this._focusedProgressPart = undefined;
            }
            if (this._mostRecentProgressPart === part) {
                this._mostRecentProgressPart = this._getLastActiveProgressPart();
            }
        });
    }
    setFocusedProgressPart(part) {
        this._focusedProgressPart = part;
    }
    clearFocusedProgressPart(part) {
        if (this._focusedProgressPart === part) {
            this._focusedProgressPart = undefined;
        }
    }
    getFocusedProgressPart() {
        return this._focusedProgressPart;
    }
    getMostRecentProgressPart() {
        if (!this._mostRecentProgressPart || !this._activeProgressParts.has(this._mostRecentProgressPart)) {
            this._mostRecentProgressPart = this._getLastActiveProgressPart();
        }
        return this._mostRecentProgressPart;
    }
    _getLastActiveProgressPart() {
        let latest;
        for (const part of this._activeProgressParts) {
            if (this._isAfter(part, latest)) {
                latest = part;
            }
        }
        return latest;
    }
    _isAfter(candidate, current) {
        if (!current) {
            return true;
        }
        if (candidate.elementIndex === current.elementIndex) {
            return candidate.contentIndex >= current.contentIndex;
        }
        return candidate.elementIndex > current.elementIndex;
    }
    _restoreFromStorage() {
        try {
            const raw = this._storageService.get("terminalChat.toolSessionMappings" /* StorageKeys.ToolSessionMappings */, 1 /* StorageScope.WORKSPACE */);
            if (!raw) {
                return;
            }
            const parsed = JSON.parse(raw);
            for (const [toolSessionId, persistentProcessId] of parsed) {
                if (isString(toolSessionId) && isNumber(persistentProcessId)) {
                    this._pendingRestoredMappings.set(toolSessionId, persistentProcessId);
                }
            }
        }
        catch (err) {
            this._logService.warn('Failed to restore terminal chat tool session mappings', err);
        }
    }
    _tryAdoptRestoredMapping(instance) {
        if (this._pendingRestoredMappings.size === 0) {
            return;
        }
        for (const [toolSessionId, persistentProcessId] of this._pendingRestoredMappings) {
            if (persistentProcessId === instance.shellLaunchConfig.attachPersistentProcess?.id) {
                this._terminalInstancesByToolSessionId.set(toolSessionId, instance);
                this._toolSessionIdByTerminalInstance.set(instance, toolSessionId);
                this._onDidRegisterTerminalInstanceForToolSession.fire(instance);
                this._terminalInstanceListenersByToolSessionId.set(toolSessionId, instance.onDisposed(() => {
                    this._terminalInstancesByToolSessionId.delete(toolSessionId);
                    this._toolSessionIdByTerminalInstance.delete(instance);
                    this._terminalInstanceListenersByToolSessionId.deleteAndDispose(toolSessionId);
                    this._persistToStorage();
                }));
                this._pendingRestoredMappings.delete(toolSessionId);
                this._persistToStorage();
                break;
            }
        }
    }
    _persistToStorage() {
        this._updateHasToolTerminalContextKeys();
        try {
            const entries = [];
            for (const [toolSessionId, instance] of this._terminalInstancesByToolSessionId.entries()) {
                // Use the live persistent process id when available, otherwise fall back to the id
                // from the attached process so mappings survive early in the terminal lifecycle.
                const persistentId = isNumber(instance.persistentProcessId)
                    ? instance.persistentProcessId
                    : instance.shellLaunchConfig.attachPersistentProcess?.id;
                const shouldPersist = instance.shouldPersist || instance.shellLaunchConfig.forcePersist;
                if (isNumber(persistentId) && shouldPersist) {
                    entries.push([toolSessionId, persistentId]);
                }
            }
            if (entries.length > 0) {
                this._storageService.store("terminalChat.toolSessionMappings" /* StorageKeys.ToolSessionMappings */, JSON.stringify(entries), 1 /* StorageScope.WORKSPACE */, 1 /* StorageTarget.MACHINE */);
            }
            else {
                this._storageService.remove("terminalChat.toolSessionMappings" /* StorageKeys.ToolSessionMappings */, 1 /* StorageScope.WORKSPACE */);
            }
        }
        catch (err) {
            this._logService.warn('Failed to persist terminal chat tool session mappings', err);
        }
    }
    _updateHasToolTerminalContextKeys() {
        const toolCount = this._terminalInstancesByToolSessionId.size;
        this._hasToolTerminalContext.set(toolCount > 0);
        const hiddenTerminalCount = this.getToolSessionTerminalInstances(true).length;
        this._hasHiddenToolTerminalContext.set(hiddenTerminalCount > 0);
    }
    setChatSessionAutoApproval(chatSessionResource, enabled) {
        if (enabled) {
            this._sessionAutoApprovalEnabled.set(chatSessionResource, true);
        }
        else {
            this._sessionAutoApprovalEnabled.delete(chatSessionResource);
        }
    }
    hasChatSessionAutoApproval(chatSessionResource) {
        return this._sessionAutoApprovalEnabled.has(chatSessionResource);
    }
    addSessionAutoApproveRule(chatSessionResource, key, value) {
        let sessionRules = this._sessionAutoApproveRules.get(chatSessionResource);
        if (!sessionRules) {
            sessionRules = {};
            this._sessionAutoApproveRules.set(chatSessionResource, sessionRules);
        }
        sessionRules[key] = value;
    }
    getSessionAutoApproveRules(chatSessionResource) {
        return this._sessionAutoApproveRules.get(chatSessionResource) ?? {};
    }
    continueInBackground(terminalToolSessionId) {
        this._onDidContinueInBackground.fire(terminalToolSessionId);
    }
};
TerminalChatService = __decorate([
    __param(0, ILogService),
    __param(1, ITerminalService),
    __param(2, IStorageService),
    __param(3, IContextKeyService),
    __param(4, IChatService)
], TerminalChatService);
export { TerminalChatService };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVybWluYWxDaGF0U2VydmljZS5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL3Rlcm1pbmFsQ29udHJpYi9jaGF0L2Jyb3dzZXIvdGVybWluYWxDaGF0U2VydmljZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsT0FBTyxFQUFTLE1BQU0scUNBQXFDLENBQUM7QUFDckUsT0FBTyxFQUFFLFVBQVUsRUFBRSxhQUFhLEVBQWUsWUFBWSxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDL0csT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBRWhFLE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSwyQ0FBMkMsQ0FBQztBQUN4RSxPQUFPLEVBQTBFLGdCQUFnQixFQUFFLE1BQU0sdUNBQXVDLENBQUM7QUFDakosT0FBTyxFQUFlLGtCQUFrQixFQUFFLE1BQU0seURBQXlELENBQUM7QUFDMUcsT0FBTyxFQUFFLGVBQWUsRUFBK0IsTUFBTSxtREFBbUQsQ0FBQztBQUNqSCxPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0saURBQWlELENBQUM7QUFDL0UsT0FBTyxFQUFFLHVCQUF1QixFQUFFLE1BQU0sbUJBQW1CLENBQUM7QUFDNUQsT0FBTyxFQUFFLG1CQUFtQixFQUFFLE1BQU0sdUNBQXVDLENBQUM7QUFDNUUsT0FBTyxFQUFFLFFBQVEsRUFBRSxRQUFRLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUV6RSxJQUFXLFdBR1Y7QUFIRCxXQUFXLFdBQVc7SUFDckIsdUVBQXdELENBQUE7SUFDeEQsbUVBQW9ELENBQUE7QUFDckQsQ0FBQyxFQUhVLFdBQVcsS0FBWCxXQUFXLFFBR3JCO0FBR0Q7O0dBRUc7QUFDSSxJQUFNLG1CQUFtQixHQUF6QixNQUFNLG1CQUFvQixTQUFR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