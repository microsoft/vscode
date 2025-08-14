/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import 'mocha';
import { ImplicitProjectConfiguration } from '../../configuration/configuration';

suite('ImplicitProjectConfiguration', () => {

	test('should default strict to true', () => {
		const mockConfiguration = {
			get: <T>(key: string, defaultValue?: T): T => {
				// Return default values for all settings except when explicitly overridden
				if (key === 'js/ts.implicitProjectConfig.strict') {
					return (true as any) as T;
				}
				return defaultValue as T;
			}
		} as any;

		const config = new ImplicitProjectConfiguration(mockConfiguration);
		assert.strictEqual(config.strict, true);
	});

	test('should respect user setting for strict', () => {
		const mockConfiguration = {
			get: <T>(key: string, defaultValue?: T): T => {
				if (key === 'js/ts.implicitProjectConfig.strict') {
					return (false as any) as T;
				}
				return defaultValue as T;
			}
		} as any;

		const config = new ImplicitProjectConfiguration(mockConfiguration);
		assert.strictEqual(config.strict, false);
	});

	test('should include strict in equality comparison', () => {
		const mockConfigurationTrue = {
			get: <T>(key: string, defaultValue?: T): T => {
				if (key === 'js/ts.implicitProjectConfig.strict') {
					return (true as any) as T;
				}
				return defaultValue as T;
			}
		} as any;

		const mockConfigurationFalse = {
			get: <T>(key: string, defaultValue?: T): T => {
				if (key === 'js/ts.implicitProjectConfig.strict') {
					return (false as any) as T;
				}
				return defaultValue as T;
			}
		} as any;

		const configTrue1 = new ImplicitProjectConfiguration(mockConfigurationTrue);
		const configTrue2 = new ImplicitProjectConfiguration(mockConfigurationTrue);
		const configFalse = new ImplicitProjectConfiguration(mockConfigurationFalse);

		assert.strictEqual(configTrue1.isEqualTo(configTrue2), true);
		assert.strictEqual(configTrue1.isEqualTo(configFalse), false);
	});
});