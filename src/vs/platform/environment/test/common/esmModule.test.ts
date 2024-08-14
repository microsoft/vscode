/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { isWeb } from 'vs/base/common/platform';
import { ensureNoDisposablesAreLeakedInTestSuite } from 'vs/base/test/common/utils';
import { isESM } from 'vs/base/common/amd';

(isESM ? suite : suite.skip)('Modules Loading in ESM via direct import()', () => {

	(isWeb ? test.skip : test)('@microsoft/1ds-post-js', async () => { // TODO@esm fails in web?
		// eslint-disable-next-line local/code-amd-node-module
		const { default: module } = await import('@microsoft/1ds-post-js');
		assert.ok(typeof module.PostChannel === 'function');
	});

	(isWeb ? test.skip : test)('@microsoft/1ds-core-js', async () => { // TODO@esm fails in web?
		// eslint-disable-next-line local/code-amd-node-module
		const { default: module } = await import('@microsoft/1ds-core-js');
		assert.ok(typeof module.AppInsightsCore === 'function');
	});

	ensureNoDisposablesAreLeakedInTestSuite();
});
