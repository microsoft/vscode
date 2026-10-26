/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { ChatOriginKind, SessionStatus, type ChatSummary } from '../../common/state/sessionState.js';
import { getChatsInUse } from '../../node/agentHostChatsInUse.js';

suite('getChatsInUse', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	function chat(resource: string, options: { workingDirectories?: string[]; archived?: boolean; origin?: ChatSummary['origin'] } = {}): ChatSummary {
		return {
			resource,
			title: resource,
			status: options.archived ? SessionStatus.Idle | SessionStatus.IsArchived : SessionStatus.Idle,
			modifiedAt: '',
			workingDirectories: options.workingDirectories,
			origin: options.origin,
		};
	}

	const inheritedFolders = ['file:///session'];

	function foldersInUse(chats: ChatSummary[], options: { excludedChat?: string; applying?: string[] } = {}) {
		return getChatsInUse(chats, { excludedChat: options.excludedChat, inheritedFolders, isApplyingWorkspace: candidate => !!options.applying?.includes(candidate) })
			.map(({ source, workingDirectories }) => ({ source: source?.resource, workingDirectories }));
	}

	test('a chat uses its own folders, or the session folders it inherits', () => {
		assert.deepStrictEqual(foldersInUse([chat('a', { workingDirectories: ['file:///a'] }), chat('b')]), [
			{ source: 'a', workingDirectories: ['file:///a'] },
			{ source: 'b', workingDirectories: inheritedFolders },
		]);
	});

	test('a subagent works in the folders of the chat that spawned it, never in its own pinned ones', () => {
		assert.deepStrictEqual(foldersInUse([
			chat('a', { workingDirectories: ['file:///a'] }),
			chat('sub', { workingDirectories: ['file:///pinned'], origin: { kind: ChatOriginKind.Tool, chat: 'a', toolCallId: 't' } }),
			chat('nested', { workingDirectories: ['file:///pinned-2'], origin: { kind: ChatOriginKind.Tool, chat: 'sub', toolCallId: 't' } }),
		]).map(entry => entry.workingDirectories), [['file:///a'], ['file:///a'], ['file:///a']]);
	});

	test('a side chat works in its own folders, else in those of the chat that spawned it', () => {
		assert.deepStrictEqual(foldersInUse([
			chat('a', { workingDirectories: ['file:///a'] }),
			chat('own', { workingDirectories: ['file:///own'], origin: { kind: ChatOriginKind.SideChat, chat: 'a', turnId: 'turn' } }),
			chat('shared', { origin: { kind: ChatOriginKind.SideChat, chat: 'a', turnId: 'turn' } }),
		]), [
			{ source: 'a', workingDirectories: ['file:///a'] },
			{ source: 'own', workingDirectories: ['file:///own'] },
			{ source: 'a', workingDirectories: ['file:///a'] },
		]);
	});

	test('chats spawned by an archived or excluded chat, and those chats, are not in use', () => {
		assert.deepStrictEqual(foldersInUse([
			chat('archived', { workingDirectories: ['file:///archived'], archived: true }),
			chat('under-archived', { origin: { kind: ChatOriginKind.Tool, chat: 'archived', toolCallId: 't' } }),
			chat('side-of-archived', { workingDirectories: ['file:///side'], origin: { kind: ChatOriginKind.SideChat, chat: 'archived', turnId: 'turn' } }),
			chat('excluded', { workingDirectories: ['file:///excluded'] }),
			chat('under-excluded', { origin: { kind: ChatOriginKind.Tool, chat: 'excluded', toolCallId: 't' } }),
			chat('live', { workingDirectories: ['file:///live'] }),
		], { excludedChat: 'excluded' }), [{ source: 'live', workingDirectories: ['file:///live'] }]);
	});

	test('a chat whose spawning chat is unknown has no known folders', () => {
		assert.deepStrictEqual(foldersInUse([chat('orphan', { origin: { kind: ChatOriginKind.Tool, chat: 'missing', toolCallId: 't' } })]), [
			{ source: undefined, workingDirectories: undefined },
		]);
	});

	test('a chat a workspace is being applied to holds no session folders', () => {
		assert.deepStrictEqual(foldersInUse([chat('applying'), chat('applying-own', { workingDirectories: ['file:///own'] })], { applying: ['applying', 'applying-own'] }), [
			{ source: 'applying-own', workingDirectories: ['file:///own'] },
		]);
	});
});
