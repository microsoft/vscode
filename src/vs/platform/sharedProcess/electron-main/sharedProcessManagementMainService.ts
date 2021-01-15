/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { ISharedProcess } from 'vs/platform/sharedProcess/node/sharedProcess';
import { ISharedProcessManagementService } from 'vs/platform/sharedProcess/common/sharedProcessManagement';

export const ISharedProcessManagementMainService = createDecorator<ISharedProcessManagementMainService>('sharedProcessManagementMainService');

export interface ISharedProcessManagementMainService extends ISharedProcessManagementService { }

export class SharedProcessManagementMainService implements ISharedProcessManagementMainService {

	declare readonly _serviceBrand: undefined;

	constructor(private sharedProcess: ISharedProcess) { }

	whenReady(): Promise<void> {
		return this.sharedProcess.whenReady();
	}

	async toggleWindow(): Promise<void> {
		return this.sharedProcess.toggle();
	}
}
