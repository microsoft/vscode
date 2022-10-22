/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { timeout } from 'vs/base/common/async';
import { generateUuid } from 'vs/base/common/uuid';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { ILogService } from 'vs/platform/log/common/log';
import { INativeHostService } from 'vs/platform/native/electron-sandbox/native';
import { parseExtensionDevOptions } from 'vs/workbench/services/extensions/common/extensionDevOptions';
import { ITimerService } from 'vs/workbench/services/timer/browser/timerService';

export class RendererProfiling {

	private _observer?: PerformanceObserver;

	constructor(
		@INativeHostService nativeHostService: INativeHostService,
		@IEnvironmentService environmentService: IEnvironmentService,
		@ILogService logService: ILogService,
		@ITimerService timerService: ITimerService,
		@IConfigurationService configService: IConfigurationService
	) {

		const devOpts = parseExtensionDevOptions(environmentService);
		if (devOpts.isExtensionDevTestFromCli) {
			// disabled when running extension tests
			return;
		}

		timerService.perfBaseline.then(perfBaseline => {
			logService.info(`[perf] Render performance baseline is ${perfBaseline}ms`);

			if (perfBaseline < 0) {
				// too slow
				return;
			}

			// SLOW threshold
			const slowThreshold = perfBaseline * 10; // ~10 frames at 64fps on MY machine

			const obs = new PerformanceObserver(async list => {

				obs.takeRecords();
				const maxDuration = list.getEntries()
					.map(e => e.duration)
					.reduce((p, c) => Math.max(p, c), 0);

				if (maxDuration < slowThreshold) {
					return;
				}

				if (!configService.getValue('application.experimental.rendererProfiling')) {
					logService.debug(`[perf] SLOW task detected (${maxDuration}ms) but renderer profiling is disabled via 'application.experimental.rendererProfiling'`);
					return;
				}

				const sessionId = generateUuid();
				// start heartbeat monitoring
				logService.warn(`[perf] Renderer reported VERY LONG TASK (${maxDuration}ms), starting profiling session '${sessionId}'`);

				// pause observation, we'll take a detailed look
				obs.disconnect();

				// profile for 5secs and wait after that, try for max 1min or until we
				// found something interesting
				for (let i = 0; i < 3; i++) {
					const good = await nativeHostService.profileRenderer(sessionId, 5000, perfBaseline);
					if (good) {
						break;
					}
					timeout(15000); // wait 15s
				}

				// reconnect the observer
				obs.observe({ entryTypes: ['longtask'] });
			});

			obs.observe({ entryTypes: ['longtask'] });
			this._observer = obs;

		});
	}

	dispose(): void {
		this._observer?.disconnect();
	}
}
