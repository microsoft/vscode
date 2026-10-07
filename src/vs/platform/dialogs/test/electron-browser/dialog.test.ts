/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { IOSProperties } from '../../../native/common/native.js';
import product from '../../../product/common/product.js';
import { IProductService } from '../../../product/common/productService.js';
import { createNativeAboutDialogDetails } from '../../electron-browser/dialog.js';

suite('Dialog', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	const osProperties: IOSProperties = {
		type: 'Test OS',
		release: '1.0',
		arch: 'test-arch',
		platform: 'test',
		cpus: []
	};

	function getCopilotVersionLines(runtime: string, sdk: string): { details: string[]; detailsToCopy: string[] } {
		const productService: IProductService = {
			_serviceBrand: undefined,
			...product,
			copilotVersions: { runtime, sdk }
		};
		const { details, detailsToCopy } = createNativeAboutDialogDetails(productService, osProperties);
		const selectCopilotVersionLines = (value: string) => value.split('\n').filter(line => line.startsWith('@github/copilot'));

		return {
			details: selectCopilotVersionLines(details),
			detailsToCopy: selectCopilotVersionLines(detailsToCopy)
		};
	}

	test('formats Copilot canary versions', () => {
		assert.deepStrictEqual(
			getCopilotVersionLines('1.0.84-canary.70.gdb75d0d.unsigned', '0.1.23-canary.45.gabcdef.unsigned'),
			{
				details: [
					'@github/copilot: 1.0.84.70.gdb75d0d',
					'@github/copilot-sdk: 0.1.23.45.gabcdef'
				],
				detailsToCopy: [
					'@github/copilot: 1.0.84.70.gdb75d0d',
					'@github/copilot-sdk: 0.1.23.45.gabcdef'
				]
			}
		);
	});

	test('formats Copilot unstable versions', () => {
		assert.deepStrictEqual(
			getCopilotVersionLines('1.0.85-unstable.r35379093703.g3514c9a', '1.0.15-unstable.35393089353.gfc44743'),
			{
				details: [
					'@github/copilot: 1.0.85.r35379093703.g3514c9a',
					'@github/copilot-sdk: 1.0.15.35393089353.gfc44743'
				],
				detailsToCopy: [
					'@github/copilot: 1.0.85.r35379093703.g3514c9a',
					'@github/copilot-sdk: 1.0.15.35393089353.gfc44743'
				]
			}
		);
	});

	for (const { name, runtime, sdk, expectedRuntime, expectedSdk } of [
		{
			name: 'runtime only',
			runtime: '1.0.87-unstable.r35651157977.g1aacd25',
			sdk: '1.0.15',
			expectedRuntime: '1.0.87.r35651157977.g1aacd25',
			expectedSdk: '1.0.15'
		},
		{
			name: 'SDK only',
			runtime: '1.0.87',
			sdk: '1.0.15-unstable.35663726336.gcb2a8cc',
			expectedRuntime: '1.0.87',
			expectedSdk: '1.0.15.35663726336.gcb2a8cc'
		},
		{
			name: 'bare prerelease markers',
			runtime: '1.0.87-unstable',
			sdk: '1.0.15-unstable',
			expectedRuntime: '1.0.87',
			expectedSdk: '1.0.15'
		},
		{
			name: 'hyphenated prerelease identifiers',
			runtime: '1.0.87-unstable-r35651157977.g1aacd25.unsigned',
			sdk: '1.0.15-unstable-35663726336.gcb2a8cc.unsigned',
			expectedRuntime: '1.0.87-r35651157977.g1aacd25',
			expectedSdk: '1.0.15-35663726336.gcb2a8cc'
		},
		{
			name: 'build metadata',
			runtime: '1.0.87-unstable+r35651157977.g1aacd25',
			sdk: '1.0.15-unstable+35663726336.gcb2a8cc',
			expectedRuntime: '1.0.87+r35651157977.g1aacd25',
			expectedSdk: '1.0.15+35663726336.gcb2a8cc'
		},
		{
			name: 'preserves marker-like build metadata',
			runtime: '1.0.87+build-unstable.foo',
			sdk: '1.0.15+build-canary.foo',
			expectedRuntime: '1.0.87+build-unstable.foo',
			expectedSdk: '1.0.15+build-canary.foo'
		},
		{
			name: 'removes only the leading prerelease marker',
			runtime: '1.0.87-unstable+build-unstable.foo',
			sdk: '1.0.15-canary+build-canary.foo',
			expectedRuntime: '1.0.87+build-unstable.foo',
			expectedSdk: '1.0.15+build-canary.foo'
		},
		{
			name: 'preserves marker-like text inside prerelease identifiers',
			runtime: '1.0.87-preview-unstable.foo',
			sdk: '1.0.15-preview-canary.foo',
			expectedRuntime: '1.0.87-preview-unstable.foo',
			expectedSdk: '1.0.15-preview-canary.foo'
		}
	]) {
		test(`formats Copilot unstable versions: ${name}`, () => {
			const expected = [
				`@github/copilot: ${expectedRuntime}`,
				`@github/copilot-sdk: ${expectedSdk}`
			];
			assert.deepStrictEqual(getCopilotVersionLines(runtime, sdk), {
				details: expected,
				detailsToCopy: expected
			});
		});
	}

	test('preserves stable Copilot versions', () => {
		assert.deepStrictEqual(
			getCopilotVersionLines('1.0.84', '0.1.23'),
			{
				details: [
					'@github/copilot: 1.0.84',
					'@github/copilot-sdk: 0.1.23'
				],
				detailsToCopy: [
					'@github/copilot: 1.0.84',
					'@github/copilot-sdk: 0.1.23'
				]
			}
		);
	});
});
