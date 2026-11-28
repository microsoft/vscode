/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import 'mocha';
import { githubSlugifier } from '../slugify';

suite('markdown.slugify', () => {
	function slugs(...headings: string[]): string[] {
		const builder = githubSlugifier.createBuilder();
		return headings.map(heading => builder.add(heading).value);
	}

	test('Adds suffixes for repeated headings', () => {
		assert.deepStrictEqual(slugs('a', 'a', 'a'), ['a', 'a-1', 'a-2']);
	});

	test('Does not reuse a suffix taken by another heading', () => {
		assert.deepStrictEqual(slugs('a', 'a', 'a-1'), ['a', 'a-1', 'a-1-1']);
		assert.deepStrictEqual(slugs('a-1', 'a', 'a', 'a'), ['a-1', 'a', 'a-2', 'a-3']);
	});
});
