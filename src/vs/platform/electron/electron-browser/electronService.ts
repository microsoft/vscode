/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IMainProcessService } from 'vs/platform/ipc/electron-browser/mainProcessService';

export class ElectronService {

	_serviceBrand: undefined;

	constructor(@IMainProcessService mainProcessService: IMainProcessService) {
		const channel = mainProcessService.getChannel('electron');

		// Proxy: forward any property access to the channel
		return new Proxy({}, {
			get(_target, propKey, _receiver) {
				if (typeof propKey === 'string') {
					return function (...args: any[]) {
						return channel.call(propKey, ...args);
					};
				}

				throw new Error(`Not Implemented in ElectronService: ${String(propKey)}`);
			}
		}) as ElectronService;
	}
}
