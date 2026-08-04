/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'mocha';
import * as assert from 'assert';
import { parseSshConfig, SshConfigHostResolver } from '../sshConfig.js';
import { getRepositoryFromUrl } from '../util.js';

suite('parseSshConfig', () => {

	test('extracts a simple Host -> HostName mapping', () => {
		const map = parseSshConfig([
			'Host gh-personal',
			'  HostName github.com',
			'  User git'
		].join('\n'));

		assert.strictEqual(map.get('gh-personal'), 'github.com');
	});

	test('handles multiple Host blocks', () => {
		const map = parseSshConfig([
			'Host work',
			'  HostName github.com',
			'',
			'Host server',
			'  HostName example.com'
		].join('\n'));

		assert.strictEqual(map.get('work'), 'github.com');
		assert.strictEqual(map.get('server'), 'example.com');
	});

	test('records every literal alias on a `Host` line', () => {
		const map = parseSshConfig([
			'Host alias-a alias-b',
			'  HostName github.com'
		].join('\n'));

		assert.strictEqual(map.get('alias-a'), 'github.com');
		assert.strictEqual(map.get('alias-b'), 'github.com');
	});

	test('skips wildcard / negated aliases', () => {
		const map = parseSshConfig([
			'Host *.example.com !skip alias',
			'  HostName github.com'
		].join('\n'));

		assert.strictEqual(map.has('*.example.com'), false);
		assert.strictEqual(map.has('!skip'), false);
		assert.strictEqual(map.get('alias'), 'github.com');
	});

	test('is case-insensitive for keywords and tolerates `=` separators', () => {
		const map = parseSshConfig([
			'host=gh',
			'  HOSTNAME = github.com'
		].join('\n'));

		assert.strictEqual(map.get('gh'), 'github.com');
	});

	test('ignores comments and blank lines', () => {
		const map = parseSshConfig([
			'# top-level comment',
			'',
			'Host gh   # inline comment',
			'  HostName github.com'
		].join('\n'));

		assert.strictEqual(map.get('gh'), 'github.com');
	});

	test('keeps the first HostName when an alias is declared twice', () => {
		const map = parseSshConfig([
			'Host gh',
			'  HostName github.com',
			'Host gh',
			'  HostName other.example'
		].join('\n'));

		assert.strictEqual(map.get('gh'), 'github.com');
	});
});

suite('getRepositoryFromUrl with SSH host alias', () => {

	function resolverFor(map: Record<string, string>): Pick<SshConfigHostResolver, 'resolveSync'> {
		return { resolveSync: (alias: string) => map[alias] };
	}

	test('still recognizes plain github.com remotes', () => {
		const r = getRepositoryFromUrl('git@github.com:microsoft/vscode.git', resolverFor({}));
		assert.deepStrictEqual(r, { owner: 'microsoft', repo: 'vscode' });
	});

	test('resolves a custom SSH alias mapped to github.com', () => {
		const r = getRepositoryFromUrl(
			'git@fancy-git-host:microsoft/vscode.git',
			resolverFor({ 'fancy-git-host': 'github.com' })
		);
		assert.deepStrictEqual(r, { owner: 'microsoft', repo: 'vscode' });
	});

	test('returns undefined when the alias resolves to a non-github host', () => {
		const r = getRepositoryFromUrl(
			'git@internal-host:owner/repo.git',
			resolverFor({ 'internal-host': 'gitlab.example.com' })
		);
		assert.strictEqual(r, undefined);
	});

	test('returns undefined when the alias is not in the SSH config', () => {
		const r = getRepositoryFromUrl(
			'git@unknown-alias:owner/repo.git',
			resolverFor({})
		);
		assert.strictEqual(r, undefined);
	});
});
