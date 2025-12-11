/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../base/test/common/utils.js';
import { ServerEnvironmentService, ServerParsedArgs } from '../../node/serverEnvironmentService.js';
import { NativeParsedArgs } from '../../../platform/environment/common/argv.js';

suite('ServerEnvironmentService', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	function createServerEnvironmentService(args: Partial<ServerParsedArgs>): ServerEnvironmentService {
		const fullArgs = {
			_: [],
			...args
		} as unknown as NativeParsedArgs;
		return new ServerEnvironmentService(fullArgs, { _serviceBrand: undefined, ...args });
	}

	suite('reconnectionGraceTime', () => {
		test('should use default value when no argument is provided', () => {
			const service = createServerEnvironmentService({});
			// Default value is ProtocolConstants.ReconnectionGraceTime which is 10800000ms
			assert.ok(service.reconnectionGraceTime > 0);
		});

		test('should parse positive integer values correctly', () => {
			const service = createServerEnvironmentService({ 'reconnection-grace-time': '60' });
			assert.strictEqual(service.reconnectionGraceTime, 60000); // 60 seconds = 60000ms
		});

		test('should fallback to default for negative values', () => {
			const service = createServerEnvironmentService({ 'reconnection-grace-time': '-1000' });
			// Should fallback to default value (not accept negative)
			assert.ok(service.reconnectionGraceTime > 0);
		});

		test('should fallback to default for non-numeric values', () => {
			const service = createServerEnvironmentService({ 'reconnection-grace-time': 'invalid' });
			assert.ok(service.reconnectionGraceTime > 0);
		});

		test('should fallback to default for empty string', () => {
			const service = createServerEnvironmentService({ 'reconnection-grace-time': '' });
			assert.ok(service.reconnectionGraceTime > 0);
		});

		test('should handle zero value', () => {
			const service = createServerEnvironmentService({ 'reconnection-grace-time': '0' });
			assert.strictEqual(service.reconnectionGraceTime, 0);
		});

		test('should handle large values within safe range', () => {
			const service = createServerEnvironmentService({ 'reconnection-grace-time': '3600' });
			assert.strictEqual(service.reconnectionGraceTime, 3600000); // 1 hour = 3600000ms
		});
	});
});
