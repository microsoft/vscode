/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { ILogService, setGlobalLogService } from 'vs/platform/log/common/log';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';

export class SpdLogService implements ILogService {

	_serviceBrand: any;

	constructor(
		processName: string,
		setGlobal: boolean,
		@IEnvironmentService environmentService: IEnvironmentService
	) {
		// TODO create logger

		if (setGlobal) {
			setGlobalLogService(this);
		}
	}

	trace(message: string, ...args: any[]): void {
		// throw new Error('Method not implemented.');
	}

	debug(message: string, ...args: any[]): void {
		// throw new Error('Method not implemented.');
	}

	info(message: string, ...args: any[]): void {
		// throw new Error('Method not implemented.');
	}

	warn(message: string, ...args: any[]): void {
		// throw new Error('Method not implemented.');
	}

	error(message: string | Error, ...args: any[]): void {
		// throw new Error('Method not implemented.');
	}

	critical(message: string, ...args: any[]): void {
		// throw new Error('Method not implemented.');
	}
}