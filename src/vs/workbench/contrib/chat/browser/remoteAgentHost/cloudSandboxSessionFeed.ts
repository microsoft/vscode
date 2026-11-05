/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { StopWatch } from '../../../../../base/common/stopwatch.js';
import { ICloudSandboxApiService } from '../../../../../platform/agentHost/common/cloudSandboxAgentHost.js';
import { CloudSandboxSessionFeed as SessionFeed, CloudSandboxSessionFeedRefresh, SessionFeedSocket } from '../../../../../platform/agentHost/common/cloudSandboxSessionFeed.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { ICloudSandboxTelemetryService } from './cloudSandboxTelemetry.js';

export type { CloudSandboxSessionFeedRefresh } from '../../../../../platform/agentHost/common/cloudSandboxSessionFeed.js';

export class CloudSandboxSessionFeed extends SessionFeed {
	constructor(
		onInvalidate: (refresh: CloudSandboxSessionFeedRefresh) => void,
		webSocketFactory: (url: string, protocol: string) => SessionFeedSocket = (url, protocol) => new WebSocket(url, protocol),
		stopWatchFactory: () => Pick<StopWatch, 'elapsed'> = () => StopWatch.create(),
		@ICloudSandboxApiService apiService: ICloudSandboxApiService,
		@ILogService logService: ILogService,
		@ICloudSandboxTelemetryService telemetryService: ICloudSandboxTelemetryService,
	) {
		super(onInvalidate, webSocketFactory, stopWatchFactory, apiService, logService, telemetryService);
	}
}
