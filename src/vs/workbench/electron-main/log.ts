/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import {ServiceIdentifier, createDecorator} from 'vs/platform/instantiation/common/instantiation';
import {IEnvService} from './env';

export const ILogService = createDecorator<ILogService>('logService');

export interface ILogService {
	serviceId: ServiceIdentifier<any>;
	log(... args: any[]): void;
}

export class MainLogService implements ILogService {

	serviceId = ILogService;

	constructor(@IEnvService private envService: IEnvService) {

	}

	log(...args: any[]): void {
		const { cliArgs } = this.envService.getEnv();

		if (cliArgs.verboseLogging) {
			console.log.call(null, `(${new Date().toLocaleTimeString()})`, ...args);
		}
	}
}