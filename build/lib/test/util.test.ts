/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert = require('assert');
import util = require('../util');

function getMockTagExists(tags: string[]) {
	return (tag: string) => tags.indexOf(tag) >= 0;
}

suite('util tests', () => {
	test('getPreviousVersion - patch', () => {
		assert.equal(
			util.getPreviousVersion('1.2.3', getMockTagExists(['1.2.2', '1.2.1', '1.2.0', '1.1.0'])),
			'1.2.2'
		);
	});

	test('getPreviousVersion - patch invalid', () => {
		try {
			util.getPreviousVersion('1.2.2', getMockTagExists(['1.2.0', '1.1.0']));
		} catch (e) {
			// expected
			return;
		}

		throw new Error('Expected an exception');
	});

	test('getPreviousVersion - minor', () => {
		assert.equal(
			util.getPreviousVersion('1.2.0', getMockTagExists(['1.1.0', '1.1.1', '1.1.2', '1.1.3'])),
			'1.1.3'
		);

		assert.equal(
			util.getPreviousVersion('1.2.0', getMockTagExists(['1.1.0', '1.0.0'])),
			'1.1.0'
		);
	});

	test('getPreviousVersion - minor gap', () => {
		assert.equal(
			util.getPreviousVersion('1.2.0', getMockTagExists(['1.1.0', '1.1.1', '1.1.3'])),
			'1.1.1'
		);
	});

	test('getPreviousVersion - minor invalid', () => {
		try {
			util.getPreviousVersion('1.2.0', getMockTagExists(['1.0.0']));
		} catch (e) {
			// expected
			return;
		}

		throw new Error('Expected an exception');
	});

	test('getPreviousVersion - major', () => {
		assert.equal(
			util.getPreviousVersion('2.0.0', getMockTagExists(['1.0.0', '1.1.0', '1.2.0', '1.2.1', '1.2.2'])),
			'1.2.2'
		);
	});

	test('getPreviousVersion - major invalid', () => {
		try {
			util.getPreviousVersion('3.0.0', getMockTagExists(['1.0.0']));
		} catch (e) {
			// expected
			return;
		}

		throw new Error('Expected an exception');
	});
});
