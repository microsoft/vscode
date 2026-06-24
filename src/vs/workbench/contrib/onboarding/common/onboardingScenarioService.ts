/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IOnboardingScenario, OnboardingOutcome } from './onboardingScenario.js';

export const IOnboardingScenarioService = createDecorator<IOnboardingScenarioService>('onboardingScenarioService');

/** Global setting that enables/disables *automatic* onboarding scenarios. */
export const ONBOARDING_ENABLED_CONFIG = 'onboarding.enabled';

/**
 * Developer/advanced setting. When enabled, onboarding tours bypass usage-based
 * eligibility gating (e.g. the new-session tour's "first few sessions" check) so
 * they can be triggered on demand for testing. Tours are still shown at most
 * once — use the "Reset Onboarding Shown State" command to replay them.
 */
export const ONBOARDING_DEVELOPER_MODE_CONFIG = 'onboarding.developerMode';

/**
 * The presentation-agnostic onboarding engine. It decides *when* and *whether*
 * a scenario runs (eligibility, scheduling, once-per-user persistence) and
 * delegates *how* it is rendered to a registered presentation.
 */
export interface IOnboardingScenarioService {
	readonly _serviceBrand: undefined;

	/**
	 * Begin watching scenario eligibility. Automatic scenarios may start as soon
	 * as they become eligible. Safe to call multiple times (no-op after first).
	 */
	start(): void;

	/**
	 * Run a scenario on demand, bypassing the once-per-user gate and the global
	 * `onboarding.enabled` setting. Used by command triggers and the (future)
	 * tutorial page. Still serialized with any in-flight scenario.
	 */
	runScenario(id: string): Promise<OnboardingOutcome>;

	/**
	 * All registered scenarios (across presentation kinds). Useful for a tutorial
	 * page that lists everything the user can replay.
	 */
	getScenarios(): readonly IOnboardingScenario[];

	/** Whether the scenario has already been shown to the user. */
	hasBeenShown(id: string): boolean;

	/** Clear the "shown" state for a single scenario (developer/testing aid). */
	reset(id: string): void;

	/** Clear the "shown" state for all scenarios (developer/testing aid). */
	resetAll(): void;
}
