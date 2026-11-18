/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import {
	getMultiLanguageContextProviderParamsFromActiveExperiments,
	multiLanguageContextProviderParamsDefault,
} from '../contextProviderRegistryMultiLanguage';

suite('contextProviderRegistryMultiLanguage', function () {
	let activeExperiments: Map<string, string | number | boolean | string[]>;

	setup(function () {
		activeExperiments = new Map();
	});

	suite('getMultiLanguageContextProviderConfigFromActiveExperiments', function () {
		test('returns default config when no experiments are set', function () {
			const result = getMultiLanguageContextProviderParamsFromActiveExperiments(new Map());

			assert.deepStrictEqual(result, multiLanguageContextProviderParamsDefault);
		});

		test('overrides defaults with experiment values', function () {
			activeExperiments.set('mlcpMaxContextItems', '50');
			activeExperiments.set('mlcpMaxSymbolMatches', 30);
			activeExperiments.set('mlcpEnableImports', true);

			const result = getMultiLanguageContextProviderParamsFromActiveExperiments(activeExperiments);

			assert.strictEqual(result.mlcpMaxContextItems, 50);
			assert.strictEqual(result.mlcpMaxSymbolMatches, 30);
			assert.strictEqual(result.mlcpEnableImports, true);
		});

		test('converts string values to appropriate types', function () {
			activeExperiments.set('mlcpMaxContextItems', '25');
			activeExperiments.set('mlcpEnableImports', 'true');

			const result = getMultiLanguageContextProviderParamsFromActiveExperiments(activeExperiments);

			assert.strictEqual(result.mlcpMaxContextItems, 25);
			assert.strictEqual(result.mlcpEnableImports, true);
		});

		test('converts string values for false to appropriate types', function () {
			activeExperiments.set('mlcpMaxContextItems', '25');
			activeExperiments.set('mlcpEnableImports', 'false');

			const result = getMultiLanguageContextProviderParamsFromActiveExperiments(activeExperiments);

			assert.strictEqual(result.mlcpMaxContextItems, 25);
			assert.strictEqual(result.mlcpEnableImports, false);
		});

		test('handles partial overrides', function () {
			activeExperiments.set('mlcpEnableImports', true);

			const result = getMultiLanguageContextProviderParamsFromActiveExperiments(activeExperiments);

			assert.strictEqual(
				result.mlcpMaxContextItems,
				multiLanguageContextProviderParamsDefault.mlcpMaxContextItems
			);
			assert.strictEqual(
				result.mlcpMaxSymbolMatches,
				multiLanguageContextProviderParamsDefault.mlcpMaxSymbolMatches
			);
			assert.strictEqual(result.mlcpEnableImports, true);
		});

		test('converts falsy values correctly', function () {
			activeExperiments.set('mlcpMaxContextItems', 0);
			activeExperiments.set('mlcpEnableImports', false);

			const result = getMultiLanguageContextProviderParamsFromActiveExperiments(activeExperiments);

			assert.strictEqual(result.mlcpMaxContextItems, 0);
			assert.strictEqual(result.mlcpEnableImports, false);
		});

		test('returns false for imports when not set', function () {
			const result = getMultiLanguageContextProviderParamsFromActiveExperiments(activeExperiments);

			assert.strictEqual(result.mlcpEnableImports, false);
		});
	});
});
