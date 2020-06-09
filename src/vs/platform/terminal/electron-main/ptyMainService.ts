/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { ICommonPtyService } from 'vs/platform/terminal/common/terminal';

export interface IPtyMainService extends ICommonPtyService { }

export const IPtyMainService = createDecorator<IPtyMainService>('ptyMainService');

export class PtyMainService implements IPtyMainService {
	declare readonly _serviceBrand: undefined;

	constructor() {
	}

	async createInstance(): Promise<string> {
		console.log('ptyMainService#createInstance');
		return 'hello';
		// e.sender.send('vscode:terminalCreateResponse', 'test');
	}
}
