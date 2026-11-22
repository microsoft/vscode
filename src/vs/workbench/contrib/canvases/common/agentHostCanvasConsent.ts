/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { toAction } from '../../../../base/common/actions.js';
import { toErrorMessage } from '../../../../base/common/errorMessage.js';
import { getErrorMessage, isCancellationError } from '../../../../base/common/errors.js';
import Severity from '../../../../base/common/severity.js';
import { localize } from '../../../../nls.js';
import { AgentExtensionConsentOption, type AgentCanvasOpenAnswer, type AgentCanvasOpenFailure, type AgentCanvasOpenResult, type IAgentExtensionConsentRequest } from '../../../../platform/agentHost/common/agent.js';
import { IDialogService, type IPromptButton } from '../../../../platform/dialogs/common/dialogs.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { IProgressService, ProgressLocation } from '../../../../platform/progress/common/progress.js';
import type { ICanvasOpenOptions } from '../../../common/canvasReference.js';

/** How long an open the user asked for may take before it shows progress, so that opening a running canvas shows none. */
const CANVAS_OPEN_PROGRESS_DELAY_MS = 500;

/** A canvas did not open because the user did not allow its extension to load. */
export class CanvasExtensionConsentDeniedError extends Error {
	constructor(readonly consent: IAgentExtensionConsentRequest, readonly retryable: boolean) {
		super(getDeniedMessage(consent, retryable));
		this.name = 'CanvasExtensionConsentDeniedError';
	}
}

/** A canvas did not open for a reason its host reported. */
export class CanvasOpenFailedError extends Error {
	constructor(readonly failure: AgentCanvasOpenFailure) {
		super(getFailureMessage(failure));
		this.name = 'CanvasOpenFailedError';
	}

	/** Whether opening the canvas again can succeed. */
	get retryable(): boolean {
		return this.failure === 'reloaded';
	}
}

/**
 * Opens an agent host canvas, asking the user in a modal dialog whenever the canvas's extension needs consent to load.
 * Throws {@link CanvasExtensionConsentDeniedError} when the user does not allow it, and {@link CanvasOpenFailedError}
 * when the host reports why the canvas did not open.
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
	if (result.kind === 'failed') {
		throw new CanvasOpenFailedError(result.failure);
	}
}

/**
 * Opens a canvas the user asked for through `open`, showing progress while it takes long, as it does when its extension
 * starts on first use, and reports a failure with the way to recover from it.
 */
export async function openCanvasForUser(progressService: IProgressService, notificationService: INotificationService, label: string, open: (options?: ICanvasOpenOptions) => Promise<void>): Promise<void> {
	const openWithProgress = (options?: ICanvasOpenOptions) => progressService.withProgress({
		location: ProgressLocation.Notification,
		title: localize('canvasOpen.progress', "Opening canvas {0}...", label),
		delay: CANVAS_OPEN_PROGRESS_DELAY_MS,
	}, () => open(options));
	try {
		await openWithProgress();
	} catch (error) {
		notifyCanvasOpenFailure(notificationService, error, label, openWithProgress);
	}
}

/**
 * Reports a canvas the user asked for that did not open, offering to try again when that can help. A canvas closed while
 * it opened, or an open the user cancelled, is not reported. Each attempt is reported in turn, so that trying again asks
 * again for consent whenever the latest attempt was declined.
 */
export function notifyCanvasOpenFailure(notificationService: INotificationService, error: unknown, label: string, open: (options?: ICanvasOpenOptions) => Promise<void>): void {
	if (isCancellationError(error)) {
		return;
	}
	if (error instanceof CanvasExtensionConsentDeniedError) {
		notifyWithRetry(notificationService, Severity.Warning, error.message, label, open, { retryDeniedConsent: true });
	} else if (error instanceof CanvasOpenFailedError) {
		if (error.retryable) {
			notifyWithRetry(notificationService, Severity.Warning, getFailureMessage(error.failure, label), label, open, undefined);
		} else if (error.failure !== 'dismissed') {
			notificationService.notify({ severity: error.failure === 'unavailable' ? Severity.Warning : Severity.Error, message: getFailureMessage(error.failure, label) });
		}
	} else {
		notificationService.error(localize('canvasOpen.failed', "Could not open canvas {0}: {1}", label, toErrorMessage(error)));
	}
}

/** Reports a canvas, named `label`, that did not open, keeping a way to try again with `options` until it opens. */
function notifyWithRetry(notificationService: INotificationService, severity: Severity, message: string, label: string, open: (options?: ICanvasOpenOptions) => Promise<void>, options: ICanvasOpenOptions | undefined): void {
	notificationService.notify({
		severity,
		message,
		// A declined extension's canvases leave the canvas menus until a retry succeeds, so keep the way to try again in view.
		sticky: true,
		actions: {
			primary: [toAction({
				id: 'canvas.retryExtensionConsent',
				label: localize('canvasExtensionConsent.tryAgain', "Try Again"),
				run: () => open(options).catch(retryError => {
					if (isCancellationError(retryError) || retryError instanceof CanvasExtensionConsentDeniedError || retryError instanceof CanvasOpenFailedError) {
						notifyCanvasOpenFailure(notificationService, retryError, label, open);
					} else {
						// A retry that failed otherwise, for example while the chat is busy, keeps the way to try again.
						notifyWithRetry(notificationService, Severity.Error, getErrorMessage(retryError), label, open, options);
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

/** Why a canvas did not open, naming it when `label` is known. */
function getFailureMessage(failure: AgentCanvasOpenFailure, label?: string): string {
	switch (failure) {
		case 'dismissed':
			// Never reported: the canvas was closed on purpose.
			return localize('canvasOpen.dismissed', "The canvas was closed while it opened.");
		case 'reloaded':
			return label
				? localize('canvasOpen.reloaded.named', "Canvas {0} did not open because its extensions were reloaded while its extension started.", label)
				: localize('canvasOpen.reloaded', "The canvas did not open because its extensions were reloaded while its extension started.");
		case 'mismatchedDeclaration':
			return label
				? localize('canvasOpen.mismatchedDeclaration.named', "Canvas {0} was withdrawn because its extension registered it differently from its extension.json declaration. The extension must register exactly what it declares.", label)
				: localize('canvasOpen.mismatchedDeclaration', "The canvas was withdrawn because its extension registered it differently from its extension.json declaration. The extension must register exactly what it declares.");
		case 'startFailed':
			return label
				? localize('canvasOpen.startFailed.named', "Canvas {0} did not open because its extension did not start. Check the extension for errors.", label)
				: localize('canvasOpen.startFailed', "The canvas did not open because its extension did not start. Check the extension for errors.");
		case 'unavailable':
			return label
				? localize('canvasOpen.unavailable.named', "Canvas {0} is no longer available. Its extension may have been disabled, removed, or failed to start.", label)
				: localize('canvasOpen.unavailable', "The canvas is no longer available. Its extension may have been disabled, removed, or failed to start.");
	}
}
