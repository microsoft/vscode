/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from 'vs/base/test/common/utils';

suite('Modules Loading in ESM via direct import()', () => {

	test('@microsoft/1ds-post-js', async () => {
		// eslint-disable-next-line local/code-amd-node-module
		const { default: module } = await import('@microsoft/1ds-post-js');
		assert.ok(typeof module.PostChannel === 'function');
	});

	test('@microsoft/1ds-core-js', async () => {
		// eslint-disable-next-line local/code-amd-node-module
		const { default: module } = await import('@microsoft/1ds-core-js');
		assert.ok(typeof module.AppInsightsCore === 'function');
	});

	ensureNoDisposablesAreLeakedInTestSuite();
});
