/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DeferredPromise, raceTimeout } from '../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../base/common/cancellation.js';
import { URI } from '../../../base/common/uri.js';
import { localize } from '../../../nls.js';
import { ICodeWindow } from '../../window/electron-main/window.js';
import { IOpenConfiguration, IWindowsMainService } from '../../windows/electron-main/windows.js';
import { IOpenAgentsWindowOptions, OnboardingTryoutWindowRequestResult } from '../common/native.js';

const TRYOUT_ACCEPT_TIMEOUT = 30_000;

interface IPendingOnboardingTryout {
	readonly sourceWindowId: number;
	readonly cancellation: CancellationTokenSource;
	readonly completion: DeferredPromise<OnboardingTryoutWindowRequestResult>;
	destinationWindow: ICodeWindow | undefined;
}

const pendingOnboardingTryouts = new Map<string, IPendingOnboardingTryout>();

export async function openAgentsWindow(windowsMainService: IWindowsMainService, openConfig: IOpenConfiguration, options?: IOpenAgentsWindowOptions): Promise<OnboardingTryoutWindowRequestResult | undefined> {
	const request = options?.tryoutRequest;
	const pending = request ? createPendingRequest(openConfig.contextWindowId, request.requestId) : undefined;
	try {
		const opening = windowsMainService.openAgentsWindow(
			openConfig,
			options?.folderUri ? URI.revive(options.folderUri) : undefined,
			options?.sessionResource ? URI.revive(options.sessionResource) : undefined,
			options?.source,
			options?.folderUriIsDefault,
		);
		const windows = pending
			? await raceWindowOpening(opening, pending.completion)
			: await opening;
		if (!Array.isArray(windows)) {
			return windows;
		}
		if (pending?.completion.isSettled) {
			return pending.completion.p;
		}
		if (windows.length > 0) {
			windows[0].focus();
		}
		if (!request || !pending) {
			return undefined;
		}
		if (windows.length !== 1) {
			throw new Error(localize('onboardingTryout.noAgentsWindow', "The feature example could not be sent to an Agents window."));
		}
		pending.destinationWindow = windows[0];
		windows[0].sendWhenReady('vscode:runOnboardingTryout', pending.cancellation.token, request);
		const result = await raceTimeout(pending.completion.p, TRYOUT_ACCEPT_TIMEOUT);
		if (result === undefined) {
			pending.cancellation.cancel();
			pending.destinationWindow.sendWhenReady('vscode:cancelOnboardingTryout', CancellationToken.None, request.requestId);
			throw new Error(localize('onboardingTryout.acceptTimeout', "The Agents window did not accept the feature example in time."));
		}
		return result;
	} finally {
		if (request && pendingOnboardingTryouts.get(request.requestId) === pending) {
			pendingOnboardingTryouts.delete(request.requestId);
		}
		pending?.cancellation.dispose();
	}
}

async function raceWindowOpening(opening: Promise<ICodeWindow[]>, completion: DeferredPromise<OnboardingTryoutWindowRequestResult>): Promise<ICodeWindow[] | OnboardingTryoutWindowRequestResult> {
	const outcome = await Promise.race([
		opening.then(
			windows => ({ kind: 'windows' as const, windows }),
			error => ({ kind: 'error' as const, error }),
		),
		completion.p.then(result => ({ kind: 'completion' as const, result })),
	]);
	if (outcome.kind === 'error') {
		throw outcome.error;
	}
	return outcome.kind === 'completion' ? outcome.result : outcome.windows;
}

export function cancelOnboardingTryout(sourceWindowId: number | undefined, requestId: string): void {
	const pending = pendingOnboardingTryouts.get(requestId);
	if (!pending || pending.sourceWindowId !== sourceWindowId) {
		return;
	}
	cancelPendingRequest(requestId, pending, 'cancelled');
}

function cancelPendingRequest(requestId: string, pending: IPendingOnboardingTryout, result: 'cancelled' | 'superseded'): void {
	pending.cancellation.cancel();
	pending.destinationWindow?.sendWhenReady('vscode:cancelOnboardingTryout', CancellationToken.None, requestId);
	void pending.completion.complete(result);
}

export function completeOnboardingTryout(destinationWindowId: number | undefined, requestId: string, result: OnboardingTryoutWindowRequestResult): void {
	const pending = pendingOnboardingTryouts.get(requestId);
	if (!pending || pending.destinationWindow?.id !== destinationWindowId || !isRequestResult(result)) {
		return;
	}
	void pending.completion.complete(result);
}

function createPendingRequest(sourceWindowId: number | undefined, requestId: string): IPendingOnboardingTryout {
	if (typeof sourceWindowId !== 'number' || typeof requestId !== 'string' || !requestId || pendingOnboardingTryouts.has(requestId)) {
		throw new Error(localize('onboardingTryout.invalidRequest', "The feature example request is invalid."));
	}
	for (const [previousId, previous] of pendingOnboardingTryouts) {
		if (!previous.completion.isSettled) {
			cancelPendingRequest(previousId, previous, 'superseded');
		}
	}
	const pending: IPendingOnboardingTryout = {
		sourceWindowId,
		cancellation: new CancellationTokenSource(),
		completion: new DeferredPromise<OnboardingTryoutWindowRequestResult>(),
		destinationWindow: undefined,
	};
	pendingOnboardingTryouts.set(requestId, pending);
	return pending;
}

function isRequestResult(value: unknown): value is OnboardingTryoutWindowRequestResult {
	return value === 'accepted' || value === 'cancelled' || value === 'rejected' || value === 'superseded';
}
