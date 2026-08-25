/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { deepStrictEqual } from 'assert';
import 'mocha';
import { githubSlugifier } from '../slugify';

suite('githubSlugifier', () => {
	suite('createBuilder', () => {
		test('Duplicate heading whose generated id is taken gets the next free suffix', () => {
			const builder = githubSlugifier.createBuilder();
			deepStrictEqual(
				['Foo', 'Foo-1', 'Foo'].map(heading => builder.add(heading).value),
				['foo', 'foo-1', 'foo-2']);
		});

		test('Heading whose slug collides with a generated id is suffixed further', () => {
			const builder = githubSlugifier.createBuilder();
			deepStrictEqual(
				['Foo', 'Foo', 'Foo 1', 'Foo'].map(heading => builder.add(heading).value),
				['foo', 'foo-1', 'foo-1-1', 'foo-2']);
		});

		test('Repeated headings keep their existing ids', () => {
			const builder = githubSlugifier.createBuilder();
			deepStrictEqual(
				['Foo', 'Foo', 'Foo'].map(heading => builder.add(heading).value),
				['foo', 'foo-1', 'foo-2']);
		});
	});
});
