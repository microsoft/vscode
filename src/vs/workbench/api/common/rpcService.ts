/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IMainContext } from 'vs/workbench/api/common/extHost.protocol';
import { ProxyIdentifier } from 'vs/workbench/services/extensions/common/proxyIdentifier';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';

export const IExtHostRpcService = createDecorator<IExtHostRpcService>('IExtHostRpcService');

export interface IExtHostRpcService {
	_serviceBrand: any;
	getProxy<T>(identifier: ProxyIdentifier<T>): T;
}

export class ExtHostRpcService implements IExtHostRpcService {
	readonly _serviceBrand: any;

	constructor(private readonly _mainContext: IMainContext) { }

	getProxy<T>(identifier: ProxyIdentifier<T>): T {
		return this._mainContext.getProxy(identifier);
	}
}
