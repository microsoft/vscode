/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, test } from 'vitest';
import { jsonToTable } from '../searchIntent';

describe('searchIntent jsonToTable', () => {

	test('returns no table without args', () => {
		expect(jsonToTable(undefined)).toEqual([]);
	});

	test('renders only the known search parameters', () => {
		expect(jsonToTable({
			isRegex: true,
			query: 'foo',
			'[evil](https://evil.example)': 'x',
			replace: '',
			filesToInclude: 'src/**',
		})).toEqual([
			'| Parameter  | Value |\n',
			'| ------ | ----- |\n',
			'| query | `foo` |\n',
			'| filesToInclude | `src/**` |\n',
			'| isRegex | `true` |\n',
			'\n',
		]);
	});

	test('keeps model provided values literal inside the table cell', () => {
		const values = [
			'safe` | injected',
			'a``b',
			'`leading and trailing`',
			' padded ',
			'  ',
			'line1\nline2\r\nline3\u2028line4',
			'a|b',
			'a\\|b',
			'a\\\\|b',
			'[evil](https://evil.example)\\|',
		];
		expect(values.map(value => jsonToTable({ query: value })[2])).toEqual([
			'| query | ``safe` \\| injected`` |\n',
			'| query | ```a``b``` |\n',
			'| query | `` `leading and trailing` `` |\n',
			'| query | `  padded  ` |\n',
			'| query | `  ` |\n',
			'| query | `line1 line2 line3 line4` |\n',
			'| query | `a\\|b` |\n',
			'| query | `a\\`&#124;`b` |\n',
			'| query | `a\\\\\\|b` |\n',
			'| query | `[evil](https://evil.example)\\`&#124; |\n',
		]);
	});
});
