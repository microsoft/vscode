/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IStorageService } from '../../storage/common/storage';
import { ILogService } from '../../log/common/log';
import { IUserDataProfilesService } from '../common/userDataProfile';
import { IMainProcessService } from '../../ipc/common/mainProcessService';
import { RemoteUserDataProfileStorageService } from '../common/userDataProfileStorageService';

export class SharedProcessUserDataProfileStorageService extends RemoteUserDataProfileStorageService {

	constructor(
		@IMainProcessService mainProcessService: IMainProcessService,
		@IUserDataProfilesService userDataProfilesService: IUserDataProfilesService,
		@IStorageService storageService: IStorageService,
		@ILogService logService: ILogService,
	) {
		super(true, mainProcessService, userDataProfilesService, storageService, logService);
	}
}
