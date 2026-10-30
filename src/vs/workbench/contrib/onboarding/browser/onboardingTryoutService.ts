/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { raceCancellationError } from '../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { isCancellationError } from '../../../../base/common/errors.js';
import { Emitter } from '../../../../base/common/event.js';
import { Disposable, DisposableStore, toDisposable } from '../../../../base/common/lifecycle.js';
import { generateUuid, isUUID } from '../../../../base/common/uuid.js';
import { localize } from '../../../../nls.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IOnboardingTryoutRunOptions, isOnboardingTryoutSource, OnboardingTryoutSource } from '../../../../platform/onboarding/common/onboardingTryoutHandoff.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IChatEntitlementService, chatRequiresSetup } from '../../../services/chat/common/chatEntitlementService.js';
import { IWorkbenchEnvironmentService } from '../../../services/environment/common/environmentService.js';
import { onboardingScenarioRegistry } from '../common/onboardingRegistry.js';
import { IOnboardingRunResult, IOnboardingScenario } from '../common/onboardingScenario.js';
import { AGENTS_WINDOW_TRYOUT_PRESENTATION_KIND, IOnboardingTryoutRunContext, IOnboardingTryoutScenario, IOnboardingTryoutService, IOnboardingTryoutUnavailable, onboardingTryoutPresentationRegistry, OnboardingTryoutAvailability, OnboardingTryoutResult, parseOnboardingTryoutArguments, RUN_ONBOARDING_TRYOUT_COMMAND_ID } from '../common/onboardingTryout.js';

type TryoutEvent = {
	tryoutId: string;
	runId: string;
	source: OnboardingTryoutSource;
};

type TryoutClassification = {
	tryoutId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The registered product-owned feature example identifier.' };
	runId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'An ephemeral random identifier correlating one tryout run, including native window handoff.' };
	source: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The product entry point: releaseNotes, externalLink, or direct. External links do not identify a website origin.' };
};

type TryoutStartedClassification = TryoutClassification & {
	owner: 'ntrogh';
	comment: 'A feature example actually opened, executed, or prepared. Identifies a cohort for subsequent product usage analysis, not feature adoption.';
};

type TryoutOutcomeEvent = TryoutEvent & {
	result: Exclude<OnboardingTryoutResult['kind'], 'routed'> | 'error';
	launchResult: 'opened' | 'executed' | 'prepared' | 'none';
	guidanceOutcome: IOnboardingRunResult['outcome'] | 'notShown' | undefined;
	dismissReason: IOnboardingRunResult['dismissReason'] | undefined;
	durationMs: number;
};

type TryoutOutcomeClassification = TryoutClassification & {
	owner: 'ntrogh';
	comment: 'The terminal result of a feature example in its execution window. Guidance completion is distinct from launching the example or adopting the feature.';
	result: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The result: opened, executed, prepared, unavailable, cancelled, or error.' };
	launchResult: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether the example opened, executed, or prepared before ending, or none if it did not launch.' };
	guidanceOutcome: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The guide outcome when observed: completed, skipped, dismissed, aborted, or notShown.' };
	dismissReason: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The bounded action that ended the guide, when observed.' };
	durationMs: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Elapsed time for the execution attempt, including preparation, in milliseconds.' };
};

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
		@ITelemetryService private readonly telemetryService: ITelemetryService,
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

	run(id: string, token = CancellationToken.None, options?: IOnboardingTryoutRunOptions): Promise<OnboardingTryoutResult> {
		parseOnboardingTryoutArguments([id]);
		if (options && (!isOnboardingTryoutSource(options.source) || options.runId !== undefined && !isUUID(options.runId))) {
			throw new Error(localize('onboarding.tryout.invalidRunOptions', "The feature example run context is invalid."));
		}
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
			const scenario = this.getTryout(id);
			const runOptions = { source: options?.source ?? 'direct', runId: options?.runId ?? generateUuid() } satisfies IOnboardingTryoutRunOptions;
			const telemetryData: TryoutEvent | undefined = scenario && (scenario.tryout.targetWindow !== 'agents' || this.environmentService.isSessionsWindow)
				? { tryoutId: scenario.id, ...runOptions }
				: undefined;
			const startTime = Date.now();
			let result: OnboardingTryoutResult | undefined;
			let launchResult: TryoutOutcomeEvent['launchResult'] = 'none';
			let guidanceResult: IOnboardingRunResult | undefined;
			let finished = false;
			const onDidLaunch = (kind: 'opened' | 'executed' | 'prepared') => {
				if (finished || cancellation.token.isCancellationRequested || launchResult !== 'none') {
					return;
				}
				launchResult = kind;
				if (telemetryData) {
					this.telemetryService.publicLog2<TryoutEvent, TryoutStartedClassification>('onboarding.tryoutStarted', telemetryData);
				}
			};
			try {
				result = await this.doRun({
					id, token: cancellation.token, store, options: runOptions, onDidLaunch,
					onDidFinishGuidance: guidance => {
						if (!finished) {
							guidanceResult = guidance;
						}
					},
				});
				if (result.kind === 'opened' || result.kind === 'executed' || result.kind === 'prepared') {
					onDidLaunch(result.kind);
				}
				return result;
			} catch (error) {
				if (isCancellationError(error)) {
					result = { kind: 'cancelled' };
					return result;
				}
				throw error;
			} finally {
				finished = true;
				if (this.activeRun === activeRun) {
					this.activeRun = undefined;
				}
				store.dispose();
				if (telemetryData && result?.kind !== 'routed') {
					this.telemetryService.publicLog2<TryoutOutcomeEvent, TryoutOutcomeClassification>('onboarding.tryoutOutcome', {
						...telemetryData,
						result: result?.kind ?? 'error',
						launchResult,
						guidanceOutcome: guidanceResult ? (guidanceResult.shown ? guidanceResult.outcome : 'notShown') : undefined,
						dismissReason: guidanceResult?.dismissReason,
						durationMs: Date.now() - startTime,
					});
				}
			}
		})();
		return activeRun.promise;
	}

	private async doRun(context: IOnboardingTryoutRunContext): Promise<OnboardingTryoutResult> {
		const { id, token } = context;
		if (token.isCancellationRequested || this._store.isDisposed) {
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
		const prepared = await raceCancellationError(presentation.prepare(scenario, context), token);
		if (prepared.kind !== 'ready') {
			return prepared;
		}
		if (token.isCancellationRequested) {
			return { kind: 'cancelled' };
		}
		if (this.getTryout(id) !== scenario || onboardingTryoutPresentationRegistry.get(presentationKind) !== presentation) {
			return this.unavailable();
		}
		const currentAvailability = this.getAvailability(id);
		if (currentAvailability.kind !== 'ready') {
			return this.asResult(currentAvailability);
		}
		return raceCancellationError(prepared.run(), token);
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
