/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DeferredPromise, raceTimeout } from '../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../base/common/cancellation.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { isUUID } from '../../../base/common/uuid.js';
import { localize } from '../../../nls.js';
import { IEnvironmentMainService } from '../../environment/electron-main/environmentMainService.js';
import { ICodeWindow } from '../../window/electron-main/window.js';
import { IWindowsMainService, OpenContext } from '../../windows/electron-main/windows.js';
import { IOnboardingTryoutWindowRequest, OnboardingTryoutWindowRequestResult } from '../common/onboardingTryoutHandoff.js';

const TRYOUT_ACCEPT_TIMEOUT = 30_000;

interface IPendingOnboardingTryout {
	readonly sourceWindowId: number;
	readonly cancellation: CancellationTokenSource;
	readonly completion: DeferredPromise<OnboardingTryoutWindowRequestResult>;
	destinationWindow: ICodeWindow | undefined;
}

export class OnboardingTryoutHandoff extends Disposable {
	private readonly pendingRequests = new Map<string, IPendingOnboardingTryout>();

	constructor(
		@IWindowsMainService private readonly windowsMainService: IWindowsMainService,
		@IEnvironmentMainService private readonly environmentService: IEnvironmentMainService,
	) {
		super();
	}

	async open(sourceWindowId: number, request: IOnboardingTryoutWindowRequest): Promise<OnboardingTryoutWindowRequestResult> {
		if (this._store.isDisposed || !request || typeof request.requestId !== 'string' || !isUUID(request.requestId) || typeof request.tryoutId !== 'string') {
			throw new Error(localize('onboardingTryout.invalidRequest', "The feature example request is invalid."));
		}
		const pending = this.createPendingRequest(sourceWindowId, request.requestId);
		try {
			const opening = this.windowsMainService.openAgentsWindow({
				context: OpenContext.API,
				contextWindowId: sourceWindowId,
				cli: this.environmentService.args,
			});
			const windows = await Promise.race([opening, pending.completion.p]);
			if (!Array.isArray(windows)) {
				return windows;
			}
			if (pending.completion.isSettled) {
				return pending.completion.p;
			}
			if (windows.length !== 1) {
				throw new Error(localize('onboardingTryout.noAgentsWindow', "The feature example could not be sent to an Agents window."));
			}
			pending.destinationWindow = windows[0];
			windows[0].focus();
			windows[0].sendWhenReady('vscode:runOnboardingTryout', pending.cancellation.token, request);
			const result = await raceTimeout(pending.completion.p, TRYOUT_ACCEPT_TIMEOUT);
			if (result === undefined) {
				this.cancelPendingRequest(request.requestId, pending, 'cancelled');
				throw new Error(localize('onboardingTryout.acceptTimeout', "The Agents window did not accept the feature example in time."));
			}
			return result;
		} finally {
			this.pendingRequests.delete(request.requestId);
			pending.cancellation.dispose();
		}
	}

	async cancel(sourceWindowId: number, requestId: string): Promise<void> {
		const pending = this.pendingRequests.get(requestId);
		if (pending?.sourceWindowId === sourceWindowId) {
			this.cancelPendingRequest(requestId, pending, 'cancelled');
		}
	}

	async complete(destinationWindowId: number, requestId: string, result: OnboardingTryoutWindowRequestResult): Promise<void> {
		const pending = this.pendingRequests.get(requestId);
		if (pending?.destinationWindow?.id === destinationWindowId && isRequestResult(result)) {
			await pending.completion.complete(result);
		}
	}

	private cancelPendingRequest(requestId: string, pending: IPendingOnboardingTryout, result: 'cancelled' | 'superseded'): void {
		pending.cancellation.cancel();
		pending.destinationWindow?.sendWhenReady('vscode:cancelOnboardingTryout', CancellationToken.None, requestId);
		void pending.completion.complete(result);
	}

	private createPendingRequest(sourceWindowId: number, requestId: string): IPendingOnboardingTryout {
		if (!Number.isInteger(sourceWindowId) || this.pendingRequests.has(requestId)) {
			throw new Error(localize('onboardingTryout.invalidRequest', "The feature example request is invalid."));
		}
		for (const [previousId, previous] of this.pendingRequests) {
			if (!previous.completion.isSettled) {
				this.cancelPendingRequest(previousId, previous, 'superseded');
			}
		}
		const pending: IPendingOnboardingTryout = {
			sourceWindowId,
			cancellation: new CancellationTokenSource(),
			completion: new DeferredPromise<OnboardingTryoutWindowRequestResult>(),
			destinationWindow: undefined,
		};
		this.pendingRequests.set(requestId, pending);
		return pending;
	}

	override dispose(): void {
		for (const [id, pending] of this.pendingRequests) {
			this.cancelPendingRequest(id, pending, 'cancelled');
			pending.cancellation.dispose();
		}
		this.pendingRequests.clear();
		super.dispose();
	}
}

function isRequestResult(value: unknown): value is OnboardingTryoutWindowRequestResult {
	return value === 'accepted' || value === 'cancelled' || value === 'rejected' || value === 'superseded';
}
