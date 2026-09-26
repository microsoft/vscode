/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { createCommandUri } from '../../../../base/common/htmlContent.js';
import { DisposableStore, IDisposable } from '../../../../base/common/lifecycle.js';
import { matchesScheme, Schemas } from '../../../../base/common/network.js';
import { equalsIgnoreCase } from '../../../../base/common/strings.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { ContextKeyExpression } from '../../../../platform/contextkey/common/contextkey.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IOnboardingTryoutRunOptions } from '../../../../platform/onboarding/common/onboardingTryoutHandoff.js';
import { onboardingScenarioRegistry } from './onboardingRegistry.js';
import { IOnboardingPresentationRef, IOnboardingRunResult, IOnboardingScenario } from './onboardingScenario.js';

export const RUN_ONBOARDING_TRYOUT_COMMAND_ID = 'workbench.action.onboarding.tryFeature';
export const ONBOARDING_TRYOUT_URL_AUTHORITY = 'tryout';
export const AGENTS_WINDOW_TRYOUT_PRESENTATION_KIND = 'agentsWindow';

export interface IOnboardingTryoutCommand {
	readonly id: string;
	readonly arguments?: readonly unknown[];
}

export interface IOnboardingTryoutSetupAction {
	readonly label: string;
	readonly command: IOnboardingTryoutCommand;
}

export interface IOnboardingTryoutMetadata {
	readonly title: string;
	readonly description: string;
	readonly isAI?: boolean;
	readonly targetWindow?: 'agents';
	/** Whether product-protocol links may request this tryout. Defaults to true and always requires confirmation. */
	readonly allowExternalLaunch?: boolean;
	readonly unavailableMessage?: string;
	readonly setup?: IOnboardingTryoutSetupAction;
}

export interface IOnboardingTryoutUnavailable {
	readonly kind: 'unavailable';
	readonly message: string;
	readonly action?: IOnboardingTryoutSetupAction;
}

export type OnboardingTryoutAvailability =
	| { readonly kind: 'ready' }
	| { readonly kind: 'hidden' }
	| IOnboardingTryoutUnavailable;

export type OnboardingTryoutResult =
	| { readonly kind: 'opened' | 'executed' | 'prepared'; readonly targetScope?: string }
	| { readonly kind: 'routed' }
	| { readonly kind: 'cancelled' }
	| IOnboardingTryoutUnavailable;

export interface IOnboardingTryoutRunContext {
	readonly id: string;
	readonly token: CancellationToken;
	readonly store: DisposableStore;
	readonly options?: IOnboardingTryoutRunOptions;
	readonly onDidLaunch?: (kind: 'opened' | 'executed' | 'prepared') => void;
	readonly onDidFinishGuidance?: (result: IOnboardingRunResult) => void;
}

export type OnboardingTryoutPreparation =
	| { readonly kind: 'ready'; readonly run: () => Promise<OnboardingTryoutResult> }
	| { readonly kind: 'cancelled' }
	| IOnboardingTryoutUnavailable;

export interface IOnboardingTryoutPresentation {
	readonly kind: string;
	readonly onDidChangeAvailability?: Event<void>;
	getAvailability(scenario: IOnboardingScenario): OnboardingTryoutAvailability;
	prepare(scenario: IOnboardingScenario, context: IOnboardingTryoutRunContext): Promise<OnboardingTryoutPreparation>;
}

export interface IOnboardingTryoutPresentationRegistry {
	register(presentation: IOnboardingTryoutPresentation): IDisposable;
	get(kind: string): IOnboardingTryoutPresentation | undefined;
	readonly onDidChange: Event<void>;
}

class OnboardingTryoutPresentationRegistry implements IOnboardingTryoutPresentationRegistry {
	private readonly presentations = new Map<string, IOnboardingTryoutPresentation>();
	private readonly _onDidChange = new Emitter<void>();
	readonly onDidChange = this._onDidChange.event;

	register(presentation: IOnboardingTryoutPresentation): IDisposable {
		if (this.presentations.has(presentation.kind)) {
			throw new Error(`An onboarding tryout presentation with kind '${presentation.kind}' is already registered.`);
		}
		this.presentations.set(presentation.kind, presentation);
		this._onDidChange.fire();
		return {
			dispose: () => {
				if (this.presentations.get(presentation.kind) === presentation) {
					this.presentations.delete(presentation.kind);
					this._onDidChange.fire();
				}
			}
		};
	}

	get(kind: string): IOnboardingTryoutPresentation | undefined {
		return this.presentations.get(kind);
	}
}

export const onboardingTryoutPresentationRegistry: IOnboardingTryoutPresentationRegistry = new OnboardingTryoutPresentationRegistry();

export interface IOnboardingTryoutPresentationDefinition<TPayload> {
	readonly kind: string;
	readonly onDidChangeAvailability?: Event<void>;
	isPayload(value: unknown): value is TPayload;
	getAvailability(payload: TPayload): OnboardingTryoutAvailability;
	prepare(payload: TPayload, context: IOnboardingTryoutRunContext): Promise<OnboardingTryoutPreparation>;
}

export interface IOnboardingTryout<TPayload> extends IOnboardingTryoutMetadata {
	readonly id: string;
	readonly when?: ContextKeyExpression;
	readonly presentation: IOnboardingPresentationRef<TPayload>;
}

export type IOnboardingTryoutScenario = IOnboardingScenario & { readonly tryout: IOnboardingTryoutMetadata };

export const IOnboardingTryoutService = createDecorator<IOnboardingTryoutService>('onboardingTryoutService');

export interface IOnboardingTryoutService {
	readonly _serviceBrand: undefined;
	readonly onDidChange: Event<void>;
	getTryout(id: string): IOnboardingTryoutScenario | undefined;
	getTryouts(): readonly IOnboardingTryoutScenario[];
	getAvailability(id: string): OnboardingTryoutAvailability;
	run(id: string, token?: CancellationToken, options?: IOnboardingTryoutRunOptions): Promise<OnboardingTryoutResult>;
}

export function isOnboardingTryoutId(value: unknown): value is string {
	return typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(value);
}

export function isOnboardingTargetScope(value: unknown): value is string {
	return typeof value === 'string' && value.length > 0 && value.length <= 512;
}

export function parseOnboardingTryoutArguments(args: readonly unknown[]): string {
	if (args.length !== 1 || !isOnboardingTryoutId(args[0])) {
		throw new Error(localize('onboarding.tryout.invalidArguments', "Expected exactly one valid feature example identifier."));
	}
	return args[0];
}

export function createOnboardingTryoutUri(id: string): URI {
	return createCommandUri(RUN_ONBOARDING_TRYOUT_COMMAND_ID, parseOnboardingTryoutArguments([id]));
}

export function parseOnboardingTryoutUri(uri: URI): string | undefined {
	if (uri.scheme !== Schemas.command || uri.path !== RUN_ONBOARDING_TRYOUT_COMMAND_ID) {
		return undefined;
	}
	const args: unknown = JSON.parse(decodeURIComponent(uri.query));
	if (!Array.isArray(args)) {
		throw new Error(localize('onboarding.tryout.invalidArguments', "Expected exactly one valid feature example identifier."));
	}
	return parseOnboardingTryoutArguments(args);
}

export function parseExternalOnboardingTryoutUri(uri: URI, urlProtocol: string): string | undefined {
	if (!matchesScheme(uri, urlProtocol)
		|| !equalsIgnoreCase(uri.authority, ONBOARDING_TRYOUT_URL_AUTHORITY)
		|| !uri.path.startsWith('/')
		|| uri.query.length > 0
		|| uri.fragment.length > 0) {
		return undefined;
	}

	const id = uri.path.slice(1);
	return isOnboardingTryoutId(id) ? id : undefined;
}

export function registerOnboardingTryout<TPayload>(tryout: IOnboardingTryout<TPayload>): IDisposable {
	const { id, when, presentation, ...metadata } = tryout;
	parseOnboardingTryoutArguments([id]);
	return onboardingScenarioRegistry.register({
		id,
		when,
		presentation,
		tryout: metadata,
		trigger: { kind: 'command', commandId: RUN_ONBOARDING_TRYOUT_COMMAND_ID },
	});
}

export function registerOnboardingTryoutPresentation<TPayload>(definition: IOnboardingTryoutPresentationDefinition<TPayload>): IDisposable {
	const getPayload = (scenario: IOnboardingScenario): TPayload => {
		const payload = scenario.presentation.payload;
		if (!definition.isPayload(payload)) {
			throw new Error(localize('onboarding.tryout.invalidPayload', "The feature example '{0}' has an invalid presentation.", scenario.id));
		}
		return payload;
	};
	return onboardingTryoutPresentationRegistry.register({
		kind: definition.kind,
		onDidChangeAvailability: definition.onDidChangeAvailability,
		getAvailability: scenario => definition.getAvailability(getPayload(scenario)),
		prepare: (scenario, context) => definition.prepare(getPayload(scenario), context),
	});
}
