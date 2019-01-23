/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as assert from 'assert';
import { formatOptions, Option } from 'vs/platform/environment/node/argv';

suite('formatOptions', () => {

	function o(id: string, description: string): Option {
		return {
			id, description, type: 'string'
		};
	}

	test('Text should display small columns correctly', () => {
		assert.deepEqual(
			formatOptions([
				o('foo', 'bar')
			], 80),
			['  --foo bar']
		);
		assert.deepEqual(
			formatOptions([
				o('f', 'bar'),
				o('fo', 'ba'),
				o('foo', 'b')
			], 80),
			[
				'  --f   bar',
				'  --fo  ba',
				'  --foo b'
			]);
	});

	test('Text should wrap', () => {
		assert.deepEqual(
			formatOptions([
				o('foo', (<any>'bar ').repeat(9))
			], 40),
			[
				'  --foo bar bar bar bar bar bar bar bar',
				'        bar'
			]);
	});

	test('Text should revert to the condensed view when the terminal is too narrow', () => {
		assert.deepEqual(
			formatOptions([
				o('foo', (<any>'bar ').repeat(9))
			], 30),
			[
				'  --foo',
				'      bar bar bar bar bar bar bar bar bar '
			]);
	});
});
