/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DeferredPromise } from '../../../../base/common/async.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { waitForState } from '../../../../base/common/observable.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { localize } from '../../../../nls.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IAutomationDescriptor as IAutomation, IAutomationRun } from '../../../../workbench/contrib/chat/common/automations/automation.js';
import { IAutomationRunDispatch, IAutomationRunner, IAutomationRunOperation } from '../../../../workbench/contrib/chat/common/automations/automationRunner.js';
import { IAutomationService } from '../../../../workbench/contrib/chat/common/automations/automationService.js';
import { publishAutomationRun, publishAutomationRunError } from '../../../../workbench/contrib/chat/common/automations/automationTelemetry.js';

export class AutomationRunner implements IAutomationRunner {

	declare readonly _serviceBrand: undefined;

	constructor(
		@IAutomationService private readonly automationService: IAutomationService,
		@ILogService private readonly logService: ILogService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@INotificationService private readonly notificationService: INotificationService,
	) { }

	runOnce(automation: IAutomation, token: CancellationToken = CancellationToken.None): IAutomationRunOperation {
		const dispatched = new DeferredPromise<IAutomationRunDispatch>();
		return {
			whenDispatched: dispatched.p,
			whenCompleted: this._runOnce(automation, token, dispatched),
		};
	}

	private async _runOnce(automation: IAutomation, token: CancellationToken, dispatched: DeferredPromise<IAutomationRunDispatch>): Promise<void> {
		const startTimeMs = Date.now();
		let run: IAutomationRun | undefined;
		try {
			if (!this.automationService.getAutomation(automation.id)) {
				await dispatched.complete({ kind: 'notStarted', reason: 'deleted' });
				return;
			}
			if (automation.host?.migrationPending) {
				this.notificationService.info(localize('automationTargetUnavailable', "Automation '{0}' cannot start until its agent becomes available.", automation.name));
				await dispatched.complete({ kind: 'notStarted', reason: 'targetUnavailable' });
				return;
			}
			if (token.isCancellationRequested) {
				await dispatched.complete({ kind: 'notStarted', reason: 'cancelled' });
				return;
			}

			const started = await this.automationService.startRun(automation.id, generateUuid());
			if (!started.claimed) {
				await dispatched.complete({ kind: 'alreadyRunning', activeRun: started.run });
				return;
			}
			run = started.run;
			const runs = this.automationService.runsFor(automation.id);
			let current = runs.get().find(candidate => candidate.id === run!.id) ?? run;
			if (!current.sessionResource && !isTerminalRun(current)) {
				const updatedRuns = await waitForState(
					runs,
					items => {
						const candidate = items.find(item => item.id === run!.id);
						return !!candidate?.sessionResource || !!candidate && isTerminalRun(candidate);
					},
					undefined,
					token,
				);
				current = updatedRuns.find(candidate => candidate.id === run!.id) ?? current;
			}

			if (current.sessionResource) {
				await dispatched.complete({ kind: 'started', run: current, sessionResource: current.sessionResource });
			} else {
				await dispatched.complete({
					kind: 'notStarted',
					reason: current.status === 'cancelled' ? 'cancelled' : 'error',
					run: current,
				});
			}

			if (!isTerminalRun(current)) {
				const updatedRuns = await waitForState(
					runs,
					items => {
						const candidate = items.find(item => item.id === run!.id);
						return !!candidate && isTerminalRun(candidate);
					},
					undefined,
					token,
				);
				current = updatedRuns.find(candidate => candidate.id === run!.id) ?? current;
			}

			if (current.status === 'failed') {
				throw new Error(current.errorMessage ?? localize('automationRunner.sessionFailed', "Agent session failed."));
			}
			publishAutomationRun(this.telemetryService, { trigger: 'manual', automation, success: current.status === 'completed', durationMs: Date.now() - startTimeMs });
		} catch (error) {
			if (run && token.isCancellationRequested) {
				try {
					await this.automationService.cancelRun(run.id);
					const runs = this.automationService.runsFor(automation.id);
					const current = runs.get().find(candidate => candidate.id === run!.id);
					if (current && !isTerminalRun(current)) {
						await waitForState(runs, items => {
							const candidate = items.find(item => item.id === run!.id);
							return !!candidate && isTerminalRun(candidate);
						});
					}
				} catch (cancelError) {
					this.logService.error(`[AutomationRunner] Failed to cancel run ${run.id}`, cancelError);
				}
				await dispatched.complete({ kind: 'notStarted', reason: 'cancelled', run });
				publishAutomationRun(this.telemetryService, { trigger: 'manual', automation, success: false, durationMs: Date.now() - startTimeMs });
				return;
			}
			const errorMessage = error instanceof Error ? error.message : String(error);
			this.logService.error(`[AutomationRunner] Run for ${automation.id} failed`, error);
			this.notificationService.error(localize('automationRunFailed', "Automation '{0}' failed: {1}", automation.name, errorMessage));
			await dispatched.complete({ kind: 'notStarted', reason: 'error', run });
			publishAutomationRun(this.telemetryService, { trigger: 'manual', automation, success: false, durationMs: Date.now() - startTimeMs });
			publishAutomationRunError(this.telemetryService, { trigger: 'manual', automation });
		} finally {
			await dispatched.complete({ kind: 'notStarted', reason: 'error', run });
		}
	}
}

function isTerminalRun(run: IAutomationRun): boolean {
	return run.status === 'completed' || run.status === 'failed' || run.status === 'cancelled';
}
