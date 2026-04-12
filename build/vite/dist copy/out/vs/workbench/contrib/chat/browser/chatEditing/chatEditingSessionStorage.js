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
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { hashAsync } from '../../../../../base/common/hash.js';
import { ResourceMap } from '../../../../../base/common/map.js';
import { revive } from '../../../../../base/common/marshalling.js';
import { joinPath } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { IEnvironmentService } from '../../../../../platform/environment/common/environment.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { getKeyForChatSessionResource } from './chatEditingOperations.js';
const STORAGE_CONTENTS_FOLDER = 'contents';
const STORAGE_STATE_FILE = 'state.json';
let ChatEditingSessionStorage = class ChatEditingSessionStorage {
    constructor(_chatSessionResource, _fileService, _environmentService, _logService, _workspaceContextService) {
        this._chatSessionResource = _chatSessionResource;
        this._fileService = _fileService;
        this._environmentService = _environmentService;
        this._logService = _logService;
        this._workspaceContextService = _workspaceContextService;
        this.storageKey = getKeyForChatSessionResource(_chatSessionResource);
    }
    _getStorageLocation() {
        const workspaceId = this._workspaceContextService.getWorkspace().id;
        return joinPath(this._environmentService.workspaceStorageHome, workspaceId, 'chatEditingSessions', this.storageKey);
    }
    async restoreState() {
        const storageLocation = this._getStorageLocation();
        const fileContents = new Map();
        const getFileContent = (hash) => {
            let readPromise = fileContents.get(hash);
            if (!readPromise) {
                readPromise = this._fileService.readFile(joinPath(storageLocation, STORAGE_CONTENTS_FOLDER, hash)).then(content => content.value.toString());
                fileContents.set(hash, readPromise);
            }
            return readPromise;
        };
        const deserializeSnapshotEntriesDTO = async (dtoEntries) => {
            const entries = new ResourceMap();
            for (const entryDTO of dtoEntries) {
                const entry = await deserializeSnapshotEntry(entryDTO);
                entries.set(entry.resource, entry);
            }
            return entries;
        };
        const deserializeChatEditingStopDTO = async (stopDTO) => {
            const entries = await deserializeSnapshotEntriesDTO(stopDTO.entries);
            return { stopId: 'stopId' in stopDTO ? stopDTO.stopId : undefined, entries };
        };
        const deserializeSnapshotEntry = async (entry) => {
            return {
                resource: URI.parse(entry.resource),
                languageId: entry.languageId,
                original: await getFileContent(entry.originalHash),
                current: await getFileContent(entry.currentHash),
                state: entry.state,
                snapshotUri: URI.parse(entry.snapshotUri),
                telemetryInfo: {
                    requestId: entry.telemetryInfo.requestId,
                    agentId: entry.telemetryInfo.agentId,
                    command: entry.telemetryInfo.command,
                    sessionResource: this._chatSessionResource,
                    result: undefined,
                    modelId: entry.telemetryInfo.modelId,
                    modeId: entry.telemetryInfo.modeId,
                    applyCodeBlockSuggestionId: entry.telemetryInfo.applyCodeBlockSuggestionId,
                    feature: entry.telemetryInfo.feature,
                },
                isDeleted: entry.isDeleted,
            };
        };
        try {
            const stateFilePath = joinPath(storageLocation, STORAGE_STATE_FILE);
            if (!await this._fileService.exists(stateFilePath)) {
                this._logService.debug(`chatEditingSession: No editing session state found at ${stateFilePath.toString()}`);
                return undefined;
            }
            this._logService.debug(`chatEditingSession: Restoring editing session at ${stateFilePath.toString()}`);
            const stateFileContent = await this._fileService.readFile(stateFilePath);
            const data = JSON.parse(stateFileContent.value.toString());
            if (!COMPATIBLE_STORAGE_VERSIONS.includes(data.version)) {
                return undefined;
            }
            const initialFileContents = new ResourceMap();
            for (const fileContentDTO of data.initialFileContents) {
                initialFileContents.set(URI.parse(fileContentDTO[0]), await getFileContent(fileContentDTO[1]));
            }
            const recentSnapshot = await deserializeChatEditingStopDTO(data.recentSnapshot);
            return {
                initialFileContents,
                recentSnapshot,
                timeline: revive(data.timeline),
            };
        }
        catch (e) {
            this._logService.error(`Error restoring chat editing session from ${storageLocation.toString()}`, e);
        }
        return undefined;
    }
    async storeState(state) {
        const storageFolder = this._getStorageLocation();
        const contentsFolder = URI.joinPath(storageFolder, STORAGE_CONTENTS_FOLDER);
        // prepare the content folder
        const existingContents = new Set();
        try {
            const stat = await this._fileService.resolve(contentsFolder);
            stat.children?.forEach(child => {
                if (child.isFile) {
                    existingContents.add(child.name);
                }
            });
        }
        catch (e) {
            try {
                // does not exist, create
                await this._fileService.createFolder(contentsFolder);
            }
            catch (e) {
                this._logService.error(`Error creating chat editing session content folder ${contentsFolder.toString()}`, e);
                return;
            }
        }
        const contentWritePromises = new Map();
        // saves a file content under a path containing a hash of the content.
        // Returns the hash to represent the content.
        const writeContent = async (content) => {
            const buffer = VSBuffer.fromString(content);
            const hash = (await hashAsync(buffer)).substring(0, 7);
            if (!existingContents.has(hash)) {
                await this._fileService.writeFile(joinPath(contentsFolder, hash), buffer);
            }
            return hash;
        };
        const addFileContent = async (content) => {
            let storedContentHash = contentWritePromises.get(content);
            if (!storedContentHash) {
                storedContentHash = writeContent(content);
                contentWritePromises.set(content, storedContentHash);
            }
            return storedContentHash;
        };
        const serializeResourceMap = async (resourceMap, serialize) => {
            return await Promise.all(Array.from(resourceMap.entries()).map(async ([resourceURI, value]) => [resourceURI.toString(), await serialize(value)]));
        };
        const serializeChatEditingSessionStop = async (stop) => {
            return {
                stopId: stop.stopId,
                entries: await Promise.all(Array.from(stop.entries.values()).map(serializeSnapshotEntry))
            };
        };
        const serializeSnapshotEntry = async (entry) => {
            return {
                resource: entry.resource.toString(),
                languageId: entry.languageId,
                originalHash: await addFileContent(entry.original),
                currentHash: await addFileContent(entry.current),
                state: entry.state,
                snapshotUri: entry.snapshotUri.toString(),
                telemetryInfo: { requestId: entry.telemetryInfo.requestId, agentId: entry.telemetryInfo.agentId, command: entry.telemetryInfo.command, modelId: entry.telemetryInfo.modelId, modeId: entry.telemetryInfo.modeId },
                isDeleted: entry.isDeleted,
            };
        };
        try {
            const data = {
                version: STORAGE_VERSION,
                initialFileContents: await serializeResourceMap(state.initialFileContents, value => addFileContent(value)),
                timeline: state.timeline,
                recentSnapshot: await serializeChatEditingSessionStop(state.recentSnapshot),
            };
            this._logService.debug(`chatEditingSession: Storing editing session at ${storageFolder.toString()}: ${contentWritePromises.size} files`);
            await this._fileService.writeFile(joinPath(storageFolder, STORAGE_STATE_FILE), VSBuffer.fromString(JSON.stringify(data)));
        }
        catch (e) {
            this._logService.debug(`Error storing chat editing session to ${storageFolder.toString()}`, e);
        }
    }
    async clearState() {
        const storageFolder = this._getStorageLocation();
        if (await this._fileService.exists(storageFolder)) {
            this._logService.debug(`chatEditingSession: Clearing editing session at ${storageFolder.toString()}`);
            try {
                await this._fileService.del(storageFolder, { recursive: true });
            }
            catch (e) {
                this._logService.debug(`Error clearing chat editing session from ${storageFolder.toString()}`, e);
            }
        }
    }
};
ChatEditingSessionStorage = __decorate([
    __param(1, IFileService),
    __param(2, IEnvironmentService),
    __param(3, ILogService),
    __param(4, IWorkspaceContextService)
], ChatEditingSessionStorage);
export { ChatEditingSessionStorage };
const COMPATIBLE_STORAGE_VERSIONS = [1, 2];
const STORAGE_VERSION = 2;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdEVkaXRpbmdTZXNzaW9uU3RvcmFnZS5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci9jaGF0RWRpdGluZy9jaGF0RWRpdGluZ1Nlc3Npb25TdG9yYWdlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUNoRSxPQUFPLEVBQUUsU0FBUyxFQUFFLE1BQU0sb0NBQW9DLENBQUM7QUFDL0QsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQ2hFLE9BQU8sRUFBRSxNQUFNLEVBQUUsTUFBTSwyQ0FBMkMsQ0FBQztBQUNuRSxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDbkUsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBRXhELE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLDJEQUEyRCxDQUFDO0FBQ2hHLE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSwrQ0FBK0MsQ0FBQztBQUM3RSxPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0sMkNBQTJDLENBQUM7QUFDeEUsT0FBTyxFQUFFLHdCQUF3QixFQUFFLE1BQU0sdURBQXVELENBQUM7QUFHakcsT0FBTyxFQUFFLDRCQUE0QixFQUE2QixNQUFNLDRCQUE0QixDQUFDO0FBRXJHLE1BQU0sdUJBQXVCLEdBQUcsVUFBVSxDQUFDO0FBQzNDLE1BQU0sa0JBQWtCLEdBQUcsWUFBWSxDQUFDO0FBUWpDLElBQU0seUJBQXlCLEdBQS9CLE1BQU0seUJBQXlCO0lBRXJDLFlBQ2tCLG9CQUF5QixFQUNYLFlBQTBCLEVBQ25CLG1CQUF3QyxFQUNoRCxXQUF3QixFQUNYLHdCQUFrRDtRQUo1RSx5QkFB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