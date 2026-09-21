/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { getWorkingDirectoryInfo, getWorkingDirectoryUri, getWorkingDirectoryUris, isMultiRootSession, mapWorkingDirectory } from '../../common/agentHostWorkingDirectories.js';
import { WorkingDirectory, WorkingDirectoryOriginKind } from '../../common/state/protocol/channels-session/state.js';
import { createChatState, createSessionState, mergeSessionWithDefaultChat, SessionStatus } from '../../common/state/sessionState.js';

suite('agentHostWorkingDirectories', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('normalizes legacy directories without inventing provenance', () => {
		const directories = ['file:///workspace/api', { uri: 'file:///workspace/web', repo: 'https://example.com/team/app' }];
		assert.deepStrictEqual({
			uris: getWorkingDirectoryUris(directories),
			info: getWorkingDirectoryInfo(directories),
			empty: getWorkingDirectoryInfo([]),
			absent: getWorkingDirectoryInfo(undefined),
		}, {
			uris: ['file:///workspace/api', 'file:///workspace/web'],
			info: [{ uri: 'file:///workspace/api' }, { uri: 'file:///workspace/web', repo: 'https://example.com/team/app' }],
			empty: [],
			absent: undefined,
		});
	});

	test('maps filesystem locations without mapping the repository source', () => {
		const directory: WorkingDirectory = {
			uri: 'file:///worktrees/topic/packages/api',
			repo: 'file:///repositories/app',
			origin: { kind: WorkingDirectoryOriginKind.Worktree, mainWorktree: 'file:///checkouts/app' },
		};
		const mapped = mapWorkingDirectory(directory, uri => uri.with({ scheme: 'vscode-agent-host', authority: 'host' }));
		assert.deepStrictEqual({
			mapped,
			key: getWorkingDirectoryUri(directory),
			legacy: mapWorkingDirectory('file:///workspace/app', uri => uri.with({ scheme: 'vscode-agent-host', authority: 'host' })),
			unchanged: URI.parse(directory.uri).scheme,
		}, {
			mapped: {
				uri: 'vscode-agent-host://host/worktrees/topic/packages/api',
				repo: 'file:///repositories/app',
				origin: { kind: WorkingDirectoryOriginKind.Worktree, mainWorktree: 'vscode-agent-host://host/checkouts/app' },
			},
			key: 'file:///worktrees/topic/packages/api',
			legacy: 'vscode-agent-host://host/workspace/app',
			unchanged: 'file',
		});
	});

	test('session and chat projections expose effective URIs without changing authoritative records', () => {
		const directories: WorkingDirectory[] = [
			{ uri: 'file:///checkout/app/packages/api', repo: 'https://example.com/team/app', origin: { kind: WorkingDirectoryOriginKind.Repo } },
			{ uri: 'file:///checkout/app/packages/web', repo: 'https://example.com/team/app', origin: { kind: WorkingDirectoryOriginKind.Repo } },
		];
		const modifiedAt = new Date(0).toISOString();
		const state = createSessionState({
			resource: 'ahp-session:/app',
			provider: 'copilot',
			title: 'App',
			status: SessionStatus.Idle,
			createdAt: modifiedAt,
			modifiedAt,
			workingDirectories: directories,
		});
		const chat = createChatState({
			resource: 'ahp-chat:/app/web',
			title: 'Web',
			status: SessionStatus.Idle,
			modifiedAt,
			workingDirectories: [directories[1].uri],
		});
		assert.deepStrictEqual({
			session: mergeSessionWithDefaultChat(state, undefined).workingDirectories,
			chat: mergeSessionWithDefaultChat(state, chat).workingDirectories,
			raw: state.workingDirectories,
		}, {
			session: directories.map(directory => directory.uri),
			chat: [directories[1].uri],
			raw: directories,
		});
	});

	suite('isMultiRootSession', () => {
		test('is false for undefined, empty, and single-root sessions', () => {
			assert.deepStrictEqual([
				isMultiRootSession(undefined),
				isMultiRootSession([]),
				isMultiRootSession(['file:///workspace/primary']),
			], [false, false, false]);
		});

		test('is true for two or more working directories', () => {
			assert.deepStrictEqual([
				isMultiRootSession(['file:///workspace/a', 'file:///workspace/b']),
				isMultiRootSession(['file:///workspace/a', 'file:///workspace/b', 'file:///workspace/c']),
			], [true, true]);
		});
	});
});
