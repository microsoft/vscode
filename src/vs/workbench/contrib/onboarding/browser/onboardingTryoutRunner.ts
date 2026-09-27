/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { getErrorMessage } from '../../../../base/common/errors.js';
import { equals } from '../../../../base/common/objects.js';
import { localize } from '../../../../nls.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { INotificationService, Severity } from '../../../../platform/notification/common/notification.js';
import { IOnboardingTryoutRunOptions } from '../../../../platform/onboarding/common/onboardingTryoutHandoff.js';
import { IOnboardingTryoutService, OnboardingTryoutResult } from '../common/onboardingTryout.js';

export async function runOnboardingTryout(
	id: string,
	token: CancellationToken,
	tryoutService: IOnboardingTryoutService,
	commandService: ICommandService,
	notificationService: INotificationService,
	logService: ILogService,
	options?: IOnboardingTryoutRunOptions,
): Promise<OnboardingTryoutResult> {
	try {
		const result = await tryoutService.run(id, token, options);
		if (result.kind === 'unavailable') {
			const action = result.action;
			if (action) {
				notificationService.prompt(Severity.Info, result.message, [{
					label: action.label,
					run: async () => {
						const current = tryoutService.getAvailability(id);
						if (current.kind !== 'unavailable' || !current.action || !equals(current.action, action)) {
							notificationService.info(localize('onboarding.tryout.setupChanged', "The example's availability changed. Try opening it again."));
							return;
						}
						try {
							await commandService.executeCommand(current.action.command.id, ...(current.action.command.arguments ?? []));
						} catch (error) {
							logService.error('[OnboardingTryout] Setup failed', error);
							notificationService.error(getErrorMessage(error));
						}
					},
				}]);
			} else {
				notificationService.info(result.message);
			}
		}
		return result;
	} catch (error) {
		logService.error('[OnboardingTryout] Launch failed', error);
		notificationService.error(getErrorMessage(error));
		throw error;
	}
}
