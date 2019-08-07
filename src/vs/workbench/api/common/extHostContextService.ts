/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IMainContext, IInitData } from './extHost.protocol';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';

export const IExtHostContextService = createDecorator<IExtHostContextService>('IExtHostContextService');

export interface IExtHostContextService {
	_serviceBrand: undefined;

	readonly rpc: IMainContext;
	readonly initData: IInitData;
}

export class ExtHostContextService implements IExtHostContextService {
	_serviceBrand: any;
	constructor(
		readonly rpc: IMainContext,
		readonly initData: IInitData
	) { }
}
