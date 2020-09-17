/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { ICommonNativeHostService } from 'vs/platform/native/common/native';
import { IMainProcessService } from 'vs/platform/ipc/electron-sandbox/mainProcessService';
import { createChannelSender } from 'vs/base/parts/ipc/common/ipc';

export const INativeHostService = createDecorator<INativeHostService>('nativeHostService');

export interface INativeHostService extends ICommonNativeHostService { }

// @ts-ignore: interface is implemented via proxy
export class NativeHostService implements INativeHostService {

	declare readonly _serviceBrand: undefined;

	constructor(
		readonly windowId: number,
		@IMainProcessService mainProcessService: IMainProcessService
	) {
		return createChannelSender<INativeHostService>(mainProcessService.getChannel('nativeHost'), {
			context: windowId,
			properties: (() => {
				const properties = new Map<string, unknown>();
				properties.set('windowId', windowId);

				return properties;
			})()
		});
	}
}
