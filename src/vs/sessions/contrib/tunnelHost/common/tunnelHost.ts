/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../base/common/event.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { ITunnelHostInfo } from '../../../../platform/agentHost/common/tunnelAgentHost.js';

export const ITunnelHostService = createDecorator<ITunnelHostService>('tunnelHostService');

export interface ITunnelHostService {
	readonly _serviceBrand: undefined;

	/** Fires when the sharing status changes. */
	readonly onDidChangeStatus: Event<void>;

	/** Whether the agent host is currently shared via a tunnel. */
	readonly isSharing: boolean;

	/** Whether a tunnel connection is currently being established. */
	readonly isConnecting: boolean;

	/** Information about the active tunnel, if sharing. */
	readonly sharingInfo: ITunnelHostInfo | undefined;

	/** Start sharing the local agent host via a dev tunnel. */
	startSharing(): Promise<void>;

	/** Stop sharing and tear down the tunnel. */
	stopSharing(): Promise<void>;
}
