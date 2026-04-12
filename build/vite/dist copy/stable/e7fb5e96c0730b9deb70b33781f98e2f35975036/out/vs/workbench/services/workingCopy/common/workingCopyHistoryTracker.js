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
var WorkingCopyHistoryTracker_1;
import { localize } from '../../../../nls.js';
import { GlobalIdleValue, Limiter } from '../../../../base/common/async.js';
import { CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../../base/common/map.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IUndoRedoService } from '../../../../platform/undoRedo/common/undoRedo.js';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity.js';
import { SaveSourceRegistry } from '../../../common/editor.js';
import { IPathService } from '../../path/common/pathService.js';
import { isStoredFileWorkingCopySaveEvent } from './storedFileWorkingCopy.js';
import { IWorkingCopyHistoryService, MAX_PARALLEL_HISTORY_IO_OPS } from './workingCopyHistory.js';
import { IWorkingCopyService } from './workingCopyService.js';
import { Schemas } from '../../../../base/common/network.js';
import { ResourceGlobMatcher } from '../../../common/resources.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { IFileService } from '../../../../platform/files/common/files.js';
let WorkingCopyHistoryTracker = class WorkingCopyHistoryTracker extends Disposable {
    static { WorkingCopyHistoryTracker_1 = this; }
    static { this.SETTINGS = {
        ENABLED: 'workbench.localHistory.enabled',
        SIZE_LIMIT: 'workbench.localHistory.maxFileSize',
        EXCLUDES: 'workbench.localHistory.exclude'
    }; }
    static { this.UNDO_REDO_SAVE_SOURCE = SaveSourceRegistry.registerSource('undoRedo.source', localize('undoRedo.source', "Undo / Redo")); }
    constructor(workingCopyService, workingCopyHistoryService, uriIdentityService, pathService, configurationService, undoRedoService, contextService, fileService) {
        super();
        this.workingCopyService = workingCopyService;
        this.workingCopyHistoryService = workingCopyHistoryService;
        this.uriIdentityService = uriIdentityService;
        this.pathService = pathService;
        this.configurationService = configurationService;
        this.undoRedoService = undoRedoService;
        this.contextService = contextService;
        this.fileService = fileService;
        this.limiter = this._register(new Limiter(MAX_PARALLEL_HISTORY_IO_OPS));
        this.resourceExcludeMatcher = this._register(new GlobalIdleValue(() => {
            const matcher = this._register(new ResourceGlobMatcher(root => this.configurationService.getValue(WorkingCopyHistoryTracker_1.SETTINGS.EXCLUDES, { resource: root }), event => event.affectsConfiguration(WorkingCopyHistoryTracker_1.SETTINGS.EXCLUDES), this.contextService, this.configurationService));
            return matcher;
        }));
        this.pendingAddHistoryEntryOperations = new ResourceMap(resource => this.uriIdentityService.extUri.getComparisonKey(resource));
        this.workingCopyContentVersion = new ResourceMap(resource => this.uriIdentityService.extUri.getComparisonKey(resource));
        this.historyEntryContentVersion = new ResourceMap(resource => this.uriIdentityService.extUri.getComparisonKey(resource));
        this.registerListeners();
    }
    registerListeners() {
        // File Events
        this._register(this.fileService.onDidRunOperation(e => this.onDidRunFileOperation(e)));
        // Working Copy Events
        this._register(this.workingCopyService.onDidChangeContent(workingCopy => this.onDidChangeContent(workingCopy)));
        this._register(this.workingCopyService.onDidSave(e => this.onDidSave(e)));
    }
    async onDidRunFileOperation(e) {
        if (!this.shouldTrackHistoryFromFileOperationEvent(e)) {
            return; // return early for working copies we are not interested in
        }
        const source = e.resource;
        const target = e.target.resource;
        // Move working copy history entries for this file move event
        const resources = await this.workingCopyHistoryService.moveEntries(source, target);
        // Make sure to track the content version of each entry that
        // was moved in our map. This ensures that a subsequent save
        // without a content change does not add a redundant entry
        // (https://github.com/microsoft/vscode/issues/145881)
        for (const resource of resources) {
            const contentVersion = this.getContentVersion(resource);
            this.historyEntryContentVersion.set(resource, contentVersion);
        }
    }
    onDidChangeContent(workingCopy) {
        // Increment content version ID for resource
        const contentVersionId = this.getContentVersion(workingCopy.resource);
        this.workingCopyContentVersion.set(workingCopy.resource, contentVersionId + 1);
    }
    getContentVersion(resource) {
        return this.workingCopyContentVersion.get(resource) || 0;
    }
    onDidSave(e) {
        if (!this.shouldTrackHistoryFromSaveEvent(e)) {
            return; // return early for working copies we are not interested in
        }
        const contentVersion = this.getContentVersion(e.workingCopy.resource);
        if (this.historyEntryContentVersion.get(e.workingCopy.resource) === contentVersion) {
            return; // return early when content version already has associated history entry
        }
        // Cancel any previous operation for this resource
        this.pendingAddHistoryEntryOperations.get(e.workingCopy.resource)?.dispose(true);
        // Create new cancellation token support and remember
        const cts = new CancellationTokenSource();
        this.pendingAddHistoryEntryOperations.set(e.workingCopy.resource, cts);
        // Queue new operation to add to history
        this.limiter.queue(async () => {
            if (cts.token.isCancellationRequested) {
                return;
            }
            const contentVersion = this.getContentVersion(e.workingCopy.resource);
            // Figure out source of save operation if not provided already
            let source = e.source;
            if (!e.source) {
                source = this.resolveSourceFromUndoRedo(e);
            }
            // Add entry
            await this.workingCopyHistoryService.addEntry({ resource: e.workingCopy.resource, source, timestamp: e.stat.mtime }, cts.token);
            // Remember content version as being added to history
            this.historyEntryContentVersion.set(e.workingCopy.resource, contentVersion);
            if (cts.token.isCancellationRequested) {
                return;
            }
            // Finally remove from pending operations
            this.pendingAddHistoryEntryOperations.delete(e.workingCopy.resource);
        });
    }
    resolveSourceFromUndoRedo(e) {
        const lastStackElement = this.undoRedoService.getLastElement(e.workingCopy.resource);
        if (lastStackElement) {
            if (lastStackElement.code === 'undoredo.textBufferEdit') {
                return undefined; // ignore any unspecific stack element that resulted just from typing
            }
            return lastStackElement.label;
        }
        const allStackElements = this.undoRedoService.getElements(e.workingCopy.resource);
        if (allStackElements.future.length > 0 || allStackElements.past.length > 0) {
            return WorkingCopyHistoryTracker_1.UNDO_REDO_SAVE_SOURCE;
        }
        return undefined;
    }
    shouldTrackHistoryFromSaveEvent(e) {
        if (!isStoredFileWorkingCopySaveEvent(e)) {
            return false; // only support working copies that are backed by stored files
        }
        return this.shouldTrackHistory(e.workingCopy.resource, e.stat);
    }
    shouldTrackHistoryFromFileOperationEvent(e) {
        if (!e.isOperation(2 /* FileOperation.MOVE */)) {
            return false; // only interested in move operations
        }
        return this.shouldTrackHistory(e.target.resource, e.target);
    }
    shouldTrackHistory(resource, stat) {
        if (resource.scheme !== this.pathService.defaultUriScheme && // track history for all workspace resources
            resource.scheme !== Schemas.vscodeUserData && // track history for all settings
            resource.scheme !== Schemas.inMemory // track history for tests that use in-memory
        ) {
            return false; // do not support unknown resources
        }
        const configuredMaxFileSizeInBytes = 1024 * this.configurationService.getValue(WorkingCopyHistoryTracker_1.SETTINGS.SIZE_LIMIT, { resource });
        if (stat.size > configuredMaxFileSizeInBytes) {
            return false; // only track files that are not too large
        }
        if (this.configurationService.getValue(WorkingCopyHistoryTracker_1.SETTINGS.ENABLED, { resource }) === false) {
            return false; // do not track when history is disabled
        }
        // Finally check for exclude setting
        return !this.resourceExcludeMatcher.value.matches(resource);
    }
};
WorkingCopyHistoryTracker = WorkingCopyHistoryTracker_1 = __decorate([
    __param(0, IWorkingCopyService),
    __param(1, IWorkingCopyHistoryService),
    __param(2, IUriIdentityService),
    __param(3, IPathService),
    __param(4, IConfigurationService),
    __param(5, IUndoRedoService),
    __param(6, IWorkspaceContextService),
    __param(7, IFileService)
], WorkingCopyHistoryTracker);
export { WorkingCopyHistoryTracker };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoid29ya2luZ0NvcHlIaXN0b3J5VHJhY2tlci5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9zZXJ2aWNlcy93b3JraW5nQ29weS9jb21tb24vd29ya2luZ0NvcHlIaXN0b3J5VHJhY2tlci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLG9CQUFvQixDQUFDO0FBRTlDLE9BQU8sRUFBRSxlQUFlLEVBQUUsT0FBTyxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDNUUsT0FBTyxFQUFFLHVCQUF1QixFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDbEYsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ2xFLE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQUM3RCxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSw0REFBNEQsQ0FBQztBQUNuRyxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSxrREFBa0QsQ0FBQztBQUNwRixPQUFPLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSx3REFBd0QsQ0FBQztBQUU3RixPQUFPLEVBQWMsa0JBQWtCLEVBQUUsTUFBTSwyQkFBMkIsQ0FBQztBQUMzRSxPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDaEUsT0FBTyxFQUFFLGdDQUFnQyxFQUErQixNQUFNLDRCQUE0QixDQUFDO0FBRzNHLE9BQU8sRUFBRSwwQkFBMEIsRUFBRSwyQkFBMkIsRUFBRSxNQUFNLHlCQUF5QixDQUFDO0FBQ2xHLE9BQU8sRUFBeUIsbUJBQW1CLEVBQUUsTUFBTSx5QkFBeUIsQ0FBQztBQUNyRixPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sb0NBQW9DLENBQUM7QUFDN0QsT0FBTyxFQUFFLG1CQUFt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