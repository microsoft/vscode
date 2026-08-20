/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DeferredPromise } from '../../../../base/common/async.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { derived, waitForState } from '../../../../base/common/observable.js';
import { localize } from '../../../../nls.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { AutomationRunTrigger, IAutomationDescriptor, IAutomationRun } from '../../../../workbench/contrib/chat/common/automations/automation.js';
import { IAutomationRunDispatch, IAutomationRunner, IAutomationRunOperation } from '../../../../workbench/contrib/chat/common/automations/automationRunner.js';
import { IAutomationService } from '../../../../workbench/contrib/chat/common/automations/automationService.js';
import { publishAutomationRun, publishAutomationRunError } from '../../../../workbench/contrib/chat/common/automations/automationTelemetry.js';
import { ISession, SessionStatus } from '../../../services/sessions/common/session.js';
import { ICreateNewSessionOptions, ISendRequestOptions, ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';

/** Sessions-layer runner. Never throws; failures are recorded on the run row. */
export class AutomationRunner implements IAutomationRunner {

	declare readonly _serviceBrand: undefined;

	constructor(
		@IAutomationService private readonly automationService: IAutomationService,
		@ISessionsManagementService private readonly sessionsManagementService: ISessionsManagementService,
		@ILogService private readonly logService: ILogService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@INotificationService private readonly notificationService: INotificationService,
	) { }

	runOnce(
		automation: IAutomationDescriptor,
		trigger: AutomationRunTrigger,
		leaderWindowId: number,
		token: CancellationToken = CancellationToken.None,
	): IAutomationRunOperation {
		const dispatched = new DeferredPromise<IAutomationRunDispatch>();
		return {
			whenDispatched: dispatched.p,
			whenCompleted: this._runOnce(automation, trigger, leaderWindowId, token, dispatched),
		};
	}

	private async _runOnce(
		automation: IAutomationDescriptor,
		trigger: AutomationRunTrigger,
		leaderWindowId: number,
		token: CancellationToken,
		dispatched: DeferredPromise<IAutomationRunDispatch>,
	): Promise<void> {
		// Must not throw per IAutomationRunner contract. Unexpected errors are swallowed here.
		try {
			await this._runOnceInner(automation, trigger, leaderWindowId, token, dispatched);
		} catch (err) {
			this.logService.error(`[AutomationRunner] unexpected error in runOnce for ${automation.id}`, err);
		} finally {
			// No-op once an exit path above has already reported its outcome.
			await dispatched.complete({ kind: 'notStarted', reason: 'error' });
		}
	}

	private async _runOnceInner(
		automation: IAutomationDescriptor,
		trigger: AutomationRunTrigger,
		leaderWindowId: number,
		token: CancellationToken,
		dispatched: DeferredPromise<IAutomationRunDispatch>,
	): Promise<void> {
		const startTimeMs = Date.now();
		let runId: string | undefined;
		try {
			if (!this.automationService.getAutomation(automation.id)) {
				this.logService.trace(`[AutomationRunner] skipping ${automation.id}: automation was deleted.`);
				await dispatched.complete({ kind: 'notStarted', reason: 'deleted' });
				return;
			}

			const target = automation.target;
			const isolationMode = target.kind === 'workspace'
				? target.isolation.kind === 'folder' ? 'workspace' : target.isolation.kind === 'worktree' ? 'worktree' : undefined
				: undefined;
			const branch = target.kind === 'workspace' && target.isolation.kind === 'worktree' ? target.isolation.branch : undefined;

			const createOptions: ICreateNewSessionOptions | undefined = target.providerId !== undefined || target.sessionTypeId !== undefined || automation.modelId !== undefined || automation.mode !== undefined || automation.permissionLevel !== undefined || isolationMode !== undefined || branch !== undefined
				? {
					providerId: target.providerId,
					sessionTypeId: target.sessionTypeId,
					modelId: automation.modelId,
					modeId: automation.mode,
					permissionLevel: automation.permissionLevel,
					isolationMode,
					branch,
				}
				: undefined;

			const targetAvailable = target.kind === 'quickChat'
				? this.sessionsManagementService.isQuickChatTargetAvailable(createOptions)
				: this.sessionsManagementService.isNewSessionTargetAvailable(target.folderUri, createOptions);
			if (!targetAvailable) {
				this.logService.trace(`[AutomationRunner] deferring ${automation.id}: target is not yet advertised.`);
				if (trigger === 'manual') {
					this.notificationService.info(localize('automationTargetUnavailable', "Automation '{0}' cannot start until its agent becomes available.", automation.name));
				}
				await dispatched.complete({ kind: 'notStarted', reason: 'targetUnavailable' });
				return;
			}

			// Atomically claims the automation's single active-run slot; a losing racer
			// gets the winner's run back instead of dispatching a duplicate session.
			const claim = await this.automationService.recordRunStart(automation.id, trigger, leaderWindowId);
			if (!claim.claimed) {
				this.logService.trace(`[AutomationRunner] skipping ${automation.id}: active run already exists.`);
				await dispatched.complete({ kind: 'alreadyRunning', activeRun: claim.run });
				return;
			}
			runId = claim.run.id;
			const run = await this.automationService.updateRun(runId, { status: 'running' }) ?? claim.run;
			this.logService.info(`[AutomationRunner] claimed run ${runId} for automation ${automation.id}: trigger=${trigger}, leaderWindowId=${leaderWindowId}.`);

			if (token.isCancellationRequested) {
				await dispatched.complete({ kind: 'notStarted', reason: 'cancelled', run });
				await this._markCancelled(runId, trigger, automation, startTimeMs);
				return;
			}

			const options: ISendRequestOptions = {
				query: automation.prompt,
				background: true,
				title: automation.name?.substring(0, 100),
			};

			this.logService.trace(`[AutomationRunner] running ${automation.id}: target=${target.kind}, provider=${createOptions?.providerId ?? '(default)'}, sessionType=${createOptions?.sessionTypeId ?? '(default)'}, model=${createOptions?.modelId ?? '(default)'}, mode=${createOptions?.modeId ?? '(default)'}, permissionLevel=${createOptions?.permissionLevel ?? '(default)'}`);
			this.logService.info(`[AutomationRunner] creating a session for run ${runId} (automation ${automation.id}).`);

			let session: ISession | undefined;
			if (target.kind === 'quickChat') {
				session = await this.sessionsManagementService.createAndSendQuickChatRequest(options, createOptions, token);
			} else {
				session = await this.sessionsManagementService.createAndSendNewChatRequest(target.folderUri, options, createOptions, token);
			}

			if (session) {
				const sessionResource = session.resource;
				let updatedRun: IAutomationRun | undefined;
				try {
					updatedRun = await this.automationService.updateRun(runId, { sessionResource });
				} catch (err) {
					this.logService.warn(`[AutomationRunner] session ${sessionResource.toString()} was created for run ${runId} (automation ${automation.id}), but persisting the session link failed.`, err);
					throw err;
				}
				if (updatedRun) {
					this.logService.info(`[AutomationRunner] linked run ${runId} for automation ${automation.id} to session ${sessionResource.toString()}.`);
				} else {
					this.logService.warn(`[AutomationRunner] session ${sessionResource.toString()} was created for run ${runId} (automation ${automation.id}), but the run no longer exists and the session link was not persisted.`);
				}
				const dispatchedRun = updatedRun ?? run;
				await dispatched.complete({ kind: 'started', run: dispatchedRun, sessionResource });
			} else {
				// Dispatch ended without a session, e.g. the sessions service was disposed mid-send.
				this.logService.warn(`[AutomationRunner] session creation returned no session for run ${runId} (automation ${automation.id}): cancelled=${token.isCancellationRequested}.`);
				await dispatched.complete({ kind: 'notStarted', reason: token.isCancellationRequested ? 'cancelled' : 'error', run });
			}

			if (token.isCancellationRequested) {
				await this._markCancelled(runId, trigger, automation, startTimeMs);
				return;
			}

			const terminalStatus = session
				? await waitForState(
					derived(reader => session.mainChat.read(reader).status.read(reader)),
					status => status === SessionStatus.Completed || status === SessionStatus.Error,
					undefined,
					token,
				)
				: SessionStatus.Completed;

			if (token.isCancellationRequested) {
				await this._markCancelled(runId, trigger, automation, startTimeMs);
				return;
			}

			if (terminalStatus === SessionStatus.Error) {
				throw new Error(localize('automationRunner.sessionFailed', "Agent session failed."));
			}

			await this.automationService.updateRun(runId, {
				status: 'completed',
				completedAt: new Date().toISOString(),
			});
			publishAutomationRun(this.telemetryService, { trigger, automation, success: true, durationMs: Date.now() - startTimeMs });
		} catch (err) {
			if (runId && token.isCancellationRequested) {
				await dispatched.complete({ kind: 'notStarted', reason: 'cancelled' });
				await this._markCancelled(runId, trigger, automation, startTimeMs);
				return;
			}
			this.logService.error(`[AutomationRunner] run for ${automation.id} failed`, err);
			try {
				const errorMessage = err instanceof Error ? err.message : String(err);
				this.notificationService.error(localize('automationRunFailed', "Automation '{0}' failed: {1}", automation.name, errorMessage));
				let failedRun: IAutomationRun | undefined;
				if (runId) {
					failedRun = await this.automationService.updateRun(runId, {
						status: 'failed',
						completedAt: new Date().toISOString(),
						errorMessage,
					});
				}
				// No-op when the session was already dispatched and failed later in its lifecycle.
				await dispatched.complete({ kind: 'notStarted', reason: 'error', run: failedRun });
				publishAutomationRun(this.telemetryService, { trigger, automation, success: false, durationMs: Date.now() - startTimeMs });
				publishAutomationRunError(this.telemetryService, { trigger, automation });
			} catch (innerErr) {
				this.logService.error(`[AutomationRunner] error recording failure for ${automation.id}`, innerErr);
			}
		}
	}

	private async _markCancelled(runId: string, trigger: AutomationRunTrigger, automation: IAutomationDescriptor, startTimeMs: number): Promise<void> {
		try {
			if (this.automationService.getActiveRunFor(automation.id)?.id === runId) {
				await this.automationService.updateRun(runId, {
					status: 'failed',
					completedAt: new Date().toISOString(),
					errorMessage: localize('automationRunner.cancelled', "Cancelled"),
				});
			}
			publishAutomationRun(this.telemetryService, { trigger, automation, success: false, durationMs: Date.now() - startTimeMs });
		} catch (err) {
			this.logService.error(`[AutomationRunner] error recording cancellation for ${automation.id}`, err);
		}
	}
}
