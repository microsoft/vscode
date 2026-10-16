/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IObservable } from '../../../../base/common/observable.js';
import { AgentHostRemoteConnectionsBackend } from '../../../../platform/agentHost/common/missionControlEnvironment.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';

export const IRemoteConnectionsService = createDecorator<IRemoteConnectionsService>('remoteConnectionsService');

/** Owns the application-local connection method preference, independently of sharing enablement. */
export interface IRemoteConnectionsService {
	readonly _serviceBrand: undefined;
	readonly backend: IObservable<AgentHostRemoteConnectionsBackend>;
	setBackend(backend: AgentHostRemoteConnectionsBackend): void;
}
