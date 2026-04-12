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
var ChatSessionStore_1;
import { Sequencer } from '../../../../../base/common/async.js';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { toErrorMessage } from '../../../../../base/common/errorMessage.js';
import { MarkdownString } from '../../../../../base/common/htmlContent.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { revive } from '../../../../../base/common/marshalling.js';
import { isEqual, joinPath } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { IEnvironmentService } from '../../../../../platform/environment/common/environment.js';
import { IFileService, toFileOperationResult } from '../../../../../platform/files/common/files.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
import { IStorageService } from '../../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { IUserDataProfilesService } from '../../../../../platform/userDataProfile/common/userDataProfile.js';
import { isEmptyWorkspaceIdentifier, IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { ILifecycleService } from '../../../../services/lifecycle/common/lifecycle.js';
import { IWorkspaceEditingService } from '../../../../services/workspaces/common/workspaceEditing.js';
import { awaitStatsForSession } from '../chat.js';
import { ChatModel, normalizeSerializableChatData } from './chatModel.js';
import { ChatSessionOperationLog } from './chatSessionOperationLog.js';
import { LocalChatSessionUri } from './chatUri.js';
const maxPersistedSessions = 50;
const ChatIndexStorageKey = 'chat.ChatSessionStore.index';
const ChatTransferIndexStorageKey = 'ChatSessionStore.transferIndex';
let ChatSessionStore = class ChatSessionStore extends Disposable {
    static { ChatSessionStore_1 = this; }
    constructor(fileService, environmentService, logService, workspaceContextService, telemetryService, storageService, lifecycleService, userDataProfilesService, configurationService, workspaceEditingService, dialogService, openerService) {
        super();
        this.fileService = fileService;
        this.environmentService = environmentService;
        this.logService = logService;
        this.workspaceContextService = workspaceContextService;
        this.telemetryService = telemetryService;
        this.storageService = storageService;
        this.lifecycleService = lifecycleService;
        this.userDataProfilesService = userDataProfilesService;
        this.configurationService = configurationService;
        this.workspaceEditingService = workspaceEditingService;
        this.dialogService = dialogService;
        this.openerService = openerService;
        this.storeQueue = new Sequencer();
        this.shuttingDown = false;
        this._didReportIssue = false;
        const workspace = this.workspaceContextService.getWorkspace();
        const isEmptyWindow = !workspace.configuration && workspace.folders.length === 0;
        const workspaceId = this.workspaceContextService.getWorkspace().id;
        this.storageRoot = isEmptyWindow ?
            joinPath(this.userDataProfilesService.defaultProfile.globalStorageHome, 'emptyWindowChatSessions') :
            joinPath(this.environmentService.workspaceStorageHome, workspaceId, 'chatSessions');
        this.previousEmptyWindowStorageRoot = isEmptyWindow ?
            joinPath(this.environmentService.workspaceStorageHome, 'no-workspace', 'chatSessions') :
            undefined;
        this.transferredSessionStorageRoot = joinPath(this.userDataProfilesService.defaultProfile.globalStorageHome, 'transferredChatSessions');
        // Listen to workspace transitions to migrate chat sessions
        this._register(this.workspaceEditingService.onDidEnterWorkspace(event => {
            const transitionPromise = this.storeQueue.queue(() => this.handleWorkspaceTransition(event.oldWorkspace, event.newWorkspace));
            event.join(transitionPromise);
        }));
        this._register(this.lifecycleService.onWillShutdown(e => {
            this.shuttingDown = true;
            if (!this.storeTask) {
                return;
            }
            e.join(this.storeTask, {
                id: 'join.chatSessionStore',
                label: localize('join.chatSessionStore', "Saving chat history")
            });
        }));
    }
    async handleWorkspaceTransition(oldWorkspace, newWorkspace) {
        const wasEmptyWindow = isEmptyWorkspaceIdentifier(oldWorkspace);
        const isNewWorkspaceEmpty = isEmptyWorkspaceIdentifier(newWorkspace);
        const oldWorkspaceId = oldWorkspace.id;
        const newWorkspaceId = newWorkspace.id;
        this.logService.info(`ChatSessionStore: Workspace transition from ${oldWorkspaceId} to ${newWorkspaceId}`);
        // Determine the old storage location based on the old workspace
        const oldStorageRoot = wasEmptyWindow ?
            joinPath(this.userDataProfilesService.defaultProfile.globalStorageHome, 'emptyWindowChatSessions') :
            joinPath(this.environmentService.workspaceStorageHome, oldWorkspaceId, 'chatSessions');
        // Determine the new storage location based on the new workspace
        const newStorageRoot = isNewWorkspaceEmpty ?
            joinPath(this.userDataProfilesService.defaultProfile.globalStorageHome, 'emptyWindowChatSessions') :
            joinPath(this.environmentService.workspaceStorageHome, newWorkspaceId, 'chatSessions');
        // If the storage roots are identical, there is nothing to migrate
        if (isEqual(oldStorageRoot, newStorageRoot)) {
            this.storageRoot = newStorageRoot;
            return;
        }
        // Update storage root for the new workspace
        this.storageRoot = newStorageRoot;
        // Migrate session files from old to new location
        await this.migrateSessionsToNewWorkspace(oldStorageRoot, wasEmptyWindow, isNewWorkspaceEmpty);
    }
    async migrateSessionsToNewWorkspace(oldStorageRoot, wasEmptyWindow, isNewWorkspaceEmpty) {
        try {
            // Check if old storage location exists
            const oldStorageExists = await this.fileService.exists(oldStorageRoot);
            if (!oldStorageExists) {
                this.logService.info(`ChatSessionStore: Old storage location does not exist, skipping migration`);
                return;
            }
            // Read all session files from old location
            const oldDirectory = await this.fileService.resolve(oldStorageRoot);
            if (!oldDirectory.children) {
                this.logService.info(`ChatSessionStore: No children in old storage location, skipping migration`);
                return;
            }
            this.logService.info(`ChatSessionStore: Found ${oldDirectory.children.length} files in old storage location`);
            // Copy each file to the new location
            let migratedCount = 0;
            for (const child of oldDirectory.children) {
                if (!child.isDirectory && (child.name.endsWith('.json') || child.name.endsWith('.jsonl'))) {
                    const oldFilePath = child.resource;
                    const newFilePath = joinPath(this.storageRoot, child.name);
                    try {
                        await this.fileService.copy(oldFilePath, newFilePath, false);
                        migratedCount++;
                    }
                    catch (e) {
                        if (toFileOperationResult(e) === 4 /* FileOperationResult.FILE_MOVE_CONFLICT */) {
                            // File already exists at target - skip as a no-op
                            this.logService.trace(`ChatSessionStore: Session file ${child.name} already exists at target, skipping`);
                        }
                        else {
                            this.reportError('sessionMigration', `Error migrating chat session file ${child.name}`, e);
                        }
                    }
                }
            }
            this.logService.info(`ChatSessionStore: Copied ${migratedCount} chat session files from ${wasEmptyWindow ? 'empty window' : oldStorageRoot.toString()} to ${isNewWorkspaceEmpty ? 'empty window' : this.storageRoot.toString()} (originals preserved at old location)`);
            // Clear the index cache and flush it to the new storage scope
            this.indexCache = undefined;
            try {
                await this.flushIndex();
            }
            catch (e) {
                this.reportError('migrateWorkspace', 'Error flushing chat session index after workspace migration', e);
            }
        }
        catch (e) {
            this.reportError('migrateWorkspace', 'Error migrating chat sessions to new workspace', e);
        }
    }
    async storeSessions(sessions) {
        if (this.shuttingDown) {
            // Don't start this task if we missed the chance to block shutdown
            return;
        }
        try {
            this.storeTask = this.storeQueue.queue(async () => {
                try {
                    await Promise.all(sessions.map(session => this.writeSession(session)));
                    await this.trimEntries();
                    await this.flushIndex();
                }
                catch (e) {
                    this.reportError('storeSessions', 'Error storing chat sessions', e);
                }
            });
            await this.storeTask;
        }
        finally {
            this.storeTask = undefined;
        }
    }
    async storeSessionsMetadataOnly(sessions) {
        if (this.shuttingDown) {
            // Don't start this task if we missed the chance to block shutdown
            return;
        }
        try {
            this.storeTask = this.storeQueue.queue(async () => {
                try {
                    await Promise.all(sessions.map(session => this.writeSessionMetadataOnly(session)));
                    await this.flushIndex();
                }
                catch (e) {
                    this.reportError('storeSessions', 'Error storing chat sessions', e);
                }
            });
            await this.storeTask;
        }
        finally {
            this.storeTask = undefined;
        }
    }
    async storeTransferSession(transferData, session) {
        const index = this.getTransferredSessionIndex();
        const workspaceKey = transferData.toWorkspace.toString();
        // Clean up any preexisting transferred session for this workspace
        const existingTransfer = index[workspaceKey];
        if (existingTransfer) {
            try {
                const existingSessionResource = URI.revive(existingTransfer.sessionResource);
                if (existingSessionResource && LocalChatSessionUri.parseLocalSessionId(existingSessionResource)) {
                    const existingStorageLocation = this.getTransferredSessionStorageLocation(existingSessionResource);
                    await this.fileService.del(existingStorageLocation);
                }
            }
            catch (e) {
                if (toFileOperationResult(e) !== 1 /* FileOperationResult.FILE_NOT_FOUND */) {
                    this.reportError('storeTransferSession', 'Error deleting old transferred session file', e);
                }
            }
        }
        try {
            const content = JSON.stringify(session, undefined, 2);
            const storageLocation = this.getTransferredSessionStorageLocation(session.sessionResource);
            await this.fileService.writeFile(storageLocation, VSBuffer.fromString(content));
        }
        catch (e) {
            this.reportError('sessionWrite', 'Error writing chat session', e);
            return;
        }
        index[workspaceKey] = transferData;
        try {
            this.storageService.store(ChatTransferIndexStorageKey, index, 0 /* StorageScope.PROFILE */, 1 /* StorageTarget.MACHINE */);
        }
        catch (e) {
            this.reportError('storeTransferSession', 'Error storing chat transfer session', e);
        }
    }
    getTransferredSessionIndex() {
        try {
            const data = this.storageService.getObject(ChatTransferIndexStorageKey, 0 /* StorageScope.PROFILE */, {});
            return data;
        }
        catch (e) {
            this.reportError('getTransferredSessionIndex', 'Error reading chat transfer index', e);
            return {};
        }
    }
    static { this.TRANSFER_EXPIRATION_MS = 60 * 1000 * 5; }
    getTransferredSessionData() {
        try {
            const index = this.getTransferredSessionIndex();
            const workspaceFolders = this.workspaceContextService.getWorkspace().folders;
            if (workspaceFolders.length !== 1) {
                // Can only transfer sessions to single-folder workspaces
                return undefined;
            }
            const workspaceKey = workspaceFolders[0].uri.toString();
            const transferredSessionForWorkspace = index[workspaceKey];
            if (!transferredSessionForWorkspace) {
                return undefined;
            }
            // Check if the transfer has expired
            const revivedTransferData = revive(transferredSessionForWorkspace);
            if (Date.now() - transferredSessionForWorkspace.timestampInMilliseconds > ChatSessionStore_1.TRANSFER_EXPIRATION_MS) {
                this.logService.info('ChatSessionStore: Transferred session has expired');
                this.cleanupTransferredSession(revivedTransferData.sessionResource);
                return undefined;
            }
            return !!LocalChatSessionUri.parseLocalSessionId(revivedTransferData.sessionResource) && revivedTransferData.sessionResource;
        }
        catch (e) {
            this.reportError('getTransferredSession', 'Error getting transferred chat session URI', e);
            return undefined;
        }
    }
    async readTransferredSession(sessionResource) {
        try {
            const storageLocation = this.getTransferredSessionStorageLocation(sessionResource);
            const sessionId = LocalChatSessionUri.parseLocalSessionId(sessionResource);
            if (!sessionId) {
                return undefined;
            }
            const sessionData = await this.readSessionFromLocation(storageLocation, undefined, sessionId);
            // Clean up the transferred session after reading
            await this.cleanupTransferredSession(sessionResource);
            return sessionData;
        }
        catch (e) {
            this.reportError('getTransferredSession', 'Error getting transferred chat session', e);
            return undefined;
        }
    }
    async cleanupTransferredSession(sessionResource) {
        try {
            // Remove from index
            const index = this.getTransferredSessionIndex();
            const workspaceFolders = this.workspaceContextService.getWorkspace().folders;
            if (workspaceFolders.length === 1) {
                const workspaceKey = workspaceFolders[0].uri.toString();
                delete index[workspaceKey];
                this.storageService.store(ChatTransferIndexStorageKey, index, 0 /* StorageScope.PROFILE */, 1 /* StorageTarget.MACHINE */);
            }
            // Delete the transferred session file
            const storageLocation = this.getTransferredSessionStorageLocation(sessionResource);
            await this.fileService.del(storageLocation);
        }
        catch (e) {
            if (toFileOperationResult(e) !== 1 /* FileOperationResult.FILE_NOT_FOUND */) {
                this.reportError('cleanupTransferredSession', 'Error cleaning up transferred session', e);
            }
        }
    }
    async writeSession(session) {
        try {
            const index = this.internalGetIndex();
            const storageLocation = this.getStorageLocation(session.sessionId);
            if (storageLocation.log) {
                if (session instanceof ChatModel) {
                    if (!session.dataSerializer) {
                        session.dataSerializer = new ChatSessionOperationLog();
                    }
                    let op;
                    let data;
                    try {
                        ({ op, data } = session.dataSerializer.write(session));
                    }
                    catch (e) {
                        // This is a big of an ugly prompt, but there is _something_ going on with
                        // missing sessions. Unfortunately it's hard to root cause because users would
                        // not notice an error until they reload the window, at which point any error
                        // is gone. Throw a very verbose dialog here so we can get some quality
                        // bug reports, if the issue is indeed in the serialized.
                        // todo@connor4312: remove after a little bit
                        if (!this._didReportIssue) {
                            this._didReportIssue = true;
                            this.dialogService.prompt({
                                custom: true, // so text is copyable
                                title: localize('chatSessionStore.serializationError', 'Error saving chat session'),
                                message: localize('chatSessionStore.writeError', 'Error serializing chat session for storage. The session will be lost if the window is closed. Please report this issue to the VS Code team:\n\n{0}', e.stack || toErrorMessage(e)),
                                buttons: [
                                    { label: localize('reportIssue', 'Report Issue'), run: () => this.openerService.open('https://github.com/microsoft/vscode/issues/new?template=bug_report.md') }
                                ]
                            });
                        }
                        throw e;
                    }
                    if (data.byteLength > 0) {
                        await this.fileService.writeFile(storageLocation.log, data, { append: op === 'append' });
                    }
                }
                else {
                    const content = new ChatSessionOperationLog().createInitialFromSerialized(session);
                    await this.fileService.writeFile(storageLocation.log, content);
                }
            }
            else {
                await this.fileService.writeFile(storageLocation.flat, VSBuffer.fromString(JSON.stringify(session)));
            }
            // Write succeeded, update index
            const newMetadata = await getSessionMetadata(session);
            index.entries[session.sessionId] = newMetadata;
        }
        catch (e) {
            this.reportError('sessionWrite', 'Error writing chat session', e);
        }
    }
    async writeSessionMetadataOnly(session) {
        // Only to be used for external sessions
        if (LocalChatSessionUri.parseLocalSessionId(session.sessionResource)) {
            return;
        }
        try {
            const index = this.internalGetIndex();
            // TODO get this class on sessionResource
            const externalSessionId = session.sessionResource.toString();
            index.entries[externalSessionId] = await getSessionMetadata(session);
        }
        catch (e) {
            this.reportError('sessionMetadataWrite', 'Error writing chat session metadata', e);
        }
    }
    async flushIndex() {
        const index = this.internalGetIndex();
        try {
            this.storageService.store(ChatIndexStorageKey, index, this.getIndexStorageScope(), 1 /* StorageTarget.MACHINE */);
        }
        catch (e) {
            // Only if JSON.stringify fails, AFAIK
            this.reportError('indexWrite', 'Error writing index', e);
        }
    }
    getIndexStorageScope() {
        const workspace = this.workspaceContextService.getWorkspace();
        const isEmptyWindow = !workspace.configuration && workspace.folders.length === 0;
        return isEmptyWindow ? -1 /* StorageScope.APPLICATION */ : 1 /* StorageScope.WORKSPACE */;
    }
    async trimEntries() {
        const index = this.internalGetIndex();
        const entries = Object.entries(index.entries)
            .filter(([_id, entry]) => !entry.isExternal)
            .sort((a, b) => b[1].lastMessageDate - a[1].lastMessageDate)
            .map(([id]) => id);
        if (entries.length > maxPersistedSessions) {
            const entriesToDelete = entries.slice(maxPersistedSessions);
            for (const entry of entriesToDelete) {
                delete index.entries[entry];
            }
            this.logService.trace(`ChatSessionStore: Trimmed ${entriesToDelete.length} old chat sessions from index`);
        }
    }
    async internalDeleteSession(sessionId) {
        const index = this.internalGetIndex();
        if (!index.entries[sessionId]) {
            return;
        }
        const storageLocation = this.getStorageLocation(sessionId);
        for (const uri of [storageLocation.flat, storageLocation.log]) {
            try {
                if (uri) {
                    await this.fileService.del(uri);
                }
            }
            catch (e) {
                if (toFileOperationResult(e) !== 1 /* FileOperationResult.FILE_NOT_FOUND */) {
                    this.reportError('sessionDelete', 'Error deleting chat session', e);
                }
            }
            delete index.entries[sessionId];
        }
    }
    hasSessions() {
        return Object.keys(this.internalGetIndex().entries).length > 0;
    }
    isSessionEmpty(sessionId) {
        const index = this.internalGetIndex();
        return index.entries[sessionId]?.isEmpty ?? true;
    }
    async deleteSession(sessionId) {
        await this.storeQueue.queue(async () => {
            await this.internalDeleteSession(sessionId);
            await this.flushIndex();
        });
    }
    async clearAllSessions() {
        await this.storeQueue.queue(async () => {
            const index = this.internalGetIndex();
            const entries = Object.keys(index.entries);
            this.logService.info(`ChatSessionStore: Clearing ${entries.length} chat sessions`);
            await Promise.all(entries.map(entry => this.internalDeleteSession(entry)));
            await this.flushIndex();
        });
    }
    async setSessionTitle(sessionId, title) {
        await this.storeQueue.queue(async () => {
            const index = this.internalGetIndex();
            if (index.entries[sessionId]) {
                index.entries[sessionId].title = title;
            }
        });
    }
    reportError(reasonForTelemetry, message, error) {
        const fileOperationReason = error && toFileOperationResult(error);
        if (fileOperationReason === 1 /* FileOperationResult.FILE_NOT_FOUND */) {
            // Expected case (e.g. reading a non-existent session); keep noise low
            this.logService.trace(`ChatSessionStore: ` + message, toErrorMessage(error));
        }
        else {
            // Unexpected or serious error; surface at error level
            this.logService.error(`ChatSessionStore: ` + message, toErrorMessage(error));
        }
        this.telemetryService.publicLog2('chatSessionStoreError', {
            reason: reasonForTelemetry,
            fileOperationReason: fileOperationReason ?? -1
        });
    }
    internalGetIndex() {
        if (this.indexCache) {
            return this.indexCache;
        }
        const data = this.storageService.get(ChatIndexStorageKey, this.getIndexStorageScope(), undefined);
        if (!data) {
            this.indexCache = { version: 1, entries: {} };
            return this.indexCache;
        }
        try {
            const index = JSON.parse(data);
            if (isChatSessionIndex(index)) {
                // Success
                this.indexCache = index;
            }
            else {
                this.reportError('invalidIndexFormat', `Invalid index format: ${data}`);
                this.indexCache = { version: 1, entries: {} };
            }
        }
        catch (e) {
            // Only if JSON.parse fails
            this.reportError('invalidIndexJSON', `Index corrupt: ${data}`, e);
            this.indexCache = { version: 1, entries: {} };
        }
        // Convert from pre-1.109 format which lacks timing
        for (const entry of Object.values(this.indexCache.entries)) {
            entry.timing ??= {
                created: entry.lastMessageDate,
                lastRequestStarted: undefined,
                lastRequestEnded: entry.lastMessageDate,
            };
            // TODO@connor4312: the check for Pending/NeedsInput guards old sessions from Insiders pre PR #288161 and it can be safely removed after a transition period, to only backfill the "complete" state when missing.
            entry.lastResponseState ??= entry.lastResponseState === 0 /* ResponseModelState.Pending */ || entry.lastResponseState === 4 /* ResponseModelState.NeedsInput */ ? 1 /* ResponseModelState.Complete */ : entry.lastResponseState || 1 /* ResponseModelState.Complete */;
        }
        return this.indexCache;
    }
    async getIndex() {
        return this.storeQueue.queue(async () => {
            return this.internalGetIndex().entries;
        });
    }
    getMetadataForSessionSync(sessionResource) {
        const index = this.internalGetIndex();
        return index.entries[this.getIndexKey(sessionResource)];
    }
    getIndexKey(sessionResource) {
        const sessionId = LocalChatSessionUri.parseLocalSessionId(sessionResource);
        return sessionId ?? sessionResource.toString();
    }
    logIndex() {
        const data = this.storageService.get(ChatIndexStorageKey, this.getIndexStorageScope(), undefined);
        this.logService.info('ChatSessionStore index: ', data);
    }
    async migrateDataIfNeeded(getInitialData) {
        await this.storeQueue.queue(async () => {
            const data = this.storageService.get(ChatIndexStorageKey, this.getIndexStorageScope(), undefined);
            const needsMigrationFromStorageService = !data;
            if (needsMigrationFromStorageService) {
                const initialData = getInitialData();
                if (initialData) {
                    await this.migrate(initialData);
                }
            }
        });
    }
    async migrate(initialData) {
        const numSessions = Object.keys(initialData).length;
        this.logService.info(`ChatSessionStore: Migrating ${numSessions} chat sessions from storage service to file system`);
        await Promise.all(Object.values(initialData).map(async (session) => {
            await this.writeSession(session);
        }));
        await this.flushIndex();
    }
    async readSession(sessionId) {
        return await this.storeQueue.queue(async () => {
            const storageLocation = this.getStorageLocation(sessionId);
            return this.readSessionFromLocation(storageLocation.flat, storageLocation.log, sessionId);
        });
    }
    async readSessionFromLocation(flatStorageLocation, logStorageLocation, sessionId) {
        let fromLocation = flatStorageLocation;
        let rawData;
        if (logStorageLocation) {
            try {
                rawData = (await this.fileService.readFile(logStorageLocation)).value;
                fromLocation = logStorageLocation;
            }
            catch (e) {
                this.reportError('sessionReadFile', `Error reading log chat session file ${sessionId}`, e);
            }
        }
        if (!rawData) {
            try {
                rawData = (await this.fileService.readFile(flatStorageLocation)).value;
                fromLocation = flatStorageLocation;
            }
            catch (e) {
                this.reportError('sessionReadFile', `Error reading flat chat session file ${sessionId}`, e);
                if (toFileOperationResult(e) === 1 /* FileOperationResult.FILE_NOT_FOUND */ && this.previousEmptyWindowStorageRoot) {
                    rawData = await this.readSessionFromPreviousLocation(sessionId);
                }
            }
        }
        if (!rawData) {
            return undefined;
        }
        try {
            let session;
            const log = new ChatSessionOperationLog();
            if (fromLocation === logStorageLocation) {
                session = revive(log.read(rawData));
            }
            else {
                session = revive(JSON.parse(rawData.toString()));
            }
            // TODO Copied from ChatService.ts, cleanup
            // Revive serialized markdown strings in response data
            for (const request of session.requests) {
                if (Array.isArray(request.response)) {
                    request.response = request.response.map((response) => {
                        if (typeof response === 'string') {
                            return new MarkdownString(response);
                        }
                        return response;
                    });
                }
                else if (typeof request.response === 'string') {
                    request.response = [new MarkdownString(request.response)];
                }
            }
            return { value: normalizeSerializableChatData(session), serializer: log };
        }
        catch (err) {
            this.reportError('malformedSession', `Malformed session data in ${fromLocation.fsPath}: [${rawData.slice(0, 20).toString()}${rawData.byteLength > 20 ? '...' : ''}]`, err);
            return undefined;
        }
    }
    async readSessionFromPreviousLocation(sessionId) {
        let rawData;
        if (this.previousEmptyWindowStorageRoot) {
            const storageLocation2 = joinPath(this.previousEmptyWindowStorageRoot, `${sessionId}.json`);
            try {
                rawData = (await this.fileService.readFile(storageLocation2)).value;
                this.logService.info(`ChatSessionStore: Read chat session ${sessionId} from previous location`);
            }
            catch (e) {
                this.reportError('sessionReadFile', `Error reading chat session file ${sessionId} from previous location`, e);
                return undefined;
            }
        }
        return rawData;
    }
    getStorageLocation(chatSessionId) {
        return {
            flat: joinPath(this.storageRoot, `${chatSessionId}.json`),
            // todo@connor4312: remove after stabilizing
            log: this.configurationService.getValue('chat.useLogSessionStorage') !== false ? joinPath(this.storageRoot, `${chatSessionId}.jsonl`) : undefined,
        };
    }
    getTransferredSessionStorageLocation(sessionResource) {
        const sessionId = LocalChatSessionUri.parseLocalSessionId(sessionResource);
        return joinPath(this.transferredSessionStorageRoot, `${sessionId}.json`);
    }
    getChatStorageFolder() {
        return this.storageRoot;
    }
};
ChatSessionStore = ChatSessionStore_1 = __decorate([
    __param(0, IFileService),
    __param(1, IEnvironmentService),
    __param(2, ILogService),
    __param(3, IWorkspaceContextService),
    __param(4, ITelemetryService),
    __param(5, IStorageService),
    __param(6, ILifecycleService),
    __param(7, IUserDataProfilesService),
    __param(8, IConfigurationService),
    __param(9, IWorkspaceEditingService),
    __param(10, IDialogService),
    __param(11, IOpenerService)
], ChatSessionStore);
export { ChatSessionStore };
function isChatSessionEntryMetadata(obj) {
    return (!!obj &&
        typeof obj === 'object' &&
        typeof obj.sessionId === 'string' &&
        typeof obj.title === 'string' &&
        typeof obj.lastMessageDate === 'number');
}
// TODO if we update the index version:
// Don't throw away index when moving backwards in VS Code version. Try to recover it. But this scenario is hard.
function isChatSessionIndex(data) {
    if (typeof data !== 'object' || data === null) {
        return false;
    }
    const index = data;
    if (index.version !== 1) {
        return false;
    }
    if (typeof index.entries !== 'object' || index.entries === null) {
        return false;
    }
    for (const key in index.entries) {
        if (!isChatSessionEntryMetadata(index.entries[key])) {
            return false;
        }
    }
    return true;
}
async function getSessionMetadata(session) {
    const title = session.customTitle || (session instanceof ChatModel ? session.title : undefined);
    let stats;
    if (session instanceof ChatModel) {
        stats = await awaitStatsForSession(session);
    }
    const lastMessageDate = session instanceof ChatModel ?
        session.lastMessageDate :
        session.requests.at(-1)?.timestamp ?? session.creationDate;
    const timing = session instanceof ChatModel ?
        session.timing :
        // session is only ISerializableChatData in the old pre-fs storage data migration scenario
        {
            created: session.creationDate,
            lastRequestStarted: session.requests.at(-1)?.timestamp,
            lastRequestEnded: lastMessageDate,
        };
    let lastResponseState = session instanceof ChatModel ?
        (session.lastRequest?.response?.state ?? 1 /* ResponseModelState.Complete */) :
        1 /* ResponseModelState.Complete */;
    if (lastResponseState === 0 /* ResponseModelState.Pending */ || lastResponseState === 4 /* ResponseModelState.NeedsInput */) {
        lastResponseState = 2 /* ResponseModelState.Cancelled */;
    }
    return {
        sessionId: session.sessionId,
        title: title || localize('newChat', "New Chat"),
        lastMessageDate,
        timing,
        initialLocation: session.initialLocation,
        hasPendingEdits: session instanceof ChatModel ? (session.editingSession?.entries.get().some(e => e.state.get() === 0 /* ModifiedFileEntryState.Modified */)) : false,
        isEmpty: session instanceof ChatModel ? session.getRequests().length === 0 : session.requests.length === 0,
        stats,
        isExternal: session instanceof ChatModel && !LocalChatSessionUri.parseLocalSessionId(session.sessionResource),
        lastResponseState,
        permissionLevel: session instanceof ChatModel ? session.inputModel.state.get()?.permissionLevel : undefined,
    };
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdFNlc3Npb25TdG9yZS5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvY29tbW9uL21vZGVsL2NoYXRTZXNzaW9uU3RvcmUudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxTQUFTLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUNoRSxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDaEUsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLDRDQUE0QyxDQUFDO0FBQzVFLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSwyQ0FBMkMsQ0FBQztBQUMzRSxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDckUsT0FBTyxFQUFFLE1BQU0sRUFBRSxNQUFNLDJDQUEyQyxDQUFDO0FBQ25FLE9BQU8sRUFBRSxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDNUUsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQ3hELE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSx1QkFBdUIsQ0FBQztBQUNqRCxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSwrREFBK0QsQ0FBQztBQUN0RyxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sbURBQW1ELENBQUM7QUFDbkYsT0FBTyxFQUFFLG1CQUFtQixFQUFFLE1BQU0sMkRBQTJELENBQUM7QUFDaEcsT0FBTyxFQUF1QixZQUFZLEVBQUUscUJBQXFCLEVBQUUsTUFBTSwrQ0FBK0MsQ0FBQztBQUN6SCxPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0sMkNBQTJDLENBQUM7QUFDeEUsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLGlEQUFpRCxDQUFDO0FBQ2pGLE9BQU8s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