/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { localize } from '../../../../nls.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { AutomationRunTrigger, IAutomation } from '../../../../workbench/contrib/chat/common/automations/automation.js';
import { IAutomationRunner } from '../../../../workbench/contrib/chat/common/automations/automationRunner.js';
import { IAutomationService } from '../../../../workbench/contrib/chat/common/automations/automationService.js';
import { publishAutomationRun, publishAutomationRunError } from '../../../../workbench/contrib/chat/common/automations/automationTelemetry.js';
import { ICreateNewSessionOptions, ISendRequestOptions, ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';

/**
 * Sessions-layer runner that turns an automation kickoff into a real
 * Agents-window chat session.
 *
 * Lifecycle of a single `runOnce`:
 *   1. If another run for the same automation is already pending or
 *      running, skip (per-automation idempotency).
 *   2. Record a `pending` run row, immediately flip it to `running`.
 *   3. Call `createAndSendNewChatRequest` with the automation's
 *      required `folderUri`. The service returns the committed session
 *      directly, avoiding event-listener races with concurrent sends.
 *   4. On success, update the run row to `completed`, stamp the
 *      returned `sessionId`, and return. The session itself keeps
 *      running independently; this run row records the kickoff, not
 *      the session's eventual outcome.
 *   5. On failure or cancellation, update the run row to `failed`
 *      (with the error message or "Cancelled") and swallow the error
 *      (runners must never throw).
 *
 * The token is re-checked after the send returns so a scheduler
 * cancellation that lands mid-flight surfaces as `failed`/`Cancelled`
 * rather than `completed`. The session itself cannot be aborted
 * post-commit, but the run row reflects the intended outcome.
 */
export class SessionsAutomationRunner implements IAutomationRunner {

	declare readonly _serviceBrand: undefined;

	constructor(
		@IAutomationService private readonly automationService: IAutomationService,
		@ISessionsManagementService private readonly sessionsManagementService: ISessionsManagementService,
		@ILogService private readonly logService: ILogService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
	) { }

	async runOnce(
		automation: IAutomation,
		trigger: AutomationRunTrigger,
		leaderWindowId: number,
		token: CancellationToken = CancellationToken.None,
	): Promise<void> {
		// Outer defensive guard: this method MUST NOT throw per the
		// `IAutomationRunner` contract. Any unexpected throw from the
		// inner try/catch (e.g. storage failure inside the error path
		// itself) is logged and swallowed here.
		try {
			await this._runOnceInner(automation, trigger, leaderWindowId, token);
		} catch (err) {
			this.logService.error(`[SessionsAutomationRunner] unexpected error in runOnce for ${automation.id}`, err);
		}
	}

	private async _runOnceInner(
		automation: IAutomation,
		trigger: AutomationRunTrigger,
		leaderWindowId: number,
		token: CancellationToken,
	): Promise<void> {
		if (this.automationService.getActiveRunFor(automation.id)) {
			this.logService.trace(`[SessionsAutomationRunner] skipping ${automation.id}: active run already exists.`);
			return;
		}

		const startTimeMs = Date.now();
		let runId: string | undefined;
		try {
			const run = await this.automationService.recordRunStart(automation.id, trigger, leaderWindowId);
			runId = run.id;
			await this.automationService.updateRun(runId, { status: 'running' });

			if (token.isCancellationRequested) {
				await this._markCancelled(runId, trigger, automation, startTimeMs);
				return;
			}

			const options: ISendRequestOptions = {
				query: automation.prompt,
				background: true,
			};

			const createOptions: ICreateNewSessionOptions | undefined = automation.providerId || automation.sessionTypeId || automation.modelId || automation.mode || automation.permissionLevel
				? {
					providerId: automation.providerId,
					sessionTypeId: automation.sessionTypeId,
					modelId: automation.modelId,
					modeId: automation.mode,
					permissionLevel: automation.permissionLevel,
				}
				: undefined;

			this.logService.trace(`[SessionsAutomationRunner] running ${automation.id}: provider=${createOptions?.providerId ?? '(default)'}, sessionType=${createOptions?.sessionTypeId ?? '(default)'}, model=${createOptions?.modelId ?? '(default)'}, mode=${createOptions?.modeId ?? '(default)'}, permissionLevel=${createOptions?.permissionLevel ?? '(default)'}`);

			const session = await this.sessionsManagementService.createAndSendNewChatRequest(automation.folderUri, options, createOptions);

			// Re-check cancellation post-send: a scheduler timeout/dispose
			// that landed during the in-flight send should surface as
			// `failed`/`Cancelled`, not `completed`. The session itself is
			// already committed and continues independently — only the run
			// row outcome is corrected here.
			if (token.isCancellationRequested) {
				await this._markCancelled(runId, trigger, automation, startTimeMs);
				return;
			}

			await this.automationService.updateRun(runId, {
				status: 'completed',
				completedAt: new Date().toISOString(),
				...(session ? { sessionId: session.sessionId } : {}),
			});
			publishAutomationRun(this.telemetryService, { trigger, automation, success: true, durationMs: Date.now() - startTimeMs });
		} catch (err) {
			this.logService.error(`[SessionsAutomationRunner] run for ${automation.id} failed`, err);
			// Defensive nested try/catch: the error path itself awaits
			// `updateRun` and emits telemetry, and must not propagate a
			// secondary failure to the outer caller.
			try {
				const errorMessage = err instanceof Error ? err.message : String(err);
				if (runId) {
					await this.automationService.updateRun(runId, {
						status: 'failed',
						completedAt: new Date().toISOString(),
						errorMessage,
					});
				}
				publishAutomationRun(this.telemetryService, { trigger, automation, success: false, durationMs: Date.now() - startTimeMs });
				publishAutomationRunError(this.telemetryService, { trigger, automation, errorMessage });
			} catch (innerErr) {
				this.logService.error(`[SessionsAutomationRunner] error recording failure for ${automation.id}`, innerErr);
			}
		}
	}

	private async _markCancelled(runId: string, trigger: AutomationRunTrigger, automation: IAutomation, startTimeMs: number): Promise<void> {
		try {
			await this.automationService.updateRun(runId, {
				status: 'failed',
				completedAt: new Date().toISOString(),
				errorMessage: localize('automationRunner.cancelled', "Cancelled"),
			});
			publishAutomationRun(this.telemetryService, { trigger, automation, success: false, durationMs: Date.now() - startTimeMs });
		} catch (err) {
			this.logService.error(`[SessionsAutomationRunner] error recording cancellation for ${automation.id}`, err);
		}
	}
}
