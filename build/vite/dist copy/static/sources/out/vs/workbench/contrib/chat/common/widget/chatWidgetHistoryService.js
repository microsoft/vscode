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
import { equals as arraysEqual } from '../../../../../base/common/arrays.js';
import { Emitter } from '../../../../../base/common/event.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';
import { IStorageService } from '../../../../../platform/storage/common/storage.js';
import { Memento } from '../../../../common/memento.js';
import { CHAT_PROVIDER_ID } from '../participants/chatParticipantContribTypes.js';
import { ChatAgentLocation, ChatModeKind } from '../constants.js';
export const IChatWidgetHistoryService = createDecorator('IChatWidgetHistoryService');
export const ChatInputHistoryMaxEntries = 40;
let ChatWidgetHistoryService = class ChatWidgetHistoryService extends Disposable {
    constructor(storageService) {
        super();
        this._onDidChangeHistory = this._register(new Emitter());
        this.changed = false;
        this.onDidChangeHistory = this._onDidChangeHistory.event;
        this.memento = new Memento('interactive-session', storageService);
        const loadedState = this.memento.getMemento(1 /* StorageScope.WORKSPACE */, 1 /* StorageTarget.MACHINE */);
        this.viewState = loadedState;
        this._register(storageService.onWillSaveState(() => {
            if (this.changed) {
                this.memento.saveMemento();
                this.changed = false;
            }
        }));
    }
    getHistory(location) {
        const key = this.getKey(location);
        const history = this.viewState.history?.[key] ?? [];
        return history.map(entry => this.migrateHistoryEntry(entry));
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    migrateHistoryEntry(entry) {
        // If it's already in the new format (has 'inputText' property), return as-is
        if (entry.inputText !== undefined) {
            return entry;
        }
        // Otherwise, it's an old IChatHistoryEntry with 'text' and 'state' properties
        const oldEntry = entry;
        const oldState = oldEntry.state ?? {};
        // Migrate chatMode to the new mode structure
        let modeId;
        let modeKind;
        if (oldState.chatMode) {
            if (typeof oldState.chatMode === 'string') {
                modeId = oldState.chatMode;
                modeKind = Object.values(ChatModeKind).includes(oldState.chatMode)
                    ? oldState.chatMode
                    : undefined;
            }
            else if (typeof oldState.chatMode === 'object' && oldState.chatMode !== null) {
                // Old format: { id: string }
                const oldMode = oldState.chatMode;
                modeId = oldMode.id ?? ChatModeKind.Ask;
                modeKind = oldMode.id && Object.values(ChatModeKind).includes(oldMode.id)
                    ? oldMode.id
                    : undefined;
            }
            else {
                modeId = ChatModeKind.Ask;
                modeKind = ChatModeKind.Ask;
            }
        }
        else {
            modeId = ChatModeKind.Ask;
            modeKind = ChatModeKind.Ask;
        }
        return {
            inputText: oldEntry.text ?? '',
            attachments: oldState.chatContextAttachments ?? [],
            mode: {
                id: modeId,
                kind: modeKind
            },
            contrib: oldEntry.state || {},
            selectedModel: undefined,
            selections: []
        };
    }
    getKey(location) {
        // Preserve history for panel by continuing to use the same old provider id. Use the location as a key for other chat locations.
        return location === ChatAgentLocation.Chat ? CHAT_PROVIDER_ID : location;
    }
    append(location, history) {
        this.viewState.history ??= {};
        const key = this.getKey(location);
        this.viewState.history[key] = this.getHistory(location).concat(history).slice(-ChatInputHistoryMaxEntries);
        this.changed = true;
        this._onDidChangeHistory.fire({ kind: 'append', entry: history });
    }
    clearHistory() {
        this.viewState.history = {};
        this.changed = true;
        this._onDidChangeHistory.fire({ kind: 'clear' });
    }
};
ChatWidgetHistoryService = __decorate([
    __param(0, IStorageService)
], ChatWidgetHistoryService);
export { ChatWidgetHistoryService };
let ChatHistoryNavigator = class ChatHistoryNavigator extends Disposable {
    get values() {
        return this.chatWidgetHistoryService.getHistory(this.location);
    }
    constructor(location, chatWidgetHistoryService) {
        super();
        this.location = location;
        this.chatWidgetHistoryService = chatWidgetHistoryService;
        this._overlay = [];
        this._history = this.chatWidgetHistoryService.getHistory(this.location);
        this._currentIndex = this._history.length;
        this._register(this.chatWidgetHistoryService.onDidChangeHistory(e => {
            if (e.kind === 'append') {
                const prevLength = this._history.length;
                this._history = this.chatWidgetHistoryService.getHistory(this.location);
                const newLength = this._history.length;
                // If this append operation adjusted all history entries back, move our index back too
                // if we weren't pointing to the end of the history.
                if (prevLength === newLength) {
                    this._overlay.shift();
                    if (this._currentIndex < this._history.length) {
                        this._currentIndex = Math.max(this._currentIndex - 1, 0);
                    }
                }
                else if (this._currentIndex === prevLength) {
                    this._currentIndex = newLength;
                }
            }
            else if (e.kind === 'clear') {
                this._history = [];
                this._currentIndex = 0;
                this._overlay = [];
            }
        }));
    }
    isAtEnd() {
        return this._currentIndex === Math.max(this._history.length, this._overlay.length);
    }
    isAtStart() {
        return this._currentIndex === 0;
    }
    /**
     * Replaces a history entry at the current index in this view of the history.
     * Allows editing of old history entries while preventing accidental navigation
     * from losing the edits.
     */
    overlay(entry) {
        this._overlay[this._currentIndex] = entry;
    }
    resetCursor() {
        this._currentIndex = this._history.length;
    }
    previous() {
        this._currentIndex = Math.max(this._currentIndex - 1, 0);
        return this.current();
    }
    next() {
        this._currentIndex = Math.min(this._currentIndex + 1, this._history.length);
        return this.current();
    }
    current() {
        return this._overlay[this._currentIndex] ?? this._history[this._currentIndex];
    }
    /**
     * Appends a new entry to the navigator. Resets the state back to the end
     * and clears any overlayed entries.
     */
    append(entry) {
        this._overlay = [];
        this._currentIndex = this._history.length;
        if (!entriesEqual(this._history.at(-1), entry)) {
            this.chatWidgetHistoryService.append(this.location, entry);
        }
    }
};
ChatHistoryNavigator = __decorate([
    __param(1, IChatWidgetHistoryService)
], ChatHistoryNavigator);
export { ChatHistoryNavigator };
function entriesEqual(a, b) {
    if (!a || !b) {
        return false;
    }
    if (a.inputText !== b.inputText) {
        return false;
    }
    if (!arraysEqual(a.attachments, b.attachments, (x, y) => x.id === y.id)) {
        return false;
    }
    return true;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdFdpZGdldEhpc3RvcnlTZXJ2aWNlLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9jb21tb24vd2lkZ2V0L2NoYXRXaWRnZXRIaXN0b3J5U2VydmljZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsTUFBTSxJQUFJLFdBQVcsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQzdFLE9BQU8sRUFBRSxPQUFPLEVBQVMsTUFBTSxxQ0FBcUMsQ0FBQztBQUNyRSxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDckUsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLCtEQUErRCxDQUFDO0FBQ2hHLE9BQU8sRUFBRSxlQUFlLEVBQStCLE1BQU0sbURBQW1ELENBQUM7QUFDakgsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLCtCQUErQixDQUFDO0FBRXhELE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBRWxGLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxZQUFZLEVBQUUsTUFBTSxpQkFBaUIsQ0FBQztBQW9CbEUsTUFBTSxDQUFDLE1BQU0seUJBQXlCLEdBQUcsZUFBZSxDQUE0QiwyQkFBMkIsQ0FBQyxDQUFDO0FBaUJqSCxNQUFNLENBQUMsTUFBTSwwQkFBMEIsR0FBRyxFQUFFLENBQUM7QUFFdEMsSUFBTSx3QkFBd0IsR0FBOUIsTUFBTSx3QkFBeUIsU0FBUSxVQUFVO0lBVXZELFlBQ2tCLGNBQStCO1FBRWhELEtBQUssRUFBRSxDQUFDO1FBUFEsd0JBQW1CLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLE9BQU8sRUFBcUIsQ0FBQyxDQUFDO1FBQ2hGLFlBQU8sR0FBRyxLQUFLLENBQUM7UUFDZix1QkFBa0IsR0FBRyxJ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