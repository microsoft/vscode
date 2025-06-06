/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import { Event, Emitter } from '../../../../base/common/event.js';
import { assertIsDefined } from '../../../../base/common/types.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { IWorkbenchContributionsRegistry, Extensions as WorkbenchExtensions } from '../../../common/contributions.js';
import { ILifecycleService, LifecyclePhase, WillShutdownEvent } from '../../lifecycle/common/lifecycle.js';
import { WorkingCopyHistoryTracker } from './workingCopyHistoryTracker.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { IWorkingCopyHistoryEntry, IWorkingCopyHistoryEntryDescriptor, IWorkingCopyHistoryEvent, IWorkingCopyHistoryService, MAX_PARALLEL_HISTORY_IO_OPS } from './workingCopyHistory.js';
import { FileOperationError, FileOperationResult, IFileService, IFileStatWithMetadata } from '../../../../platform/files/common/files.js';
import { IRemoteAgentService } from '../../remote/common/remoteAgentService.js';
import { URI } from '../../../../base/common/uri.js';
import { DeferredPromise, Limiter, RunOnceScheduler } from '../../../../base/common/async.js';
import { dirname, extname, isEqual, joinPath } from '../../../../base/common/resources.js';
import { IWorkbenchEnvironmentService } from '../../environment/common/environmentService.js';
import { hash } from '../../../../base/common/hash.js';
import { indexOfPath, randomPath } from '../../../../base/common/extpath.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { ResourceMap } from '../../../../base/common/map.js';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity.js';
import { ILabelService } from '../../../../platform/label/common/label.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { SaveSource, SaveSourceRegistry } from '../../../common/editor.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { distinct } from '../../../../base/common/arrays.js';
import { escapeRegExpCharacters } from '../../../../base/common/strings.js';

interface ISerializedWorkingCopyHistoryModel {
	readonly version: number;
	readonly resource: string;
	readonly entries: ISerializedWorkingCopyHistoryModelEntry[];
}

interface ISerializedWorkingCopyHistoryModelEntry {
	readonly id: string;
	readonly timestamp: number;
	readonly source?: SaveSource;
	readonly sourceDescription?: string;
}

export interface IWorkingCopyHistoryModelOptions {

	/**
	 * Whether to flush when the model changes. If not
	 * configured, `model.store()` has to be called
	 * explicitly.
	 */
	flushOnChange: boolean;
}

export class WorkingCopyHistoryModel {

	static readonly ENTRIES_FILE = 'entries.json';

	private static readonly FILE_SAVED_SOURCE = SaveSourceRegistry.registerSource('default.source', localize('default.source', "File Saved"));

	private static readonly SETTINGS = {
		MAX_ENTRIES: 'workbench.localHistory.maxFileEntries',
		MERGE_PERIOD: 'workbench.localHistory.mergeWindow'
	};

	private entries: IWorkingCopyHistoryEntry[] = [];

	private whenResolved: Promise<void> | undefined = undefined;

	private workingCopyResource: URI | undefined = undefined;
	private workingCopyName: string | undefined = undefined;

	private historyEntriesFolder: URI | undefined = undefined;
	private historyEntriesListingFile: URI | undefined = undefined;

	private historyEntriesNameMatcher: RegExp | undefined = undefined;

	private versionId = 0;
	private storedVersionId = this.versionId;

	private readonly storeLimiter = new Limiter(1);

	constructor(
		workingCopyResource: URI,
		private readonly historyHome: URI,
		private readonly entryAddedEmitter: Emitter<IWorkingCopyHistoryEvent>,
		private readonly entryChangedEmitter: Emitter<IWorkingCopyHistoryEvent>,
		private readonly entryReplacedEmitter: Emitter<IWorkingCopyHistoryEvent>,
		private readonly entryRemovedEmitter: Emitter<IWorkingCopyHistoryEvent>,
		private readonly options: IWorkingCopyHistoryModelOptions,
		private readonly fileService: IFileService,
		private readonly labelService: ILabelService,
		private readonly logService: ILogService,
		private readonly configurationService: IConfigurationService
	) {
		this.setWorkingCopy(workingCopyResource);
	}

	private setWorkingCopy(workingCopyResource: URI): void {

		// Update working copy
		this.workingCopyResource = workingCopyResource;
		this.workingCopyName = this.labelService.getUriBasenameLabel(workingCopyResource);

		this.historyEntriesNameMatcher = new RegExp(`[A-Za-z0-9]{4}${escapeRegExpCharacters(extname(workingCopyResource))}`);

		// Update locations
		this.historyEntriesFolder = this.toHistoryEntriesFolder(this.historyHome, workingCopyResource);
		this.historyEntriesListingFile = joinPath(this.historyEntriesFolder, WorkingCopyHistoryModel.ENTRIES_FILE);

		// Reset entries and resolved cache
		this.entries = [];
		this.whenResolved = undefined;
	}

	private toHistoryEntriesFolder(historyHome: URI, workingCopyResource: URI): URI {
		return joinPath(historyHome, hash(workingCopyResource.toString()).toString(16));
	}

	async addEntry(source = WorkingCopyHistoryModel.FILE_SAVED_SOURCE, sourceDescription: string | undefined = undefined, timestamp = Date.now(), token: CancellationToken): Promise<IWorkingCopyHistoryEntry> {
		let entryToReplace: IWorkingCopyHistoryEntry | undefined = undefined;

		// Figure out if the last entry should be replaced based
		// on settings that can define a interval for when an
		// entry is not added as new entry but should replace.
		// However, when save source is different, never replace.
		const lastEntry = this.entries.at(-1);
		if (lastEntry && lastEntry.source === source) {
			const configuredReplaceInterval = this.configurationService.getValue<number>(WorkingCopyHistoryModel.SETTINGS.MERGE_PERIOD, { resource: this.workingCopyResource });
			if (timestamp - lastEntry.timestamp <= (configuredReplaceInterval * 1000 /* convert to millies */)) {
				entryToReplace = lastEntry;
			}
		}

		let entry: IWorkingCopyHistoryEntry;

		// Replace lastest entry in history
		if (entryToReplace) {
			entry = await this.doReplaceEntry(entryToReplace, source, sourceDescription, timestamp, token);
		}

		// Add entry to history
		else {
			entry = await this.doAddEntry(source, sourceDescription, timestamp, token);
		}

		// Flush now if configured
		if (this.options.flushOnChange && !token.isCancellationRequested) {
			await this.store(token);
		}

		return entry;
	}

	private async doAddEntry(source: SaveSource, sourceDescription: string | undefined = undefined, timestamp: number, token: CancellationToken): Promise<IWorkingCopyHistoryEntry> {
		const workingCopyResource = assertIsDefined(this.workingCopyResource);
		const workingCopyName = assertIsDefined(this.workingCopyName);
		const historyEntriesFolder = assertIsDefined(this.historyEntriesFolder);

		// Perform a fast clone operation with minimal overhead to a new random location
		const id = `${randomPath(undefined, undefined, 4)}${extname(workingCopyResource)}`;
		const location = joinPath(historyEntriesFolder, id);
		await this.fileService.cloneFile(workingCopyResource, location);

		// Add to list of entries
		const entry: IWorkingCopyHistoryEntry = {
			id,
			workingCopy: { resource: workingCopyResource, name: workingCopyName },
			location,
			timestamp,
			source,
			sourceDescription
		};
		this.entries.push(entry);

		// Update version ID of model to use for storing later
		this.versionId++;

		// Events
		this.entryAddedEmitter.fire({ entry });

		return entry;
	}

	private async doReplaceEntry(entry: IWorkingCopyHistoryEntry, source: SaveSource, sourceDescription: string | undefined = undefined, timestamp: number, token: CancellationToken): Promise<IWorkingCopyHistoryEntry> {
		const workingCopyResource = assertIsDefined(this.workingCopyResource);

		// Perform a fast clone operation with minimal overhead to the existing location
		await this.fileService.cloneFile(workingCopyResource, entry.location);

		// Update entry
		entry.source = source;
		entry.sourceDescription = sourceDescription;
		entry.timestamp = timestamp;

		// Update version ID of model to use for storing later
		this.versionId++;

		// Events
		this.entryReplacedEmitter.fire({ entry });

		return entry;
	}

	async removeEntry(entry: IWorkingCopyHistoryEntry, token: CancellationToken): Promise<boolean> {

		// Make sure to await resolving when removing entries
		await this.resolveEntriesOnce();

		if (token.isCancellationRequested) {
			return false;
		}

		const index = this.entries.indexOf(entry);
		if (index === -1) {
			return false;
		}

		// Delete from disk
		await this.deleteEntry(entry);

		// Remove from model
		this.entries.splice(index, 1);

		// Update version ID of model to use for storing later
		this.versionId++;

		// Events
		this.entryRemovedEmitter.fire({ entry });

		// Flush now if configured
		if (this.options.flushOnChange && !token.isCancellationRequested) {
			await this.store(token);
		}

		return true;
	}

	async updateEntry(entry: IWorkingCopyHistoryEntry, properties: { source: SaveSource }, token: CancellationToken): Promise<void> {

		// Make sure to await resolving when updating entries
		await this.resolveEntriesOnce();

		if (token.isCancellationRequested) {
			return;
		}

		const index = this.entries.indexOf(entry);
		if (index === -1) {
			return;
		}

		// Update entry
		entry.source = properties.source;

		// Update version ID of model to use for storing later
		this.versionId++;

		// Events
		this.entryChangedEmitter.fire({ entry });

		// Flush now if configured
		if (this.options.flushOnChange && !token.isCancellationRequested) {
			await this.store(token);
		}
	}

	async getEntries(): Promise<readonly IWorkingCopyHistoryEntry[]> {

		// Make sure to await resolving when all entries are asked for
		await this.resolveEntriesOnce();

		// Return as many entries as configured by user settings
		const configuredMaxEntries = this.configurationService.getValue<number>(WorkingCopyHistoryModel.SETTINGS.MAX_ENTRIES, { resource: this.workingCopyResource });
		if (this.entries.length > configuredMaxEntries) {
			return this.entries.slice(this.entries.length - configuredMaxEntries);
		}

		return this.entries;
	}

	async hasEntries(skipResolve: boolean): Promise<boolean> {

		// Make sure to await resolving unless explicitly skipped
		if (!skipResolve) {
			await this.resolveEntriesOnce();
		}

		return this.entries.length > 0;
	}

	private resolveEntriesOnce(): Promise<void> {
		if (!this.whenResolved) {
			this.whenResolved = this.doResolveEntries();
		}

		return this.whenResolved;
	}

	private async doResolveEntries(): Promise<void> {

		// Resolve from disk
		const entries = await this.resolveEntriesFromDisk();

		// We now need to merge our in-memory entries with the
		// entries we have found on disk because it is possible
		// that new entries have been added before the entries
		// listing file was updated
		for (const entry of this.entries) {
			entries.set(entry.id, entry);
		}

		// Set as entries, sorted by timestamp
		this.entries = Array.from(entries.values()).sort((entryA, entryB) => entryA.timestamp - entryB.timestamp);
	}

	private async resolveEntriesFromDisk(): Promise<Map<string /* ID */, IWorkingCopyHistoryEntry>> {
		const workingCopyResource = assertIsDefined(this.workingCopyResource);
		const workingCopyName = assertIsDefined(this.workingCopyName);

		const [entryListing, entryStats] = await Promise.all([

			// Resolve entries listing file
			this.readEntriesFile(),

			// Resolve children of history folder
			this.readEntriesFolder()
		]);

		// Add from raw folder children
		const entries = new Map<string, IWorkingCopyHistoryEntry>();
		if (entryStats) {
			for (const entryStat of entryStats) {
				entries.set(entryStat.name, {
					id: entryStat.name,
					workingCopy: { resource: workingCopyResource, name: workingCopyName },
					location: entryStat.resource,
					timestamp: entryStat.mtime,
					source: WorkingCopyHistoryModel.FILE_SAVED_SOURCE,
					sourceDescription: undefined
				});
			}
		}

		// Update from listing (to have more specific metadata)
		if (entryListing) {
			for (const entry of entryListing.entries) {
				const existingEntry = entries.get(entry.id);
				if (existingEntry) {
					entries.set(entry.id, {
						...existingEntry,
						timestamp: entry.timestamp,
						source: entry.source ?? existingEntry.source,
						sourceDescription: entry.sourceDescription ?? existingEntry.sourceDescription
					});
				}
			}
		}

		return entries;
	}

	async moveEntries(target: WorkingCopyHistoryModel, source: SaveSource, token: CancellationToken): Promise<void> {
		const timestamp = Date.now();
		const sourceDescription = this.labelService.getUriLabel(assertIsDefined(this.workingCopyResource));

		// Move all entries into the target folder so that we preserve
		// any existing history entries that might already be present

		const sourceHistoryEntriesFolder = assertIsDefined(this.historyEntriesFolder);
		const targetHistoryEntriesFolder = assertIsDefined(target.historyEntriesFolder);
		try {
			for (const entry of this.entries) {
				await this.fileService.move(entry.location, joinPath(targetHistoryEntriesFolder, entry.id), true);
			}
			await this.fileService.del(sourceHistoryEntriesFolder, { recursive: true });
		} catch (error) {
			if (!this.isFileNotFound(error)) {
				try {
					// In case of an error (unless not found), fallback to moving the entire folder
					await this.fileService.move(sourceHistoryEntriesFolder, targetHistoryEntriesFolder, true);
				} catch (error) {
					if (!this.isFileNotFound(error)) {
						this.traceError(error);
					}
				}
			}
		}

		// Merge our entries with target entries before updating associated working copy
		const allEntries = distinct([...this.entries, ...target.entries], entry => entry.id).sort((entryA, entryB) => entryA.timestamp - entryB.timestamp);

		// Update our associated working copy
		const targetWorkingCopyResource = assertIsDefined(target.workingCopyResource);
		this.setWorkingCopy(targetWorkingCopyResource);

		// Restore our entries and ensure correct metadata
		const targetWorkingCopyName = assertIsDefined(target.workingCopyName);
		for (const entry of allEntries) {
			this.entries.push({
				id: entry.id,
				location: joinPath(targetHistoryEntriesFolder, entry.id),
				source: entry.source,
				sourceDescription: entry.sourceDescription,
				timestamp: entry.timestamp,
				workingCopy: {
					resource: targetWorkingCopyResource,
					name: targetWorkingCopyName
				}
			});
		}

		// Add entry for the move
		await this.addEntry(source, sourceDescription, timestamp, token);

		// Store model again to updated location
		await this.store(token);
	}

	async store(token: CancellationToken): Promise<void> {
		if (!this.shouldStore()) {
			return;
		}

		// Use a `Limiter` to prevent multiple `store` operations
		// potentially running at the same time

		await this.storeLimiter.queue(async () => {
			if (token.isCancellationRequested || !this.shouldStore()) {
				return;
			}

			return this.doStore(token);
		});
	}

	private shouldStore(): boolean {
		return this.storedVersionId !== this.versionId;
	}

	private async doStore(token: CancellationToken): Promise<void> {
		const historyEntriesFolder = assertIsDefined(this.historyEntriesFolder);

		// Make sure to await resolving when persisting
		await this.resolveEntriesOnce();

		if (token.isCancellationRequested) {
			return undefined;
		}

		// Cleanup based on max-entries setting
		await this.cleanUpEntries();

		// Without entries, remove the history folder
		const storedVersion = this.versionId;
		if (this.entries.length === 0) {
			try {
				await this.fileService.del(historyEntriesFolder, { recursive: true });
			} catch (error) {
				this.traceError(error);
			}
		}

		// If we still have entries, update the entries meta file
		else {
			await this.writeEntriesFile();
		}

		// Mark as stored version
		this.storedVersionId = storedVersion;
	}

	private async cleanUpEntries(): Promise<void> {
		const configuredMaxEntries = this.configurationService.getValue<number>(WorkingCopyHistoryModel.SETTINGS.MAX_ENTRIES, { resource: this.workingCopyResource });
		if (this.entries.length <= configuredMaxEntries) {
			return; // nothing to cleanup
		}

		const entriesToDelete = this.entries.slice(0, this.entries.length - configuredMaxEntries);
		const entriesToKeep = this.entries.slice(this.entries.length - configuredMaxEntries);

		// Delete entries from disk as instructed
		for (const entryToDelete of entriesToDelete) {
			await this.deleteEntry(entryToDelete);
		}

		// Make sure to update our in-memory model as well
		// because it will be persisted right after
		this.entries = entriesToKeep;

		// Events
		for (const entry of entriesToDelete) {
			this.entryRemovedEmitter.fire({ entry });
		}
	}

	private async deleteEntry(entry: IWorkingCopyHistoryEntry): Promise<void> {
		try {
			await this.fileService.del(entry.location);
		} catch (error) {
			this.traceError(error);
		}
	}

	private async writeEntriesFile(): Promise<void> {
		const workingCopyResource = assertIsDefined(this.workingCopyResource);
		const historyEntriesListingFile = assertIsDefined(this.historyEntriesListingFile);

		const serializedModel: ISerializedWorkingCopyHistoryModel = {
			version: 1,
			resource: workingCopyResource.toString(),
			entries: this.entries.map(entry => {
				return {
					id: entry.id,
					source: entry.source !== WorkingCopyHistoryModel.FILE_SAVED_SOURCE ? entry.source : undefined,
					sourceDescription: entry.sourceDescription,
					timestamp: entry.timestamp
				};
			})
		};

		await this.fileService.writeFile(historyEntriesListingFile, VSBuffer.fromString(JSON.stringify(serializedModel)));
	}

	private async readEntriesFile(): Promise<ISerializedWorkingCopyHistoryModel | undefined> {
		const historyEntriesListingFile = assertIsDefined(this.historyEntriesListingFile);

		let serializedModel: ISerializedWorkingCopyHistoryModel | undefined = undefined;
		try {
			serializedModel = JSON.parse((await this.fileService.readFile(historyEntriesListingFile)).value.toString());
		} catch (error) {
			if (!this.isFileNotFound(error)) {
				this.traceError(error);
			}
		}

		return serializedModel;
	}

	private async readEntriesFolder(): Promise<IFileStatWithMetadata[] | undefined> {
		const historyEntriesFolder = assertIsDefined(this.historyEntriesFolder);
		const historyEntriesNameMatcher = assertIsDefined(this.historyEntriesNameMatcher);

		let rawEntries: IFileStatWithMetadata[] | undefined = undefined;

		// Resolve children of folder on disk
		try {
			rawEntries = (await this.fileService.resolve(historyEntriesFolder, { resolveMetadata: true })).children;
		} catch (error) {
			if (!this.isFileNotFound(error)) {
				this.traceError(error);
			}
		}

		if (!rawEntries) {
			return undefined;
		}

		// Skip entries that do not seem to have valid file name
		return rawEntries.filter(entry =>
			!isEqual(entry.resource, this.historyEntriesListingFile) && // not the listings file
			historyEntriesNameMatcher.test(entry.name)					// matching our expected file pattern for entries
		);
	}

	private isFileNotFound(error: unknown): boolean {
		return error instanceof FileOperationError && error.fileOperationResult === FileOperationResult.FILE_NOT_FOUND;
	}

	private traceError(error: Error): void {
		this.logService.trace('[Working Copy History Service]', error);
	}
}

export abstract class WorkingCopyHistoryService extends Disposable implements IWorkingCopyHistoryService {

	private static readonly FILE_MOVED_SOURCE = SaveSourceRegistry.registerSource('moved.source', localize('moved.source', "File Moved"));
	private static readonly FILE_RENAMED_SOURCE = SaveSourceRegistry.registerSource('renamed.source', localize('renamed.source', "File Renamed"));

	declare readonly _serviceBrand: undefined;

	protected readonly _onDidAddEntry = this._register(new Emitter<IWorkingCopyHistoryEvent>());
	readonly onDidAddEntry = this._onDidAddEntry.event;

	protected readonly _onDidChangeEntry = this._register(new Emitter<IWorkingCopyHistoryEvent>());
	readonly onDidChangeEntry = this._onDidChangeEntry.event;

	protected readonly _onDidReplaceEntry = this._register(new Emitter<IWorkingCopyHistoryEvent>());
	readonly onDidReplaceEntry = this._onDidReplaceEntry.event;

	private readonly _onDidMoveEntries = this._register(new Emitter<void>());
	readonly onDidMoveEntries = this._onDidMoveEntries.event;

	protected readonly _onDidRemoveEntry = this._register(new Emitter<IWorkingCopyHistoryEvent>());
	readonly onDidRemoveEntry = this._onDidRemoveEntry.event;

	private readonly _onDidRemoveEntries = this._register(new Emitter<void>());
	readonly onDidRemoveEntries = this._onDidRemoveEntries.event;

	private readonly localHistoryHome = new DeferredPromise<URI>();

	protected readonly models = new ResourceMap<WorkingCopyHistoryModel>(resource => this.uriIdentityService.extUri.getComparisonKey(resource));

	constructor(
		@IFileService protected readonly fileService: IFileService,
		@IRemoteAgentService protected readonly remoteAgentService: IRemoteAgentService,
		@IWorkbenchEnvironmentService protected readonly environmentService: IWorkbenchEnvironmentService,
		@IUriIdentityService protected readonly uriIdentityService: IUriIdentityService,
		@ILabelService protected readonly labelService: ILabelService,
		@ILogService protected readonly logService: ILogService,
		@IConfigurationService protected readonly configurationService: IConfigurationService
	) {
		super();

		this.resolveLocalHistoryHome();
	}

	private async resolveLocalHistoryHome(): Promise<void> {
		let historyHome: URI | undefined = undefined;

		// Prefer history to be stored in the remote if we are connected to a remote
		try {
			const remoteEnv = await this.remoteAgentService.getEnvironment();
			if (remoteEnv) {
				historyHome = remoteEnv.localHistoryHome;
			}
		} catch (error) {
			this.logService.trace(error); // ignore and fallback to local
		}

		// But fallback to local if there is no remote
		if (!historyHome) {
			historyHome = this.environmentService.localHistoryHome;
		}

		this.localHistoryHome.complete(historyHome);
	}

	async moveEntries(source: URI, target: URI): Promise<URI[]> {
		const limiter = new Limiter<URI>(MAX_PARALLEL_HISTORY_IO_OPS);
		const promises: Promise<URI>[] = [];

		for (const [resource, model] of this.models) {
			if (!this.uriIdentityService.extUri.isEqualOrParent(resource, source)) {
				continue; // model does not match moved resource
			}

			// Determine new resulting target resource
			let targetResource: URI;
			if (this.uriIdentityService.extUri.isEqual(source, resource)) {
				targetResource = target; // file got moved
			} else {
				const index = indexOfPath(resource.path, source.path);
				targetResource = joinPath(target, resource.path.substr(index + source.path.length + 1)); // parent folder got moved
			}

			// Figure out save source
			let saveSource: SaveSource;
			if (this.uriIdentityService.extUri.isEqual(dirname(resource), dirname(targetResource))) {
				saveSource = WorkingCopyHistoryService.FILE_RENAMED_SOURCE;
			} else {
				saveSource = WorkingCopyHistoryService.FILE_MOVED_SOURCE;
			}

			// Move entries to target queued
			promises.push(limiter.queue(() => this.doMoveEntries(model, saveSource, resource, targetResource)));
		}

		if (!promises.length) {
			return [];
		}

		// Await move operations
		const resources = await Promise.all(promises);

		// Events
		this._onDidMoveEntries.fire();

		return resources;
	}

	private async doMoveEntries(source: WorkingCopyHistoryModel, saveSource: SaveSource, sourceWorkingCopyResource: URI, targetWorkingCopyResource: URI): Promise<URI> {

		// Move to target via model
		const target = await this.getModel(targetWorkingCopyResource);
		await source.moveEntries(target, saveSource, CancellationToken.None);

		// Update model in our map
		this.models.delete(sourceWorkingCopyResource);
		this.models.set(targetWorkingCopyResource, source);

		return targetWorkingCopyResource;
	}

	async addEntry({ resource, source, timestamp }: IWorkingCopyHistoryEntryDescriptor, token: CancellationToken): Promise<IWorkingCopyHistoryEntry | undefined> {
		if (!this.fileService.hasProvider(resource)) {
			return undefined; // we require the working copy resource to be file service accessible
		}

		// Resolve history model for working copy
		const model = await this.getModel(resource);
		if (token.isCancellationRequested) {
			return undefined;
		}

		// Add to model
		return model.addEntry(source, undefined, timestamp, token);
	}

	async updateEntry(entry: IWorkingCopyHistoryEntry, properties: { source: SaveSource }, token: CancellationToken): Promise<void> {

		// Resolve history model for working copy
		const model = await this.getModel(entry.workingCopy.resource);
		if (token.isCancellationRequested) {
			return;
		}

		// Rename in model
		return model.updateEntry(entry, properties, token);
	}

	async removeEntry(entry: IWorkingCopyHistoryEntry, token: CancellationToken): Promise<boolean> {

		// Resolve history model for working copy
		const model = await this.getModel(entry.workingCopy.resource);
		if (token.isCancellationRequested) {
			return false;
		}

		// Remove from model
		return model.removeEntry(entry, token);
	}

	async removeAll(token: CancellationToken): Promise<void> {
		const historyHome = await this.localHistoryHome.p;
		if (token.isCancellationRequested) {
			return;
		}

		// Clear models
		this.models.clear();

		// Remove from disk
		await this.fileService.del(historyHome, { recursive: true });

		// Events
		this._onDidRemoveEntries.fire();
	}

	async getEntries(resource: URI, token: CancellationToken): Promise<readonly IWorkingCopyHistoryEntry[]> {
		const model = await this.getModel(resource);
		if (token.isCancellationRequested) {
			return [];
		}

		const entries = await model.getEntries();
		return entries ?? [];
	}

	async getAll(token: CancellationToken): Promise<readonly URI[]> {
		const historyHome = await this.localHistoryHome.p;
		if (token.isCancellationRequested) {
			return [];
		}

		const all = new ResourceMap<true>();

		// Fill in all known model resources (they might not have yet persisted to disk)
		for (const [resource, model] of this.models) {
			const hasInMemoryEntries = await model.hasEntries(true /* skip resolving because we resolve below from disk */);
			if (hasInMemoryEntries) {
				all.set(resource, true);
			}
		}

		// Resolve all other resources by iterating the history home folder
		try {
			const resolvedHistoryHome = await this.fileService.resolve(historyHome);
			if (resolvedHistoryHome.children) {
				const limiter = new Limiter(MAX_PARALLEL_HISTORY_IO_OPS);
				const promises = [];

				for (const child of resolvedHistoryHome.children) {
					promises.push(limiter.queue(async () => {
						if (token.isCancellationRequested) {
							return;
						}

						try {
							const serializedModel: ISerializedWorkingCopyHistoryModel = JSON.parse((await this.fileService.readFile(joinPath(child.resource, WorkingCopyHistoryModel.ENTRIES_FILE))).value.toString());
							if (serializedModel.entries.length > 0) {
								all.set(URI.parse(serializedModel.resource), true);
							}
						} catch (error) {
							// ignore - model might be missing or corrupt, but we need it
						}
					}));
				}

				await Promise.all(promises);
			}
		} catch (error) {
			// ignore - history might be entirely empty
		}

		return Array.from(all.keys());
	}

	private async getModel(resource: URI): Promise<WorkingCopyHistoryModel> {
		const historyHome = await this.localHistoryHome.p;

		let model = this.models.get(resource);
		if (!model) {
			model = new WorkingCopyHistoryModel(resource, historyHome, this._onDidAddEntry, this._onDidChangeEntry, this._onDidReplaceEntry, this._onDidRemoveEntry, this.getModelOptions(), this.fileService, this.labelService, this.logService, this.configurationService);
			this.models.set(resource, model);
		}

		return model;
	}

	protected abstract getModelOptions(): IWorkingCopyHistoryModelOptions;

}

export class NativeWorkingCopyHistoryService extends WorkingCopyHistoryService {

	private static readonly STORE_ALL_INTERVAL = 5 * 60 * 1000; // 5min

	private readonly isRemotelyStored = typeof this.environmentService.remoteAuthority === 'string';

	private readonly storeAllCts = this._register(new CancellationTokenSource());
	private readonly storeAllScheduler = this._register(new RunOnceScheduler(() => this.storeAll(this.storeAllCts.token), NativeWorkingCopyHistoryService.STORE_ALL_INTERVAL));

	constructor(
		@IFileService fileService: IFileService,
		@IRemoteAgentService remoteAgentService: IRemoteAgentService,
		@IWorkbenchEnvironmentService environmentService: IWorkbenchEnvironmentService,
		@IUriIdentityService uriIdentityService: IUriIdentityService,
		@ILabelService labelService: ILabelService,
		@ILifecycleService private readonly lifecycleService: ILifecycleService,
		@ILogService logService: ILogService,
		@IConfigurationService configurationService: IConfigurationService
	) {
		super(fileService, remoteAgentService, environmentService, uriIdentityService, labelService, logService, configurationService);

		this.registerListeners();
	}

	private registerListeners(): void {
		if (!this.isRemotelyStored) {

			// Local: persist all on shutdown
			this._register(this.lifecycleService.onWillShutdown(e => this.onWillShutdown(e)));

			// Local: schedule persist on change
			this._register(Event.any(this.onDidAddEntry, this.onDidChangeEntry, this.onDidReplaceEntry, this.onDidRemoveEntry)(() => this.onDidChangeModels()));
		}
	}

	protected getModelOptions(): IWorkingCopyHistoryModelOptions {
		return { flushOnChange: this.isRemotelyStored /* because the connection might drop anytime */ };
	}

	private onWillShutdown(e: WillShutdownEvent): void {

		// Dispose the scheduler...
		this.storeAllScheduler.dispose();
		this.storeAllCts.dispose(true);

		// ...because we now explicitly store all models
		e.join(this.storeAll(e.token), { id: 'join.workingCopyHistory', label: localize('join.workingCopyHistory', "Saving local history") });
	}

	private onDidChangeModels(): void {
		if (!this.storeAllScheduler.isScheduled()) {
			this.storeAllScheduler.schedule();
		}
	}

	private async storeAll(token: CancellationToken): Promise<void> {
		const limiter = new Limiter(MAX_PARALLEL_HISTORY_IO_OPS);
		const promises = [];

		const models = Array.from(this.models.values());
		for (const model of models) {
			promises.push(limiter.queue(async () => {
				if (token.isCancellationRequested) {
					return;
				}

				try {
					await model.store(token);
				} catch (error) {
					this.logService.trace(error);
				}
			}));
		}

		await Promise.all(promises);
	}
}

// Register History Tracker
Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).registerWorkbenchContribution(WorkingCopyHistoryTracker, LifecyclePhase.Restored);
