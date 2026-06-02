/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { timeout } from '../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { AutomationRunTrigger, IAutomation } from '../../common/automations/automation.js';
import { IAutomationService } from '../../common/automations/automationService.js';

/**
 * Owns the act of running a single automation: claim the per-automation
 * slot, record the run, drive the chat session (Phase 5), and report
 * success/failure back to {@link IAutomationService}.
 *
 * Phase 4 ships a placeholder implementation: it records a `pending`
 * run, marks it `running` after a short delay, then completes it. This
 * is enough to validate the scheduler end-to-end before the real
 * session creation lands in Phase 5.
 */
export interface IAutomationRunner {
	/**
	 * Runs `automation` once. Resolves when the run is finished (or
	 * skipped because another run was already in flight). Never throws;
	 * failures are recorded on the run row.
	 */
	runOnce(
		automation: IAutomation,
		trigger: AutomationRunTrigger,
		leaderWindowId: number,
		token?: CancellationToken,
	): Promise<void>;
}

export interface IPlaceholderAutomationRunnerOptions {
	/**
	 * Delay between recording the run as `running` and completing it.
	 * Tests pass 0 to remove the artificial pause.
	 */
	readonly placeholderRunDurationMs?: number;
}

export class PlaceholderAutomationRunner implements IAutomationRunner {

	private readonly _placeholderRunDurationMs: number;

	constructor(
		private readonly automationService: IAutomationService,
		private readonly logService: ILogService,
		options: IPlaceholderAutomationRunnerOptions = {},
	) {
		this._placeholderRunDurationMs = options.placeholderRunDurationMs ?? 1_000;
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

			if (this._placeholderRunDurationMs > 0) {
				await timeout(this._placeholderRunDurationMs, token);
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
