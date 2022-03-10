/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { Registry } from 'vs/platform/registry/common/platform';
import { IWorkbenchContributionsRegistry, Extensions as WorkbenchExtensions } from 'vs/workbench/common/contributions';
import { LifecyclePhase } from 'vs/workbench/services/lifecycle/common/lifecycle';
import { WorkingCopyHistoryTracker } from 'vs/workbench/services/workingCopy/common/workingCopyHistoryTracker';
import { Disposable } from 'vs/base/common/lifecycle';
import { IWorkingCopyHistoryService } from 'vs/workbench/services/workingCopy/common/workingCopyHistory';
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

export class WorkingCopyHistoryService extends Disposable implements IWorkingCopyHistoryService {

	declare readonly _serviceBrand: undefined;

	private readonly localHistoryHome = new DeferredPromise<URI>();

	constructor(
		@IFileService private readonly fileService: IFileService,
		@IRemoteAgentService private readonly remoteAgentService: IRemoteAgentService,
		@IEnvironmentService private readonly environmentService: IEnvironmentService
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

		return joinPath(historyHome, hash(workingCopy.resource.toString()).toString(16));
	}

	async addEntry(workingCopy: IWorkingCopy, token: CancellationToken): Promise<URI | undefined> {
		if (!this.fileService.hasProvider(workingCopy.resource)) {
			return undefined; // we require the working copy resource to be file service accessible
		}

		const workingCopyHistoryHome = await this.resolveWorkingCopyLocalHistoryHome(workingCopy);

		if (token.isCancellationRequested) {
			return undefined;
		}

		const target = joinPath(workingCopyHistoryHome, `${randomPath(undefined, undefined, 4)}${extname(workingCopy.resource)}`);
		await this.fileService.cloneFile(workingCopy.resource, target);

		return target;
	}
}

// Register Service
registerSingleton(IWorkingCopyHistoryService, WorkingCopyHistoryService, true);

// Register History Tracker
Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).registerWorkbenchContribution(WorkingCopyHistoryTracker, LifecyclePhase.Restored);
