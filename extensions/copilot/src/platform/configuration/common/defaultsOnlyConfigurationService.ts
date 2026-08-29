/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AbstractConfigurationService } from './abstractConfigurationService.js';
import { BaseConfig, ConfigTarget, IConfigurationService } from './configuration.js';

export class DefaultsOnlyConfigurationService extends AbstractConfigurationService implements IConfigurationService {

	override getValue<T>(key: BaseConfig<T>): T {
		return this.getDefaultValue(key);
	}

	override updateValue<T>(_key: BaseConfig<T>, _value: T, _target?: ConfigTarget): Promise<void> {
		throw new Error('Unsupported');
	}

	override setConfig<T>(_key: BaseConfig<T>, _value: T, _target?: ConfigTarget): Promise<void> {
		return Promise.resolve();
	}
}
