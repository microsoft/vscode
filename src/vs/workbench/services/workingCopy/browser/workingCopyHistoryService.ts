/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IFileService } from '../../../../platform/files/common/files';
import { IRemoteAgentService } from '../../remote/common/remoteAgentService';
import { IWorkbenchEnvironmentService } from '../../environment/common/environmentService';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity';
import { ILabelService } from '../../../../platform/label/common/label';
import { ILogService } from '../../../../platform/log/common/log';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration';
import { IWorkingCopyHistoryModelOptions, WorkingCopyHistoryService } from '../common/workingCopyHistoryService';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions';
import { IWorkingCopyHistoryService } from '../common/workingCopyHistory';

export class BrowserWorkingCopyHistoryService extends WorkingCopyHistoryService {

	constructor(
		@IFileService fileService: IFileService,
		@IRemoteAgentService remoteAgentService: IRemoteAgentService,
		@IWorkbenchEnvironmentService environmentService: IWorkbenchEnvironmentService,
		@IUriIdentityService uriIdentityService: IUriIdentityService,
		@ILabelService labelService: ILabelService,
		@ILogService logService: ILogService,
		@IConfigurationService configurationService: IConfigurationService
	) {
		super(fileService, remoteAgentService, environmentService, uriIdentityService, labelService, logService, configurationService);
	}

	protected getModelOptions(): IWorkingCopyHistoryModelOptions {
		return { flushOnChange: true /* because browsers support no long running shutdown */ };
	}
}

// Register Service
registerSingleton(IWorkingCopyHistoryService, BrowserWorkingCopyHistoryService, InstantiationType.Delayed);
