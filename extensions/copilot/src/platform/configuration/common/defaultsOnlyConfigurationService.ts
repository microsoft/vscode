/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { ConfigurationScope } from 'vscode';
import { IExperimentationService } from '../../telemetry/common/nullExperimentationService';
import { AbstractConfigurationService, BaseConfig, Config, ExperimentBasedConfig, ExperimentBasedConfigType, globalConfigRegistry, InspectConfigResult } from './configurationService';

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

	override setConfig(): Promise<void> {
		return Promise.resolve();
	}

	override getNonExtensionConfig<T>(configKey: string): T | undefined {
		return undefined;
	}

	override getExperimentBasedConfig<T extends ExperimentBasedConfigType>(key: ExperimentBasedConfig<T>, experimentationService: IExperimentationService, scope?: ConfigurationScope): T {
		if (key.experimentName) {
			const expValue = experimentationService.getTreatmentVariable<Exclude<T, undefined>>(key.experimentName);
			if (expValue !== undefined) {
				return expValue;
			}
		}

		// This is the pattern we've been using for a while now. We need to maintain it for older experiments.
		const expValue = experimentationService.getTreatmentVariable<Exclude<T, undefined>>(`copilotchat.config.${key.id}`);
		if (expValue !== undefined) {
			return expValue;
		}

		// This is the pattern vscode uses for settings using the `onExp` tag. But vscode only supports it for
		// settings defined in package.json, so this is why we're also reading the value from exp here.
		const expValue2 = experimentationService.getTreatmentVariable<Exclude<T, undefined>>(`config.${key.fullyQualifiedId}`);
		if (expValue2 !== undefined) {
			return expValue2;
		}

		if (key.fullyQualifiedOldId) {
			const oldExpValue = experimentationService.getTreatmentVariable<Exclude<T, undefined>>(`copilotchat.config.${key.oldId}`);
			if (oldExpValue !== undefined) {
				return oldExpValue;
			}

			const oldExpValue2 = experimentationService.getTreatmentVariable<Exclude<T, undefined>>(`config.${key.fullyQualifiedOldId}`);
			if (oldExpValue2 !== undefined) {
				return oldExpValue2;
			}
		}

		return this.getDefaultValue(key);
	}

	override updateExperimentBasedConfiguration(treatments: string[]): void {
		if (treatments.length === 0) {
			return;
		}

		// Fire simulated event which checks if a configuration is affected in the treatments
		this._onDidChangeConfiguration.fire({
			affectsConfiguration: (section: string, _scope?: ConfigurationScope) => {
				if (treatments.some(t => t.startsWith(`config.${section}`))) {
					return true;
				}
				const oldId = globalConfigRegistry.configs.get(section)?.fullyQualifiedOldId;
				if (oldId && treatments.some(t => t.startsWith(`config.${oldId}`))) {
					return true;
				}
				return false;
			}
		});
	}

	override dumpConfig(): { [key: string]: string } {
		return {};
	}
}
