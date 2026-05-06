/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { mainWindow } from '../../../../base/browser/window.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../workbench/common/contributions.js';
import { ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';
import { logAgentsWindowTimeToReady } from '../../../common/sessionsTelemetry.js';

/**
 * Emits a one-shot `vscodeAgents.window/timeToReady` perf event when the
 * Agents workbench reaches the AfterRestored phase. Uses the Navigation
 * Timing API to measure from `navigationStart` to "now" — i.e. the moment
 * all parts have been created and contributions are running.
 */
class SessionsPerfContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.sessions.perf';

	constructor(
		@ITelemetryService telemetryService: ITelemetryService,
		@ISessionsManagementService sessionsManagementService: ISessionsManagementService,
	) {
		super();

		try {
			const performanceNow = mainWindow.performance.now();

			let durationMs = Math.round(performanceNow);
			const navEntries = mainWindow.performance.getEntriesByType('navigation') as PerformanceNavigationTiming[];
			const nav = navEntries[0];
			if (nav) {
				durationMs = Math.round(performanceNow - nav.startTime);
			}

			const restoredSessions = sessionsManagementService.getSessions().length;
			const route = mainWindow.location?.pathname?.includes('/agents') ? 'agents' : 'main';

			logAgentsWindowTimeToReady(telemetryService, {
				durationMs,
				restoredSessions,
				route,
			});
		} catch {
			// Telemetry must never break startup.
		}
	}
}

registerWorkbenchContribution2(SessionsPerfContribution.ID, SessionsPerfContribution, WorkbenchPhase.AfterRestored);
