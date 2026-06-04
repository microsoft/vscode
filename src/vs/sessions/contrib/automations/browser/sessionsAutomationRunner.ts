/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { IDisposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { AutomationRunTrigger, IAutomation } from '../../../../workbench/contrib/chat/common/automations/automation.js';
import { IAutomationRunner } from '../../../../workbench/contrib/chat/common/automations/automationRunner.js';
import { IAutomationService } from '../../../../workbench/contrib/chat/common/automations/automationService.js';
import { ISession } from '../../../services/sessions/common/session.js';
import { ICreateNewSessionOptions, ISendRequestOptions, ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';

/**
 * Sessions-layer runner that turns an automation kickoff into a real
 * Agents-window chat session.
 *
 * Lifecycle of a single `runOnce`:
 *   1. If another run for the same automation is already pending or
 *      running, skip (per-automation idempotency).
 *   2. Record a `pending` run row, immediately flip it to `running`.
 *   3. Subscribe to {@link ISessionsManagementService.onDidSendRequest}
 *      so we can capture the session that was just created, then call
 *      `createAndSendNewChatRequest` with the automation's required
 *      `folderUri`.
 *   4. On success, update the run row to `completed`, stamp the
 *      captured `sessionId` if any, and return. The session itself
 *      keeps running independently; this run row records the kickoff,
 *      not the session's eventual outcome.
 *   5. On failure, update the run row to `failed` with the error
 *      message and swallow the error (runners must never throw).
 *
 * Concurrency note: the scheduler awaits each `runOnce` sequentially,
 * so the `onDidSendRequest` capture cannot be confused with another
 * automation's kickoff happening in the same tick. Manual run-now is
 * deferred to a later phase to keep this invariant.
 */
export class SessionsAutomationRunner implements IAutomationRunner {

	declare readonly _serviceBrand: undefined;

	constructor(
		@IAutomationService private readonly automationService: IAutomationService,
		@ISessionsManagementService private readonly sessionsManagementService: ISessionsManagementService,
		@ILogService private readonly logService: ILogService,
	) { }

	async runOnce(
		automation: IAutomation,
		trigger: AutomationRunTrigger,
		leaderWindowId: number,
		token: CancellationToken = CancellationToken.None,
	): Promise<void> {
		if (this.automationService.getActiveRunFor(automation.id)) {
			this.logService.trace(`[SessionsAutomationRunner] skipping ${automation.id}: active run already exists.`);
			return;
		}

		let runId: string | undefined;
		try {
			const run = await this.automationService.recordRunStart(automation.id, trigger, leaderWindowId);
			runId = run.id;
			await this.automationService.updateRun(runId, { status: 'running' });

			if (token.isCancellationRequested) {
				await this.automationService.updateRun(runId, {
					status: 'failed',
					completedAt: new Date().toISOString(),
					errorMessage: localize('automationRunner.cancelled', "Cancelled"),
				});
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

			const session = await this.createSessionAndCapture(automation.folderUri, options, createOptions);

			await this.automationService.updateRun(runId, {
				status: 'completed',
				completedAt: new Date().toISOString(),
				...(session ? { sessionId: session.sessionId } : {}),
			});
		} catch (err) {
			this.logService.error(`[SessionsAutomationRunner] run for ${automation.id} failed`, err);
			if (runId) {
				await this.automationService.updateRun(runId, {
					status: 'failed',
					completedAt: new Date().toISOString(),
					errorMessage: err instanceof Error ? err.message : String(err),
				});
			}
		}
	}

	/**
	 * Subscribes to `onDidSendRequest` before calling
	 * `createAndSendNewChatRequest` so we can stamp the resulting
	 * session ID onto the run row. The subscription is disposed in a
	 * `finally` so a thrown request still cleans up.
	 */
	private async createSessionAndCapture(
		folderUri: URI,
		options: ISendRequestOptions,
		createOptions?: ICreateNewSessionOptions,
	): Promise<ISession | undefined> {
		let captured: ISession | undefined;
		const subscription: IDisposable = this.sessionsManagementService.onDidSendRequest(e => {
			if (e.isNewSession && !captured) {
				captured = e.session;
			}
		});
		try {
			await this.sessionsManagementService.createAndSendNewChatRequest(folderUri, options, createOptions);
		} finally {
			subscription.dispose();
		}
		return captured;
	}
}
