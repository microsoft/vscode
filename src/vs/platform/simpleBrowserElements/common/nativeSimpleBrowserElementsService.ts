/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ProxyChannel } from '../../../base/parts/ipc/common/ipc.js';
import { IMainProcessService } from '../../ipc/common/mainProcessService.js';
import { INativeSimpleBrowserElementsService } from './simpleBrowserElements.js';

// @ts-ignore: interface is implemented via proxy
export class NativeSimpleBrowserElementsService implements INativeSimpleBrowserElementsService {

	declare readonly _serviceBrand: undefined;

	constructor(
		readonly windowId: number,
		@IMainProcessService mainProcessService: IMainProcessService
	) {
		return ProxyChannel.toService<INativeSimpleBrowserElementsService>(mainProcessService.getChannel('simpleBrowserElements'), {
			context: windowId,
			properties: (() => {
				const properties = new Map<string, unknown>();
				properties.set('windowId', windowId);

				return properties;
			})()
		});
	}
}

