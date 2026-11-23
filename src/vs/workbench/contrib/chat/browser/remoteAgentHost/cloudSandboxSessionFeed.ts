/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { StopWatch } from '../../../../../base/common/stopwatch.js';
import { ICloudSandboxApiService } from '../../../../../platform/agentHost/common/cloudSandboxAgentHost.js';
import { CloudSandboxSessionFeed as PortableCloudSandboxSessionFeed, CloudSandboxSessionFeedRefresh, SessionFeedSocket } from '../../../../../platform/agentHost/common/cloudSandboxSessionFeed.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IPowerService } from '../../../../services/power/common/powerService.js';
import { ICloudSandboxTelemetryService } from './cloudSandboxTelemetry.js';

export type { CloudSandboxSessionFeedRefresh } from '../../../../../platform/agentHost/common/cloudSandboxSessionFeed.js';

/** Supplies browser networking, credentials, telemetry and OS power notifications to the portable feed. */
export class CloudSandboxSessionFeed extends PortableCloudSandboxSessionFeed {
	constructor(
		onInvalidate: (refresh: CloudSandboxSessionFeedRefresh) => void,
		webSocketFactory: (url: string, protocol: string) => SessionFeedSocket = (url, protocol) => new WebSocket(url, protocol),
		stopWatchFactory: () => Pick<StopWatch, 'elapsed'> = () => StopWatch.create(),
		canConnect: () => boolean = () => true,
		@ICloudSandboxApiService apiService: ICloudSandboxApiService,
		@ILogService logService: ILogService,
		@ICloudSandboxTelemetryService telemetryService: ICloudSandboxTelemetryService,
		@IPowerService powerService: IPowerService,
	) {
		super(onInvalidate, webSocketFactory, token => apiService.connectSessionFeed(token),
			data => telemetryService.reportSessionFeed(data), stopWatchFactory, canConnect, logService);
		this._register(powerService.onDidSuspend(() => this.suspend()));
		this._register(powerService.onDidResume(() => this.resume()));
	}
}
