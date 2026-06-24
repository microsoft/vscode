/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it } from 'vitest';
import { transformIndentation } from '../indentationGuesser';

describe('identationGuesser', () => {
	it('transformIndentation', () => {
		expect(transformIndentation('  hello()', { insertSpaces: true, tabSize: 2 }, { insertSpaces: false, tabSize: 2 })).toBe('\thello()');

		// 4 spaces to 2-space indent
		expect(transformIndentation('    hello()', { insertSpaces: true, tabSize: 4 }, { insertSpaces: true, tabSize: 2 })).toBe('  hello()');
		// tab to 4 spaces
		expect(transformIndentation('\thello()', { insertSpaces: false, tabSize: 4 }, { insertSpaces: true, tabSize: 4 })).toBe('    hello()');
		// 8 spaces to tab (tabSize 4)
		expect(transformIndentation('        hello()', { insertSpaces: true, tabSize: 4 }, { insertSpaces: false, tabSize: 4 })).toBe('\t\thello()');
		// 2 tabs to 4 spaces (tabSize 2)
		expect(transformIndentation('\t\thello()', { insertSpaces: false, tabSize: 2 }, { insertSpaces: true, tabSize: 4 })).toBe('        hello()');
		// No indentation change
		expect(transformIndentation('hello()', { insertSpaces: true, tabSize: 2 }, { insertSpaces: true, tabSize: 2 })).toBe('hello()');
		expect(transformIndentation(' \thello()', { insertSpaces: false, tabSize: 4 }, { insertSpaces: true, tabSize: 2 })).toBe(' \thello()');
	});
});
