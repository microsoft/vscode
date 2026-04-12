/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { ResourceMap } from '../../../../../../base/common/map.js';
import { observableValue } from '../../../../../../base/common/observable.js';
import { URI } from '../../../../../../base/common/uri.js';
export class MockChatService {
    constructor() {
        this._chatModels = observableValue('chatModels', []);
        this.chatModels = this._chatModels;
        this.requestInProgressObs = observableValue('name', false);
        this.editingSessions = [];
        this.transferredSessionResource = undefined;
        this.onDidSubmitRequest = Event.None;
        this._onDidCreateModel = new Emitter();
        this.onDidCreateModel = this._onDidCreateModel.event;
        this.sessions = new ResourceMap();
        this.liveSessionItems = [];
        this.historySessionItems = [];
        this._onDidDisposeSession = new Emitter();
        this.onDidDisposeSession = this._onDidDisposeSession.event;
        this.onDidPerformUserAction = Event.None;
        this.onDidReceiveQuestionCarouselAnswer = Event.None;
    }
    fireDidDisposeSession(sessionResources) {
        this._onDidDisposeSession.fire({ sessionResources, reason: 'cleared' });
    }
    setSaveModelsEnabled(enabled) {
    }
    processPendingRequests(sessionResource) {
    }
    setLiveSessionItems(items) {
        this.liveSessionItems = items;
    }
    setHistorySessionItems(items) {
        this.historySessionItems = items;
    }
    addSession(session) {
        this.sessions.set(session.sessionResource, session);
        // Update the chatModels observable
        this._chatModels.set([...this.sessions.values()], undefined);
        this._onDidCreateModel.fire(session);
    }
    removeSession(sessionResource) {
        this.sessions.delete(sessionResource);
        // Update the chatModels observable
        this._chatModels.set([...this.sessions.values()], undefined);
    }
    isEnabled(_location) {
        return true;
    }
    hasSessions() {
        return this.sessions.size > 0;
    }
    getProviderInfos() {
        return [];
    }
    startNewLocalSession(_location, _options) {
        throw new Error('Method not implemented.');
    }
    getSession(sessionResource) {
        return this.sessions.get(sessionResource);
    }
    getLatestRequest() {
        return undefined;
    }
    acquireOrRestoreSession(_sessionResource) {
        throw new Error('Method not implemented.');
    }
    getSessionTitle(_sessionResource) {
        return undefined;
    }
    loadSessionFromData(data, _debugOwner) {
        throw new Error('Method not implemented.');
    }
    getChatModelReferenceDebugInfo() {
        return { totalModels: 0, totalReferences: 0, models: [] };
    }
    acquireOrLoadSession(_resource, _position, _token, _debugOwner) {
        throw new Error('Method not implemented.');
    }
    acquireExistingSession(_sessionResource, _debugOwner) {
        return undefined;
    }
    setSessionTitle(_sessionResource, _title) { }
    appendProgress(_request, _progress) { }
    sendRequest(_sessionResource, _message) {
        throw new Error('Method not implemented.');
    }
    resendRequest(_request, _options) {
        throw new Error('Method not implemented.');
    }
    adoptRequest(_sessionResource, _request) {
        throw new Error('Method not implemented.');
    }
    removeRequest(_sessionResource, _requestId) {
        throw new Error('Method not implemented.');
    }
    async cancelCurrentRequestForSession(_sessionResource, _source) { }
    migrateRequests(_originalResource, _targetResource) { }
    setYieldRequested(_sessionResource) { }
    removePendingRequest(_sessionResource, _requestId) { }
    setPendingRequests(_sessionResource, _requests) { }
    addCompleteRequest() { }
    async getLocalSessionHistory() {
        return this.historySessionItems;
    }
    async clearAllHistoryEntries() { }
    async removeHistoryEntry(_resource) { }
    notifyUserAction(_event) { }
    notifyQuestionCarouselAnswer(_requestId, _resolveId, _answers) { }
    async transferChatSession() { }
    setChatSessionTitle() { }
    isEditingLocation(_location) {
        return false;
    }
    getChatStorageFolder() {
        return URI.file('/tmp');
    }
    logChatIndex() { }
    activateDefaultAgent(_location) {
        return Promise.resolve();
    }
    async getLiveSessionItems() {
        return this.liveSessionItems;
    }
    async getHistorySessionItems() {
        return this.historySessionItems;
    }
    waitForModelDisposals() {
        return Promise.resolve();
    }
    getMetadataForSession(sessionResource) {
        throw new Error('Method not implemented.');
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibW9ja0NoYXRTZXJ2aWNlLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvY2hhdC90ZXN0L2NvbW1vbi9jaGF0U2VydmljZS9tb2NrQ2hhdFNlcnZpY2UudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFHaEcsT0FBTyxFQUFFLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUN4RSxPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDbkUsT0FBTyxFQUF1QixlQUFlLEVBQUUsTUFBTSw2Q0FBNkMsQ0FBQztBQUNuRyxPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFNM0QsTUFBTSxPQUFPLGVBQWU7SUFBNUI7UUFDa0IsZ0JBQVcsR0FBOEMsZUFBZSxDQUFDLFlBQVksRUFBRSxFQUFFLENBQUMsQ0FBQztRQUNuRyxlQUFVLEdBQUcsSUFBSSxDQUFDLFdBQVcsQ0FBQztRQUN2Qyx5QkFBb0IsR0FBRyxlQUFlLENBQUMsTUFBTSxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBRXRELG9CQUFlLEdBQUcsRUFBRSxDQUFDO1FBQ3JCLCtCQUEwQixHQUFHLFNBQVMsQ0FBQztRQUM5Qix1QkFBa0IsR0FBRyxLQUFLLENBQUMsSUFBSSxDQUFDO1FBRXhCLHNCQUFpQixHQUFHLElBQUksT0FBTyxFQUFjLENBQUM7UUFDdEQscUJBQWdCLEdBQUcsSUFBSSxDQUFDLGlCQUFpQixDQUFDLEtBQUssQ0FBQztRQUV4QyxhQUFRLEdBQUcsSUFBSSxXQUFXLEVBQWMsQ0FBQztRQUNsRCxxQkFBZ0IsR0FBa0IsRUFBRSxDQUFDO1FBQ3JDLHdCQUFtQixHQUFrQixFQUFFLENBQUM7UUFFL0IseUJBQW9CLEdBQUcsSUFBSSxPQUFPLEVBQWtELENBQUM7UUFDN0Ysd0JBQW1CLEdBQUcs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