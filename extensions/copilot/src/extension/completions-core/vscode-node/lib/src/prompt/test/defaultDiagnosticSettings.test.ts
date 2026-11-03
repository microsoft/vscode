/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import Sinon from 'sinon';
import { TestingServiceCollection } from '../../../../../../../platform/test/node/services';
import { ServicesAccessor } from '../../../../../../../util/vs/platform/instantiation/common/instantiation';
import { IConfigurationService } from '../../../../../../../platform/configuration/common/configurationService';
import { DefaultDiagnosticSettings, getDefaultDiagnosticSettings } from '../contextProviderRegistry';
import { createLibTestingContext } from '../../test/context';

suite('DefaultDiagnosticSettings', function () {
	suite('DefaultDiagnosticSettings.from()', function () {
		test('should return undefined for null input', function () {
			const result = DefaultDiagnosticSettings.from(null);
			assert.strictEqual(result, undefined);
		});

		test('should return undefined for undefined input', function () {
			const result = DefaultDiagnosticSettings.from(undefined);
			assert.strictEqual(result, undefined);
		});

		test('should return undefined for empty string', function () {
			const result = DefaultDiagnosticSettings.from('');
			assert.strictEqual(result, undefined);
		});

		test('should return undefined for invalid JSON', function () {
			const result = DefaultDiagnosticSettings.from('invalid json');
			assert.strictEqual(result, undefined);
		});

		test('should return undefined for empty JSON object', function () {
			const result = DefaultDiagnosticSettings.from('{}');
			assert.strictEqual(result, undefined);
		});

		test('should parse valid JSON with all fields', function () {
			const json = JSON.stringify({
				warnings: 'yes',
				maxLineDistance: 20,
				maxDiagnostics: 10
			});
			const result = DefaultDiagnosticSettings.from(json);
			assert.deepStrictEqual(result, {
				warnings: 'yes',
				maxLineDistance: 20,
				maxDiagnostics: 10
			});
		});

		test('should parse JSON with warnings: "no"', function () {
			const json = JSON.stringify({
				warnings: 'no',
				maxLineDistance: 15,
				maxDiagnostics: 3
			});
			const result = DefaultDiagnosticSettings.from(json);
			assert.deepStrictEqual(result, {
				warnings: 'no',
				maxLineDistance: 15,
				maxDiagnostics: 3
			});
		});

		test('should parse JSON with warnings: "yesIfNoErrors"', function () {
			const json = JSON.stringify({
				warnings: 'yesIfNoErrors',
				maxLineDistance: 25,
				maxDiagnostics: 8
			});
			const result = DefaultDiagnosticSettings.from(json);
			assert.deepStrictEqual(result, {
				warnings: 'yesIfNoErrors',
				maxLineDistance: 25,
				maxDiagnostics: 8
			});
		});

		test('should default warnings to "no" for invalid value', function () {
			const json = JSON.stringify({
				warnings: 'invalid',
				maxLineDistance: 10,
				maxDiagnostics: 5
			});
			const result = DefaultDiagnosticSettings.from(json);
			assert.strictEqual(result?.warnings, 'no');
		});

		test('should default warnings to "no" when not provided', function () {
			const json = JSON.stringify({
				maxLineDistance: 10,
				maxDiagnostics: 5
			});
			const result = DefaultDiagnosticSettings.from(json);
			assert.strictEqual(result?.warnings, 'no');
		});

		test('should default maxLineDistance to 10 when not provided', function () {
			const json = JSON.stringify({
				warnings: 'yes',
				maxDiagnostics: 5
			});
			const result = DefaultDiagnosticSettings.from(json);
			assert.strictEqual(result?.maxLineDistance, 10);
		});

		test('should default maxLineDistance to 10 when negative', function () {
			const json = JSON.stringify({
				warnings: 'yes',
				maxLineDistance: -5,
				maxDiagnostics: 5
			});
			const result = DefaultDiagnosticSettings.from(json);
			assert.strictEqual(result?.maxLineDistance, 10);
		});

		test('should default maxLineDistance to 10 when not a number', function () {
			const json = JSON.stringify({
				warnings: 'yes',
				maxLineDistance: 'invalid',
				maxDiagnostics: 5
			});
			const result = DefaultDiagnosticSettings.from(json);
			assert.strictEqual(result?.maxLineDistance, 10);
		});

		test('should accept maxLineDistance of 0', function () {
			const json = JSON.stringify({
				warnings: 'yes',
				maxLineDistance: 0,
				maxDiagnostics: 5
			});
			const result = DefaultDiagnosticSettings.from(json);
			assert.strictEqual(result?.maxLineDistance, 0);
		});

		test('should default maxDiagnostics to 5 when not provided', function () {
			const json = JSON.stringify({
				warnings: 'yes',
				maxLineDistance: 10
			});
			const result = DefaultDiagnosticSettings.from(json);
			assert.strictEqual(result?.maxDiagnostics, 5);
		});

		test('should default maxDiagnostics to 5 when zero', function () {
			const json = JSON.stringify({
				warnings: 'yes',
				maxLineDistance: 10,
				maxDiagnostics: 0
			});
			const result = DefaultDiagnosticSettings.from(json);
			assert.strictEqual(result?.maxDiagnostics, 5);
		});

		test('should default maxDiagnostics to 5 when negative', function () {
			const json = JSON.stringify({
				warnings: 'yes',
				maxLineDistance: 10,
				maxDiagnostics: -3
			});
			const result = DefaultDiagnosticSettings.from(json);
			assert.strictEqual(result?.maxDiagnostics, 5);
		});

		test('should default maxDiagnostics to 5 when not a number', function () {
			const json = JSON.stringify({
				warnings: 'yes',
				maxLineDistance: 10,
				maxDiagnostics: 'invalid'
			});
			const result = DefaultDiagnosticSettings.from(json);
			assert.strictEqual(result?.maxDiagnostics, 5);
		});

		test('should accept large values for maxLineDistance', function () {
			const json = JSON.stringify({
				warnings: 'yes',
				maxLineDistance: 1000,
				maxDiagnostics: 5
			});
			const result = DefaultDiagnosticSettings.from(json);
			assert.strictEqual(result?.maxLineDistance, 1000);
		});

		test('should accept large values for maxDiagnostics', function () {
			const json = JSON.stringify({
				warnings: 'yes',
				maxLineDistance: 10,
				maxDiagnostics: 100
			});
			const result = DefaultDiagnosticSettings.from(json);
			assert.strictEqual(result?.maxDiagnostics, 100);
		});

		test('should handle JSON with extra fields', function () {
			const json = JSON.stringify({
				warnings: 'yes',
				maxLineDistance: 10,
				maxDiagnostics: 5,
				extraField: 'should be ignored'
			});
			const result = DefaultDiagnosticSettings.from(json);
			assert.deepStrictEqual(result, {
				warnings: 'yes',
				maxLineDistance: 10,
				maxDiagnostics: 5
			});
		});

		test('should handle partial JSON with only warnings', function () {
			const json = JSON.stringify({
				warnings: 'yes'
			});
			const result = DefaultDiagnosticSettings.from(json);
			assert.deepStrictEqual(result, {
				warnings: 'yes',
				maxLineDistance: 10,
				maxDiagnostics: 5
			});
		});

		test('should handle partial JSON with only maxLineDistance', function () {
			const json = JSON.stringify({
				maxLineDistance: 25
			});
			const result = DefaultDiagnosticSettings.from(json);
			assert.deepStrictEqual(result, {
				warnings: 'no',
				maxLineDistance: 25,
				maxDiagnostics: 5
			});
		});

		test('should handle partial JSON with only maxDiagnostics', function () {
			const json = JSON.stringify({
				maxDiagnostics: 15
			});
			const result = DefaultDiagnosticSettings.from(json);
			assert.deepStrictEqual(result, {
				warnings: 'no',
				maxLineDistance: 10,
				maxDiagnostics: 15
			});
		});
	});

	suite('getDefaultDiagnosticSettings()', function () {
		let serviceCollection: TestingServiceCollection;
		let accessor: ServicesAccessor;

		setup(function () {
			serviceCollection = createLibTestingContext();
			accessor = serviceCollection.createTestingAccessor();
		});

		teardown(function () {
			Sinon.restore();
		});

		test('should return undefined when config value is not a string', function () {
			const configService = accessor.get(IConfigurationService);
			Sinon.stub(configService, 'getExperimentBasedConfig').returns(123); // non-string value

			const result = getDefaultDiagnosticSettings(accessor);
			assert.strictEqual(result, undefined);
		});

		test('should return undefined when config value is undefined', function () {
			const configService = accessor.get(IConfigurationService);
			Sinon.stub(configService, 'getExperimentBasedConfig').returns(undefined);

			const result = getDefaultDiagnosticSettings(accessor);
			assert.strictEqual(result, undefined);
		});

		test('should return parsed settings when config value is valid JSON', function () {
			const configService = accessor.get(IConfigurationService);
			const configValue = JSON.stringify({
				warnings: 'yes',
				maxLineDistance: 20,
				maxDiagnostics: 10
			});
			Sinon.stub(configService, 'getExperimentBasedConfig').returns(configValue);

			const result = getDefaultDiagnosticSettings(accessor);
			assert.deepStrictEqual(result, {
				warnings: 'yes',
				maxLineDistance: 20,
				maxDiagnostics: 10
			});
		});

		test('should return undefined when config value is invalid JSON', function () {
			const configService = accessor.get(IConfigurationService);
			Sinon.stub(configService, 'getExperimentBasedConfig').returns('invalid json');

			const result = getDefaultDiagnosticSettings(accessor);
			assert.strictEqual(result, undefined);
		});

		test('should return undefined when config value is empty object JSON', function () {
			const configService = accessor.get(IConfigurationService);
			Sinon.stub(configService, 'getExperimentBasedConfig').returns('{}');

			const result = getDefaultDiagnosticSettings(accessor);
			assert.strictEqual(result, undefined);
		});
	});
});
