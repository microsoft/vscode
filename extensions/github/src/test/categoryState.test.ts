/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'mocha';
import * as assert from 'assert';
import { getSelectedCategory, setSelectedCategory } from '../categoryState.js';

suite('Category State Tests', function () {

	test('should return default category when not set', function () {
		const category = getSelectedCategory();
		assert.strictEqual(category, undefined);
	});

	test('should store and retrieve user category', function () {
		setSelectedCategory('user');
		const category = getSelectedCategory();
		assert.strictEqual(category, 'user');
	});

	test('should store and retrieve orgs category', function () {
		setSelectedCategory('orgs');
		const category = getSelectedCategory();
		assert.strictEqual(category, 'orgs');
	});

	test('should store and retrieve all category', function () {
		setSelectedCategory('all');
		const category = getSelectedCategory();
		assert.strictEqual(category, 'all');
	});

	test('should update category when set multiple times', function () {
		setSelectedCategory('user');
		assert.strictEqual(getSelectedCategory(), 'user');

		setSelectedCategory('orgs');
		assert.strictEqual(getSelectedCategory(), 'orgs');

		setSelectedCategory('all');
		assert.strictEqual(getSelectedCategory(), 'all');
	});
});
