/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { URI } from 'vs/base/common/uri';
import { GlobalIdleValue, Limiter } from 'vs/base/common/async';
import { CancellationTokenSource } from 'vs/base/common/cancellation';
import { Disposable } from 'vs/base/common/lifecycle';
import { ResourceMap } from 'vs/base/common/map';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IUndoRedoService } from 'vs/platform/undoRedo/common/undoRedo';
import { IUriIdentityService } from 'vs/platform/uriIdentity/common/uriIdentity';
import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { SaveSource, SaveSourceRegistry } from 'vs/workbench/common/editor';
import { IPathService } from 'vs/workbench/services/path/common/pathService';
import { isStoredFileWorkingCopySaveEvent, IStoredFileWorkingCopyModel } from 'vs/workbench/services/workingCopy/common/storedFileWorkingCopy';
import { IStoredFileWorkingCopySaveEvent } from 'vs/workbench/services/workingCopy/common/storedFileWorkingCopyManager';
import { IWorkingCopy } from 'vs/workbench/services/workingCopy/common/workingCopy';
import { IWorkingCopyHistoryService, MAX_PARALLEL_HISTORY_IO_OPS } from 'vs/workbench/services/workingCopy/common/workingCopyHistory';
import { IWorkingCopySaveEvent, IWorkingCopyService } from 'vs/workbench/services/workingCopy/common/workingCopyService';
import { Schemas } from 'vs/base/common/network';
import { ResourceGlobMatcher } from 'vs/workbench/common/resources';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { FileOperation, FileOperationEvent, IFileOperationEventWithMetadata, IFileService, IFileStatWithMetadata } from 'vs/platform/files/common/files';

export class WorkingCopyHistoryTracker extends Disposable implements IWorkbenchContribution {

	private static readonly SETTINGS = {
		ENABLED: 'workbench.localHistory.enabled',
		SIZE_LIMIT: 'workbench.localHistory.maxFileSize',
		EXCLUDES: 'workbench.localHistory.exclude'
	};

	private static readonly UNDO_REDO_SAVE_SOURCE = SaveSourceRegistry.registerSource('undoRedo.source', localize('undoRedo.source', "Undo / Redo"));

	private readonly limiter = this._register(new Limiter(MAX_PARALLEL_HISTORY_IO_OPS));

	private readonly resourceExcludeMatcher = this._register(new GlobalIdleValue(() => {
		const matcher = this._register(new ResourceGlobMatcher(
			root => this.configurationService.getValue(WorkingCopyHistoryTracker.SETTINGS.EXCLUDES, { resource: root }),
			event => event.affectsConfiguration(WorkingCopyHistoryTracker.SETTINGS.EXCLUDES),
			this.contextService,
			this.configurationService
		));

		return matcher;
	}));

	private readonly pendingAddHistoryEntryOperations = new ResourceMap<CancellationTokenSource>(resource => this.uriIdentityService.extUri.getComparisonKey(resource));

	private readonly workingCopyContentVersion = new ResourceMap<number>(resource => this.uriIdentityService.extUri.getComparisonKey(resource));
	private readonly historyEntryContentVersion = new ResourceMap<number>(resource => this.uriIdentityService.extUri.getComparisonKey(resource));

	constructor(
		@IWorkingCopyService private readonly workingCopyService: IWorkingCopyService,
		@IWorkingCopyHistoryService private readonly workingCopyHistoryService: IWorkingCopyHistoryService,
		@IUriIdentityService private readonly uriIdentityService: IUriIdentityService,
		@IPathService private readonly pathService: IPathService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IUndoRedoService private readonly undoRedoService: IUndoRedoService,
		@IWorkspaceContextService private readonly contextService: IWorkspaceContextService,
		@IFileService private readonly fileService: IFileService
	) {
		super();

		this.registerListeners();
	}

	private registerListeners() {

		// File Events
		this._register(this.fileService.onDidRunOperation(e => this.onDidRunFileOperation(e)));

		// Working Copy Events
		this._register(this.workingCopyService.onDidChangeContent(workingCopy => this.onDidChangeContent(workingCopy)));
		this._register(this.workingCopyService.onDidSave(e => this.onDidSave(e)));
	}

	private async onDidRunFileOperation(e: FileOperationEvent): Promise<void> {
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

	private onDidChangeContent(workingCopy: IWorkingCopy): void {

		// Increment content version ID for resource
		const contentVersionId = this.getContentVersion(workingCopy.resource);
		this.workingCopyContentVersion.set(workingCopy.resource, contentVersionId + 1);
	}

	private getContentVersion(resource: URI): number {
		return this.workingCopyContentVersion.get(resource) || 0;
	}

	private onDidSave(e: IWorkingCopySaveEvent): void {
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

	private resolveSourceFromUndoRedo(e: IWorkingCopySaveEvent): SaveSource | undefined {
		const lastStackElement = this.undoRedoService.getLastElement(e.workingCopy.resource);
		if (lastStackElement) {
			if (lastStackElement.code === 'undoredo.textBufferEdit') {
				return undefined; // ignore any unspecific stack element that resulted just from typing
			}

			return lastStackElement.label;
		}

		const allStackElements = this.undoRedoService.getElements(e.workingCopy.resource);
		if (allStackElements.future.length > 0 || allStackElements.past.length > 0) {
			return WorkingCopyHistoryTracker.UNDO_REDO_SAVE_SOURCE;
		}

		return undefined;
	}

	private shouldTrackHistoryFromSaveEvent(e: IWorkingCopySaveEvent): e is IStoredFileWorkingCopySaveEvent<IStoredFileWorkingCopyModel> {
		if (!isStoredFileWorkingCopySaveEvent(e)) {
			return false; // only support working copies that are backed by stored files
		}

		return this.shouldTrackHistory(e.workingCopy.resource, e.stat);
	}

	private shouldTrackHistoryFromFileOperationEvent(e: FileOperationEvent): e is IFileOperationEventWithMetadata {
		if (!e.isOperation(FileOperation.MOVE)) {
			return false; // only interested in move operations
		}

		return this.shouldTrackHistory(e.target.resource, e.target);
	}

	private shouldTrackHistory(resource: URI, stat: IFileStatWithMetadata): boolean {
		if (
			resource.scheme !== this.pathService.defaultUriScheme && 	// track history for all workspace resources
			resource.scheme !== Schemas.vscodeUserData &&				// track history for all settings
			resource.scheme !== Schemas.inMemory	 					// track history for tests that use in-memory
		) {
			return false; // do not support unknown resources
		}

		const configuredMaxFileSizeInBytes = 1024 * this.configurationService.getValue<number>(WorkingCopyHistoryTracker.SETTINGS.SIZE_LIMIT, { resource });
		if (stat.size > configuredMaxFileSizeInBytes) {
			return false; // only track files that are not too large
		}

		if (this.configurationService.getValue(WorkingCopyHistoryTracker.SETTINGS.ENABLED, { resource }) === false) {
			return false; // do not track when history is disabled
		}

		// Finally check for exclude setting
		return !this.resourceExcludeMatcher.value.matches(resource);
	}
}
