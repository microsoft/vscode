/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { ConfigurationScope } from 'vscode';
import { AbstractConfigurationService, BaseConfig, Config, ConfigTarget, InspectConfigResult } from './configurationService';

/** Provides only the default values, ignoring the user's settings or exp. */

export class DefaultsOnlyConfigurationService extends AbstractConfigurationService {

	override getConfig<T>(key: Config<T>): T {
		return this.getDefaultValue(key);
	}

	override inspectConfig<T>(key: BaseConfig<T>, scope?: ConfigurationScope): InspectConfigResult<T> | undefined {
		return {
			defaultValue: this.getDefaultValue(key),
		};
	}

	override setConfig<T>(key: BaseConfig<T>, value: T, _target?: ConfigTarget): Promise<void> {
		return Promise.resolve();
	}

	override getNonExtensionConfig<T>(configKey: string): T | undefined {
		return undefined;
	}

	override updateExperimentBasedConfiguration(treatments: string[]): void {
		if (treatments.length === 0) {
			return;
		}

		// Fire simulated event which checks if a configuration is affected in the treatments
		this._onDidChangeConfiguration.fire({
			affectsConfiguration: (section: string, _scope?: ConfigurationScope) => this._treatmentsAffectConfiguration(treatments, section)
		});
	}

	override dumpConfig(): { [key: string]: string } {
		return {};
	}
}
