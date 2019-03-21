/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IRemoteAgentEnvironment } from 'vs/platform/remote/common/remoteAgentEnvironment';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';

export interface IRemoteEnvironmentService {
	_serviceBrand: any;
	getEnvironment(): Promise<IRemoteAgentEnvironment | null>;
}

export const IRemoteEnvironmentService = createDecorator<IRemoteEnvironmentService>('remoteEnvironmentService');