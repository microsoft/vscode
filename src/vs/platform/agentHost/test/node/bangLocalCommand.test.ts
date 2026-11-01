/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { ActionType } from '../../common/state/sessionActions.js';
import { TerminalClaimKind } from '../../common/state/protocol/state.js';
import { buildChatUri, buildDefaultChatUri, SessionStatus } from '../../common/state/sessionState.js';
import { AgentHostStateManager } from '../../node/agentHostStateManager.js';
import { BangLocalCommand } from '../../node/localCommands/bangLocalCommand.js';
import { TestAgentHostTerminalManager } from './testAgentHostTerminalManager.js';

suite('BangLocalCommand', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	for (const chatId of ['default', 'peer']) {
		for (const override of [false, true]) {
			test(`uses ${chatId} chat working directory ${override ? 'override' : 'inheritance'}`, async () => {
				const session = 'copilot:/session';
				const chat = chatId === 'default' ? buildDefaultChatUri(session) : buildChatUri(session, chatId);
				const inheritedDirectory = URI.file('/workspace/main');
				const chatDirectory = URI.file('/workspace/peer');
				const logService = new NullLogService();
				const stateManager = store.add(new AgentHostStateManager(logService));
				stateManager.createSession({
					resource: session, provider: 'copilot', title: 'Test', status: SessionStatus.Idle,
					createdAt: new Date(0).toISOString(), modifiedAt: new Date(0).toISOString(),
					workingDirectories: [inheritedDirectory.toString(), chatDirectory.toString()],
				});
				stateManager.addChat(session, chat);
				if (override) {
					stateManager.dispatchServerAction(chat, { type: ActionType.ChatWorkingDirectorySet, directory: chatDirectory.toString() });
				}
				const terminalManager = store.add(new TestAgentHostTerminalManager());
				const command = store.add(new BangLocalCommand({
					logService, terminalManager,
					getState: channel => stateManager.getSessionState(channel),
					dispatch: () => { }, updateChatTitle: () => { }, persistSessionFlag: () => { }, markTitleRenamed: () => { },
				}));
				const run = command.tryHandle({ turnChannel: chat, turnId: 'turn', text: '!pwd' })!.run();
				await terminalManager.commandFinishedListenerRegistered.p;
				terminalManager.fireCommandFinished({ commandId: '1', command: 'pwd', exitCode: 0, output: '' });
				await run;

				const { cwd, claim } = terminalManager.created[0];
				assert.ok(claim?.kind === TerminalClaimKind.Session);
				assert.deepStrictEqual({ cwd, session: claim.session, chat: claim.chat, turnId: claim.turnId }, {
					cwd: (override ? chatDirectory : inheritedDirectory).fsPath,
					session, chat, turnId: 'turn',
				});
			});
		}
	}
});
