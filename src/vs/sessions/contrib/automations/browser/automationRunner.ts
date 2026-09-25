/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DeferredPromise } from '../../../../base/common/async.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { isCancellationError } from '../../../../base/common/errors.js';
import { localize } from '../../../../nls.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { IAutomationDescriptor } from '../../../../workbench/contrib/chat/common/automations/automation.js';
import { IAutomationRunDispatch, IAutomationRunner, IAutomationRunOperation } from '../../../../workbench/contrib/chat/common/automations/automationRunner.js';
import { AutomationUnavailableError, IAutomationService } from '../../../../workbench/contrib/chat/common/automations/automationService.js';
import { ISessionsProvidersService } from '../../../services/sessions/browser/sessionsProvidersService.js';

/**
 * Client-side Run Now coordinator that requests execution through IAutomationService and observes the host result.
 * Reports dispatch failures and forwards supported cancellation without creating run sessions.
 */
export class AutomationRunner implements IAutomationRunner {

	declare readonly _serviceBrand: undefined;

	constructor(
		@IAutomationService private readonly automationService: IAutomationService,
		@ISessionsProvidersService private readonly sessionsProvidersService: ISessionsProvidersService,
		@ILogService private readonly logService: ILogService,
		@INotificationService private readonly notificationService: INotificationService,
	) { }

	runOnce(automation: IAutomationDescriptor, token: CancellationToken = CancellationToken.None): IAutomationRunOperation {
		const dispatched = new DeferredPromise<IAutomationRunDispatch>();
		return {
			whenDispatched: dispatched.p,
			whenCompleted: this.run(automation, token, dispatched),
		};
	}

	private async run(automation: IAutomationDescriptor, token: CancellationToken, dispatched: DeferredPromise<IAutomationRunDispatch>): Promise<void> {
		try {
			if (token.isCancellationRequested) {
				await dispatched.complete({ kind: 'notStarted', reason: 'cancelled' });
				return;
			}
			this.assertProviderAvailable(automation.target.providerId);
			if (!this.automationService.getAutomation(automation.id)) {
				await dispatched.complete({ kind: 'notStarted', reason: 'deleted' });
				return;
			}
			if (!this.automationService.canRunAutomation(automation.id)) {
				throw new AutomationUnavailableError(localize('automationRunUnavailable', "The automation's Agent Host is not ready to run it."));
			}
			const result = await this.automationService.runAutomation(automation.id, token);
			if (result.kind === 'alreadyRunning') {
				await dispatched.complete({ kind: 'alreadyRunning', activeRun: result.run });
				return;
			}

			let cancellationForwarded = false;
			const forwardCancellation = () => {
				if (!cancellationForwarded) {
					cancellationForwarded = true;
					try {
						result.cancel?.();
					} catch (error) {
						this.logService.error(`[AutomationRunner] Failed to forward cancellation for ${automation.id}`, error);
					}
				}
			};
			const cancellationListener = result.cancel ? token.onCancellationRequested(forwardCancellation) : undefined;
			try {
				if (result.run.sessionResource) {
					await dispatched.complete({ kind: 'started', run: result.run, sessionResource: result.run.sessionResource });
				} else if (token.isCancellationRequested) {
					await dispatched.complete({ kind: 'notStarted', reason: 'cancelled', run: result.run });
				} else {
					this.notificationService.error(localize('automationDispatchFailed', "Automation '{0}' did not start a session: {1}", automation.name, result.run.errorMessage ?? localize('automationDispatchNoSession', "The Agent Host ended the run without a session.")));
					await dispatched.complete({ kind: 'notStarted', reason: 'error', run: result.run });
				}
				if (token.isCancellationRequested) {
					forwardCancellation();
				}
				await result.whenCompleted;
			} finally {
				cancellationListener?.dispose();
			}
		} catch (error) {
			if (token.isCancellationRequested && isCancellationError(error)) {
				await dispatched.complete({ kind: 'notStarted', reason: 'cancelled' });
				return;
			}
			this.logService.error(`[AutomationRunner] Host run request for ${automation.id} failed`, error);
			this.notificationService.error(localize('automationRunFailed', "Automation '{0}' failed: {1}", automation.name, error instanceof Error ? error.message : String(error)));
			await dispatched.complete({ kind: 'notStarted', reason: error instanceof AutomationUnavailableError ? 'targetUnavailable' : 'error' });
		}
	}

	private assertProviderAvailable(providerId: string | undefined): void {
		if (providerId === undefined) {
			throw new AutomationUnavailableError(localize('automationHostNotSelected', "This automation has no Agent Host. Duplicate it and select an Agent Host."));
		}
		const provider = this.sessionsProvidersService.getProvider(providerId);
		if (provider === undefined) {
			throw new AutomationUnavailableError(localize('automationHostNotConnected', "Connect to this automation's Agent Host and try again."));
		}
		const store = provider.automations;
		if (store === undefined) {
			throw new AutomationUnavailableError(localize('automationProviderUnsupported', "{0} does not support automations. Use an Agent Host that supports automations.", provider.label));
		}
		switch (store.catalogueState.get()) {
			case 'ready':
				return;
			case 'loading':
				throw new AutomationUnavailableError(localize('automationHostLoading', "Automations from {0} are still loading. Wait for loading to finish, then try again.", provider.label));
			case 'error':
				throw new AutomationUnavailableError(localize('automationHostLoadError', "Automations from {0} could not be loaded. Reconnect to the Agent Host and try again.", provider.label));
			case 'unavailable':
				throw new AutomationUnavailableError(store.unavailableReason?.get() ?? localize('automationHostUnavailable', "{0} is unavailable. Reconnect to the Agent Host and try again.", provider.label));
		}
	}
}
