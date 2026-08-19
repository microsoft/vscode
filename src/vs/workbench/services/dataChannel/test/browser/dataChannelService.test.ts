/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { linkPresentationProviderInitialKinds } from '../../browser/dataChannelService.js';

suite('DataChannelService', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('link presentation contribution supports chat initial kind', () => {
		assert.ok(linkPresentationProviderInitialKinds.includes('chat'));
	});
});
