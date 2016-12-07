/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as assert from 'assert';
import { WorkspaceStats } from 'vs/workbench/services/telemetry/common/workspaceStats';

suite('Telemetry - WorkspaceStats', () => {

	test('HTTPS remotes', function () {
		const stats = new WorkspaceStats(null, null, null);
		assert.deepStrictEqual(stats.getDomainsOfRemotes(remote('https://github.com/Microsoft/vscode.git')), ['github.com']);
		assert.deepStrictEqual(stats.getDomainsOfRemotes(remote('https://git.example.com/gitproject.git')), ['example.com']);
		assert.deepStrictEqual(stats.getDomainsOfRemotes(remote('https://username@github.com/username/repository.git')), ['github.com']);
		assert.deepStrictEqual(stats.getDomainsOfRemotes(remote('https://username:password@github.com/username/repository.git')), ['github.com']);
	});

	test('SSH remotes', function () {
		const stats = new WorkspaceStats(null, null, null);
		assert.deepStrictEqual(stats.getDomainsOfRemotes(remote('ssh://user@git.server.org/project.git')), ['server.org']);
	});

	test('SCP-like remotes', function () {
		const stats = new WorkspaceStats(null, null, null);
		assert.deepStrictEqual(stats.getDomainsOfRemotes(remote('git@github.com:Microsoft/vscode.git')), ['github.com']);
		assert.deepStrictEqual(stats.getDomainsOfRemotes(remote('user@git.server.org:project.git')), ['server.org']);
		assert.deepStrictEqual(stats.getDomainsOfRemotes(remote('git.server.org:project.git')), ['server.org']);
	});

	test('Local remotes', function () {
		const stats = new WorkspaceStats(null, null, null);
		assert.deepStrictEqual(stats.getDomainsOfRemotes(remote('/opt/git/project.git')), []);
		assert.deepStrictEqual(stats.getDomainsOfRemotes(remote('file:///opt/git/project.git')), []);
	});

	function remote(url: string): string {
		return `[remote "origin"]
	url = ${url}
	fetch = +refs/heads/*:refs/remotes/origin/*
`;
	}
});