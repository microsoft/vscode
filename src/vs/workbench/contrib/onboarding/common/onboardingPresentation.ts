/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../base/common/event.js';
import { IDisposable } from '../../../../base/common/lifecycle.js';
import { IOnboardingRunResult, IOnboardingScenario } from './onboardingScenario.js';

/**
 * Context handed to a presentation for a single scenario run. Exposes only what
 * a presentation needs without leaking engine internals.
 */
export interface IOnboardingRunContext {
	/** The window hosting the UI the scenario targets (usually the main window). */
	readonly targetWindow: Window;

	/**
	 * Fires when the engine wants the presentation to abort the current run
	 * (e.g. the application is shutting down). The presentation should resolve
	 * its `run` promise with an aborted result.
	 */
	readonly onAbort: Event<void>;
}

/**
 * A presentation renders a scenario. The engine is presentation-agnostic: it
 * looks up a presentation by {@link IOnboardingScenario.presentation} `kind`
 * and delegates rendering to it. New onboarding styles (spotlight, banner,
 * modal, checklist, ...) are added by registering additional presentations.
 */
export interface IOnboardingPresentation {
	/** The kind this presentation handles, e.g. `'spotlight'`. */
	readonly kind: string;

	/**
	 * Render the scenario and resolve with the result once the user (or the
	 * engine) ends the run. Implementations must clean up all UI/listeners
	 * regardless of how the run ends.
	 */
	run(scenario: IOnboardingScenario, context: IOnboardingRunContext): Promise<IOnboardingRunResult>;
}

/**
 * Registry mapping a presentation `kind` to its implementation.
 */
export interface IOnboardingPresentationRegistry {
	/** Register a presentation. Throws if the kind is already registered. */
	register(presentation: IOnboardingPresentation): IDisposable;
	/** Look up a presentation by kind. */
	get(kind: string): IOnboardingPresentation | undefined;
}

class OnboardingPresentationRegistry implements IOnboardingPresentationRegistry {

	private readonly _presentations = new Map<string, IOnboardingPresentation>();

	register(presentation: IOnboardingPresentation): IDisposable {
		const kind = presentation.kind;
		if (this._presentations.has(kind)) {
			throw new Error(`An onboarding presentation with kind '${kind}' is already registered.`);
		}
		this._presentations.set(kind, presentation);
		return {
			dispose: () => {
				if (this._presentations.get(kind) === presentation) {
					this._presentations.delete(kind);
				}
			}
		};
	}

	get(kind: string): IOnboardingPresentation | undefined {
		return this._presentations.get(kind);
	}
}

/**
 * Global presentation registry. Presentations register here (typically from the
 * workbench contribution), and the engine resolves them when running scenarios.
 */
export const onboardingPresentationRegistry: IOnboardingPresentationRegistry = new OnboardingPresentationRegistry();
