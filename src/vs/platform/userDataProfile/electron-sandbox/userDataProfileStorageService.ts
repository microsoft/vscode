/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IUserDataProfileStorageService, RemoteUserDataProfileStorageService } from 'vs/platform/userDataProfile/common/userDataProfileStorageService';
import { InstantiationType, registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { ILogService } from 'vs/platform/log/common/log';
import { IUserDataProfilesService } from 'vs/platform/userDataProfile/common/userDataProfile';
import { IMainProcessService } from 'vs/platform/ipc/common/mainProcessService';

export class NativeUserDataProfileStorageService extends RemoteUserDataProfileStorageService {

	constructor(
		@IMainProcessService mainProcessService: IMainProcessService,
		@IUserDataProfilesService userDataProfilesService: IUserDataProfilesService,
		@IStorageService storageService: IStorageService,
		@ILogService logService: ILogService,
	) {
		super(false, mainProcessService, userDataProfilesService, storageService, logService);
	}
}

registerSingleton(IUserDataProfileStorageService, NativeUserDataProfileStorageService, InstantiationType.Delayed);
