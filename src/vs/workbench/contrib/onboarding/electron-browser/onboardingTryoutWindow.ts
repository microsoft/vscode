/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationError, getErrorMessage } from '../../../../base/common/errors.js';
import { Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { localize } from '../../../../nls.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { INativeHostService } from '../../../../platform/native/common/native.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { IWorkbenchEnvironmentService } from '../../../services/environment/common/environmentService.js';
import { IOnboardingTryoutService, parseOnboardingTryoutArguments, RUN_ONBOARDING_TRYOUT_COMMAND_ID } from '../common/onboardingTryout.js';

export class NativeOnboardingTryoutWindow extends Disposable {

	constructor(
		requests: Event<readonly unknown[]>,
		private readonly whenRestored: Promise<void>,
		@IOnboardingTryoutService private readonly tryoutService: IOnboardingTryoutService,
		@INativeHostService nativeHostService: INativeHostService,
		@ICommandService private readonly commandService: ICommandService,
		@IWorkbenchEnvironmentService environmentService: IWorkbenchEnvironmentService,
		@INotificationService private readonly notificationService: INotificationService,
		@ILogService private readonly logService: ILogService,
	) {
		super();

		this._register(tryoutService.registerWindowOpener(async (id, token) => {
			if (token.isCancellationRequested || this._store.isDisposed) {
				throw new CancellationError();
			}
			await nativeHostService.openAgentsWindow({ tryoutId: this.getAgentsTryoutId([id]) });
		}));

		if (environmentService.isSessionsWindow) {
			this._register(requests(args => {
				this.handleRequest(args).catch(error => this.logService.error('[OnboardingTryout] Native handoff failed', error));
			}));
		}
	}

	private getAgentsTryoutId(args: readonly unknown[]): string {
		const id = parseOnboardingTryoutArguments(args);
		const tryout = this.tryoutService.getTryout(id);
		if (!tryout || tryout.tryout.targetWindow !== 'agents') {
			throw new Error(localize('onboarding.tryout.notInAgentsWindow', "The feature example '{0}' is not available in the Agents window.", id));
		}
		return id;
	}

	private async handleRequest(args: readonly unknown[]): Promise<void> {
		await this.whenRestored;
		if (this._store.isDisposed) {
			return;
		}

		let id: string;
		try {
			id = this.getAgentsTryoutId(args);
		} catch (error) {
			this.notificationService.error(getErrorMessage(error));
			throw error;
		}

		// The shared command rechecks destination availability and owns launch/setup notifications.
		await this.commandService.executeCommand(RUN_ONBOARDING_TRYOUT_COMMAND_ID, id);
	}
}
