/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it } from 'vitest';
import { quoteShellArgument } from '../../common/shellQuoting';

describe('quoteShellArgument', () => {

	// Generated commit messages are derived from repository content, so treat them as hostile.
	const values = [
		'plain message',
		'test" --flag injected "',
		'fix: `id -u` and $HOME and $(whoami) and %PATH%',
		`don't; rm -rf /`,
		'typographic \u2018quotes\u2019 \u201alike\u201b these',
		`x\\'; echo pwned #`,
		'subject\n\nbody line',
		'ends with a backslash \\',
	];

	it('quotes POSIX shell arguments literally', () => {
		expect(values.map(v => quoteShellArgument(v, 'bash'))).toEqual([
			`'plain message'`,
			`'test" --flag injected "'`,
			`'fix: \`id -u\` and $HOME and $(whoami) and %PATH%'`,
			`'don'\\''t; rm -rf /'`,
			`'typographic \u2018quotes\u2019 \u201alike\u201b these'`,
			`'x\\'\\''; echo pwned #'`,
			`'subject\n\nbody line'`,
			`'ends with a backslash \\'`,
		]);
	});

	it('quotes every POSIX shell the same way', () => {
		const bash = values.map(v => quoteShellArgument(v, 'bash'));
		expect(['gitbash', 'ksh', 'sh', 'zsh'].map(shell => values.map(v => quoteShellArgument(v, shell)))).toEqual([bash, bash, bash, bash]);
	});

	it('escapes backslashes and single quotes for fish, which treats both as escapes inside single quotes', () => {
		expect(values.map(v => quoteShellArgument(v, 'fish'))).toEqual([
			`'plain message'`,
			`'test" --flag injected "'`,
			`'fix: \`id -u\` and $HOME and $(whoami) and %PATH%'`,
			`'don\\'t; rm -rf /'`,
			`'typographic \u2018quotes\u2019 \u201alike\u201b these'`,
			`'x\\\\\\'; echo pwned #'`,
			`'subject\n\nbody line'`,
			`'ends with a backslash \\\\'`,
		]);
	});

	it('doubles every kind of single quote for PowerShell, and refuses values its legacy native argument passing would mangle', () => {
		expect(values.map(v => quoteShellArgument(v, 'pwsh'))).toEqual([
			`'plain message'`,
			undefined,
			`'fix: \`id -u\` and $HOME and $(whoami) and %PATH%'`,
			`'don''t; rm -rf /'`,
			`'typographic \u2018\u2018quotes\u2019\u2019 \u201a\u201alike\u201b\u201b these'`,
			`'x\\''; echo pwned #'`,
			`'subject\n\nbody line'`,
			undefined,
		]);
	});

	it('refuses shells it has no safe quoting rules for', () => {
		const shells = ['cmd', 'csh', 'nu', 'wsl', 'xonsh', 'python', 'copilot', 'unknown', undefined];
		expect(shells.map(shell => quoteShellArgument('plain message', shell))).toEqual(shells.map(() => undefined));
	});

	it('refuses control characters in every shell, since the line editor acts on them', () => {
		const controls = ['\t', '\r', '\b', '\x1b', '\x7f', '\x9b'];
		expect(controls.map(c => ['bash', 'fish', 'pwsh'].map(shell => quoteShellArgument(`a${c}b`, shell)))).toEqual(controls.map(() => [undefined, undefined, undefined]));
	});
});