/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { Emitter } from 'vs/base/common/event';
import { Registry } from 'vs/platform/registry/common/platform';
import { IWorkbenchContributionsRegistry, Extensions as WorkbenchExtensions } from 'vs/workbench/common/contributions';
import { LifecyclePhase } from 'vs/workbench/services/lifecycle/common/lifecycle';
import { WorkingCopyHistoryTracker } from 'vs/workbench/services/workingCopy/common/workingCopyHistoryTracker';
import { Disposable } from 'vs/base/common/lifecycle';
import { IWorkingCopyHistoryEntry, IWorkingCopyHistoryEntryDescriptor, IWorkingCopyHistoryEvent, IWorkingCopyHistoryService } from 'vs/workbench/services/workingCopy/common/workingCopyHistory';
import { FileOperationError, FileOperationResult, IFileService, IFileStatWithMetadata } from 'vs/platform/files/common/files';
import { IRemoteAgentService } from 'vs/workbench/services/remote/common/remoteAgentService';
import { URI } from 'vs/base/common/uri';
import { DeferredPromise } from 'vs/base/common/async';
import { extname, isEqual, joinPath } from 'vs/base/common/resources';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { hash } from 'vs/base/common/hash';
import { randomPath } from 'vs/base/common/extpath';
import { CancellationToken } from 'vs/base/common/cancellation';
import { ResourceMap } from 'vs/base/common/map';
import { IUriIdentityService } from 'vs/platform/uriIdentity/common/uriIdentity';
import { ILabelService } from 'vs/platform/label/common/label';
import { VSBuffer } from 'vs/base/common/buffer';
import { ILogService } from 'vs/platform/log/common/log';
import { SaveSource, SaveSourceRegistry } from 'vs/workbench/common/editor';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';

interface ISerializedWorkingCopyHistoryModel {
	readonly version: number;
	readonly resource: string;
	readonly entries: ISerializedWorkingCopyHistoryModelEntry[];
}

interface ISerializedWorkingCopyHistoryModelEntry {
	readonly id: string;
	readonly timestamp: number;
	readonly source?: SaveSource;
}

export class WorkingCopyHistoryModel {

	private static readonly SEP = /\//g;

	private static readonly ENTRIES_FILE = 'entries.json';

	private static readonly DEFAULT_ENTRY_SOURCE = SaveSourceRegistry.registerSource('default.source', localize('default.source', "File Saved"));

	private static readonly MAX_ENTRIES_SETTINGS_KEY = 'workbench.localHistory.maxFileEntries';

	private entries: IWorkingCopyHistoryEntry[] = [];

	private whenResolved: Promise<void> | undefined = undefined;

	private readonly historyEntriesFolder = joinPath(this.historyHome, hash(this.workingCopyResource.toString(true)).toString(16));
	private readonly historyEntriesListingFile = joinPath(this.historyEntriesFolder, WorkingCopyHistoryModel.ENTRIES_FILE);
	private readonly historyEntriesNameMatch = new RegExp(`[A-Za-z0-9]{4}${extname(this.workingCopyResource)}`);

	private readonly workingCopy = { resource: this.workingCopyResource, name: this.labelService.getUriBasenameLabel(this.workingCopyResource) };

	constructor(
		private readonly workingCopyResource: URI,
		private readonly historyHome: URI,
		private readonly entryAddedEmitter: Emitter<IWorkingCopyHistoryEvent>,
		private readonly entryRemovedEmitter: Emitter<IWorkingCopyHistoryEvent>,
		private readonly fileService: IFileService,
		private readonly labelService: ILabelService,
		private readonly logService: ILogService,
		private readonly configurationService: IConfigurationService
	) {
	}

	async addEntry(source = WorkingCopyHistoryModel.DEFAULT_ENTRY_SOURCE, timestamp = Date.now(), token: CancellationToken): Promise<IWorkingCopyHistoryEntry> {

		// Clone to a potentially unique location within
		// the history entries folder. The idea is to
		// execute this as fast as possible, tolerating
		// naming collisions, even though unlikely.
		const id = `${randomPath(undefined, undefined, 4)}${extname(this.workingCopyResource)}`;
		const location = joinPath(this.historyEntriesFolder, id);
		await this.fileService.cloneFile(this.workingCopyResource, location);

		// Add to list of entries
		const entry: IWorkingCopyHistoryEntry = {
			id,
			workingCopy: this.workingCopy,
			location,
			timestamp: {
				value: timestamp,
				label: this.toDateLabel(timestamp)
			},
			source
		};
		this.entries.push(entry);

		// Events
		this.entryAddedEmitter.fire({ entry });

		return entry;
	}

	private toDateLabel(timestamp: number): string {
		const date = new Date(timestamp);

		return `${date.toLocaleString().replace(WorkingCopyHistoryModel.SEP, '-')}`;
	}

	async removeEntry(entry: IWorkingCopyHistoryEntry, token: CancellationToken): Promise<boolean> {
		const index = this.entries.indexOf(entry);
		if (index === -1) {
			return false;
		}

		// Delete from disk
		await this.deleteEntry(entry);

		// Remove from model
		this.entries.splice(index, 1);

		// Events
		this.entryRemovedEmitter.fire({ entry });

		return true;
	}

	async getEntries(): Promise<readonly IWorkingCopyHistoryEntry[]> {

		// Make sure to await resolving when all entries are asked for
		await this.resolveEntriesOnce();

		// Return as many entries as configured by user settings
		const configuredMaxEntries = this.configurationService.getValue<number>(WorkingCopyHistoryModel.MAX_ENTRIES_SETTINGS_KEY, { resource: this.workingCopyResource });
		if (this.entries.length > configuredMaxEntries) {
			return this.entries.slice(this.entries.length - configuredMaxEntries);
		}

		return this.entries;
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
		this.entries = Array.from(entries.values()).sort((entryA, entryB) => entryA.timestamp.value - entryB.timestamp.value);
	}

	private async resolveEntriesFromDisk(): Promise<Map<string /* ID */, IWorkingCopyHistoryEntry>> {
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
					workingCopy: this.workingCopy,
					location: entryStat.resource,
					timestamp: {
						value: entryStat.mtime,
						label: this.toDateLabel(entryStat.mtime)
					},
					source: WorkingCopyHistoryModel.DEFAULT_ENTRY_SOURCE
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
						timestamp: {
							value: entry.timestamp,
							label: this.toDateLabel(entry.timestamp)
						},
						source: entry.source ?? existingEntry.source
					});
				}
			}
		}

		return entries;
	}

	async store(): Promise<void> {

		// Cleanup based on max-entries setting
		await this.cleanUpEntries();

		// Persist entries meta data
		await this.writeEntriesFile();
	}

	private async cleanUpEntries(): Promise<void> {

		// We can only cleanup entries when we have resolved
		// all existing entries from disk, so we need to first
		// do that if not already done.
		await this.resolveEntriesOnce();

		const configuredMaxEntries = this.configurationService.getValue<number>(WorkingCopyHistoryModel.MAX_ENTRIES_SETTINGS_KEY, { resource: this.workingCopyResource });
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
		const serializedModel: ISerializedWorkingCopyHistoryModel = {
			version: 1,
			resource: this.workingCopyResource.toString(true),
			entries: this.entries.map(entry => {
				return {
					id: entry.id,
					source: entry.source !== WorkingCopyHistoryModel.DEFAULT_ENTRY_SOURCE ? entry.source : undefined,
					timestamp: entry.timestamp.value
				};
			})
		};

		await this.fileService.writeFile(this.historyEntriesListingFile, VSBuffer.fromString(JSON.stringify(serializedModel)));
	}

	private async readEntriesFile(): Promise<ISerializedWorkingCopyHistoryModel | undefined> {
		let serializedModel: ISerializedWorkingCopyHistoryModel | undefined = undefined;
		try {
			serializedModel = JSON.parse((await this.fileService.readFile(this.historyEntriesListingFile)).value.toString());
		} catch (error) {
			if (!(error instanceof FileOperationError && error.fileOperationResult === FileOperationResult.FILE_NOT_FOUND)) {
				this.traceError(error);
			}
		}

		return serializedModel;
	}

	private async readEntriesFolder(): Promise<IFileStatWithMetadata[] | undefined> {
		let rawEntries: IFileStatWithMetadata[] | undefined = undefined;

		// Resolve children of folder on disk
		try {
			rawEntries = (await this.fileService.resolve(this.historyEntriesFolder, { resolveMetadata: true })).children;
		} catch (error) {
			if (!(error instanceof FileOperationError && error.fileOperationResult === FileOperationResult.FILE_NOT_FOUND)) {
				this.traceError(error);
			}
		}

		if (!rawEntries) {
			return undefined;
		}

		// Skip entries that do not seem to have valid file name
		return rawEntries.filter(entry =>
			!isEqual(entry.resource, this.historyEntriesListingFile) && // not the listings file
			this.historyEntriesNameMatch.test(entry.name)				// matching our expected file pattern for entries
		);
	}

	private traceError(error: Error): void {
		this.logService.trace('[Working Copy History Service]', error);
	}
}

export abstract class WorkingCopyHistoryService extends Disposable implements IWorkingCopyHistoryService {

	declare readonly _serviceBrand: undefined;

	protected readonly _onDidAddEntry = this._register(new Emitter<IWorkingCopyHistoryEvent>());
	readonly onDidAddEntry = this._onDidAddEntry.event;

	protected readonly _onDidRemoveEntry = this._register(new Emitter<IWorkingCopyHistoryEvent>());
	readonly onDidRemoveEntry = this._onDidRemoveEntry.event;

	private readonly localHistoryHome = new DeferredPromise<URI>();

	protected readonly models = new ResourceMap<WorkingCopyHistoryModel>(resource => this.uriIdentityService.extUri.getComparisonKey(resource));

	constructor(
		@IFileService protected readonly fileService: IFileService,
		@IRemoteAgentService protected readonly remoteAgentService: IRemoteAgentService,
		@IEnvironmentService protected readonly environmentService: IEnvironmentService,
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
		return model.addEntry(source, timestamp, token);
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

	async getEntries(resource: URI, token: CancellationToken): Promise<readonly IWorkingCopyHistoryEntry[]> {
		const model = await this.getModel(resource);
		if (token.isCancellationRequested) {
			return [];
		}

		const entries = await model.getEntries();
		return entries ?? [];
	}

	private async getModel(resource: URI): Promise<WorkingCopyHistoryModel> {
		const historyHome = await this.localHistoryHome.p;

		let model = this.models.get(resource);
		if (!model) {
			model = this.createModel(resource, historyHome);
			this.models.set(resource, model);
		}

		return model;
	}

	protected createModel(resource: URI, historyHome: URI): WorkingCopyHistoryModel {
		return new WorkingCopyHistoryModel(resource, historyHome, this._onDidAddEntry, this._onDidRemoveEntry, this.fileService, this.labelService, this.logService, this.configurationService);
	}
}

// Register History Tracker
Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).registerWorkbenchContribution(WorkingCopyHistoryTracker, LifecyclePhase.Restored);
