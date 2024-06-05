/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from 'vs/base/common/event';
import { DisposableStore, IDisposable } from 'vs/base/common/lifecycle';
import { IChannelClient } from 'vs/base/parts/ipc/common/ipc';

export interface IPtyHostConnection {
	readonly client: IChannelClient;
	readonly store: DisposableStore;
	readonly onDidProcessExit: Event<{ code: number; signal: string }>;
}

export interface IPtyHostStarter extends IDisposable {
	onRequestConnection?: Event<void>;
	onWillShutdown?: Event<void>;

	/**
	 * Creates a pty host and connects to it.
	 */
	start(): IPtyHostConnection;
}
