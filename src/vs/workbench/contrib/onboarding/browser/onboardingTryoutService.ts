/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { raceCancellationError } from '../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { isCancellationError } from '../../../../base/common/errors.js';
import { Emitter } from '../../../../base/common/event.js';
import { Disposable, DisposableStore, toDisposable } from '../../../../base/common/lifecycle.js';
import { localize } from '../../../../nls.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IChatEntitlementService, chatRequiresSetup } from '../../../services/chat/common/chatEntitlementService.js';
import { IWorkbenchEnvironmentService } from '../../../services/environment/common/environmentService.js';
import { onboardingScenarioRegistry } from '../common/onboardingRegistry.js';
import { IOnboardingScenario } from '../common/onboardingScenario.js';
import { AGENTS_WINDOW_TRYOUT_PRESENTATION_KIND, IOnboardingTryoutScenario, IOnboardingTryoutService, IOnboardingTryoutUnavailable, onboardingTryoutPresentationRegistry, OnboardingTryoutAvailability, OnboardingTryoutResult, parseOnboardingTryoutArguments, RUN_ONBOARDING_TRYOUT_COMMAND_ID } from '../common/onboardingTryout.js';

function isTryout(scenario: IOnboardingScenario): scenario is IOnboardingTryoutScenario {
	return !!scenario.tryout && scenario.trigger.kind === 'command' && scenario.trigger.commandId === RUN_ONBOARDING_TRYOUT_COMMAND_ID;
}

interface IActiveTryoutRun {
	readonly id: string;
	readonly store: DisposableStore;
	readonly cancellation: CancellationTokenSource;
	promise: Promise<OnboardingTryoutResult>;
}

export class OnboardingTryoutService extends Disposable implements IOnboardingTryoutService {

	declare readonly _serviceBrand: undefined;

	private readonly _onDidChange = this._register(new Emitter<void>());
	readonly onDidChange = this._onDidChange.event;

	private readonly presentationListeners = this._register(new DisposableStore());
	private activeRun: IActiveTryoutRun | undefined;
	private readonly contextKeys = new Set<string>();

	constructor(
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IChatEntitlementService private readonly chatEntitlementService: IChatEntitlementService,
		@IWorkbenchEnvironmentService private readonly environmentService: IWorkbenchEnvironmentService,
	) {
		super();

		this._register(onboardingScenarioRegistry.onDidChange(() => this.refreshContributions()));
		this._register(onboardingTryoutPresentationRegistry.onDidChange(() => this.refreshContributions()));
		this._register(contextKeyService.onDidChangeContext(event => {
			if (event.affectsSome(this.contextKeys)) {
				this._onDidChange.fire();
			}
		}));
		this._register(chatEntitlementService.onDidChangeSentiment(() => this._onDidChange.fire()));
		this._register(chatEntitlementService.onDidChangeEntitlement(() => this._onDidChange.fire()));
		this._register(chatEntitlementService.onDidChangeAnonymous(() => this._onDidChange.fire()));
		this._register(toDisposable(() => this.activeRun?.store.dispose()));
		this.refreshContributions();
	}

	private refreshContributions(): void {
		this.contextKeys.clear();
		this.presentationListeners.clear();
		const kinds = new Set<string>();
		for (const scenario of this.getTryouts()) {
			for (const key of scenario.when?.keys() ?? []) {
				this.contextKeys.add(key);
			}
			kinds.add(this.getPresentationKind(scenario));
		}
		for (const kind of kinds) {
			const presentation = onboardingTryoutPresentationRegistry.get(kind);
			if (presentation?.onDidChangeAvailability) {
				this.presentationListeners.add(presentation.onDidChangeAvailability(() => this._onDidChange.fire()));
			}
		}
		this._onDidChange.fire();
	}

	getTryout(id: string): IOnboardingTryoutScenario | undefined {
		const scenario = onboardingScenarioRegistry.getScenario(id);
		return scenario && isTryout(scenario) ? scenario : undefined;
	}

	getTryouts(): readonly IOnboardingTryoutScenario[] {
		return onboardingScenarioRegistry.getScenarios().filter(isTryout);
	}

	getAvailability(id: string): OnboardingTryoutAvailability {
		const scenario = this.getTryout(id);
		if (!scenario) {
			return this.unavailable();
		}

		if (scenario.tryout.isAI && this.chatEntitlementService.sentiment.hidden) {
			return { kind: 'hidden' };
		}

		if (scenario.tryout.targetWindow === 'agents' && !this.environmentService.isSessionsWindow) {
			const presentation = onboardingTryoutPresentationRegistry.get(AGENTS_WINDOW_TRYOUT_PRESENTATION_KIND);
			return presentation
				? presentation.getAvailability(scenario)
				: { kind: 'unavailable', message: localize('onboarding.tryout.agentsUnavailable', "This example requires the desktop Agents window.") };
		}

		if (scenario.tryout.isAI) {
			const sentiment = this.chatEntitlementService.sentiment;
			if (sentiment.disabledInWorkspace) {
				return {
					kind: 'unavailable',
					message: localize('onboarding.tryout.chatDisabledInWorkspace', "Chat is disabled in this workspace."),
				};
			}
			if (chatRequiresSetup({
				completed: !!sentiment.completed,
				disabled: !!sentiment.disabled,
				untrusted: !!sentiment.untrusted,
				entitlement: this.chatEntitlementService.entitlement,
				anonymous: this.chatEntitlementService.anonymous,
				hasByokModels: this.chatEntitlementService.hasByokModels,
			})) {
				return {
					kind: 'unavailable',
					message: localize('onboarding.tryout.chatSetupRequired', "Set up Chat before trying this example."),
					action: {
						label: localize('onboarding.tryout.setUpChat', "Set Up Chat"),
						command: { id: 'workbench.action.chat.triggerSetup' },
					},
				};
			}
		}

		if (scenario.when && !this.contextKeyService.contextMatchesRules(scenario.when)) {
			return {
				kind: 'unavailable',
				message: scenario.tryout.unavailableMessage ?? localize('onboarding.tryout.notAvailableHere', "This example is not available in the current context."),
				action: scenario.tryout.setup,
			};
		}

		const presentation = onboardingTryoutPresentationRegistry.get(scenario.presentation.kind);
		if (!presentation) {
			return this.unavailable();
		}
		return presentation.getAvailability(scenario);
	}

	private getPresentationKind(scenario: IOnboardingTryoutScenario): string {
		return scenario.tryout.targetWindow === 'agents' && !this.environmentService.isSessionsWindow
			? AGENTS_WINDOW_TRYOUT_PRESENTATION_KIND
			: scenario.presentation.kind;
	}

	run(id: string, token = CancellationToken.None): Promise<OnboardingTryoutResult> {
		parseOnboardingTryoutArguments([id]);
		if (this.activeRun?.id === id && !this.activeRun.cancellation.token.isCancellationRequested) {
			return this.activeRun.promise;
		}

		const store = new DisposableStore();
		this.activeRun?.store.dispose();
		const cancellation = new CancellationTokenSource(token);
		const activeRun: IActiveTryoutRun = {
			id,
			store,
			cancellation,
			promise: Promise.resolve({ kind: 'cancelled' }),
		};
		this.activeRun = activeRun;
		store.add(toDisposable(() => cancellation.dispose(true)));

		activeRun.promise = (async (): Promise<OnboardingTryoutResult> => {
			await Promise.resolve();
			try {
				if (cancellation.token.isCancellationRequested || this._store.isDisposed) {
					return { kind: 'cancelled' };
				}
				const scenario = this.getTryout(id);
				if (!scenario) {
					throw new Error(localize('onboarding.tryout.unknown', "The feature example '{0}' is not available in this version.", id));
				}
				const availability = this.getAvailability(id);
				if (availability.kind !== 'ready') {
					return this.asResult(availability);
				}

				const presentationKind = this.getPresentationKind(scenario);
				const presentation = onboardingTryoutPresentationRegistry.get(presentationKind);
				if (!presentation) {
					return this.unavailable();
				}
				const prepared = await raceCancellationError(presentation.prepare(scenario, { id, token: cancellation.token, store }), cancellation.token);
				if (prepared.kind !== 'ready') {
					return prepared;
				}
				if (cancellation.token.isCancellationRequested) {
					return { kind: 'cancelled' };
				}
				if (this.getTryout(id) !== scenario || onboardingTryoutPresentationRegistry.get(presentationKind) !== presentation) {
					return this.unavailable();
				}
				const currentAvailability = this.getAvailability(id);
				if (currentAvailability.kind !== 'ready') {
					return this.asResult(currentAvailability);
				}
return await raceCancellationError(prepared.run(), cancellation.token);
			} catch (error) {
				if (isCancellationError(error)) {
					return { kind: 'cancelled' };
				}
				throw error;
			} finally {
				if (this.activeRun === activeRun) {
					this.activeRun = undefined;
				}
				store.dispose();
			}
		})();
		return activeRun.promise;
	}

	private unavailable(): IOnboardingTryoutUnavailable {
		return {
			kind: 'unavailable',
			message: localize('onboarding.tryout.unavailable', "This feature example is not available in this version."),
		};
	}

	private asResult(availability: Exclude<OnboardingTryoutAvailability, { readonly kind: 'ready' }>): OnboardingTryoutResult {
		return availability.kind === 'hidden'
			? { kind: 'unavailable', message: localize('onboarding.tryout.aiHidden', "AI features are disabled.") }
			: availability;
	}
}
