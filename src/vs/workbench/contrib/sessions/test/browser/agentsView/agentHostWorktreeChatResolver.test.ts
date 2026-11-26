/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Event } from '../../../../../../base/common/event.js';
import { constObservable, observableValue } from '../../../../../../base/common/observable.js';
import { URI } from '../../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IChat, ISession, ISessionFolder, ISessionWorkspace } from '../../../../../services/sessions/common/session.js';
import { AgentHostWorktreeChatResolver } from '../../../browser/agentsView/agentHostWorktreeChatResolver.contribution.js';
import { LOCAL_AGENT_HOST_PROVIDER_ID } from '../../../common/agentHostSessionsProvider.js';
import { ISessionsManagementService } from '../../../common/sessionsManagement.js';

suite('AgentHostWorktreeChatResolver', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('resolves a chat of a local agent host session by where the chat works, else its session, and whether the session is archived; not another provider\'s chat', () => {
		const workspace = (path: string) => upcastPartial<ISessionWorkspace>({ folders: [upcastPartial<ISessionFolder>({ workingDirectory: URI.file(path) })] });
		const chats = new Map<string, { session: ISession; chat: IChat }>([
			['ahp-chat:/own', { session: upcastPartial<ISession>({ providerId: LOCAL_AGENT_HOST_PROVIDER_ID, workspace: constObservable(workspace('/work/vscode')), isArchived: constObservable(false) }), chat: upcastPartial<IChat>({ workspace: constObservable(workspace('/work/vscode.worktrees/a')) }) }],
			['ahp-chat:/session', { session: upcastPartial<ISession>({ providerId: LOCAL_AGENT_HOST_PROVIDER_ID, workspace: constObservable(workspace('/work/vscode')), isArchived: constObservable(true) }), chat: upcastPartial<IChat>({ workspace: constObservable(undefined) }) }],
			['remote:/chat', { session: upcastPartial<ISession>({ providerId: 'remote-agent-host-x', workspace: constObservable(workspace('/work/vscode')), isArchived: constObservable(false) }), chat: upcastPartial<IChat>({ workspace: constObservable(undefined) }) }],
		]);
		const resolver = new AgentHostWorktreeChatResolver(upcastPartial<ISessionsManagementService>({
			onDidChangeSession: Event.None,
			getSessionForChatResource: (resource: URI) => chats.get(resource.toString()),
		}));
		const resolve = (resource: string) => {
			const chat = resolver.resolve(URI.parse(resource));
			return chat && { workingDirectory: chat.workingDirectory.get()?.path, isArchived: chat.isArchived };
		};

		assert.deepStrictEqual(['ahp-chat:/own', 'ahp-chat:/session', 'remote:/chat', 'ahp-chat:/unknown'].map(resolve), [
			{ workingDirectory: '/work/vscode.worktrees/a', isArchived: false },
			{ workingDirectory: '/work/vscode', isArchived: true },
			undefined,
			undefined,
		]);
	});

	test('tells where a chat works as only that chat of its session comes to work elsewhere, which changes no session', () => {
		const workspace = (path: string) => upcastPartial<ISessionWorkspace>({ folders: [upcastPartial<ISessionFolder>({ workingDirectory: URI.file(path) })] });
		const chatWorkspace = observableValue<ISessionWorkspace | undefined>('chatWorkspace', undefined);
		const found = { session: upcastPartial<ISession>({ providerId: LOCAL_AGENT_HOST_PROVIDER_ID, workspace: constObservable(workspace('/work/vscode')), isArchived: constObservable(false) }), chat: upcastPartial<IChat>({ workspace: chatWorkspace }) };
		const resolver = new AgentHostWorktreeChatResolver(upcastPartial<ISessionsManagementService>({
			onDidChangeSession: Event.None,
			getSessionForChatResource: () => found,
		}));
		const workingDirectory = resolver.resolve(URI.parse('ahp-chat:/main'))!.workingDirectory;
		const before = workingDirectory.get()?.path;
		chatWorkspace.set(workspace('/work/vscode.worktrees/isolated'), undefined);

		assert.deepStrictEqual({ before, after: workingDirectory.get()?.path }, { before: '/work/vscode', after: '/work/vscode.worktrees/isolated' });
	});
});
