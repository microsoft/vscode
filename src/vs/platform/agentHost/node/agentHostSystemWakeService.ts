/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { observableValue, type IObservable } from '../../../base/common/observable.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';

export const IAgentHostSystemWakeService = createDecorator<IAgentHostSystemWakeService>('agentHostSystemWakeService');

/**
 * Tracks whether the machine running this Agent Host is fully awake. It is not
 * fully awake while it sleeps or during a background maintenance wake (macOS
 * dark wake), when work the host starts stalls as soon as the machine sleeps
 * again.
 *
 * The local client process that owns the host reports transitions. Hosts
 * without a reporter, such as remote hosts, are always fully awake.
 */
export interface IAgentHostSystemWakeService {
	readonly _serviceBrand: undefined;
	readonly isFullyAwake: IObservable<boolean>;
	setFullyAwake(fullyAwake: boolean): void;
}

export class AgentHostSystemWakeService implements IAgentHostSystemWakeService {
	declare readonly _serviceBrand: undefined;

	private readonly _isFullyAwake = observableValue<boolean>(this, true);
	readonly isFullyAwake: IObservable<boolean> = this._isFullyAwake;

	setFullyAwake(fullyAwake: boolean): void {
		this._isFullyAwake.set(fullyAwake, undefined);
	}
}
