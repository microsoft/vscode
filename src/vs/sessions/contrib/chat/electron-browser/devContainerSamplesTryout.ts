/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Lazy } from '../../../../base/common/lazy.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { isEqual } from '../../../../base/common/resources.js';
import { localize } from '../../../../nls.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../workbench/common/contributions.js';
import { DEV_CONTAINER_SAMPLES_TRYOUT_PRESENTATION_KIND } from '../../../../workbench/contrib/chat/common/onboarding/devContainerSamplesTryout.js';
import { IOnboardingTryoutPresentationDefinition, IOnboardingTryoutRunContext, IOnboardingTryoutService, OnboardingTryoutAvailability, OnboardingTryoutPreparation, registerOnboardingTryoutPresentation } from '../../../../workbench/contrib/onboarding/common/onboardingTryout.js';
import { areDevContainerSamplesEnabled } from '../../../common/devContainerAgentHostService.js';
import { ISessionsService } from '../../../services/sessions/browser/sessionsService.js';
import { INewSessionComposerService } from '../browser/newSessionComposerService.js';

export class DevContainerSamplesTryoutPresentation extends Disposable implements IOnboardingTryoutPresentationDefinition<undefined> {
	readonly kind = DEV_CONTAINER_SAMPLES_TRYOUT_PRESENTATION_KIND;
	readonly isPayload = (value: unknown): value is undefined => value === undefined;

	constructor(
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@ISessionsService private readonly sessionsService: ISessionsService,
		@INewSessionComposerService private readonly composerService: INewSessionComposerService,
		@IOnboardingTryoutService private readonly tryoutService: IOnboardingTryoutService,
	) {
		super();
	}

	getAvailability(): OnboardingTryoutAvailability {
		return this._store.isDisposed ? { kind: 'hidden' } : { kind: 'ready' };
	}

	async prepare(_payload: undefined, context: IOnboardingTryoutRunContext): Promise<OnboardingTryoutPreparation> {
		const isCancelled = () => this._store.isDisposed || context.token.isCancellationRequested || context.store.isDisposed;
		const isAvailable = () => areDevContainerSamplesEnabled(this.configurationService) && this.tryoutService.getAvailability(context.id).kind === 'ready';
		const unavailable = { kind: 'unavailable', message: localize('devContainerSamplesTryout.pickerUnavailable', "The Dev Container samples picker is not available in the current Agents composer. Set up a local Agent Host and try again.") } as const;
		return {
			kind: 'ready',
			run: async () => {
				if (isCancelled()) {
					return { kind: 'cancelled' };
				}
				if (!isAvailable()) {
					return unavailable;
				}
				const result = await this.sessionsService.openNewSession(undefined, context.token);
				if (isCancelled() || result.trustDeclined) {
					return { kind: 'cancelled' };
				}
				const composer = this.composerService.activeComposer.get();
				return isAvailable() && composer && isEqual(composer.sessionResource?.get(), result.session?.resource) && composer.showDevContainerSamples?.()
					? { kind: 'opened' }
					: unavailable;
			},
		};
	}
}

export class DevContainerSamplesTryoutContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'sessions.contrib.devContainerSamplesTryout';

	constructor(@IInstantiationService instantiationService: IInstantiationService) {
		super();
		const presentation = new Lazy(() => this._register(instantiationService.createInstance(DevContainerSamplesTryoutPresentation)));
		this._register(registerOnboardingTryoutPresentation({
			kind: DEV_CONTAINER_SAMPLES_TRYOUT_PRESENTATION_KIND,
			isPayload: (value): value is undefined => value === undefined,
			getAvailability: () => this._store.isDisposed ? { kind: 'hidden' } : { kind: 'ready' },
			prepare: (payload, context) => presentation.value.prepare(payload, context),
		}));
	}
}

registerWorkbenchContribution2(DevContainerSamplesTryoutContribution.ID, DevContainerSamplesTryoutContribution, WorkbenchPhase.BlockRestore);
