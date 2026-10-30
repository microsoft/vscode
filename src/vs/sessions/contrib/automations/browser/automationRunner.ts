/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DeferredPromise } from '../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
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

interface IAutomationRunOutcome {
	readonly status: 'completed' | 'failed';
	readonly errorMessage?: string;
}

interface IAutomationRunState {
	readonly startTimeMs: number;
	runId?: string;
	outcome?: IAutomationRunOutcome;
	whenRecorded?: Promise<IAutomationRun | undefined>;
}

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
		const state: IAutomationRunState = { startTimeMs: Date.now() };
		return {
			whenDispatched: dispatched.p,
			whenCompleted: this._runOnce(automation, trigger, leaderWindowId, token, dispatched, state),
			timeout: async timeoutMs => {
				const run = await this._finishRun(state, trigger, automation, {
					status: 'failed',
					errorMessage: localize('automation.timedOut', "Timed out after {0} minute(s).", Math.round(timeoutMs / 60_000)),
				});
				this.logService.warn(`[AutomationRunner] timeout requested for automation ${automation.id} after ${timeoutMs}ms (run=${state.runId ?? '(not claimed)'}, outcome=${state.outcome?.status}, session=${run?.sessionResource?.toString() ?? '(none)'}).`);
			},
		};
	}

	private async _runOnce(
		automation: IAutomationDescriptor,
		trigger: AutomationRunTrigger,
		leaderWindowId: number,
		token: CancellationToken,
		dispatched: DeferredPromise<IAutomationRunDispatch>,
		state: IAutomationRunState,
	): Promise<void> {
		// Must not throw per IAutomationRunner contract. Unexpected errors are swallowed here.
		try {
			await this._runOnceInner(automation, trigger, leaderWindowId, token, dispatched, state);
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
		state: IAutomationRunState,
	): Promise<void> {
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
			let run: IAutomationRun;
			try {
				run = await this.automationService.updateRun(runId, { status: 'running' }) ?? claim.run;
			} finally {
				// Terminal writes must follow the in-flight transition to running.
				state.runId = runId;
			}
			this.logService.info(`[AutomationRunner] claimed run ${runId} for automation ${automation.id}: trigger=${trigger}, leaderWindowId=${leaderWindowId}.`);

			if (state.outcome || token.isCancellationRequested) {
				await dispatched.complete({ kind: 'notStarted', reason: 'cancelled', run });
				await this._markCancelled(state, trigger, automation);
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

			if (state.outcome || token.isCancellationRequested) {
				await this._markCancelled(state, trigger, automation);
				return;
			}

			let terminalStatus = SessionStatus.Completed;
			if (session) {
				const completionCts = new CancellationTokenSource(token);
				try {
					terminalStatus = await waitForState(
						derived(reader => session.mainChat.read(reader).status.read(reader)),
						status => status === SessionStatus.Completed || status === SessionStatus.Error,
						undefined,
						completionCts.token,
					);
				} finally {
					// waitForState releases its cancellation listener when the token is cancelled.
					completionCts.dispose(true);
				}
			}

			if (token.isCancellationRequested) {
				await this._markCancelled(state, trigger, automation);
				return;
			}

			if (terminalStatus === SessionStatus.Error) {
				throw new Error(localize('automationRunner.sessionFailed', "Agent session failed."));
			}

			await this._finishRun(state, trigger, automation, {
				status: 'completed',
			});
		} catch (err) {
			if (state.outcome || runId && token.isCancellationRequested) {
				await dispatched.complete({ kind: 'notStarted', reason: 'cancelled' });
				await this._markCancelled(state, trigger, automation);
				return;
			}
			this.logService.error(`[AutomationRunner] run for ${automation.id} failed`, err);
			try {
				const errorMessage = err instanceof Error ? err.message : String(err);
				this.notificationService.error(localize('automationRunFailed', "Automation '{0}' failed: {1}", automation.name, errorMessage));
				let failedRun: IAutomationRun | undefined;
				if (runId) {
					failedRun = await this._finishRun(state, trigger, automation, {
						status: 'failed',
						errorMessage,
					});
				} else {
					publishAutomationRun(this.telemetryService, { trigger, automation, success: false, durationMs: Date.now() - state.startTimeMs });
				}
				// No-op when the session was already dispatched and failed later in its lifecycle.
				await dispatched.complete({ kind: 'notStarted', reason: 'error', run: failedRun });
				publishAutomationRunError(this.telemetryService, { trigger, automation });
			} catch (innerErr) {
				this.logService.error(`[AutomationRunner] error recording failure for ${automation.id}`, innerErr);
			}
		}
	}

	private async _markCancelled(state: IAutomationRunState, trigger: AutomationRunTrigger, automation: IAutomationDescriptor): Promise<void> {
		await this._finishRun(state, trigger, automation, {
			status: 'failed',
			errorMessage: localize('automationRunner.cancelled', "Cancelled"),
		});
	}

	private _finishRun(state: IAutomationRunState, trigger: AutomationRunTrigger, automation: IAutomationDescriptor, outcome: IAutomationRunOutcome): Promise<IAutomationRun | undefined> {
		// Select synchronously, before persistence can yield to another terminal signal.
		state.outcome ??= outcome;
		if (!state.runId) {
			return Promise.resolve(undefined);
		}
		return state.whenRecorded ??= this._recordOutcome(state.runId, state.outcome, trigger, automation, state.startTimeMs);
	}

	private async _recordOutcome(runId: string, outcome: IAutomationRunOutcome, trigger: AutomationRunTrigger, automation: IAutomationDescriptor, startTimeMs: number): Promise<IAutomationRun | undefined> {
		try {
			if (this.automationService.getActiveRunFor(automation.id)?.id !== runId) {
				this.logService.trace(`[AutomationRunner] not recording outcome for inactive run ${runId} (automation ${automation.id}).`);
				return undefined;
			}
			const run = await this.automationService.updateRun(runId, {
				...outcome,
				completedAt: new Date().toISOString(),
			});
			if (!run) {
				this.logService.warn(`[AutomationRunner] run ${runId} for automation ${automation.id} disappeared before its ${outcome.status} outcome could be recorded.`);
				return undefined;
			}
			publishAutomationRun(this.telemetryService, { trigger, automation, success: outcome.status === 'completed', durationMs: Date.now() - startTimeMs });
			return run;
		} catch (err) {
			this.logService.error(`[AutomationRunner] error recording ${outcome.status} outcome for run ${runId} (automation ${automation.id})`, err);
			return undefined;
		}
	}
}
