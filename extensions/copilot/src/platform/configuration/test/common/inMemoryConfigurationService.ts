/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { ConfigurationScope } from 'vscode';
import { IExperimentationService } from '../../../telemetry/common/nullExperimentationService';
import { AbstractConfigurationService, BaseConfig, Config, ExperimentBasedConfig, ExperimentBasedConfigType, IConfigurationService, InspectConfigResult } from '../../common/configurationService';

/**
 * A IConfigurationService that allows overriding of config values.
 */
export class InMemoryConfigurationService extends AbstractConfigurationService {
	constructor(
		private readonly baseConfigurationService: IConfigurationService,
		private readonly overrides = new Map<BaseConfig<any>, unknown>(),
		private readonly nonExtensionOverrides = new Map<string, any>(),
	) {
		super();
	}

	override getConfig<T>(key: Config<T>): T {
		const override = this.overrides.get(key);
		if (override !== undefined) {
			return override as T;
		}
		return this.baseConfigurationService.getConfig(key);
	}

	override inspectConfig<T>(key: BaseConfig<T>, scope?: ConfigurationScope): InspectConfigResult<T> | undefined {
		const inspect = this.baseConfigurationService.inspectConfig(key, scope);

		const override = this.overrides.get(key);
		if (override !== undefined) {
			return {
				defaultValue: this.getDefaultValue(key),
				globalValue: override as T
			};
		}
		return inspect;
	}

	override getNonExtensionConfig<T>(configKey: string): T | undefined {
		return this.nonExtensionOverrides.get(configKey) ?? this.baseConfigurationService.getNonExtensionConfig(configKey);
	}

	override setConfig<T>(key: BaseConfig<T>, value: T): Promise<void> {
		this.overrides.set(key, value);
		this._onDidChangeConfiguration.fire({
			affectsConfiguration: (section: string) => section === key.fullyQualifiedId || key.fullyQualifiedId.startsWith(section + '.')
		});
		return Promise.resolve();
	}

	setNonExtensionConfig<T>(key: string, value: T): Promise<void> {
		this.nonExtensionOverrides.set(key, value);
		this._onDidChangeConfiguration.fire({
			affectsConfiguration: (section: string) => section === key || key.startsWith(section + '.')
		});
		return Promise.resolve();
	}

	override getExperimentBasedConfig<T extends ExperimentBasedConfigType>(key: ExperimentBasedConfig<T>, experimentationService: IExperimentationService, scope?: ConfigurationScope): T {
		const override = this.overrides.get(key);
		if (override !== undefined) {
			return override as T;
		}
		return this.baseConfigurationService.getExperimentBasedConfig(key, experimentationService);
	}

	dumpConfig(): { [key: string]: string } {
		const config = this.baseConfigurationService.dumpConfig();
		this.overrides.forEach((value, key) => {
			config[key.id] = JSON.stringify(value);
		});
		return config;
	}
}
