/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { Limiter } from 'vs/base/common/async';
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
import { IWorkingCopyHistoryService } from 'vs/workbench/services/workingCopy/common/workingCopyHistory';
import { IWorkingCopySaveEvent, IWorkingCopyService } from 'vs/workbench/services/workingCopy/common/workingCopyService';
import { Schemas } from 'vs/base/common/network';

export class WorkingCopyHistoryTracker extends Disposable implements IWorkbenchContribution {

	// Adding history entries from the tracker should not be
	// an operation that should be unbounded and as such we
	// limit the write operations up to a maximum degree.
	private static readonly MAX_PARALLEL_HISTORY_WRITES = 10;

	private static readonly SETTINGS = {
		ENABLED: 'workbench.localHistory.enabled',
		SIZE_LIMIT: 'workbench.localHistory.maxFileSize',
	};

	private static readonly UNDO_REDO_SAVE_SOURCE = SaveSourceRegistry.registerSource('undoRedo.source', localize('undoRedo.source', "Undo / Redo"));

	private readonly limiter = this._register(new Limiter(WorkingCopyHistoryTracker.MAX_PARALLEL_HISTORY_WRITES));

	private readonly pendingAddHistoryEntryOperations = new ResourceMap<CancellationTokenSource>(resource => this.uriIdentityService.extUri.getComparisonKey(resource));

	private readonly workingCopyContentVersion = new ResourceMap<number>(resource => this.uriIdentityService.extUri.getComparisonKey(resource));
	private readonly historyEntryContentVersion = new ResourceMap<number>(resource => this.uriIdentityService.extUri.getComparisonKey(resource));

	constructor(
		@IWorkingCopyService private readonly workingCopyService: IWorkingCopyService,
		@IWorkingCopyHistoryService private readonly workingCopyHistoryService: IWorkingCopyHistoryService,
		@IUriIdentityService private readonly uriIdentityService: IUriIdentityService,
		@IPathService private readonly pathService: IPathService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IUndoRedoService private readonly undoRedoService: IUndoRedoService
	) {
		super();

		this.registerListeners();
	}

	private registerListeners() {

		// Working Copy events
		this._register(this.workingCopyService.onDidChangeContent(workingCopy => this.onDidChangeContent(workingCopy)));
		this._register(this.workingCopyService.onDidSave(e => this.onDidSave(e)));
	}

	private onDidChangeContent(workingCopy: IWorkingCopy): void {

		// Increment content version ID for resource
		const contentVersionId = this.getContentVersion(workingCopy);
		this.workingCopyContentVersion.set(workingCopy.resource, contentVersionId + 1);
	}

	private getContentVersion(workingCopy: IWorkingCopy): number {
		return this.workingCopyContentVersion.get(workingCopy.resource) || 0;
	}

	private onDidSave(e: IWorkingCopySaveEvent): void {
		if (!this.shouldTrackHistory(e)) {
			return; // return early for working copies we are not interested in
		}

		const contentVersion = this.getContentVersion(e.workingCopy);
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

			const contentVersion = this.getContentVersion(e.workingCopy);

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

	private shouldTrackHistory(e: IWorkingCopySaveEvent): e is IStoredFileWorkingCopySaveEvent<IStoredFileWorkingCopyModel> {
		if (
			e.workingCopy.resource.scheme !== this.pathService.defaultUriScheme && 	// track history for all workspace resources
			e.workingCopy.resource.scheme !== Schemas.userData						// track history for all settings
		) {
			return false; // do not support unknown resources
		}

		if (!isStoredFileWorkingCopySaveEvent(e)) {
			return false; // only support working copies that are backed by stored files
		}

		const configuredMaxFileSizeInBytes = 1024 * this.configurationService.getValue<number>(WorkingCopyHistoryTracker.SETTINGS.SIZE_LIMIT, { resource: e.workingCopy.resource });
		if (e.stat.size > configuredMaxFileSizeInBytes) {
			return false; // only track files that are not too large
		}

		// Finally check for setting
		return this.configurationService.getValue<boolean>(WorkingCopyHistoryTracker.SETTINGS.ENABLED, { resource: e.workingCopy.resource }) !== false;
	}
}
