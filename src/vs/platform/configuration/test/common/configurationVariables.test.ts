/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { hasConfigurationVariable, parseConfigurationVariable } from '../../common/configurationVariables.js';

suite('hasConfigurationVariable', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('recognizes complete variables, including empty expressions', () => {
		const values = [
			'${name}',
			'${env:PATH}',
			'${}',
			'${:}',
			'${input:}',
			'${command:name:argument}',
			'before ${name} after',
			'${one}${two}',
			'$${name}',
			'\\${name}',
		];

		assert.deepStrictEqual(values.map(hasConfigurationVariable), values.map(() => true));
	});

	test('recognizes nested ordinary braces and variables', () => {
		const values = [
			'${{}}',
			'${{{name}}}',
			'${command:name{argument}tail}',
			'${outer:${inner}}',
			'${outer:{${inner:{argument}}}}',
		];

		assert.deepStrictEqual(values.map(hasConfigurationVariable), values.map(() => true));
	});

	test('leaves incomplete markers and ordinary braces literal', () => {
		const values = [
			'',
			'literal',
			'$',
			'{name}',
			'$ {name}',
			'${',
			'${name',
			'${name{}',
			'${{name}',
			'${{{}}',
			'${outer:{inner}{tail}',
			'}${',
			'}${{name}',
		];

		assert.deepStrictEqual(values.map(hasConfigurationVariable), values.map(() => false));
	});

	test('finds complete inner variables after incomplete outer expressions', () => {
		const values = [
			'${outer ${inner}',
			'${outer:{${inner}',
			'${${}',
			'${${name{}}',
			'${outer ${incomplete ${env:PATH} trailing ${',
		];

		assert.deepStrictEqual(values.map(hasConfigurationVariable), values.map(() => true));
	});

	test('ignores unmatched braces outside complete variables', () => {
		const values = [
			'}${name}',
			'${name}{',
			'${name}}',
			'{${name}{',
			'${name} trailing ${',
		];

		assert.deepStrictEqual(values.map(hasConfigurationVariable), values.map(() => true));
	});

	test('agrees with the parser on all short brace expressions', () => {
		const mismatches: string[] = [];
		const check = (value: string, remaining: number): void => {
			let expected = false;
			for (let offset = 0; offset < value.length; offset++) {
				if (parseConfigurationVariable(value, offset)) {
					expected = true;
					break;
				}
			}

			if (hasConfigurationVariable(value) !== expected) {
				mismatches.push(value);
			}

			if (remaining > 0) {
				for (const character of '${}a:') {
					check(value + character, remaining - 1);
				}
			}
		};

		check('', 6);
		assert.deepStrictEqual(mismatches, []);
	});

	for (const suffix of ['', '${env:PATH}']) {
		test(`scans 64 KiB of incomplete markers${suffix ? ' followed by a complete variable' : ''} within the performance budget`, () => {
			const value = '${'.repeat(32 * 1024) + suffix;
			const start = performance.now();
			const actual = hasConfigurationVariable(value);
			const elapsed = performance.now() - start;

			assert.strictEqual(actual, suffix.length > 0);
			assert.ok(elapsed < 1000, `Expected the scan to take less than 1000 ms, took ${elapsed.toFixed(1)} ms`);
		}).timeout(60000);
	}
});
