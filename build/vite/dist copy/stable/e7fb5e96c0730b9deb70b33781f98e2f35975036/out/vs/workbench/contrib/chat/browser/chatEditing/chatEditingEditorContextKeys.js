var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Event } from '../../../../../base/common/event.js';
import { DisposableMap, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { autorun, constObservable, derived, observableFromEvent } from '../../../../../base/common/observable.js';
import { localize } from '../../../../../nls.js';
import { RawContextKey } from '../../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { EditorResourceAccessor, SideBySideEditor } from '../../../../common/editor.js';
import { IEditorGroupsService } from '../../../../services/editor/common/editorGroupsService.js';
import { IInlineChatSessionService } from '../../../inlineChat/browser/inlineChatSessionService.js';
import { IChatEditingService } from '../../common/editing/chatEditingService.js';
import { IChatService } from '../../common/chatService/chatService.js';
export const ctxIsGlobalEditingSession = new RawContextKey('chatEdits.isGlobalEditingSession', undefined, localize('chat.ctxEditSessionIsGlobal', "The current editor is part of the global edit session"));
export const ctxHasEditorModification = new RawContextKey('chatEdits.hasEditorModifications', undefined, localize('chat.hasEditorModifications', "The current editor contains chat modifications"));
export const ctxIsCurrentlyBeingModified = new RawContextKey('chatEdits.isCurrentlyBeingModified', undefined, localize('chat.isCurrentlyBeingModified', "The current editor is currently being modified"));
export const ctxReviewModeEnabled = new RawContextKey('chatEdits.isReviewModeEnabled', true, localize('chat.ctxReviewModeEnabled', "Review mode for chat changes is enabled"));
export const ctxHasRequestInProgress = new RawContextKey('chatEdits.isRequestInProgress', false, localize('chat.ctxHasRequestInProgress', "The current editor shows a file from an edit session which is still in progress"));
export const ctxRequestCount = new RawContextKey('chatEdits.requestCount', 0, localize('chatEdits.requestCount', "The number of turns the editing session in this editor has"));
export const ctxCursorInChangeRange = new RawContextKey('chatEdits.cursorInChangeRange', false, localize('chat.ctxCursorInChangeRange', "The cursor is inside a change range made by chat editing."));
let ChatEditingEditorContextKeys = class ChatEditingEditorContextKeys {
    static { this.ID = 'chat.edits.editorContextKeys'; }
    constructor(instaService, editorGroupsService) {
        this._store = new DisposableStore();
        const editorGroupCtx = this._store.add(new DisposableMap());
        const editorGroups = observableFromEvent(this, Event.any(editorGroupsService.onDidAddGroup, editorGroupsService.onDidRemoveGroup), () => editorGroupsService.groups);
        this._store.add(autorun(r => {
            const toDispose = new Set(editorGroupCtx.keys());
            for (const group of editorGroups.read(r)) {
                toDispose.delete(group);
                if (editorGroupCtx.has(group)) {
                    continue;
                }
                editorGroupCtx.set(group, instaService.createInstance(ContextKeyGroup, group));
            }
            for (const item of toDispose) {
                editorGroupCtx.deleteAndDispose(item);
            }
        }));
    }
    dispose() {
        this._store.dispose();
    }
};
ChatEditingEditorContextKeys = __decorate([
    __param(0, IInstantiationService),
    __param(1, IEditorGroupsService)
], ChatEditingEditorContextKeys);
export { ChatEditingEditorContextKeys };
let ContextKeyGroup = class ContextKeyGroup {
    constructor(group, inlineChatSessionService, chatEditingService, chatService) {
        this._store = new DisposableStore();
        this._ctxIsGlobalEditingSession = ctxIsGlobalEditingSession.bindTo(group.scopedContextKeyService);
        this._ctxHasEditorModification = ctxHasEditorModification.bindTo(group.scopedContextKeyService);
        this._ctxIsCurrentlyBeingModified = ctxIsCurrentlyBeingModified.bindTo(group.scopedContextKeyService);
        this._ctxHasRequestInProgress = ctxHasRequestInProgress.bindTo(group.scopedContextKeyService);
        this._ctxReviewModeEnabled = ctxReviewModeEnabled.bindTo(group.scopedContextKeyService);
        this._ctxRequestCount = ctxRequestCount.bindTo(group.scopedContextKeyService);
        const editorObs = observableFromEvent(this, group.onDidModelChange, () => group.activeEditor);
        const tupleObs = derived(r => {
            const editor = editorObs.read(r);
            const uri = EditorResourceAccessor.getOriginalUri(editor, { supportSideBySide: SideBySideEditor.PRIMARY });
            if (!uri) {
                this._reset();
                return;
            }
            return new ObservableEditorSession(uri, chatEditingService, inlineChatSessionService).value.read(r);
        });
        this._store.add(autorun(r => {
            const tuple = tupleObs.read(r);
            if (!tuple) {
                this._reset();
                return;
            }
            const { session, entry } = tuple;
            const chatModel = chatService.getSession(session.chatSessionResource);
            this._ctxHasEditorModification.set(entry?.state.read(r) === 0 /* ModifiedFileEntryState.Modified */);
            this._ctxIsGlobalEditingSession.set(session.isGlobalEditingSession);
            this._ctxReviewModeEnabled.set(entry ? entry.reviewMode.read(r) : false);
            this._ctxHasRequestInProgress.set(chatModel?.requestInProgress.read(r) ?? false);
            this._ctxIsCurrentlyBeingModified.set(!!entry?.isCurrentlyBeingModifiedBy.read(r));
            // number of requests
            const requestCount = chatModel
                ? observableFromEvent(this, chatModel.onDidChange, () => chatModel.getRequests().length)
                : constObservable(0);
            this._ctxRequestCount.set(requestCount.read(r));
        }));
    }
    _reset() {
        this._ctxIsGlobalEditingSession.reset();
        this._ctxHasEditorModification.reset();
        this._ctxHasRequestInProgress.reset();
        this._ctxReviewModeEnabled.reset();
        this._ctxRequestCount.reset();
    }
    dispose() {
        this._store.dispose();
        this._reset();
    }
};
ContextKeyGroup = __decorate([
    __param(1, IInlineChatSessionService),
    __param(2, IChatEditingService),
    __param(3, IChatService)
], ContextKeyGroup);
let ObservableEditorSession = class ObservableEditorSession {
    constructor(uri, chatEditingService, inlineChatService) {
        const inlineSessionObs = observableFromEvent(this, inlineChatService.onDidChangeSessions, () => inlineChatService.getSessionByTextModel(uri));
        const sessionObs = chatEditingService.editingSessionsObs.map((value, r) => {
            for (const session of value) {
                const entry = session.readEntry(uri, r);
                if (entry) {
                    return { session, entry, isInlineChat: false };
                }
            }
            return undefined;
        });
        this.value = derived(r => {
            const inlineSession = inlineSessionObs.read(r);
            if (inlineSession) {
                return { session: inlineSession.editingSession, entry: inlineSession.editingSession.readEntry(uri, r), isInlineChat: true };
            }
            return sessionObs.read(r);
        });
    }
};
ObservableEditorSession = __decorate([
    __param(1, IChatEditingService),
    __param(2, IInlineChatSessionService)
], ObservableEditorSession);
export { ObservableEditorSession };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdEVkaXRpbmdFZGl0b3JDb250ZXh0S2V5cy5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci9jaGF0RWRpdGluZy9jaGF0RWRpdGluZ0VkaXRvckNvbnRleHRLZXlzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7OztBQUFBOzs7Z0dBR2dHO0FBQ2hHLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUM1RCxPQUFPLEVBQUUsYUFBYSxFQUFFLGVBQWUsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQ3pGLE9BQU8sRUFBRSxPQUFPLEVBQUUsZUFBZSxFQUFFLE9BQU8sRUFBZSxtQkFBbUIsRUFBRSxNQUFNLDBDQUEwQyxDQUFDO0FBRS9ILE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSx1QkFBdUIsQ0FBQztBQUNqRCxPQUFPLEVBQWUsYUFBYSxFQUFFLE1BQU0seURBQXlELENBQUM7QUFDckcsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sK0RBQStELENBQUM7QUFFdEcsT0FBTyxFQUFFLHNCQUFzQixFQUFFLGdCQUFnQixFQUFFLE1BQU0sOEJBQThCLENBQUM7QUFDeEYsT0FBTyxFQUFnQixvQkFBb0IsRUFBRSxNQUFNLDJEQUEyRCxDQUFDO0FBQy9HLE9BQU8sRUFBRSx5QkFBeUIsRUFBRSxNQUFNLHlEQUF5RCxDQUFDO0FBQ3BHLE9BQU8sRUFBRSxtQkFBbUIsRUFBbUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUNsSixPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFFdkUsTUFBTSxDQUFDLE1BQU0seUJBQXlCLEdBQUcsSUFBSSxhQUFhLENBQVUsa0NBQWtDLEVBQUUsU0FBUyxFQUFFLFFBQVEsQ0FBQyw2QkFBNkIsRUFBRSx1REFBdUQsQ0FBQyxDQUFDLENBQUM7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