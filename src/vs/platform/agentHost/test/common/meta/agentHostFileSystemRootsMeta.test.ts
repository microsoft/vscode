/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { getAgentHostFileSystemRootsMeta, readAgentHostFileSystemRoots, refreshAgentHostFileSystemRootsMeta } from '../../../common/meta/agentHostFileSystemRootsMeta.js';

suite('Agent Host filesystem root metadata', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('advertises filesystem roots without projects, network shares or duplicates', () => {
		const roots = ['file:///', 'file:///C:/', 'file:///D:/', 'file:///C:/', 'file:///home/test', 'file://server/share/', 'https://host/'];
		const meta = getAgentHostFileSystemRootsMeta(roots.map(root => URI.parse(root)));
		assert.deepStrictEqual(readAgentHostFileSystemRoots({ _meta: meta }).map(root => root.toString()), ['file:///', 'file:///c%3A/', 'file:///d%3A/']);
	});

	test('absent or malformed optional metadata preserves ordinary picker behavior', () => {
		const values = [undefined, null, 'file:///', ['file:///'], ['file:///home/test'], ['file://server/share'], ['file:///C:/?query'], ['file:///C:/#fragment'], ['file:///C:/', 1], ['file:///C:/', 'file:///D:/'], Array(27).fill('file:///C:/')];
		assert.deepStrictEqual(values.map(value => readAgentHostFileSystemRoots({ _meta: { 'vscode.fileSystemRoots': value } }).map(root => root.path)), [
			[], [], [], ['/'], [], [], [], [], [], ['/C:/', '/D:/'], [],
		]);
		assert.deepStrictEqual(readAgentHostFileSystemRoots(undefined), []);
	});

	test('refresh replaces or removes navigation roots while preserving initialize-only capabilities', () => {
		const previous = { 'vscode.agentHost': true, 'vscode.fileSystemRoots': ['file:///C:/'] };
		const peers = [
			{ _meta: { 'vscode.fileSystemRoots': ['file:///D:/'], 'copilot.keepAliveTimeoutMs': 900_000 } },
			{ _meta: {} },
			{},
			{ _meta: { 'vscode.fileSystemRoots': ['file:///D:/', 'https://host/'] } },
		];
		assert.deepStrictEqual(peers.map(peer => refreshAgentHostFileSystemRootsMeta(previous, peer)), [
			{ 'vscode.agentHost': true, 'vscode.fileSystemRoots': ['file:///d%3A/'], 'copilot.keepAliveTimeoutMs': 900_000 },
			{ 'vscode.agentHost': true },
			{ 'vscode.agentHost': true },
			{ 'vscode.agentHost': true },
		]);
	});
});
