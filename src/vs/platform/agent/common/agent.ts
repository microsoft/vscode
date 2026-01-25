/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Nikolaas Bender. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../instantiation/common/instantiation.js';
import { Event } from '../../../base/common/event.js';

export const IAgentService = createDecorator<IAgentService>('agentService');

export interface IAgentService {
	readonly _serviceBrand: undefined;

	/**
	 * Event that fires when the connection state changes.
	 */
	readonly onDidChangeConnectionState: Event<boolean>;

	/**
	 * Whether the agent runtime is currently connected.
	 */
	readonly connected: boolean;

	/**
	 * Send a message to the agent runtime.
	 */
	sendMessage(topic: string, message: any): Promise<void>;
}
