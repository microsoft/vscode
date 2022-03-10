/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from 'vs/base/common/event';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { Registry } from 'vs/platform/registry/common/platform';
import { IWorkbenchContributionsRegistry, Extensions as WorkbenchExtensions } from 'vs/workbench/common/contributions';
import { LifecyclePhase } from 'vs/workbench/services/lifecycle/common/lifecycle';
import { WorkingCopyHistoryTracker } from 'vs/workbench/services/workingCopy/common/workingCopyHistoryTracker';
import { Disposable } from 'vs/base/common/lifecycle';
import { IWorkingCopyHistoryEntry, IWorkingCopyHistoryEvent, IWorkingCopyHistoryService } from 'vs/workbench/services/workingCopy/common/workingCopyHistory';
import { IFileService } from 'vs/platform/files/common/files';
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

class WorkingCopyHistoryModel {

	private readonly entries: IWorkingCopyHistoryEntry[] = [];

	addEntry(id: string, workingCopy: IWorkingCopy, location: URI, label?: string): IWorkingCopyHistoryEntry {
		const entry: IWorkingCopyHistoryEntry = {
			id,
			resource: workingCopy.resource,
			location,
			label,
			timestamp: Date.now()
		};
		this.entries.push(entry);

		return entry;
	}

	getEntries(): readonly IWorkingCopyHistoryEntry[] {
		return this.entries;
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
		@IUriIdentityService private readonly uriIdentityService: IUriIdentityService
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

	private async resolveWorkingCopyLocalHistoryHome(workingCopy: IWorkingCopy): Promise<URI> {
		const historyHome = await this.localHistoryHome.p;

		return joinPath(historyHome, hash(workingCopy.resource.toString(true)).toString(16));
	}

	async addEntry(workingCopy: IWorkingCopy, token: CancellationToken): Promise<IWorkingCopyHistoryEntry | undefined> {
		if (!this.fileService.hasProvider(workingCopy.resource)) {
			return undefined; // we require the working copy resource to be file service accessible
		}

		const workingCopyHistoryHome = await this.resolveWorkingCopyLocalHistoryHome(workingCopy);

		if (token.isCancellationRequested) {
			return undefined;
		}

		// Clone to a potentially unique location
		const entryId = `${randomPath(undefined, undefined, 4)}${extname(workingCopy.resource)}`;
		const target = joinPath(workingCopyHistoryHome, entryId);
		await this.fileService.cloneFile(workingCopy.resource, target);

		// Add to model
		let model = this.models.get(workingCopy.resource);
		if (!model) {
			model = new WorkingCopyHistoryModel();
			this.models.set(workingCopy.resource, model);
		}
		const entry = model.addEntry(entryId, workingCopy, target);

		// Events
		this._onDidAddEntry.fire({ entry });

		return entry;
	}

	async getEntries(resource: URI, token: CancellationToken): Promise<readonly IWorkingCopyHistoryEntry[]> {
		const model = this.models.get(resource);

		return model?.getEntries() ?? [];
	}
}

// Register Service
registerSingleton(IWorkingCopyHistoryService, WorkingCopyHistoryService, true);

// Register History Tracker
Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).registerWorkbenchContribution(WorkingCopyHistoryTracker, LifecyclePhase.Restored);
