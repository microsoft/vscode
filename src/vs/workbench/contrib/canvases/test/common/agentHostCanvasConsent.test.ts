/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationError } from '../../../../../base/common/errors.js';
import Severity from '../../../../../base/common/severity.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { AgentExtensionConsentOption, type AgentCanvasOpenAnswer, type AgentCanvasOpenResult, type IAgentExtensionConsentRequest } from '../../../../../platform/agentHost/common/agent.js';
import type { IDialogService, IPromptWithCustomCancel } from '../../../../../platform/dialogs/common/dialogs.js';
import type { INotification, INotificationHandle } from '../../../../../platform/notification/common/notification.js';
import { TestNotificationService } from '../../../../../platform/notification/test/common/testNotificationService.js';
import { CanvasExtensionConsentDeniedError, notifyCanvasExtensionConsentDenied, openCanvasWithExtensionConsent } from '../../common/agentHostCanvasConsent.js';

suite('Agent host canvas extension consent', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	class RecordingNotificationService extends TestNotificationService {
		readonly notifications: INotification[] = [];
		override notify(notification: INotification): INotificationHandle {
			this.notifications.push(notification);
			return super.notify(notification);
		}
	}

	const variable = 'BLACKBIRD_AUTH_METIS_API_KEY';
	const consent = (persistable: boolean): IAgentExtensionConsentRequest => ({ id: 'consent-1', kind: 'environment', extensionName: 'user:demo', displayName: 'demo', items: [variable], persistable });

	/** Records each prompt and answers it with the button whose label it names, or with the cancel button as Escape does. */
	function createDialog(choices: string[]) {
		const prompts: { message: string; detail: unknown; buttons: string[]; cancel: string | undefined }[] = [];
		const dialogService = {
			async prompt<T>(prompt: IPromptWithCustomCancel<T>) {
				const buttons = prompt.buttons ?? [];
				prompts.push({ message: prompt.message, detail: prompt.detail, buttons: buttons.map(button => button.label), cancel: prompt.cancelButton.label });
				const choice = choices.shift();
				const button = buttons.find(candidate => candidate.label === choice) ?? prompt.cancelButton;
				return { result: await button.run({ checkboxChecked: false }) };
			},
		} as Partial<IDialogService> as IDialogService;
		return { dialogService, prompts };
	}

	function createHost(results: AgentCanvasOpenResult[]) {
		const answers: (AgentCanvasOpenAnswer | undefined)[] = [];
		return {
			answers,
			open: async (answer?: AgentCanvasOpenAnswer) => {
				answers.push(answer);
				const result = results.shift();
				assert.ok(result);
				return result;
			},
		};
	}

	test('asks with the variable names, answers Not Now on Escape and reports a retryable denial', async () => {
		const { dialogService, prompts } = createDialog([]);
		const host = createHost([{ kind: 'consentRequired', consent: consent(false) }, { kind: 'consentDenied', consent: consent(false), retryable: true }]);
		const error = await openCanvasWithExtensionConsent(dialogService, host.open).then(() => undefined, error => error);
		assert.ok(error instanceof CanvasExtensionConsentDeniedError);
		assert.deepStrictEqual({ prompts, answers: host.answers, message: error.message, retryable: error.retryable }, {
			prompts: [{
				message: `Allow extension 'demo' to read sensitive environment variables?`,
				detail: `'user:demo' requested: ${variable}\n\nTheir values may be credentials. Once allowed, the extension can send them anywhere or pass them to processes it starts. If you don't allow access, the extension won't load.`,
				buttons: ['&&Allow'],
				cancel: 'Not Now',
			}],
			answers: [undefined, { kind: 'consent', consentId: 'consent-1', optionId: AgentExtensionConsentOption.NotNow }],
			message: `The canvas did not open because extension 'demo' was not allowed to read sensitive environment variables.`,
			retryable: true,
		});
	});

	test('a retry asks the host to retry first, and a persistable request offers Always Allow and Never', async () => {
		const { dialogService, prompts } = createDialog(['Al&&ways Allow']);
		const host = createHost([{ kind: 'consentRequired', consent: consent(true) }, { kind: 'opened' }]);
		await openCanvasWithExtensionConsent(dialogService, host.open, { retryDeniedConsent: true });
		assert.deepStrictEqual({ buttons: prompts.map(prompt => prompt.buttons), answers: host.answers }, {
			buttons: [['&&Allow', 'Al&&ways Allow', '&&Never']],
			answers: [{ kind: 'retry' }, { kind: 'consent', consentId: 'consent-1', optionId: AgentExtensionConsentOption.AlwaysAllow }],
		});
	});

	test('keeps Try Again in view for every denial and after a failed retry, but not after a cancelled one', async () => {
		const notificationService = new RecordingNotificationService();
		const notifications = notificationService.notifications;
		const outcomes: (() => Promise<void>)[] = [
			async () => { throw new CanvasExtensionConsentDeniedError(consent(true), true); },
			async () => { throw new Error('Try again after the chat finishes its current work.'); },
			async () => { throw new CancellationError(); },
		];
		const retry = () => outcomes.shift()!();
		notifyCanvasExtensionConsentDenied(notificationService, new CanvasExtensionConsentDeniedError(consent(true), false), retry);
		for (let index = 0; index < 3; index++) {
			await notifications[index].actions?.primary?.[0].run();
		}
		assert.deepStrictEqual(notifications.map(notification => ({
			severity: notification.severity,
			message: notification.message,
			sticky: notification.sticky,
			actions: notification.actions?.primary?.map(action => action.label),
		})), [
			{ severity: Severity.Warning, message: `The canvas did not open because you chose to never allow extension 'demo' to read sensitive environment variables. To be asked again, remove it from Extension Permission Approvals in the host settings, then select Try Again.`, sticky: true, actions: ['Try Again'] },
			{ severity: Severity.Warning, message: `The canvas did not open because extension 'demo' was not allowed to read sensitive environment variables.`, sticky: true, actions: ['Try Again'] },
			{ severity: Severity.Error, message: 'Try again after the chat finishes its current work.', sticky: true, actions: ['Try Again'] },
		]);
	});
});
