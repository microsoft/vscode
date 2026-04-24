/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../base/common/event.js';
import { DisposableStore, IDisposable } from '../../../base/common/lifecycle.js';
import { IChannelClient } from '../../../base/parts/ipc/common/ipc.js';

// Agent host process starter and connection abstractions.
// Used by the main process to spawn and connect to the agent host utility process.

export interface IAgentHostConnection {
	readonly client: IChannelClient;
	readonly store: DisposableStore;
	readonly onDidProcessExit: Event<{ code: number; signal: string }>;
}

export interface IAgentHostStarter extends IDisposable {
	readonly onRequestConnection?: Event<void>;
	readonly onWillShutdown?: Event<void>;

	/**
	 * Creates the agent host utility process and connects to it.
	 */
	start(): Promise<IAgentHostConnection>;
}
