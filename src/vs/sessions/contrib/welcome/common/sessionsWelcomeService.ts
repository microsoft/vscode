/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IObservable } from '../../../../base/common/observable.js';
import { IDisposable } from '../../../../base/common/lifecycle.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';

/**
 * A single setup step in the sessions welcome flow.
 *
 * Steps are rendered sequentially by {@link order}. The overlay
 * advances to the next step once {@link isSatisfied} becomes `true`.
 */
export interface ISessionsWelcomeStep {
	/** Unique identifier for this step. */
	readonly id: string;

	/** Display title (localized). */
	readonly title: string;

	/** Short description shown when this step is the current step (localized). */
	readonly description: string;

	/** Reactive flag — `true` when this step's requirement is met. */
	readonly isSatisfied: IObservable<boolean>;

	/**
	 * Resolves once the step has determined its initial satisfied state.
	 * Until this resolves, {@link isSatisfied} may not reflect reality.
	 */
	readonly initialized: Promise<void>;

	/** Label for the primary action button (localized). */
	readonly actionLabel: string;

	/**
	 * Execute the primary action for this step.
	 * For example, install an extension or trigger a sign-in flow.
	 */
	action(): Promise<void>;

	/** Sorting order — lower values run first. */
	readonly order: number;
}

export const ISessionsWelcomeService = createDecorator<ISessionsWelcomeService>('sessionsWelcomeService');

export interface ISessionsWelcomeService {
	readonly _serviceBrand: undefined;

	/** All registered steps sorted by {@link ISessionsWelcomeStep.order}. */
	readonly steps: IObservable<readonly ISessionsWelcomeStep[]>;

	/** `true` when every registered step is satisfied. */
	readonly isComplete: IObservable<boolean>;

	/** Resolves once all registered steps have determined their initial state. */
	readonly whenInitialized: Promise<void>;

	/**
	 * Wait for all currently registered steps to finish their async initialization,
	 * then mark the service as initialized.
	 */
	initialize(): Promise<void>;

	/** The first unsatisfied step, or `undefined` when all are done. */
	readonly currentStep: IObservable<ISessionsWelcomeStep | undefined>;

	/**
	 * Register a new welcome step.
	 * The returned disposable removes the step on disposal.
	 */
	registerStep(step: ISessionsWelcomeStep): IDisposable;
}
