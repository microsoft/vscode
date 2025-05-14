/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { buildTestUri, ParsedTestUri, parseTestUri, TestUriType } from '../../common/testingUri.js';

suite('Workbench - Testing URIs', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('round trip', () => {
		const uris: ParsedTestUri[] = [
			{ type: TestUriType.ResultActualOutput, taskIndex: 1, messageIndex: 42, resultId: 'r', testExtId: 't' },
			{ type: TestUriType.ResultExpectedOutput, taskIndex: 1, messageIndex: 42, resultId: 'r', testExtId: 't' },
			{ type: TestUriType.ResultMessage, taskIndex: 1, messageIndex: 42, resultId: 'r', testExtId: 't' },
		];

		for (const uri of uris) {
			const serialized = buildTestUri(uri);
			assert.deepStrictEqual(uri, parseTestUri(serialized));
		}
	});
});
