/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it } from 'vitest';
import { quoteShellArgument } from '../../common/shellQuoting';

describe('quoteShellArgument', () => {

	// These stand in for a generated commit message, which is derived from repository content
	// and so must never be able to terminate the quoted argument or trigger expansion.
	const values = [
		'plain message',
		'test" --flag injected "',
		'fix: `id -u` and $HOME and $(whoami)',
		`don't break; rm -rf /`,
		'back\\slash and "quotes"',
		`'; echo pwned; '`,
	];

	it('quotes POSIX shell arguments literally', () => {
		expect(values.map(v => quoteShellArgument(v, 'bash'))).toEqual([
			`'plain message'`,
			`'test" --flag injected "'`,
			`'fix: \`id -u\` and $HOME and $(whoami)'`,
			`'don'\\''t break; rm -rf /'`,
			`'back\\slash and "quotes"'`,
			`''\\''; echo pwned; '\\'''`,
		]);
	});

	it('quotes PowerShell arguments literally, doubling embedded single quotes', () => {
		expect(values.map(v => quoteShellArgument(v, 'pwsh'))).toEqual([
			`'plain message'`,
			`'test" --flag injected "'`,
			`'fix: \`id -u\` and $HOME and $(whoami)'`,
			`'don''t break; rm -rf /'`,
			`'back\\slash and "quotes"'`,
			`'''; echo pwned; '''`,
		]);
	});

	it('drops double quotes for cmd.exe, which cannot escape them', () => {
		expect(values.map(v => quoteShellArgument(v, 'cmd'))).toEqual([
			`"plain message"`,
			`"test --flag injected "`,
			`"fix: \`id -u\` and $HOME and $(whoami)"`,
			`"don't break; rm -rf /"`,
			`"back\\slash and quotes"`,
			`"'; echo pwned; '"`,
		]);
	});

	it('falls back to POSIX quoting for unknown and undefined shells', () => {
		expect([quoteShellArgument(`don't`, undefined), quoteShellArgument(`don't`, 'nushell-of-the-future')])
			.toEqual([`'don'\\''t'`, `'don'\\''t'`]);
	});
});
