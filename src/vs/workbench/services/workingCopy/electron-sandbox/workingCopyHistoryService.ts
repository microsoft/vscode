/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Limiter } from 'vs/base/common/async';
import { ILifecycleService, WillShutdownEvent } from 'vs/workbench/services/lifecycle/common/lifecycle';
import { IFileService } from 'vs/platform/files/common/files';
import { IRemoteAgentService } from 'vs/workbench/services/remote/common/remoteAgentService';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IUriIdentityService } from 'vs/platform/uriIdentity/common/uriIdentity';
import { ILabelService } from 'vs/platform/label/common/label';
import { ILogService } from 'vs/platform/log/common/log';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { WorkingCopyHistoryService } from 'vs/workbench/services/workingCopy/common/workingCopyHistoryService';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { IWorkingCopyHistoryService, MAX_PARALLEL_HISTORY_IO_OPS } from 'vs/workbench/services/workingCopy/common/workingCopyHistory';

export class NativeWorkingCopyHistoryService extends WorkingCopyHistoryService {

	constructor(
		@IFileService fileService: IFileService,
		@IRemoteAgentService remoteAgentService: IRemoteAgentService,
		@IEnvironmentService environmentService: IEnvironmentService,
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
		this.lifecycleService.onWillShutdown(e => this.onWillShutdown(e));
	}

	private onWillShutdown(e: WillShutdownEvent): void {

		// Prolong shutdown for orderly model shutdown
		e.join((async () => {
			const limiter = new Limiter(MAX_PARALLEL_HISTORY_IO_OPS);
			const promises = [];

			const models = Array.from(this.models.values());
			for (const model of models) {
				promises.push(limiter.queue(async () => {
					if (e.token.isCancellationRequested) {
						return;
					}

					try {
						await model.store(e.token);
					} catch (error) {
						this.logService.trace(error);
					}
				}));
			}

			await Promise.all(promises);
		})(), 'join.workingCopyHistory');
	}
}

// Register Service
registerSingleton(IWorkingCopyHistoryService, NativeWorkingCopyHistoryService, true);
