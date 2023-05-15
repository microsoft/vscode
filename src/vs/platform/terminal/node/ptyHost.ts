/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from 'vs/base/common/event';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { IChannelClient } from 'vs/base/parts/ipc/common/ipc';

export interface IPtyHostConnection {
	readonly client: IChannelClient;
	readonly store: DisposableStore;
	readonly onDidProcessExit: Event<{ code: number; signal: string }>;
}

export interface IPtyHostStarter {
	onBeforeWindowConnection?: Event<void>;
	onWillShutdown?: Event<void>;

	/**
	 * Creates a pty host and connects to it.
	 *
	 * @param lastPtyId Tracks the last terminal ID from the pty host so we can give it to the new
	 * pty host if it's restarted and avoid ID conflicts.
	 */
	start(lastPtyId: number): IPtyHostConnection;
}
