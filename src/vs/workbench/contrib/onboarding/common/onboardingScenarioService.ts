/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IOnboardingScenario, OnboardingOutcome } from './onboardingScenario.js';

export const IOnboardingScenarioService = createDecorator<IOnboardingScenarioService>('onboardingScenarioService');

/** Global setting that enables/disables *automatic* onboarding scenarios. */
export const ONBOARDING_ENABLED_CONFIG = 'onboarding.enabled';

/**
 * Developer/advanced setting. A map of scenario/tour id to a boolean: when a
 * scenario's flag is `true`, that scenario bypasses usage-based eligibility
 * gating (e.g. the new-session tour's "first few sessions" check) so it can be
 * triggered on demand for testing. The scenario is still shown at most once per
 * window session (tracked in memory, not persisted), so reload the window to
 * replay it — the "Reset Onboarding Shown State" command only clears the
 * persisted state and does not affect developer-mode replays.
 *
 * The default value lists every registered scenario id set to `false`, so the
 * available ids are discoverable (and toggleable) in the settings editor.
 */
export const ONBOARDING_DEVELOPER_MODE_CONFIG = 'onboarding.developerMode';

/**
 * The shape of the {@link ONBOARDING_DEVELOPER_MODE_CONFIG} setting: a map of
 * scenario/tour id to whether developer mode is enabled for that scenario.
 */
export type OnboardingDeveloperMode = { readonly [scenarioId: string]: boolean };

/**
 * Whether onboarding developer mode is enabled for the given scenario/tour id.
 * Reads {@link ONBOARDING_DEVELOPER_MODE_CONFIG} and returns `true` only when the
 * setting is an object whose entry for `scenarioId` is explicitly `true`.
 */
export function isOnboardingDeveloperModeEnabled(configurationService: IConfigurationService, scenarioId: string): boolean {
	const value = configurationService.getValue<OnboardingDeveloperMode | undefined>(ONBOARDING_DEVELOPER_MODE_CONFIG);
	return typeof value === 'object' && value !== null && value[scenarioId] === true;
}

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
