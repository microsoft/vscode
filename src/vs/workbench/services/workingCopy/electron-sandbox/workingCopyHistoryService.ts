/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { Event } from 'vs/base/common/event';
import { Limiter, RunOnceScheduler } from 'vs/base/common/async';
import { ILifecycleService, WillShutdownEvent } from 'vs/workbench/services/lifecycle/common/lifecycle';
import { IFileService } from 'vs/platform/files/common/files';
import { IRemoteAgentService } from 'vs/workbench/services/remote/common/remoteAgentService';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';
import { IUriIdentityService } from 'vs/platform/uriIdentity/common/uriIdentity';
import { ILabelService } from 'vs/platform/label/common/label';
import { ILogService } from 'vs/platform/log/common/log';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IWorkingCopyHistoryModelOptions, WorkingCopyHistoryService } from 'vs/workbench/services/workingCopy/common/workingCopyHistoryService';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { IWorkingCopyHistoryService, MAX_PARALLEL_HISTORY_IO_OPS } from 'vs/workbench/services/workingCopy/common/workingCopyHistory';
import { CancellationToken, CancellationTokenSource } from 'vs/base/common/cancellation';

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
			this.lifecycleService.onWillShutdown(e => this.onWillShutdown(e));

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

// Register Service
registerSingleton(IWorkingCopyHistoryService, NativeWorkingCopyHistoryService, true);
