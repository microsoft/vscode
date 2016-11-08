/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';

export const ILogService = createDecorator<ILogService>('logService');

export interface ILogService {
	_serviceBrand: any;
	log(...args: any[]): void;
}

export class MainLogService implements ILogService {

	_serviceBrand: any;

	constructor( @IEnvironmentService private environmentService: IEnvironmentService) {
	}

	log(...args: any[]): void {
		if (this.environmentService.verbose) {
			console.log(`\x1b[93m[main ${new Date().toLocaleTimeString()}]\x1b[0m`, ...args);
		}
	}
}