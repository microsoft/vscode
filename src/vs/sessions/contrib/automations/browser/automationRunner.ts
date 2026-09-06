/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DeferredPromise } from '../../../../base/common/async.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { CancellationError, isCancellationError } from '../../../../base/common/errors.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { autorun, derived, waitForState } from '../../../../base/common/observable.js';
import { localize } from '../../../../nls.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { logAutomationRunCompleted, logAutomationRunStarted, type AutomationRunOutcome } from '../../../../platform/telemetry/common/automationTelemetry.js';
import { AutomationRunTrigger, IAutomationDescriptor, IAutomationRun } from '../../../../workbench/contrib/chat/common/automations/automation.js';
import { IAutomationRunDispatch, IAutomationRunner, IAutomationRunOperation } from '../../../../workbench/contrib/chat/common/automations/automationRunner.js';
import { IAutomationService } from '../../../../workbench/contrib/chat/common/automations/automationService.js';
import { publishAutomationRun, publishAutomationRunError } from '../../../../workbench/contrib/chat/common/automations/automationTelemetry.js';
import { IChatService } from '../../../../workbench/contrib/chat/common/chatService/chatService.js';
import { ILanguageModelsService } from '../../../../workbench/contrib/chat/common/languageModels.js';
import { getAutomationConfigurationTelemetry, getAutomationRunTelemetry } from './automationTelemetry.js';
import { ISession, SessionStatus } from '../../../services/sessions/common/session.js';
import { ICreateNewSessionOptions, ISendRequestOptions, ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';
import { IAutomationSessionConfiguration } from '../../../services/sessions/common/sessionsProvider.js';

/** Sessions-layer runner. Never throws; failures are recorded on the run row. */
export class AutomationRunner implements IAutomationRunner {

	declare readonly _serviceBrand: undefined;

	constructor(
		@IAutomationService private readonly automationService: IAutomationService,
		@ISessionsManagementService private readonly sessionsManagementService: ISessionsManagementService,
		@ILogService private readonly logService: ILogService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@INotificationService private readonly notificationService: INotificationService,
		@ILanguageModelsService private readonly languageModelsService: ILanguageModelsService,
		@IChatService private readonly chatService: IChatService,
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
		const runTracking = new DisposableStore();
		let run: IAutomationRun | undefined;
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
			const automationConfiguration: IAutomationSessionConfiguration | undefined = automation.sessionTemplate
				? { sessionTemplate: automation.sessionTemplate }
				: automation.modelId !== undefined || automation.mode !== undefined || automation.permissionLevel !== undefined
					? {
						modelId: automation.modelId,
						mode: automation.mode,
						permissionLevel: automation.permissionLevel,
					}
					: undefined;

			const createOptions: ICreateNewSessionOptions | undefined = target.providerId !== undefined || target.sessionTypeId !== undefined || automationConfiguration !== undefined || isolationMode !== undefined || branch !== undefined
				? {
					providerId: target.providerId,
					sessionTypeId: target.sessionTypeId,
					...(automationConfiguration ? {
						sessionTemplate: automation.sessionTemplate,
						automationConfiguration,
					} : {}),
					...((automation.sessionTemplate?.modelId ?? automation.modelId) ? { modelId: automation.sessionTemplate?.modelId ?? automation.modelId } : {}),
					...(!automation.sessionTemplate && automation.mode ? { modeId: automation.mode } : {}),
					...(!automation.sessionTemplate && automation.permissionLevel ? { permissionLevel: automation.permissionLevel } : {}),
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
				if (claim.externalDispatch) {
					let cancellationForwarded = false;
					const forwardCancellation = () => {
						if (!cancellationForwarded) {
							cancellationForwarded = true;
							try {
								claim.externalDispatch?.cancel?.();
							} catch (error) {
								this.logService.error(`[AutomationRunner] Failed to forward cancellation for ${automation.id}`, error);
							}
						}
					};
					const cancellationListener = claim.externalDispatch.cancel
						? token.onCancellationRequested(forwardCancellation)
						: undefined;
					const sessionResource = claim.externalDispatch.sessionResource;
					try {
						if (sessionResource) {
							await dispatched.complete({ kind: 'started', run: claim.run, sessionResource });
						} else {
							await dispatched.complete({ kind: 'notStarted', reason: 'error', run: claim.run });
						}
						if (token.isCancellationRequested) {
							forwardCancellation();
						}
						await claim.externalDispatch.whenCompleted;
					} finally {
						cancellationListener?.dispose();
					}
					return;
				}
				this.logService.trace(`[AutomationRunner] skipping ${automation.id}: active run already exists.`);
				await dispatched.complete({ kind: 'alreadyRunning', activeRun: claim.run });
				return;
			}
			run = claim.run;
			const runId = run.id;
			runTracking.add(autorun(reader => {
				const current = this.automationService.runs.read(reader).find(candidate => candidate.id === runId);
				if (current) {
					run = current;
				}
			}));
			run = await this.automationService.updateRun(runId, { status: 'running' }) ?? run;
			this.logService.info(`[AutomationRunner] claimed run ${runId} for automation ${automation.id}: trigger=${trigger}, leaderWindowId=${leaderWindowId}.`);

			if (token.isCancellationRequested) {
				await dispatched.complete({ kind: 'notStarted', reason: 'cancelled', run });
				await this._markCancelled(run, trigger, automation, startTimeMs);
				return;
			}

			const options: ISendRequestOptions = {
				query: automation.prompt,
				background: true,
				title: automation.name?.substring(0, 100),
			};

			this.logService.trace(`[AutomationRunner] running ${automation.id}: target=${target.kind}, provider=${createOptions?.providerId ?? '(default)'}, sessionType=${createOptions?.sessionTypeId ?? '(default)'}, model=${automationConfiguration?.modelId ?? '(default)'}, mode=${automationConfiguration?.mode ?? '(default)'}, permissionLevel=${automationConfiguration?.permissionLevel ?? '(default)'}`);
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
					updatedRun = await this.automationService.updateRun(runId, { sessionResource, sessionId: session.sessionId });
				} catch (err) {
					this.logService.warn(`[AutomationRunner] session ${sessionResource.toString()} was created for run ${runId} (automation ${automation.id}), but persisting the session link failed.`, err);
					throw err;
				}
				if (updatedRun) {
					this.logService.info(`[AutomationRunner] linked run ${runId} for automation ${automation.id} to session ${sessionResource.toString()}.`);
					if (updatedRun.status === 'pending' || updatedRun.status === 'running') {
						logAutomationRunStarted(this.telemetryService, {
							...getAutomationConfigurationTelemetry(automation, this.languageModelsService),
							...getAutomationRunTelemetry(updatedRun),
						});
					}
				} else {
					this.logService.warn(`[AutomationRunner] session ${sessionResource.toString()} was created for run ${runId} (automation ${automation.id}), but the run no longer exists and the session link was not persisted.`);
				}
				const dispatchedRun = updatedRun ?? run;
				run = updatedRun ?? { ...run, sessionResource, sessionId: session.sessionId };
				await dispatched.complete({ kind: 'started', run: dispatchedRun, sessionResource });
			} else {
				// Dispatch ended without a session, e.g. the sessions service was disposed mid-send.
				this.logService.warn(`[AutomationRunner] session creation returned no session for run ${runId} (automation ${automation.id}): cancelled=${token.isCancellationRequested}.`);
				await dispatched.complete({ kind: 'notStarted', reason: token.isCancellationRequested ? 'cancelled' : 'error', run });
				if (token.isCancellationRequested) {
					throw new CancellationError();
				}
				throw new Error(localize('automationRunner.noSession', "Automation did not create a session."));
			}

			if (token.isCancellationRequested) {
				await this._markCancelled(run, trigger, automation, startTimeMs);
				return;
			}

			const response = this.chatService.getSession(session.mainChat.get().resource)?.getRequests()[0]?.response;
			const terminalStatus = await waitForState(
				derived(reader => session.mainChat.read(reader).status.read(reader)),
				status => status === SessionStatus.Completed || status === SessionStatus.Error,
				undefined,
				token,
			);

			if (token.isCancellationRequested || response?.isCanceled) {
				await this._markCancelled(run, trigger, automation, startTimeMs);
				return;
			}

			if (terminalStatus === SessionStatus.Error) {
				throw new Error(localize('automationRunner.sessionFailed', "Agent session failed."));
			}

			await this._completeRun(run, 'success');
			publishAutomationRun(this.telemetryService, { trigger, automation, success: true, durationMs: Date.now() - startTimeMs });
		} catch (err) {
			if (run && (token.isCancellationRequested || isCancellationError(err))) {
				await dispatched.complete({ kind: 'notStarted', reason: 'cancelled' });
				await this._markCancelled(run, trigger, automation, startTimeMs);
				return;
			}
			this.logService.error(`[AutomationRunner] run for ${automation.id} failed`, err);
			try {
				const errorMessage = err instanceof Error ? err.message : String(err);
				this.notificationService.error(localize('automationRunFailed', "Automation '{0}' failed: {1}", automation.name, errorMessage));
				let failedRun: IAutomationRun | undefined;
				if (run) {
					failedRun = await this._completeRun(run, 'error', errorMessage);
				}
				// No-op when the session was already dispatched and failed later in its lifecycle.
				await dispatched.complete({ kind: 'notStarted', reason: 'error', run: failedRun });
				publishAutomationRun(this.telemetryService, { trigger, automation, success: false, durationMs: Date.now() - startTimeMs });
				publishAutomationRunError(this.telemetryService, { trigger, automation });
			} catch (innerErr) {
				this.logService.error(`[AutomationRunner] error recording failure for ${automation.id}`, innerErr);
			}
		} finally {
			runTracking.dispose();
		}
	}

	private async _completeRun(run: IAutomationRun, outcome: AutomationRunOutcome, errorMessage?: string): Promise<IAutomationRun | undefined> {
		if (run.status === 'completed' || run.status === 'failed') {
			return run;
		}
		const completedAt = new Date().toISOString();
		const updated = await this.automationService.updateRun(run.id, {
			status: outcome === 'success' ? 'completed' : 'failed',
			outcome,
			completedAt,
			errorMessage,
		});
		// Deleting a legacy definition can remove its history while its session is still executing.
		if (!updated) {
			logAutomationRunCompleted(this.telemetryService, {
				...getAutomationRunTelemetry(run),
				outcome,
				durationMs: Date.parse(completedAt) - Date.parse(run.startedAt),
			});
		}
		return updated;
	}

	private async _markCancelled(run: IAutomationRun, trigger: AutomationRunTrigger, automation: IAutomationDescriptor, startTimeMs: number): Promise<void> {
		try {
			await this._completeRun(run, 'cancelled', localize('automationRunner.cancelled', "Cancelled"));
			publishAutomationRun(this.telemetryService, { trigger, automation, success: false, durationMs: Date.now() - startTimeMs });
		} catch (err) {
			this.logService.error(`[AutomationRunner] error recording cancellation for ${automation.id}`, err);
		}
	}
}
