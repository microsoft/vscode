/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IEnvService } from 'vs/code/electron-main/env';

export const ILogService = createDecorator<ILogService>('logService');

export interface ILogService {
	_serviceBrand: any;
	log(...args: any[]): void;
}

export class MainLogService implements ILogService {

	_serviceBrand: any;

	constructor(@IEnvService private envService: IEnvService) {
	}

	log(...args: any[]): void {
		const { verbose } = this.envService.cliArgs;

		if (verbose) {
			console.log(`(${new Date().toLocaleTimeString()})`, ...args);
		}
	}
}