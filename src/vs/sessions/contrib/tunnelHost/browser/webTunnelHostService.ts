/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../base/common/event.js';
import { ITunnelHostInfo } from '../../../../platform/agentHost/common/tunnelAgentHost.js';
import { ITunnelHostService } from '../../../../workbench/contrib/chat/common/tunnelHost.js';

/**
 * Web implementation of {@link ITunnelHostService}.
 *
 * Hosting a dev tunnel requires spawning the VS Code CLI, which a browser
 * cannot do, so the Agents Window on web is never itself a tunnel host. This
 * service therefore reports a permanently inactive sharing state rather than
 * being absent: consumers such as the tunnel agent host contribution depend on
 * it to decide whether a discovered tunnel is the locally hosted one, and a
 * missing registration fails their construction entirely.
 */
export class WebTunnelHostService implements ITunnelHostService {

	declare readonly _serviceBrand: undefined;

	/** Sharing can never start on web, so the status never changes. */
	readonly onDidChangeStatus: Event<void> = Event.None;

	readonly isSharing = false;

	readonly isConnecting = false;

	readonly sharingInfo: ITunnelHostInfo | undefined = undefined;

	async startSharing(): Promise<void> {
		throw new Error('Sharing the agent host via a dev tunnel is not supported on web.');
	}

	async stopSharing(): Promise<void> {
		// Never sharing on web, so there is nothing to tear down.
	}

	async restartSharing(): Promise<void> {
		// Never sharing on web, so there is nothing to restart.
	}
}
