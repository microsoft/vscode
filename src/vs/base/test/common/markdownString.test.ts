/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { MarkdownString } from 'vs/base/common/htmlContent';

suite('markdownString', () => {

	test('escape', () => {

		const mds = new MarkdownString();

		mds.appendText('# foo\n*bar*');

		assert.equal(mds.value, '\\# foo\n\n\\*bar\\*');
	});
});
