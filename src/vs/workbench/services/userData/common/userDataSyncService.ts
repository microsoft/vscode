/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IUserDataSyncService, IUserDataProviderService, IUserDataExtension } from 'vs/workbench/services/userData/common/userData';
import { Disposable } from 'vs/base/common/lifecycle';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';

export class UserDataSyncService extends Disposable implements IUserDataSyncService {

	_serviceBrand: any;

	constructor(
		@IUserDataProviderService private readonly userDataProviderService: IUserDataProviderService
	) {
		super();
	}

	synchronise(): Promise<void> {
		return Promise.resolve();
	}

	getExtensions(): Promise<IUserDataExtension[]> {
		return Promise.resolve([]);
	}

}

registerSingleton(IUserDataSyncService, UserDataSyncService);
