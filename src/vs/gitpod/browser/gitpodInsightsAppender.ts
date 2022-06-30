/* eslint-disable code-import-patterns */
/* eslint-disable header/header */
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Gitpod. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { RemoteTrackMessage } from '@gitpod/gitpod-protocol/lib/analytics';
import { ITelemetryAppender } from 'vs/platform/telemetry/common/telemetryUtils';

export class GitpodInsightsAppender implements ITelemetryAppender {
	constructor() {

	}
	public log(eventName: string, data: any): void {
		const trackMessage = mapTelemetryData(eventName, data);
		if (!trackMessage) {
			return;
		}
		window.postMessage({ type: 'vscode_telemetry', event: trackMessage.event, properties: trackMessage.properties }, '*');
	}

	public flush(): Promise<any> {
		return Promise.resolve(undefined);
	}
}


function mapTelemetryData(eventName: string, data: any): RemoteTrackMessage | undefined {
	switch (eventName) {
		case 'gitpod.connectFailed':
			return {
				event: 'vscode_conn_failed',
			};
		case 'remoteConnectionLost':
			return {
				event: 'vscode_conn_lost',
			};
	}
	return undefined;
}
