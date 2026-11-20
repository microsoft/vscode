/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it } from 'vitest';
import { InlineEditRequestLogContext } from '../../common/inlineEditLogContext';

describe('InlineEditRequestLogContext', () => {
	it.each([
		{
			name: 'newlines and tabs',
			content: '- first\tsecond\tthird\nfourth\nfifth',
			expected: '- first\\tsecond\\tthird\\nfourth\\nfifth\n',
		},
		{
			name: 'backticks',
			content: '`inline` and ```fenced```',
			expected: '\\`inline\\` and \\`\\`\\`fenced\\`\\`\\`\n',
		},
	])('escapes every occurrence of $name in log entries', ({ content, expected }) => {
		const context = new InlineEditRequestLogContext('test.ts', 1, undefined);
		context.addLog(content);

		expect(context.toJSON().logs).toEqual([expected]);
	});
});
