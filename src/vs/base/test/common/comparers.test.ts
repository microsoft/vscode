/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { compareFileNames } from 'vs/base/common/comparers';
import * as assert from 'assert';

suite('Comparers', () => {

	test('compareFileNames', () => {

		assert(compareFileNames('', '') === 0, 'empty should be equal');
		assert(compareFileNames('abc', 'abc') === 0, 'equal names should be equal');
		assert(compareFileNames('.abc', '.abc') === 0, 'equal full names should be equal');
		assert(compareFileNames('.env', '.env.example') < 0);
		assert(compareFileNames('.env.example', '.gitattributes') < 0);
	});
});
