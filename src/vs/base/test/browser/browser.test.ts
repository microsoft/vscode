/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import { isWindows, isMacintosh } from 'vs/base/common/platform';

suite('Browsers', () => {
	test('all', function () {
		assert(!(isWindows && isMacintosh));
	});
});
