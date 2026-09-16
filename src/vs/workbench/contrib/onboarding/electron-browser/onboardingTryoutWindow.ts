/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { CancellationError, getErrorMessage } from '../../../../base/common/errors.js';
import { Event } from '../../../../base/common/event.js';
import { Disposable, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { isObject } from '../../../../base/common/types.js';
import { generateUuid, isUUID } from '../../../../base/common/uuid.js';
import { localize } from '../../../../nls.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { INativeHostService, IOnboardingTryoutWindowRequest } from '../../../../platform/native/common/native.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { IWorkbenchEnvironmentService } from '../../../services/environment/common/environmentService.js';
import { IOnboardingTryoutService, parseOnboardingTryoutArguments } from '../common/onboardingTryout.js';
import { runOnboardingTryout } from '../browser/onboardingTryoutRunner.js';

class ActiveNativeTryoutRequest extends Disposable {
	readonly cancellation = this._register(new CancellationTokenSource());

	constructor(readonly request: IOnboardingTryoutWindowRequest) {
		super();
	}

	override dispose(): void {
		this.cancellation.cancel();
		super.dispose();
	}
}

export class NativeOnboardingTryoutWindow extends Disposable {
	private readonly activeRequest = this._register(new MutableDisposable<ActiveNativeTryoutRequest>());

	constructor(
		requests: Event<readonly unknown[]>,
		cancellations: Event<readonly unknown[]>,
		private readonly whenRestored: Promise<void>,
		@IOnboardingTryoutService private readonly tryoutService: IOnboardingTryoutService,
		@INativeHostService private readonly nativeHostService: INativeHostService,
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
			const requestId = generateUuid();
			const cancellation = token.onCancellationRequested(() => {
				void this.nativeHostService.cancelOnboardingTryout(requestId).catch(error => this.logService.error('[OnboardingTryout] Native cancellation failed', error));
			});
			try {
				const result = await this.nativeHostService.openAgentsWindow({
					tryoutRequest: {
						requestId,
						tryoutId: this.getAgentsTryoutId(id),
					},
				});
				if (token.isCancellationRequested || result === 'cancelled' || result === 'superseded') {
					throw new CancellationError();
				}
				if (result !== 'accepted') {
					throw new Error(localize('onboarding.tryout.agentsRejected', "The Agents window could not start the feature example."));
				}
			} finally {
				cancellation.dispose();
			}
		}));

		if (environmentService.isSessionsWindow) {
			this._register(requests(args => {
				this.startRequest(args);
			}));
			this._register(cancellations(args => {
				if (args.length === 1 && typeof args[0] === 'string' && this.activeRequest.value?.request.requestId === args[0]) {
					this.activeRequest.clear();
				}
			}));
		}
	}

	private getAgentsTryoutId(value: unknown): string {
		const id = parseOnboardingTryoutArguments([value]);
		const tryout = this.tryoutService.getTryout(id);
		if (!tryout || tryout.tryout.targetWindow !== 'agents') {
			throw new Error(localize('onboarding.tryout.notInAgentsWindow', "The feature example '{0}' is not available in the Agents window.", id));
		}
		return id;
	}

	private startRequest(args: readonly unknown[]): void {
		let request: IOnboardingTryoutWindowRequest | undefined;
		try {
			request = this.parseRequest(args);
		} catch (error) {
			const requestId = this.getRequestId(args);
			if (requestId) {
				void this.nativeHostService.completeOnboardingTryout(requestId, 'rejected');
			}
			this.notificationService.error(getErrorMessage(error));
			this.logService.error('[OnboardingTryout] Native handoff failed', error);
			return;
		}

		const previous = this.activeRequest.value;
		if (previous) {
			void this.nativeHostService.completeOnboardingTryout(previous.request.requestId, 'superseded');
		}
		const active = new ActiveNativeTryoutRequest(request);
		this.activeRequest.value = active;
		this.handleRequest(active).catch(error => this.logService.error('[OnboardingTryout] Native handoff failed', error));
	}

	private parseRequest(args: readonly unknown[]): IOnboardingTryoutWindowRequest {
		if (args.length !== 1 || !isObject(args[0])) {
			throw new Error(localize('onboarding.tryout.invalidNativeRequest', "The feature example request is invalid."));
		}
		const candidate = args[0] as Partial<IOnboardingTryoutWindowRequest>;
		if (Object.keys(candidate).length !== 2
			|| typeof candidate.requestId !== 'string' || !isUUID(candidate.requestId)
			|| typeof candidate.tryoutId !== 'string') {
			throw new Error(localize('onboarding.tryout.invalidNativeRequest', "The feature example request is invalid."));
		}
		return { requestId: candidate.requestId, tryoutId: candidate.tryoutId };
	}

	private getRequestId(args: readonly unknown[]): string | undefined {
		if (args.length !== 1 || !isObject(args[0])) {
			return undefined;
		}
		const requestId = (args[0] as Partial<IOnboardingTryoutWindowRequest>).requestId;
		return typeof requestId === 'string' && isUUID(requestId) ? requestId : undefined;
	}

	private async handleRequest(active: ActiveNativeTryoutRequest): Promise<void> {
		await this.whenRestored;
		if (this._store.isDisposed || this.activeRequest.value !== active || active.cancellation.token.isCancellationRequested) {
			return;
		}

		let id: string;
		try {
			id = this.getAgentsTryoutId(active.request.tryoutId);
		} catch (error) {
			await this.nativeHostService.completeOnboardingTryout(active.request.requestId, 'rejected');
			this.notificationService.error(getErrorMessage(error));
			throw error;
		}

		await this.nativeHostService.completeOnboardingTryout(active.request.requestId, 'accepted');
		if (this.activeRequest.value !== active || active.cancellation.token.isCancellationRequested) {
			return;
		}
		try {
			await runOnboardingTryout(
				id,
				active.cancellation.token,
				this.tryoutService,
				this.commandService,
				this.notificationService,
				this.logService,
			);
		} finally {
			if (this.activeRequest.value === active) {
				this.activeRequest.clear();
			}
		}
	}

	override dispose(): void {
		const active = this.activeRequest.value;
		if (active) {
			void this.nativeHostService.completeOnboardingTryout(active.request.requestId, 'cancelled');
		}
		super.dispose();
	}
}
