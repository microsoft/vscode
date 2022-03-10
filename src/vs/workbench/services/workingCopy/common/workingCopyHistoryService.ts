/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { Emitter } from 'vs/base/common/event';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { Registry } from 'vs/platform/registry/common/platform';
import { IWorkbenchContributionsRegistry, Extensions as WorkbenchExtensions } from 'vs/workbench/common/contributions';
import { LifecyclePhase } from 'vs/workbench/services/lifecycle/common/lifecycle';
import { WorkingCopyHistoryTracker } from 'vs/workbench/services/workingCopy/common/workingCopyHistoryTracker';
import { Disposable } from 'vs/base/common/lifecycle';
import { IWorkingCopyHistoryEntry, IWorkingCopyHistoryEvent, IWorkingCopyHistoryService } from 'vs/workbench/services/workingCopy/common/workingCopyHistory';
import { IFileService, IFileStatWithMetadata } from 'vs/platform/files/common/files';
import { IWorkingCopy } from 'vs/workbench/services/workingCopy/common/workingCopy';
import { IRemoteAgentService } from 'vs/workbench/services/remote/common/remoteAgentService';
import { URI } from 'vs/base/common/uri';
import { DeferredPromise } from 'vs/base/common/async';
import { extname, joinPath } from 'vs/base/common/resources';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { hash } from 'vs/base/common/hash';
import { randomPath } from 'vs/base/common/extpath';
import { CancellationToken } from 'vs/base/common/cancellation';
import { ResourceMap } from 'vs/base/common/map';
import { IUriIdentityService } from 'vs/platform/uriIdentity/common/uriIdentity';
import { ILabelService } from 'vs/platform/label/common/label';

class WorkingCopyHistoryModel {

	private entries: IWorkingCopyHistoryEntry[] = [];

	private whenResolved: Promise<void> | undefined = undefined;

	private historyEntriesFolder: URI;

	private workingCopyResource: URI;
	private workingCopyName: string;

	constructor(
		workingCopyResource: URI,
		historyHome: URI,
		private readonly fileService: IFileService,
		labelService: ILabelService
	) {
		this.workingCopyResource = workingCopyResource;
		this.workingCopyName = labelService.getUriBasenameLabel(workingCopyResource);

		this.historyEntriesFolder = joinPath(historyHome, hash(workingCopyResource.toString(true)).toString(16));
	}

	async addEntry(): Promise<IWorkingCopyHistoryEntry> {

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
			workingCopy: {
				resource: this.workingCopyResource,
				name: this.workingCopyName
			},
			location,
			timestamp: Date.now(),
			label: this.toEntryLabel(Date.now()),
			description: localize('historyEntryDescription', "File Saved")
		};
		this.entries.push(entry);

		return entry;
	}

	async getEntries(): Promise<readonly IWorkingCopyHistoryEntry[]> {

		// Make sure to await resolving when
		// all entries are asked for
		if (!this.whenResolved) {
			this.whenResolved = this.resolveEntries();
		}
		await this.whenResolved;

		return this.entries;
	}

	private async resolveEntries(): Promise<void> {
		let rawEntries: IFileStatWithMetadata[] | undefined = undefined;

		// Resolve children of folder on disk
		try {
			rawEntries = (await this.fileService.resolve(this.historyEntriesFolder, { resolveMetadata: true })).children;
		} catch (error) {
			// ignore - folder might not exist
		}

		if (!Array.isArray(rawEntries)) {
			return;
		}

		// Convert each child to history entry
		// sorted by modification time
		this.entries = rawEntries
			.sort((entryA, entryB) => entryA.mtime - entryB.mtime)
			.map(entry => ({
				id: entry.name,
				workingCopy: {
					resource: this.workingCopyResource,
					name: this.workingCopyName
				},
				location: entry.resource,
				timestamp: entry.mtime,
				label: this.toEntryLabel(entry.mtime),
				description: localize('historyEntryDescription', "File Saved")
			}));
	}

	private toEntryLabel(timestamp: number): string {
		const date = new Date(timestamp);

		return `${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;
	}
}

export class WorkingCopyHistoryService extends Disposable implements IWorkingCopyHistoryService {

	declare readonly _serviceBrand: undefined;

	private readonly _onDidAddEntry = this._register(new Emitter<IWorkingCopyHistoryEvent>());
	readonly onDidAddEntry = this._onDidAddEntry.event;

	private readonly localHistoryHome = new DeferredPromise<URI>();

	private readonly models = new ResourceMap<WorkingCopyHistoryModel>(resource => this.uriIdentityService.extUri.getComparisonKey(resource));

	constructor(
		@IFileService private readonly fileService: IFileService,
		@IRemoteAgentService private readonly remoteAgentService: IRemoteAgentService,
		@IEnvironmentService private readonly environmentService: IEnvironmentService,
		@IUriIdentityService private readonly uriIdentityService: IUriIdentityService,
		@ILabelService private readonly labelService: ILabelService
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
			// ignore and fallback to local
		}

		// But fallback to local if there is no remote
		if (!historyHome) {
			historyHome = this.environmentService.localHistoryHome;
		}

		this.localHistoryHome.complete(historyHome);
	}

	async addEntry(workingCopy: IWorkingCopy, token: CancellationToken): Promise<IWorkingCopyHistoryEntry | undefined> {
		if (!this.fileService.hasProvider(workingCopy.resource)) {
			return undefined; // we require the working copy resource to be file service accessible
		}

		// Resolve history model for working copy
		const model = await this.getModel(workingCopy.resource);
		if (token.isCancellationRequested) {
			return undefined;
		}

		// Add to model
		const entry = await model.addEntry();

		// Events
		this._onDidAddEntry.fire({ entry });

		return entry;
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
			model = new WorkingCopyHistoryModel(resource, historyHome, this.fileService, this.labelService);
			this.models.set(resource, model);
		}

		return model;
	}
}

// Register Service
registerSingleton(IWorkingCopyHistoryService, WorkingCopyHistoryService, true);

// Register History Tracker
Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).registerWorkbenchContribution(WorkingCopyHistoryTracker, LifecyclePhase.Restored);
