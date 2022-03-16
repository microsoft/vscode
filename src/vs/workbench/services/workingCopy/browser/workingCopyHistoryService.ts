/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from 'vs/base/common/uri';
import { SaveSource } from 'vs/workbench/common/editor';
import { CancellationToken } from 'vs/base/common/cancellation';
import { IFileService } from 'vs/platform/files/common/files';
import { IRemoteAgentService } from 'vs/workbench/services/remote/common/remoteAgentService';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IUriIdentityService } from 'vs/platform/uriIdentity/common/uriIdentity';
import { ILabelService } from 'vs/platform/label/common/label';
import { ILogService } from 'vs/platform/log/common/log';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { WorkingCopyHistoryModel, WorkingCopyHistoryService } from 'vs/workbench/services/workingCopy/common/workingCopyHistoryService';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { IWorkingCopyHistoryEntry, IWorkingCopyHistoryService } from 'vs/workbench/services/workingCopy/common/workingCopyHistory';

class BrowserWorkingCopyHistoryModel extends WorkingCopyHistoryModel {

	override async addEntry(source: SaveSource, timestamp: number, token: CancellationToken): Promise<IWorkingCopyHistoryEntry> {
		const entry = await super.addEntry(source, timestamp, token);
		if (!token.isCancellationRequested) {
			await this.store(); // need to store on each add because we do not have long running shutdown support in web
		}

		return entry;
	}

	override async removeEntry(entry: IWorkingCopyHistoryEntry, token: CancellationToken): Promise<boolean> {
		const removed = await super.removeEntry(entry, token);
		if (removed && !token.isCancellationRequested) {
			await this.store(); // need to store on each remove because we do not have long running shutdown support in web
		}

		return removed;
	}
}

export class BrowserWorkingCopyHistoryService extends WorkingCopyHistoryService {

	constructor(
		@IFileService fileService: IFileService,
		@IRemoteAgentService remoteAgentService: IRemoteAgentService,
		@IEnvironmentService environmentService: IEnvironmentService,
		@IUriIdentityService uriIdentityService: IUriIdentityService,
		@ILabelService labelService: ILabelService,
		@ILogService logService: ILogService,
		@IConfigurationService configurationService: IConfigurationService
	) {
		super(fileService, remoteAgentService, environmentService, uriIdentityService, labelService, logService, configurationService);
	}

	protected override createModel(resource: URI, historyHome: URI): WorkingCopyHistoryModel {
		return new BrowserWorkingCopyHistoryModel(resource, historyHome, this._onDidAddEntry, this._onDidRemoveEntry, this.fileService, this.labelService, this.logService, this.configurationService);
	}
}

// Register Service
registerSingleton(IWorkingCopyHistoryService, BrowserWorkingCopyHistoryService, true);
