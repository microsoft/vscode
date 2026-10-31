/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it } from 'vitest';
import { buildGitCommitCommand } from '../../common/shellQuoting';

describe('buildGitCommitCommand', () => {

	// Generated commit messages are derived from repository content, so treat them as hostile.
	const messages = [
		'plain message',
		'test" --flag injected "',
		'fix: `id -u` and $HOME and $(whoami) and %PATH%',
		`don't; rm -rf /`,
		'typographic \u2018quotes\u2019 \u201alike\u201b these',
		`x\\'; echo pwned #`,
		'subject\n\nbody line',
		'ends with a backslash \\',
	];

	it('keeps the message intact in single quotes for POSIX shells', () => {
		expect(messages.map(m => buildGitCommitCommand(m, 'bash'))).toEqual([
			`git commit -m 'plain message'`,
			`git commit -m 'test" --flag injected "'`,
			`git commit -m 'fix: \`id -u\` and $HOME and $(whoami) and %PATH%'`,
			`git commit -m 'don'\\''t; rm -rf /'`,
			`git commit -m 'typographic \u2018quotes\u2019 \u201alike\u201b these'`,
			`git commit -m 'x\\'\\''; echo pwned #'`,
			`git commit -m 'subject\n\nbody line'`,
			`git commit -m 'ends with a backslash \\'`,
		]);
	});

	it('quotes every POSIX shell the same way', () => {
		const bash = messages.map(m => buildGitCommitCommand(m, 'bash'));
		expect(['gitbash', 'ksh', 'sh', 'zsh'].map(shell => messages.map(m => buildGitCommitCommand(m, shell)))).toEqual([bash, bash, bash, bash]);
	});

	it('escapes backslashes and single quotes for fish', () => {
		expect(messages.map(m => buildGitCommitCommand(m, 'fish'))).toEqual([
			`git commit -m 'plain message'`,
			`git commit -m 'test" --flag injected "'`,
			`git commit -m 'fix: \`id -u\` and $HOME and $(whoami) and %PATH%'`,
			`git commit -m 'don\\'t; rm -rf /'`,
			`git commit -m 'typographic \u2018quotes\u2019 \u201alike\u201b these'`,
			`git commit -m 'x\\\\\\'; echo pwned #'`,
			`git commit -m 'subject\n\nbody line'`,
			`git commit -m 'ends with a backslash \\\\'`,
		]);
	});

	it('replaces double quotes, pads a trailing backslash and doubles every single quote for PowerShell', () => {
		expect(messages.map(m => buildGitCommitCommand(m, 'pwsh'))).toEqual([
			`git commit -m 'plain message'`,
			`git commit -m 'test'' --flag injected '''`,
			`git commit -m 'fix: \`id -u\` and $HOME and $(whoami) and %PATH%'`,
			`git commit -m 'don''t; rm -rf /'`,
			`git commit -m 'typographic \u2018\u2018quotes\u2019\u2019 \u201a\u201alike\u201b\u201b these'`,
			`git commit -m 'x\\''; echo pwned #'`,
			`git commit -m 'subject\n\nbody line'`,
			`git commit -m 'ends with a backslash \\ '`,
		]);
	});

	it('reduces the message to literal text, one -m per paragraph, for other shells', () => {
		expect(messages.map(m => buildGitCommitCommand(m, 'cmd'))).toEqual([
			`git commit -m "plain message"`,
			`git commit -m "test' --flag injected '"`,
			`git commit -m "fix: 'id -u' and HOME and (whoami) and PATH"`,
			`git commit -m "don't; rm -rf /"`,
			`git commit -m "typographic 'quotes' 'like' these"`,
			`git commit -m "x/'; echo pwned #"`,
			`git commit -m "subject" -m "body line"`,
			`git commit -m "ends with a backslash /"`,
		]);
	});

	it('treats every other or undetected shell like cmd', () => {
		const cmd = messages.map(m => buildGitCommitCommand(m, 'cmd'));
		const shells = ['csh', 'nu', 'wsl', 'xonsh', 'python', 'unknown', undefined];
		expect(shells.map(shell => messages.map(m => buildGitCommitCommand(m, shell)))).toEqual(shells.map(() => cmd));
	});

	it('joins the lines of each paragraph for other shells', () => {
		expect(buildGitCommitCommand('Subject\n\nline one\nline two\n \n\npara two', 'cmd')).toBe(`git commit -m "Subject" -m "line one line two" -m "para two"`);
	});

	it('strips control characters, since the line editor acts on them', () => {
		expect(['a\tb', 'a\bb', 'a\x1bb', 'a\x7fb', 'a\x9bb', 'a\r\nb', 'a\rb'].map(m => buildGitCommitCommand(m, 'bash'))).toEqual([
			`git commit -m 'a b'`,
			`git commit -m 'ab'`,
			`git commit -m 'ab'`,
			`git commit -m 'ab'`,
			`git commit -m 'ab'`,
			`git commit -m 'a\nb'`,
			`git commit -m 'a\nb'`,
		]);
	});

	it('returns undefined for agent CLIs and when no text is left', () => {
		expect([
			buildGitCommitCommand('plain message', 'copilot'),
			buildGitCommitCommand('plain message', 'claude'),
			buildGitCommitCommand('\x1b\x07', 'bash'),
			buildGitCommitCommand('$!%', 'cmd'),
		]).toEqual([undefined, undefined, undefined, undefined]);
	});
});