/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Lazy } from '../../../../base/common/lazy.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { isEqual } from '../../../../base/common/resources.js';
import { localize } from '../../../../nls.js';
import { RemoteAgentHostsEnabledSettingId } from '../../../../platform/agentHost/common/remoteAgentHostService.js';
import { ConfigurationTarget, IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../workbench/common/contributions.js';
import { DEV_CONTAINER_SAMPLES_TRYOUT_PRESENTATION_KIND } from '../../../../workbench/contrib/chat/common/onboarding/devContainerSamplesTryout.js';
import { IOnboardingTryoutPresentationDefinition, IOnboardingTryoutRunContext, IOnboardingTryoutService, OnboardingTryoutAvailability, OnboardingTryoutPreparation, OnboardingTryoutResult, registerOnboardingTryoutPresentation } from '../../../../workbench/contrib/onboarding/common/onboardingTryout.js';
import { areDevContainerSamplesEnabled, DevContainerAgentHostEnabledSettingId, DevContainerSamplesEnabledSettingId } from '../../../common/devContainerAgentHostService.js';
import { ISessionsService } from '../../../services/sessions/browser/sessionsService.js';
import { INewSessionComposerService } from '../browser/newSessionComposerService.js';

const requiredSettings = [RemoteAgentHostsEnabledSettingId, DevContainerAgentHostEnabledSettingId, DevContainerSamplesEnabledSettingId] as const;

export class DevContainerSamplesTryoutPresentation extends Disposable implements IOnboardingTryoutPresentationDefinition<undefined> {
	readonly kind = DEV_CONTAINER_SAMPLES_TRYOUT_PRESENTATION_KIND;
	readonly isPayload = (value: unknown): value is undefined => value === undefined;

	constructor(
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IDialogService private readonly dialogService: IDialogService,
		@ISessionsService private readonly sessionsService: ISessionsService,
		@INewSessionComposerService private readonly composerService: INewSessionComposerService,
		@IOnboardingTryoutService private readonly tryoutService: IOnboardingTryoutService,
	) {
		super();
	}

	getAvailability(): OnboardingTryoutAvailability {
		if (this._store.isDisposed || this.configurationService.getValue<boolean>('chat.disableAIFeatures') === true) {
			return { kind: 'hidden' };
		}
		if (requiredSettings.some(setting => this.configurationService.inspect<boolean>(setting).policyValue === false)) {
			return { kind: 'unavailable', message: localize('devContainerSamplesTryout.policy', "Your organization has disabled a setting required by Dev Container samples.") };
		}
		return { kind: 'ready' };
	}

	async prepare(_payload: undefined, context: IOnboardingTryoutRunContext): Promise<OnboardingTryoutPreparation> {
		if (this.isCancelled(context)) {
			return { kind: 'cancelled' };
		}
		let hasRun = false;
		return {
			kind: 'ready',
			run: async () => {
				if (hasRun || this.isCancelled(context)) {
					return { kind: 'cancelled' };
				}
				hasRun = true;
				return this.openSamples(context);
			},
		};
	}

	private isCancelled(context: IOnboardingTryoutRunContext): boolean {
		return this._store.isDisposed || context.token.isCancellationRequested || context.store.isDisposed;
	}

	private unavailable(): OnboardingTryoutResult {
		return { kind: 'unavailable', message: localize('devContainerSamplesTryout.pickerUnavailable', "The Dev Container samples picker is not available in the current Agents composer. Set up a local Agent Host and try again.") };
	}

	private checkAvailability(context: IOnboardingTryoutRunContext): OnboardingTryoutResult | undefined {
		if (this.isCancelled(context)) {
			return { kind: 'cancelled' };
		}
		for (const availability of [this.getAvailability(), this.tryoutService.getAvailability(context.id)]) {
			if (availability.kind !== 'ready') {
				return availability.kind === 'hidden' ? this.unavailable() : availability;
			}
		}
		return undefined;
	}

	private async openSamples(context: IOnboardingTryoutRunContext): Promise<OnboardingTryoutResult> {
		let unavailable = this.checkAvailability(context);
		if (unavailable) {
			return unavailable;
		}
		const disabledSettings = requiredSettings.filter(setting => this.configurationService.getValue<boolean>(setting) !== true);
		if (disabledSettings.length) {
			const { confirmed } = await this.dialogService.confirm({
				type: 'info',
				message: localize('devContainerSamplesTryout.enable', "Enable the settings required for Dev Container samples?"),
				detail: localize('devContainerSamplesTryout.enableDetail', "The following user settings will be enabled:\n{0}\n\nThis opens the samples picker without choosing a sample or starting Docker. Your existing draft is preserved.", disabledSettings.join('\n')),
				primaryButton: localize('devContainerSamplesTryout.enableButton', "Enable and Continue"),
			});
			if (!confirmed || this.isCancelled(context)) {
				return { kind: 'cancelled' };
			}
			for (const setting of disabledSettings) {
				unavailable = this.checkAvailability(context);
				if (unavailable) {
					return unavailable;
				}
				if (this.configurationService.getValue<boolean>(setting) !== true) {
					await this.configurationService.updateValue(setting, true, ConfigurationTarget.USER);
				}
			}
		}
		unavailable = this.checkAvailability(context);
		if (unavailable) {
			return unavailable;
		}
		if (!areDevContainerSamplesEnabled(this.configurationService)) {
			return this.unavailable();
		}
		const result = await this.sessionsService.openNewSession(undefined, context.token);
		unavailable = this.checkAvailability(context);
		if (unavailable) {
			return unavailable;
		}
		if (result.trustDeclined) {
			return { kind: 'cancelled' };
		}
		const composer = this.composerService.activeComposer.get();
		if (!composer || !isEqual(composer.sessionResource?.get(), result.session?.resource)) {
			return this.unavailable();
		}
		return composer.showDevContainerSamples?.() ? { kind: 'opened' } : this.unavailable();
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
			prepare: (payload, context) => this._store.isDisposed || context.token.isCancellationRequested || context.store.isDisposed
				? Promise.resolve({ kind: 'cancelled' })
				: presentation.value.prepare(payload, context),
		}));
	}
}

registerWorkbenchContribution2(DevContainerSamplesTryoutContribution.ID, DevContainerSamplesTryoutContribution, WorkbenchPhase.BlockRestore);
