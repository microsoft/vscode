/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
//
import { IUserDataSyncService, IUserDataSyncLogService, IUserDataSyncResourceEnablementService, IUserDataSyncStoreService, IUserDataSyncStoreManagementService, IUserDataAutoSyncEnablementService } from 'vs/platform/userDataSync/common/userDataSync';
import { Event } from 'vs/base/common/event';
import { INativeHostService } from 'vs/platform/native/electron-sandbox/native';
import { UserDataAutoSyncService as BaseUserDataAutoSyncService } from 'vs/platform/userDataSync/common/userDataAutoSyncService';
import { IUserDataSyncAccountService } from 'vs/platform/userDataSync/common/userDataSyncAccount';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { IUserDataSyncMachinesService } from 'vs/platform/userDataSync/common/userDataSyncMachines';
import { IProductService } from 'vs/platform/product/common/productService';

export class UserDataAutoSyncService extends BaseUserDataAutoSyncService {

	constructor(
		@IProductService productService: IProductService,
		@IUserDataSyncStoreManagementService userDataSyncStoreManagementService: IUserDataSyncStoreManagementService,
		@IUserDataSyncStoreService userDataSyncStoreService: IUserDataSyncStoreService,
		@IUserDataSyncResourceEnablementService userDataSyncResourceEnablementService: IUserDataSyncResourceEnablementService,
		@IUserDataSyncService userDataSyncService: IUserDataSyncService,
		@INativeHostService nativeHostService: INativeHostService,
		@IUserDataSyncLogService logService: IUserDataSyncLogService,
		@IUserDataSyncAccountService authTokenService: IUserDataSyncAccountService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IUserDataSyncMachinesService userDataSyncMachinesService: IUserDataSyncMachinesService,
		@IStorageService storageService: IStorageService,
		@IUserDataAutoSyncEnablementService userDataAutoSyncEnablementService: IUserDataAutoSyncEnablementService,
	) {
		super(productService, userDataSyncStoreManagementService, userDataSyncStoreService, userDataSyncResourceEnablementService, userDataSyncService, logService, authTokenService, telemetryService, userDataSyncMachinesService, storageService, userDataAutoSyncEnablementService);

		this._register(Event.debounce<string, string[]>(Event.any<string>(
			Event.map(nativeHostService.onDidFocusWindow, () => 'windowFocus'),
			Event.map(nativeHostService.onDidOpenWindow, () => 'windowOpen'),
		), (last, source) => last ? [...last, source] : [source], 1000)(sources => this.triggerSync(sources, true, false)));
	}

}
