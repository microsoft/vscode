/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Emitter } from '../../../../../../base/common/event.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { observableValue } from '../../../../../../base/common/observable.js';
import { ChatAgentLocation } from '../../../common/constants.js';
export class MockChatModel extends Disposable {
    constructor(sessionResource) {
        super();
        this.sessionResource = sessionResource;
        this.onDidDispose = this._register(new Emitter()).event;
        this.onDidChange = this._register(new Emitter()).event;
        this.sessionId = '';
        this.timestamp = 0;
        this.timing = { created: Date.now(), lastRequestStarted: undefined, lastRequestEnded: undefined };
        this.initialLocation = ChatAgentLocation.Chat;
        this.title = '';
        this.hasCustomTitle = false;
        this.lastMessageDate = Date.now();
        this.creationDate = Date.now();
        this.requests = [];
        this.requestInProgress = observableValue('requestInProgress', false);
        this.requestNeedsInput = observableValue('requestNeedsInput', undefined);
        this.inputPlaceholder = undefined;
        this.editingSession = undefined;
        this.checkpoint = undefined;
        this.willKeepAlive = true;
        this.responderUsername = 'agent';
        this.inputModel = {
            state: observableValue('inputModelState', undefined),
            setState: () => { },
            clearState: () => { },
            toJSON: () => undefined
        };
        this.contributedChatSession = undefined;
        this.repoData = undefined;
        this.isDisposed = false;
        this.hasRequests = false;
        this.onDidChangePendingRequests = this._register(new Emitter()).event;
        this.lastRequest = undefined;
        this.lastRequestObs = observableValue('lastRequest', undefined);
    }
    setContributedChatSession(session) {
        throw new Error('Method not implemented.');
    }
    dispose() {
        this.isDisposed = true;
        super.dispose();
    }
    startEditingSession(isGlobalEditingSession, transferFromSession) { }
    getRequests() { return []; }
    setCheckpoint(requestId) { }
    setRepoData(data) { this.repoData = data; }
    getPendingRequests() { return []; }
    toExport() {
        return {
            initialLocation: this.initialLocation,
            requests: [],
            responderUsername: '',
        };
    }
    toJSON() {
        return {
            version: 3,
            sessionId: this.sessionId,
            creationDate: this.timestamp,
            customTitle: this.customTitle,
            initialLocation: this.initialLocation,
            requests: [],
            responderUsername: '',
            repoData: this.repoData
        };
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibW9ja0NoYXRNb2RlbC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvdGVzdC9jb21tb24vbW9kZWwvbW9ja0NoYXRNb2RlbC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQUUsT0FBTyxFQUFTLE1BQU0sd0NBQXdDLENBQUM7QUFDeEUsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLDRDQUE0QyxDQUFDO0FBQ3hFLE9BQU8sRUFBZSxlQUFlLEVBQUUsTUFBTSw2Q0FBNkMsQ0FBQztBQUkzRixPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSw4QkFBOEIsQ0FBQztBQUdqRSxNQUFNLE9BQU8sYUFBYyxTQUFRLFVBQVU7SUErQjVDLFlBQXFCLGVBQW9CO1FBQ3hDLEtBQUssRUFBRSxDQUFDO1FBRFksb0JBQWUsR0FBZixlQUFlLENBQUs7UUE5QmhDLGlCQUFZLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLE9BQU8sRUFBUSxDQUFDLENBQUMsS0FBSyxDQUFDO1FBQ3pELGdCQUFXLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLE9BQU8sRUFBb0IsQ0FBQyxDQUFDLEtBQUssQ0FBQztRQUM3RSxjQUFTLEdBQUcsRUFBRSxDQUFDO1FBQ04sY0FBUyxHQUFHLENBQUMsQ0FBQztRQUNkLFdBQU0sR0FBdUIsRUFBRSxPQUFPLEVBQUUsSUFBSSxDQUFDLEdBQUcsRUFBRSxFQUFFLGtCQUFrQixFQUFFLFNBQVMsRUFBRSxnQkFBZ0IsRUFBRSxTQUFTLEVBQUUsQ0FBQztRQUNqSCxvQkFBZSxHQUFHLGlCQUFpQixDQUFDLElBQUksQ0FBQztRQUN6QyxVQUFLLEdBQUcsRUFBRSxDQUFDO1FBQ1gsbUJBQWMsR0FBRyxLQUFLLENBQUM7UUFFaEMsb0JBQWUsR0FBRyxJQUFJLENBQUMsR0FB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