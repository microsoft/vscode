/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { timeout } from '../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { AutomationRunTrigger, IAutomation } from '../../common/automations/automation.js';
import { IAutomationRunner } from '../../common/automations/automationRunner.js';
import { IAutomationService } from '../../common/automations/automationService.js';

/**
 * Placeholder runner used by the plain workbench build. It records a
 * `pending` run, marks it `running`, then marks it `completed` after a
 * short delay. It does not create a real chat session.
 *
 * The Agents window registers {@link SessionsAutomationRunner} (in
 * `vs/sessions`) for the same {@link IAutomationRunner} decorator
 * later in the singleton chain, so the placeholder only ever runs in
 * builds that do not load the sessions layer.
 */
export class PlaceholderAutomationRunner implements IAutomationRunner {

	declare readonly _serviceBrand: undefined;

	/**
	 * Delay between recording the run as `running` and completing it.
	 * Exposed as a setter so tests can drive it to 0 without going
	 * through the DI registration.
	 */
	private _runDurationMs = 1_000;

	constructor(
		@IAutomationService private readonly automationService: IAutomationService,
		@ILogService private readonly logService: ILogService,
	) { }

	/** Test-only seam. */
	setRunDurationForTesting(ms: number): void {
		this._runDurationMs = ms;
	}

	async runOnce(
		automation: IAutomation,
		trigger: AutomationRunTrigger,
		leaderWindowId: number,
		token: CancellationToken = CancellationToken.None,
	): Promise<void> {
		// Per-automation idempotency: if another run is already in
		// flight, do not start a second one. This handles the case
		// where two leader-claim ticks race for the same due automation.
		if (this.automationService.getActiveRunFor(automation.id)) {
			this.logService.trace(`[AutomationRunner] skipping ${automation.id}: active run already exists.`);
			return;
		}

		let runId: string | undefined;
		try {
			const run = await this.automationService.recordRunStart(automation.id, trigger, leaderWindowId);
			runId = run.id;
			await this.automationService.updateRun(runId, { status: 'running' });

			if (this._runDurationMs > 0) {
				await timeout(this._runDurationMs, token);
			}

			if (token.isCancellationRequested) {
				await this.automationService.updateRun(runId, {
					status: 'failed',
					completedAt: new Date().toISOString(),
					errorMessage: 'Cancelled',
				});
				return;
			}

			await this.automationService.updateRun(runId, {
				status: 'completed',
				completedAt: new Date().toISOString(),
			});
		} catch (err) {
			this.logService.error(`[AutomationRunner] run for ${automation.id} failed`, err);
			if (runId) {
				await this.automationService.updateRun(runId, {
					status: 'failed',
					completedAt: new Date().toISOString(),
					errorMessage: err instanceof Error ? err.message : String(err),
				});
			}
		}
	}
}
