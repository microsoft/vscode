/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from 'vs/platform/instantiation/common/instantiation';

export const IRemoteAgentService = createDecorator<IRemoteAgentService>('remoteAgentService');

export interface IRemoteAgentService {
	_serviceBrand: any;

	getConnection(): object;
}

export class SimpleRemoteAgentService implements IRemoteAgentService {

	_serviceBrand: any;

	getConnection(): object {
		return undefined;
	}
}