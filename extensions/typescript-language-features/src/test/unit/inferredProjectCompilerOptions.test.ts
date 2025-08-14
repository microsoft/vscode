/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import 'mocha';
import { ImplicitProjectConfiguration } from '../../configuration/configuration';
import { API } from '../../tsServer/api';
import { inferredProjectCompilerOptions, ProjectType } from '../../tsconfig';

suite('inferredProjectCompilerOptions', () => {

	function createMockServiceConfig(strictValue: boolean) {
		const mockConfiguration = {
			get: <T>(key: string, defaultValue?: T): T => {
				if (key === 'js/ts.implicitProjectConfig.strict') {
					return (strictValue as any) as T;
				}
				return defaultValue as T;
			}
		} as any;

		return {
			implicitProjectConfiguration: new ImplicitProjectConfiguration(mockConfiguration)
		} as any;
	}

	test('should include strict: true when setting is enabled', () => {
		const serviceConfig = createMockServiceConfig(true);
		const version = API.fromVersionString('4.0.0');
		
		const options = inferredProjectCompilerOptions(version, ProjectType.TypeScript, serviceConfig);
		
		assert.strictEqual(options.strict, true);
	});

	test('should not include strict when setting is disabled', () => {
		const serviceConfig = createMockServiceConfig(false);
		const version = API.fromVersionString('4.0.0');
		
		const options = inferredProjectCompilerOptions(version, ProjectType.TypeScript, serviceConfig);
		
		assert.strictEqual(options.strict, undefined);
	});

	test('should work for JavaScript projects', () => {
		const serviceConfig = createMockServiceConfig(true);
		const version = API.fromVersionString('4.0.0');
		
		const options = inferredProjectCompilerOptions(version, ProjectType.JavaScript, serviceConfig);
		
		assert.strictEqual(options.strict, true);
	});
});