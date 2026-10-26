/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import type { IAgentCreateChatWorkspace } from '../../common/agent.js';
import { getAgentHostExtensionInitializeResultMeta, setChatWorkspaceParamsValidator, supportsAgentHostCreateChatWorkspace } from '../../common/agentHostExtensionProtocol.js';
import { AgentHostCreateChatWorkspaceMetaKey, readChatWorkspaceValue, readCreateChatWorkspaceMeta, serializeChatWorkspace, withCreateChatWorkspaceMeta } from '../../common/meta/agentHostCreateChatWorkspaceMeta.js';

suite('Agent host createChat workspace metadata', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('round-trips every workspace kind through JSON, preserving unrelated metadata', () => {
		const workspaces: IAgentCreateChatWorkspace[] = [
			{ kind: 'scratch' },
			{ kind: 'folder', folder: URI.file('/workspace/repo'), isolation: 'folder' },
			{ kind: 'folder', folder: URI.file('/workspace/repo'), isolation: 'worktree', baseBranch: 'release/1.0', prompt: 'Fix the bug' },
			{ kind: 'folder', folder: URI.file('/workspace/repo'), isolation: 'worktree', baseBranch: undefined, prompt: '' },
		];
		const read = workspaces.map(workspace => {
			const meta = JSON.parse(JSON.stringify(withCreateChatWorkspaceMeta({ other: 1 }, workspace)));
			const result = readCreateChatWorkspaceMeta(meta);
			return { other: meta.other, workspace: result === 'invalid' || result === undefined || result.kind === 'scratch' ? result : { ...result, folder: result.folder.toString() } };
		});
		assert.deepStrictEqual(read, workspaces.map(workspace => ({ other: 1, workspace: workspace.kind === 'scratch' ? workspace : { ...workspace, folder: workspace.folder.toString() } })));
	});

	test('absent metadata reads as no workspace and malformed values as invalid', () => {
		const malformed: unknown[] = [
			null, 'scratch', [], {}, { kind: 'other' },
			{ kind: 'folder', isolation: 'folder' },
			{ kind: 'folder', folder: 1, isolation: 'folder' },
			{ kind: 'folder', folder: 'relative/path', isolation: 'folder' },
			{ kind: 'folder', folder: 'file:///repo', isolation: 'copy' },
			{ kind: 'folder', folder: 'file:///repo', isolation: 'worktree' },
			{ kind: 'folder', folder: 'file:///repo', isolation: 'worktree', prompt: 'p', baseBranch: 1 },
			{ kind: 'folder', folder: 'file:///repo', isolation: 'worktree', prompt: 'p', baseBranch: ' ' },
			{ kind: 'folder', folder: 'file:///repo', isolation: 'worktree', prompt: 'p', baseBranch: '--upload-pack=x' },
		];
		assert.deepStrictEqual({
			absent: [undefined, {}, { other: true }].map(meta => readCreateChatWorkspaceMeta(meta)),
			malformed: malformed.map(value => readCreateChatWorkspaceMeta({ [AgentHostCreateChatWorkspaceMetaKey]: value })),
		}, {
			absent: [undefined, undefined, undefined],
			malformed: malformed.map(() => 'invalid'),
		});
	});

	test('a bare workspace value reads like the metadata and only host file folders are accepted', () => {
		const folder = URI.file('/workspace/repo');
		const read = (value: unknown) => {
			const result = readChatWorkspaceValue(value);
			return result === 'invalid' || result.kind === 'scratch' ? result : { ...result, folder: result.folder.toString() };
		};
		assert.deepStrictEqual({
			scratch: read(serializeChatWorkspace({ kind: 'scratch' })),
			folder: read(JSON.parse(JSON.stringify(serializeChatWorkspace({ kind: 'folder', folder, isolation: 'folder' })))),
			remoteScheme: read({ kind: 'folder', folder: 'vscode-remote://ssh-remote+host/repo', isolation: 'folder' }),
			agentHostScheme: read({ kind: 'folder', folder: 'vscode-agent-host://host/repo', isolation: 'folder' }),
			untitled: read({ kind: 'folder', folder: 'untitled:/repo', isolation: 'folder' }),
			metaRemoteScheme: readCreateChatWorkspaceMeta({ [AgentHostCreateChatWorkspaceMetaKey]: { kind: 'folder', folder: 'vscode-remote://ssh-remote+host/repo', isolation: 'folder' } }),
			absent: read(undefined),
			params: [
				{ chat: 'ahp-chat:/c', workspace: { kind: 'scratch' } },
				{ chat: 'ahp-chat:/c' },
				{ workspace: { kind: 'scratch' } },
				{ chat: 'ahp-chat:/c', workspace: { kind: 'folder', isolation: 'folder' } },
			].map(params => !setChatWorkspaceParamsValidator.validate(params).error),
		}, {
			scratch: { kind: 'scratch' },
			folder: { kind: 'folder', folder: folder.toString(), isolation: 'folder' },
			remoteScheme: 'invalid',
			agentHostScheme: 'invalid',
			untitled: 'invalid',
			metaRemoteScheme: 'invalid',
			absent: 'invalid',
			params: [true, false, false, false],
		});
	});

	test('the VS Code host advertises the capability; other hosts do not', () => {
		assert.deepStrictEqual([
			undefined,
			{ protocolVersion: '1', serverSeq: 0, snapshots: [] },
			{ protocolVersion: '1', serverSeq: 0, snapshots: [], _meta: { 'vscode.detachedWorktrees': true as const } },
			{ protocolVersion: '1', serverSeq: 0, snapshots: [], _meta: getAgentHostExtensionInitializeResultMeta() },
		].map(result => supportsAgentHostCreateChatWorkspace(result)), [false, false, false, true]);
	});
});
