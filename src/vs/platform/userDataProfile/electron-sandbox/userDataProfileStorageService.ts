/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IUserDataProfileStorageService, RemoteUserDataProfileStorageService } from '../common/userDataProfileStorageService';
import { InstantiationType, registerSingleton } from '../../instantiation/common/extensions';
import { IStorageService } from '../../storage/common/storage';
import { ILogService } from '../../log/common/log';
import { IUserDataProfilesService } from '../common/userDataProfile';
import { IMainProcessService } from '../../ipc/common/mainProcessService';

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
