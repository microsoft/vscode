/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { strictEqual } from 'assert';
import 'mocha';
import { githubSlugifier } from '../slugify';

suite('githubSlugifier', () => {
	suite('createBuilder', () => {
		test('Duplicate heading whose generated id is taken gets the next free suffix', () => {
			const builder = githubSlugifier.createBuilder();
			strictEqual(builder.add('Foo').value, 'foo');
			strictEqual(builder.add('Foo-1').value, 'foo-1');
			strictEqual(builder.add('Foo').value, 'foo-2');
		});

		test('Heading whose slug collides with a generated id is suffixed further', () => {
			const builder = githubSlugifier.createBuilder();
			strictEqual(builder.add('Foo').value, 'foo');
			strictEqual(builder.add('Foo').value, 'foo-1');
			strictEqual(builder.add('Foo 1').value, 'foo-1-1');
			strictEqual(builder.add('Foo').value, 'foo-2');
		});

		test('Repeated headings keep their existing ids', () => {
			const builder = githubSlugifier.createBuilder();
			strictEqual(builder.add('Foo').value, 'foo');
			strictEqual(builder.add('Foo').value, 'foo-1');
			strictEqual(builder.add('Foo').value, 'foo-2');
		});
	});
});
