/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { ICommonPtyService } from 'vs/platform/terminal/common/terminal';

export const IPtyMainService = createDecorator<IPtyMainService>('ptyMainService');

export interface IPtyMainService extends ICommonPtyService { }

export class PtyMainService implements ICommonPtyService {
	declare readonly _serviceBrand: undefined;

	// TODO: Remove test function
	async test(): Promise<void> {
		console.log('PtyMainService#test');
	}
}
