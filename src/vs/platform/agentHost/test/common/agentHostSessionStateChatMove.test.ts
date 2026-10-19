/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { chatMoveFolderTransfers } from '../../common/agentHostSessionStateStore.js';
import { getWorkingDirectoryKey, getWorkingDirectoryScopeId } from '../../common/agentHostWorkingDirectories.js';

suite('chatMoveFolderTransfers', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const app = 'file:///workspace/app';
	const lib = 'file:///workspace/lib';
	const tools = 'file:///workspace/tools';
	const key = getWorkingDirectoryKey;

	test('re-keys a folder no remaining chat uses and copies one a remaining chat uses', () => {
		assert.deepStrictEqual(chatMoveFolderTransfers({ source: [app, lib, tools], target: [lib], chat: [lib, tools], chatHadOwnFolders: true, remaining: [[app, lib]] }, false), [
			{ kind: 'git', sourceKey: key(lib), targetKey: '', keepInSource: true },
			{ kind: 'github', sourceKey: key(lib), targetKey: key(lib), keepInSource: true },
			{ kind: 'git', sourceKey: key(tools), targetKey: key(tools), keepInSource: false },
			{ kind: 'github', sourceKey: key(tools), targetKey: key(tools), keepInSource: false },
			{ kind: 'baseBranch', sourceKey: getWorkingDirectoryScopeId([lib, tools]), targetKey: getWorkingDirectoryScopeId([lib, tools]), keepInSource: false },
		]);
	});

	test('carries the source primary folder\'s session-level git state and keeps the session base branch while a chat stays', () => {
		assert.deepStrictEqual(chatMoveFolderTransfers({ source: [app], target: [lib, app], chat: [app], chatHadOwnFolders: false, remaining: [[app]] }, false), [
			{ kind: 'git', sourceKey: '', targetKey: key(app), keepInSource: true },
			{ kind: 'git', sourceKey: key(app), targetKey: key(app), keepInSource: true },
			{ kind: 'github', sourceKey: key(app), targetKey: key(app), keepInSource: true },
			{ kind: 'baseBranch', sourceKey: '', targetKey: getWorkingDirectoryScopeId([app]), keepInSource: true },
		]);
	});

	test('re-keys everything when nothing stays in the source', () => {
		assert.deepStrictEqual(chatMoveFolderTransfers({ source: [app], target: [app], chat: [app], chatHadOwnFolders: false, remaining: [] }, false), [
			{ kind: 'git', sourceKey: '', targetKey: '', keepInSource: false },
			{ kind: 'git', sourceKey: key(app), targetKey: '', keepInSource: false },
			{ kind: 'github', sourceKey: key(app), targetKey: key(app), keepInSource: false },
			{ kind: 'baseBranch', sourceKey: '', targetKey: getWorkingDirectoryScopeId([app]), keepInSource: false },
		]);
	});
	test('keys a promoted chat\'s base branch as its new session\'s default chat\'s (G1, Block 5)', () => {
		// The promotion's target folders are the chat's: its own folders, or those it inherited.
		assert.deepStrictEqual(chatMoveFolderTransfers({ source: [app], target: [lib], chat: [lib], chatHadOwnFolders: true, remaining: [[app]] }, true).filter(transfer => transfer.kind === 'baseBranch'), [
			{ kind: 'baseBranch', sourceKey: getWorkingDirectoryScopeId([lib]), targetKey: '', keepInSource: false },
		]);
		assert.deepStrictEqual(chatMoveFolderTransfers({ source: [app], target: [app], chat: [app], chatHadOwnFolders: false, remaining: [[app]] }, true).filter(transfer => transfer.kind === 'baseBranch'), [
			{ kind: 'baseBranch', sourceKey: '', targetKey: '', keepInSource: true },
		]);
	});
});
