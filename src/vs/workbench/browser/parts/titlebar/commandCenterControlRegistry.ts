/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable } from '../../../../base/common/lifecycle.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';

/**
 * Interface for a command center control that can be registered with the titlebar.
 */
export interface ICommandCenterControl extends IDisposable {
	readonly element: HTMLElement;
}

/**
 * A registration for a custom command center control.
 */
export interface ICommandCenterControlRegistration {
	/**
	 * The context key that must be truthy for this control to be shown.
	 * When this context key is true, this control replaces the default command center.
	 */
	readonly contextKey: string;

	/**
	 * Priority for when multiple controls match. Higher priority wins.
	 */
	readonly priority: number;

	/**
	 * Factory function to create the control.
	 */
	create(instantiationService: IInstantiationService): ICommandCenterControl;
}

class CommandCenterControlRegistryImpl {
	private readonly registrations: ICommandCenterControlRegistration[] = [];

	/**
	 * Register a custom command center control.
	 */
	register(registration: ICommandCenterControlRegistration): IDisposable {
		this.registrations.push(registration);
		// Sort by priority descending
		this.registrations.sort((a, b) => b.priority - a.priority);

		return {
			dispose: () => {
				const index = this.registrations.indexOf(registration);
				if (index >= 0) {
					this.registrations.splice(index, 1);
				}
			}
		};
	}

	/**
	 * Get all registered command center controls.
	 */
	getRegistrations(): readonly ICommandCenterControlRegistration[] {
		return this.registrations;
	}
}

/**
 * Registry for custom command center controls.
 * Contrib modules can register controls here, and the titlebar will use them
 * when their context key conditions are met.
 */
export const CommandCenterControlRegistry = new CommandCenterControlRegistryImpl();
