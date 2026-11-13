/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { toAction } from '../../../../base/common/actions.js';
import { getErrorMessage, isCancellationError } from '../../../../base/common/errors.js';
import Severity from '../../../../base/common/severity.js';
import { localize } from '../../../../nls.js';
import { AgentExtensionConsentOption, type AgentCanvasOpenAnswer, type AgentCanvasOpenResult, type IAgentExtensionConsentRequest } from '../../../../platform/agentHost/common/agent.js';
import { IDialogService, type IPromptButton } from '../../../../platform/dialogs/common/dialogs.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import type { ICanvasOpenOptions } from '../../../common/canvasReference.js';

/** A canvas did not open because the user did not allow its extension to load. */
export class CanvasExtensionConsentDeniedError extends Error {
	constructor(readonly consent: IAgentExtensionConsentRequest, readonly retryable: boolean) {
		super(getDeniedMessage(consent, retryable));
		this.name = 'CanvasExtensionConsentDeniedError';
	}
}

/**
 * Opens an agent host canvas, asking the user in a modal dialog whenever the canvas's extension needs consent to load.
 * Throws {@link CanvasExtensionConsentDeniedError} when the user does not allow it.
 */
export async function openCanvasWithExtensionConsent(dialogService: IDialogService, open: (answer?: AgentCanvasOpenAnswer) => Promise<AgentCanvasOpenResult>, options?: ICanvasOpenOptions): Promise<void> {
	let result = await open(options?.retryDeniedConsent ? { kind: 'retry' } : undefined);
	while (result.kind === 'consentRequired') {
		const optionId = await askForExtensionConsent(dialogService, result.consent);
		result = await open({ kind: 'consent', consentId: result.consent.id, optionId });
	}
	if (result.kind === 'consentDenied') {
		throw new CanvasExtensionConsentDeniedError(result.consent, result.retryable);
	}
}

/** Reports a canvas that did not open because its extension was declined, offering to ask again. */
export function notifyCanvasExtensionConsentDenied(notificationService: INotificationService, error: CanvasExtensionConsentDeniedError, retry: () => Promise<void>): void {
	notifyWithRetry(notificationService, Severity.Warning, error.message, retry);
}

function notifyWithRetry(notificationService: INotificationService, severity: Severity, message: string, retry: () => Promise<void>): void {
	notificationService.notify({
		severity,
		message,
		// The declined extension's canvases leave the canvas menus until a retry succeeds, so keep the way to ask again in view.
		sticky: true,
		actions: {
			primary: [toAction({
				id: 'canvas.retryExtensionConsent',
				label: localize('canvasExtensionConsent.tryAgain', "Try Again"),
				run: () => retry().catch(retryError => {
					if (isCancellationError(retryError)) {
						return;
					}
					// A failed retry, for example while the chat is busy, keeps the way to ask again.
					if (retryError instanceof CanvasExtensionConsentDeniedError) {
						notifyWithRetry(notificationService, Severity.Warning, retryError.message, retry);
					} else {
						notifyWithRetry(notificationService, Severity.Error, getErrorMessage(retryError), retry);
					}
				}),
			})],
		},
	});
}

async function askForExtensionConsent(dialogService: IDialogService, consent: IAgentExtensionConsentRequest): Promise<AgentExtensionConsentOption> {
	const environment = consent.kind === 'environment';
	const items = consent.items.join(', ');
	const buttons: IPromptButton<AgentExtensionConsentOption>[] = [
		{ label: localize({ key: 'canvasExtensionConsent.allow', comment: ['&& denotes a mnemonic'] }, "&&Allow"), run: () => AgentExtensionConsentOption.Allow },
	];
	if (consent.persistable) {
		buttons.push(
			{ label: localize({ key: 'canvasExtensionConsent.alwaysAllow', comment: ['&& denotes a mnemonic'] }, "Al&&ways Allow"), run: () => AgentExtensionConsentOption.AlwaysAllow },
			{ label: localize({ key: 'canvasExtensionConsent.never', comment: ['&& denotes a mnemonic'] }, "&&Never"), run: () => AgentExtensionConsentOption.Never },
		);
	}
	const { result } = await dialogService.prompt<AgentExtensionConsentOption>({
		type: Severity.Warning,
		message: environment
			? localize('canvasExtensionConsent.environment.message', "Allow extension '{0}' to read sensitive environment variables?", consent.displayName)
			: localize('canvasExtensionConsent.capabilities.message', "Allow extension '{0}' to load with extra permissions?", consent.displayName),
		detail: environment
			? localize('canvasExtensionConsent.environment.detail', "'{0}' requested: {1}\n\nTheir values may be credentials. Once allowed, the extension can send them anywhere or pass them to processes it starts. If you don't allow access, the extension won't load.", consent.extensionName, items)
			: localize('canvasExtensionConsent.capabilities.detail', "'{0}' requested these permissions: {1}\n\nIf you don't allow them, the extension won't load.", consent.extensionName, items),
		buttons,
		cancelButton: { label: localize('canvasExtensionConsent.notNow', "Not Now"), run: () => AgentExtensionConsentOption.NotNow },
	});
	return result ?? AgentExtensionConsentOption.NotNow;
}

function getDeniedMessage(consent: IAgentExtensionConsentRequest, retryable: boolean): string {
	if (consent.kind === 'environment') {
		return retryable
			? localize('canvasExtensionConsent.environment.denied', "The canvas did not open because extension '{0}' was not allowed to read sensitive environment variables.", consent.displayName)
			: localize('canvasExtensionConsent.environment.never', "The canvas did not open because you chose to never allow extension '{0}' to read sensitive environment variables. To be asked again, remove it from Extension Permission Approvals in the host settings, then select Try Again.", consent.displayName);
	}
	return retryable
		? localize('canvasExtensionConsent.capabilities.denied', "The canvas did not open because extension '{0}' was not allowed to load with the permissions it requested.", consent.displayName)
		: localize('canvasExtensionConsent.capabilities.never', "The canvas did not open because you chose to never allow extension '{0}' to load with the permissions it requested. To be asked again, remove it from Extension Permission Approvals in the host settings, then select Try Again.", consent.displayName);
}
