/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { localize } from '../../../../nls.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { AutomationRunTrigger, IAutomation } from '../../../../workbench/contrib/chat/common/automations/automation.js';
import { IAutomationRunner } from '../../../../workbench/contrib/chat/common/automations/automationRunner.js';
import { IAutomationService } from '../../../../workbench/contrib/chat/common/automations/automationService.js';
import { publishAutomationRun, publishAutomationRunError } from '../../../../workbench/contrib/chat/common/automations/automationTelemetry.js';
import { ICreateNewSessionOptions, ISendRequestOptions, ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';

/**
 * Sessions-layer runner that turns an automation kickoff into a chat session.
 * The run row records the kickoff only — the session runs independently thereafter.
 * Token is re-checked post-send so mid-flight cancellations surface as `failed`, not `completed`.
 * Never throws; failures are recorded on the run row.
 */
export class AutomationRunner implements IAutomationRunner {

	declare readonly _serviceBrand: undefined;

	constructor(
		@IAutomationService private readonly automationService: IAutomationService,
		@ISessionsManagementService private readonly sessionsManagementService: ISessionsManagementService,
		@ILogService private readonly logService: ILogService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@INotificationService private readonly notificationService: INotificationService,
	) { }

	async runOnce(
		automation: IAutomation,
		trigger: AutomationRunTrigger,
		leaderWindowId: number,
		token: CancellationToken = CancellationToken.None,
	): Promise<void> {
		// Must not throw per IAutomationRunner contract; unexpected errors from the inner path are swallowed here.
		try {
			await this._runOnceInner(automation, trigger, leaderWindowId, token);
		} catch (err) {
			this.logService.error(`[AutomationRunner] unexpected error in runOnce for ${automation.id}`, err);
		}
	}

	private async _runOnceInner(
		automation: IAutomation,
		trigger: AutomationRunTrigger,
		leaderWindowId: number,
		token: CancellationToken,
	): Promise<void> {
		if (this.automationService.getActiveRunFor(automation.id)) {
			this.logService.trace(`[AutomationRunner] skipping ${automation.id}: active run already exists.`);
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
				source: 'automation',
			};

			const createOptions: ICreateNewSessionOptions | undefined = automation.providerId || automation.sessionTypeId || automation.modelId || automation.mode || automation.permissionLevel || automation.isolationMode || automation.branch
				? {
					providerId: automation.providerId,
					sessionTypeId: automation.sessionTypeId,
					modelId: automation.modelId,
					modeId: automation.mode,
					permissionLevel: automation.permissionLevel,
					isolationMode: automation.isolationMode,
					branch: automation.branch,
				}
				: undefined;

			this.logService.trace(`[AutomationRunner] running ${automation.id}: provider=${createOptions?.providerId ?? '(default)'}, sessionType=${createOptions?.sessionTypeId ?? '(default)'}, model=${createOptions?.modelId ?? '(default)'}, mode=${createOptions?.modeId ?? '(default)'}, permissionLevel=${createOptions?.permissionLevel ?? '(default)'}`);

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

			if (session) {
				try {
					const chatUri = session.mainChat.get().resource;
					const title = localize('automationRunner.sessionTitle', "{0}", automation.name);
					await this.sessionsManagementService.renameChat(session, chatUri, title);
				} catch (renameErr) {
					this.logService.warn(`[AutomationRunner] renameChat failed for ${automation.id}`, renameErr);
				}
			}

			await this.automationService.updateRun(runId, {
				status: 'completed',
				completedAt: new Date().toISOString(),
				...(session ? { sessionId: session.sessionId } : {}),
			});
			publishAutomationRun(this.telemetryService, { trigger, automation, success: true, durationMs: Date.now() - startTimeMs });
		} catch (err) {
			this.logService.error(`[AutomationRunner] run for ${automation.id} failed`, err);
			// Defensive: the error path must not propagate secondary failures to the outer caller.
			try {
				const errorMessage = err instanceof Error ? err.message : String(err);
				this.notificationService.error(localize('automationRunFailed', "Automation '{0}' failed: {1}", automation.name, errorMessage));
				if (runId) {
					await this.automationService.updateRun(runId, {
						status: 'failed',
						completedAt: new Date().toISOString(),
						errorMessage,
					});
				}
				publishAutomationRun(this.telemetryService, { trigger, automation, success: false, durationMs: Date.now() - startTimeMs });
				publishAutomationRunError(this.telemetryService, { trigger, automation });
			} catch (innerErr) {
				this.logService.error(`[AutomationRunner] error recording failure for ${automation.id}`, innerErr);
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
			this.logService.error(`[AutomationRunner] error recording cancellation for ${automation.id}`, err);
		}
	}
}
