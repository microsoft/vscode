/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Lazy } from '../../../../base/common/lazy.js';
import { Disposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { localize } from '../../../../nls.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../workbench/common/contributions.js';
import { ChatOnboardingTarget } from '../../../../workbench/contrib/chat/common/onboarding/modelPickerTryout.js';
import { isNewSessionPickerTryoutPayload, NEW_SESSION_PICKER_TRYOUT_PRESENTATION_KIND, NewSessionPickerTryoutPayload } from '../../../../workbench/contrib/chat/common/onboarding/newSessionPickerTryout.js';
import { IOnboardingTarget, registerOnboardingTargetProvider } from '../../../../workbench/contrib/onboarding/browser/onboarding.js';
import { IOnboardingTryoutPresentationDefinition, IOnboardingTryoutRunContext, IOnboardingTryoutService, IOnboardingTryoutUnavailable, OnboardingTryoutAvailability, OnboardingTryoutPreparation, registerOnboardingTryoutPresentation } from '../../../../workbench/contrib/onboarding/common/onboardingTryout.js';
import { ISessionsService } from '../../../services/sessions/browser/sessionsService.js';
import { INewSessionComposer, INewSessionComposerService } from './newSessionComposerService.js';

export class NewSessionPickerTryoutPresentation extends Disposable implements IOnboardingTryoutPresentationDefinition<NewSessionPickerTryoutPayload> {
	readonly kind = NEW_SESSION_PICKER_TRYOUT_PRESENTATION_KIND;
	readonly isPayload = isNewSessionPickerTryoutPayload;
	private readonly composersByScope = new Map<string, INewSessionComposer>();

	constructor(
		@ISessionsService private readonly sessionsService: ISessionsService,
		@INewSessionComposerService private readonly composerService: INewSessionComposerService,
		@IOnboardingTryoutService private readonly tryoutService: IOnboardingTryoutService,
	) {
		super();
		this._register(toDisposable(() => this.composersByScope.clear()));
	}

	getAvailability(): OnboardingTryoutAvailability {
		return this._store.isDisposed ? { kind: 'hidden' } : { kind: 'ready' };
	}

	resolveTarget(scope: string | undefined): IOnboardingTarget | undefined {
		if (this._store.isDisposed || scope === undefined) {
			return undefined;
		}
		const composer = this.composersByScope.get(scope);
		const picker = composer?.modelPicker;
		const element = picker?.getDomNode();
		return picker && element ? {
			element,
			open: () => {
				if (!this._store.isDisposed && this.composersByScope.get(scope) === composer) {
					picker.open();
				}
			},
		} : undefined;
	}

	async prepare(_payload: NewSessionPickerTryoutPayload, context: IOnboardingTryoutRunContext): Promise<OnboardingTryoutPreparation> {
		if (this._store.isDisposed || context.token.isCancellationRequested || context.store.isDisposed) {
			return { kind: 'cancelled' };
		}
		let hasRun = false;
		return {
			kind: 'ready',
			run: async () => {
				if (hasRun || this._store.isDisposed || context.token.isCancellationRequested || context.store.isDisposed) {
					return { kind: 'cancelled' };
				}
				hasRun = true;
				const availability = this.tryoutService.getAvailability(context.id);
				if (availability.kind !== 'ready') {
					return availability.kind === 'hidden' ? this.unavailable() : availability;
				}
				const result = await this.sessionsService.openNewSession(undefined, context.token);
				if (result.trustDeclined || this._store.isDisposed || context.token.isCancellationRequested || context.store.isDisposed) {
					return { kind: 'cancelled' };
				}
				const currentAvailability = this.tryoutService.getAvailability(context.id);
				if (currentAvailability.kind !== 'ready') {
					return currentAvailability.kind === 'hidden' ? this.unavailable() : currentAvailability;
				}
				const composer = this.composerService.activeComposer.get();
				if (!composer) {
					return this.unavailable();
				}

				const targetScope = generateUuid();
				this.composersByScope.set(targetScope, composer);
				context.store.add(toDisposable(() => this.composersByScope.delete(targetScope)));
				return { kind: 'prepared', targetScope };
			},
		};
	}

	private unavailable(): IOnboardingTryoutUnavailable {
		return {
			kind: 'unavailable',
			message: localize('newSessionPickerTryout.unavailable', "The requested picker is not available in the current Agents composer."),
		};
	}
}

export class NewSessionPickerTryoutContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'sessions.contrib.newSessionPickerTryout';

	constructor(@IInstantiationService instantiationService: IInstantiationService) {
		super();
		const presentation = new Lazy(() => this._register(instantiationService.createInstance(NewSessionPickerTryoutPresentation)));
		this._register(registerOnboardingTargetProvider(ChatOnboardingTarget.ModelPicker, scope =>
			this._store.isDisposed || scope === undefined ? undefined : presentation.value.resolveTarget(scope)));
		this._register(registerOnboardingTryoutPresentation({
			kind: NEW_SESSION_PICKER_TRYOUT_PRESENTATION_KIND,
			isPayload: isNewSessionPickerTryoutPayload,
			getAvailability: () => this._store.isDisposed ? { kind: 'hidden' } : { kind: 'ready' },
			prepare: (payload, context) => this._store.isDisposed || context.token.isCancellationRequested || context.store.isDisposed
				? Promise.resolve({ kind: 'cancelled' })
				: presentation.value.prepare(payload, context),
		}));
	}
}

registerWorkbenchContribution2(NewSessionPickerTryoutContribution.ID, NewSessionPickerTryoutContribution, WorkbenchPhase.BlockRestore);
