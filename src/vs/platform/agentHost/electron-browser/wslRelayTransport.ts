/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ILogService } from '../../log/common/log.js';
import { AhpJsonlLogger } from '../common/ahpJsonlLogger.js';
import { RelayTransport } from '../common/relayTransport.js';
import type { IWSLRemoteAgentHostMainService } from '../common/wslRemoteAgentHost.js';

export class WSLRelayTransport extends RelayTransport {
	constructor(
		connectionId: string,
		wslService: IWSLRemoteAgentHostMainService,
		ahpLogger: AhpJsonlLogger | undefined,
		@ILogService logService: ILogService,
	) {
		super(connectionId, wslService, ahpLogger, logService, '[WSLRelayTransport]');
	}
}
