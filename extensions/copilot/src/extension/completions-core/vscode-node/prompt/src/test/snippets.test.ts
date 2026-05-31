/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { SnippetProviderType, SnippetSemantics, announceSnippet } from '../snippetInclusion/snippets';
import * as assert from 'assert';
import dedent from 'ts-dedent';

suite('Unit tests for snippet.ts', () => {
	const bogusSnippet = {
		relativePath: 'snippet1.ts',
		score: 1.0,
		startLine: 1,
		endLine: 3,
		provider: SnippetProviderType.Path,
		semantics: SnippetSemantics.Snippet,
		snippet: dedent`
				A
					B
					C`,
	};

	test('announceSnippet', function () {
		assert.deepStrictEqual(announceSnippet(bogusSnippet), {
			headline: 'Compare this snippet from snippet1.ts:',
			snippet: dedent`
				A
					B
					C`,
		});
	});
});
