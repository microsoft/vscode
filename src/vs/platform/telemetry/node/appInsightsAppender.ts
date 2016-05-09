/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {ITelemetryAppender} from 'vs/platform/telemetry/common/telemetry';
import {AIAdapter, IAIAdapter} from 'vs/base/node/aiAdapter';

export class AppInsightsAppender implements ITelemetryAppender {

	private static EVENT_NAME_PREFIX: string = 'monacoworkbench';

	private appInsights: IAIAdapter;
	private appInsightsVortex: IAIAdapter;

	constructor(config: { key: string; asimovKey: string }, _testing_client?: IAIAdapter) {
		let {key, asimovKey} = config;
		if (_testing_client) {
			// for test
			this.appInsights = _testing_client;
			if (asimovKey) {
				this.appInsightsVortex = _testing_client;
			}
		} else {
			if (key) {
				this.appInsights = new AIAdapter(AppInsightsAppender.EVENT_NAME_PREFIX, undefined, key);
			}
			if (asimovKey) {
				this.appInsightsVortex = new AIAdapter(AppInsightsAppender.EVENT_NAME_PREFIX, undefined, asimovKey);
			}
		}
	}

	public log(eventName: string, data: any = Object.create(null)): void {
		if (this.appInsights) {
			this.appInsights.log(eventName, data);
		}
		if (this.appInsightsVortex) {
			this.appInsightsVortex.log(eventName, data);
		}
	}

	public dispose(): void {
		if (this.appInsights) {
			this.appInsights.dispose();
		}
		if (this.appInsightsVortex) {
			this.appInsightsVortex.dispose();
		}
		this.appInsights = null;
		this.appInsightsVortex = null;
	}
}
