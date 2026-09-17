/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { afterAll, expect, suite, test } from 'vitest';
import {
	_dispose,
	_getParseErrorCount
} from '../../node/parserImpl';
import { WASMLanguage } from '../../node/treeSitterLanguages';


suite('getParseErrorCount - typescript', () => {

	afterAll(() => _dispose());

	test('no error', async () => {
		const res = await _getParseErrorCount(WASMLanguage.TypeScript, 'const a = 1;');
		expect(res).toBe(0);
	});

	test('with error', async () => {
		const res = await _getParseErrorCount(WASMLanguage.TypeScript, 'cont a = 1;');
		expect(res).toMatchInlineSnapshot(`1`);
	});

	test('with error', async () => {
		const res = await _getParseErrorCount(WASMLanguage.TypeScript,
			`funtion foo() {`
		);
		expect(res).toMatchInlineSnapshot(`2`);
	});
});
