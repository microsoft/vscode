/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { BrowserWorkbenchEnvironmentService } from '../../browser/environmentService.js';
import { TestProductService } from '../../../../test/common/workbenchTestServices.js';

suite('BrowserWorkbenchEnvironmentService', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('gets enabled extension proposed API from workbench options', () => {
		const empty = new BrowserWorkbenchEnvironmentService('', URI.file('logs'), { enabledExtensionProposedApi: [] }, TestProductService);
		const populated = new BrowserWorkbenchEnvironmentService('', URI.file('logs'), { enabledExtensionProposedApi: ['publisher.extension'] }, TestProductService);

		assert.deepStrictEqual({
			empty: empty.extensionEnabledProposedApi,
			populated: populated.extensionEnabledProposedApi
		}, {
			empty: [],
			populated: ['publisher.extension']
		});
	});
});
