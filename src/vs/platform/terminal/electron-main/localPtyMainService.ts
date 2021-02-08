/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { ICommonLocalPtyService } from 'vs/platform/terminal/common/terminal';

export const ILocalPtyMainService = createDecorator<ILocalPtyMainService>('localPtyMainService');

export interface ILocalPtyMainService extends ICommonLocalPtyService { }

export class LocalPtyMainService implements ICommonLocalPtyService {
	declare readonly _serviceBrand: undefined;

	// TODO: Remove test function
	async test(): Promise<void> {
		console.log('PtyMainService#test');
	}
}
