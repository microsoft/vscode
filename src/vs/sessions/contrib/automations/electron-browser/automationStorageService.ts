/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IChannel } from '../../../../base/parts/ipc/common/ipc.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IMainProcessService } from '../../../../platform/ipc/common/mainProcessService.js';
import { IBaseSerializableStorageRequest, ISerializableCompareAndSwapRequest, ISerializableCompareAndSwapResult, ISerializableGetValueRequest } from '../../../../platform/storage/common/storageIpc.js';
import { AUTOMATION_STORAGE_KEY, IAutomationStorageCompareAndSwapResult, IAutomationStorageService } from '../common/automationStorageService.js';

const baseRequest: IBaseSerializableStorageRequest = {
	profile: undefined,
	workspace: undefined,
};

class NativeAutomationStorageService implements IAutomationStorageService {

	declare readonly _serviceBrand: undefined;

	private readonly channel: IChannel;

	constructor(
		@IMainProcessService mainProcessService: IMainProcessService,
	) {
		this.channel = mainProcessService.getChannel('storage');
	}

	read(): Promise<string | undefined> {
		const request: ISerializableGetValueRequest = {
			...baseRequest,
			key: AUTOMATION_STORAGE_KEY,
		};
		return this.channel.call('getValue', request);
	}

	compareAndSwap(expectedValue: string | undefined, newValue: string): Promise<IAutomationStorageCompareAndSwapResult> {
		const request: ISerializableCompareAndSwapRequest = {
			...baseRequest,
			key: AUTOMATION_STORAGE_KEY,
			expectedValue,
			newValue,
		};
		return this.channel.call<ISerializableCompareAndSwapResult>('compareAndSwap', request);
	}
}

registerSingleton(IAutomationStorageService, NativeAutomationStorageService, InstantiationType.Delayed);
