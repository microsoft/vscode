/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { buildTestUri, ParsedTestUri, parseTestUri, TestUriType } from 'vs/workbench/contrib/testing/common/testingUri';

suite('Workbench - Testing URIs', () => {
	test('round trip', () => {
		const uris: ParsedTestUri[] = [
			{ type: TestUriType.LiveActualOutput, messageIndex: 42, providerId: 'p', testId: 't' },
			{ type: TestUriType.LiveExpectedOutput, messageIndex: 42, providerId: 'p', testId: 't' },
			{ type: TestUriType.LiveMessage, messageIndex: 42, providerId: 'p', testId: 't' },
			{ type: TestUriType.ResultActualOutput, messageIndex: 42, resultId: 'r', testId: 't' },
			{ type: TestUriType.ResultExpectedOutput, messageIndex: 42, resultId: 'r', testId: 't' },
			{ type: TestUriType.ResultMessage, messageIndex: 42, resultId: 'r', testId: 't' },
		];

		for (const uri of uris) {
			const serialized = buildTestUri(uri);
			assert.deepStrictEqual(uri, parseTestUri(serialized));
		}
	});
});
