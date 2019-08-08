/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IMainContext } from 'vs/workbench/api/common/extHost.protocol';
import { ProxyIdentifier } from 'vs/workbench/services/extensions/common/proxyIdentifier';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';

export const IExtHostRpcService = createDecorator<IExtHostRpcService>('IExtHostRpcService');

export interface IExtHostRpcService extends IMainContext {
	_serviceBrand: any;
}

export class ExtHostRpcService implements IExtHostRpcService {
	readonly _serviceBrand: any;

	getProxy: <T>(identifier: ProxyIdentifier<T>) => T;
	set: <T, R extends T> (identifier: ProxyIdentifier<T>, instance: R) => R;
	assertRegistered: (identifiers: ProxyIdentifier<any>[]) => void;

	constructor(mainContext: IMainContext) {
		this.getProxy = mainContext.getProxy.bind(mainContext);
		this.set = mainContext.set.bind(mainContext);
		this.assertRegistered = mainContext.assertRegistered.bind(mainContext);

	}

}
