/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { LinkProvider } from '../../../../common/languages.js';
import { Link } from '../../browser/getLinks.js';
import { getHoverMessage } from '../../browser/links.js';

suite('Links', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	const provider: LinkProvider = { provideLinks: () => undefined };
	const range = { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 2 };

	test('hover only trusts the command a link targets', () => {
		const trust = (url: string | URI) => getHoverMessage(new Link({ range, url }, provider), true).isTrusted;
		assert.deepStrictEqual([
			trust('command:foo.bar?%5B1%5D'),
			trust('COMMAND:foo.bar'),
			trust(URI.parse('command:foo.bar')),
			trust('https://example.com/)[x](command:foo.bar)'),
			trust('file:///a.txt'),
		], [
			{ enabledCommands: ['foo.bar'] },
			{ enabledCommands: ['foo.bar'] },
			{ enabledCommands: ['foo.bar'] },
			false,
			false,
		]);
	});
});
