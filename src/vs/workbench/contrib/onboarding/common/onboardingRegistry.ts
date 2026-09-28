/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../base/common/event.js';
import { IDisposable } from '../../../../base/common/lifecycle.js';
import { IOnboardingScenario } from './onboardingScenario.js';

export type IOnboardingScenarioDescriptor = Pick<IOnboardingScenario, 'id' | 'developerModeVariations' | 'tryout'>;

/**
 * Registry of onboarding scenarios. Feature areas register their scenarios here
 * (pure data); the engine reads from it to decide what to run.
 */
export interface IOnboardingScenarioRegistry {
	/** Register a scenario. Throws if a scenario with the same id already exists. */
	register(scenario: IOnboardingScenario): IDisposable;
	/** Register persistent metadata for a scenario whose active instance may be created on demand. */
	registerDescriptor(descriptor: IOnboardingScenarioDescriptor): void;
	/** All currently registered scenarios. */
	getScenarios(): readonly IOnboardingScenario[];
	/** All known scenario descriptors, including currently registered scenarios. */
	getScenarioDescriptors(): readonly IOnboardingScenarioDescriptor[];
	/** Look up a single scenario by id. */
	getScenario(id: string): IOnboardingScenario | undefined;
	/** Fires when scenarios are added or removed, or descriptors are added or updated. */
	readonly onDidChange: Event<void>;
}

export class OnboardingScenarioRegistry implements IOnboardingScenarioRegistry {

	private readonly _scenarios = new Map<string, IOnboardingScenario>();
	private readonly _descriptors = new Map<string, IOnboardingScenarioDescriptor>();

	private readonly _onDidChange = new Emitter<void>();
	readonly onDidChange: Event<void> = this._onDidChange.event;

	register(scenario: IOnboardingScenario): IDisposable {
		const id = scenario.id;
		if (this._scenarios.has(id)) {
			throw new Error(`An onboarding scenario with id '${id}' is already registered.`);
		}
		this._scenarios.set(id, scenario);
		this._onDidChange.fire();
		return {
			dispose: () => {
				if (this._scenarios.get(id) === scenario) {
					this._scenarios.delete(id);
					this._onDidChange.fire();
				}
			}
		};
	}

	registerDescriptor(descriptor: IOnboardingScenarioDescriptor): void {
		const previous = this._descriptors.get(descriptor.id);
		if (previous?.developerModeVariations === descriptor.developerModeVariations && previous?.tryout === descriptor.tryout) {
			return;
		}
		this._descriptors.set(descriptor.id, descriptor);
		this._onDidChange.fire();
	}

	getScenarios(): readonly IOnboardingScenario[] {
		return Array.from(this._scenarios.values());
	}

	getScenarioDescriptors(): readonly IOnboardingScenarioDescriptor[] {
		const descriptors = new Map(this._descriptors);
		for (const scenario of this._scenarios.values()) {
			descriptors.set(scenario.id, scenario);
		}
		return Array.from(descriptors.values());
	}

	getScenario(id: string): IOnboardingScenario | undefined {
		return this._scenarios.get(id);
	}
}

/**
 * Global scenario registry. Scenario data files register here on import.
 */
export const onboardingScenarioRegistry: IOnboardingScenarioRegistry = new OnboardingScenarioRegistry();
