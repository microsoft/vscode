/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, timeout } from '../../../../base/common/async.js';
import { mock, upcastPartial } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { TestInstantiationService } from '../../../instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../log/common/log.js';
import { IAgentHostChatContributions, type ITurnEnd } from '../../common/agentHostChatContributionsService.js';
import { ActionType } from '../../common/state/sessionActions.js';
import { buildChatUri, MessageKind, SessionStatus } from '../../common/state/sessionState.js';
import { IAgentHostLocalTurns } from '../../node/agentHostLocalTurns.js';
import { IAgentHostPeerChatPersistenceService } from '../../node/agentHostPeerChatStore.js';
import { IAgentHostSessionTitleController } from '../../node/agentHostSessionTitleController.js';
import { AgentHostStateManager, IAgentHostStateManager, creationTimeChatStorageResource } from '../../node/agentHostStateManager.js';
import { IAgentHostTerminalManager } from '../../node/agentHostTerminalManager.js';
import { AgentHostLocalCommands, LocalChatCommandRegistry, type ILocalChatCommand, type ILocalChatCommandHandling, type ILocalChatCommandRequest } from '../../node/localCommands/localChatCommand.js';
import { createTestChatOwnershipService } from './chatOwnershipTestUtils.js';
import { IAgentHostChatOwnershipService } from '../../node/agentHostChatOwnershipService.js';

suite('AgentHostLocalCommands', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('a command whose chat is removed while it runs still ends its turn for the owner captured when it started', async () => {
		const release = new DeferredPromise<void>();
		class HoldingCommand implements ILocalChatCommand {
			readonly name = 'hold';
			readonly recordsLocalTurn = true;
			tryHandle(request: ILocalChatCommandRequest): ILocalChatCommandHandling | undefined {
				return request.text === '/hold' ? { run: () => release.p } : undefined;
			}
			dispose(): void { }
		}
		disposables.add(LocalChatCommandRegistry.register(HoldingCommand));
		const stateManager = disposables.add(new AgentHostStateManager(new NullLogService()));
		const session = 'copilot:/local-command-owner';
		const chat = buildChatUri('copilot:/encoded', 'peer');
		stateManager.createSession({ resource: session, provider: 'copilot', title: 'Session', status: SessionStatus.Idle, createdAt: new Date(0).toISOString(), modifiedAt: new Date(0).toISOString() });
		stateManager.addChat(session, chat, creationTimeChatStorageResource(session, chat));
		stateManager.dispatchServerAction(chat, { type: ActionType.ChatTurnStarted, turnId: 'turn-1', startedAt: new Date(0).toISOString(), message: { text: '/hold', origin: { kind: MessageKind.User } } });
		const turnEnds: ITurnEnd[] = [];
		const instantiationService = disposables.add(new TestInstantiationService());
		instantiationService.stub(IAgentHostStateManager, stateManager);
		instantiationService.stub(IAgentHostChatOwnershipService, createTestChatOwnershipService(stateManager));
		instantiationService.stub(ILogService, new NullLogService());
		instantiationService.stub(IAgentHostChatContributions, upcastPartial<IAgentHostChatContributions>({ turnEnd: turn => turnEnds.push(turn) }));
		instantiationService.stub(IAgentHostLocalTurns, upcastPartial<IAgentHostLocalTurns>({ findAnchorTurnId: () => undefined, record: () => { } }));
		instantiationService.stub(IAgentHostSessionTitleController, new class extends mock<IAgentHostSessionTitleController>() { }());
		instantiationService.stub(IAgentHostTerminalManager, new class extends mock<IAgentHostTerminalManager>() { }());
		instantiationService.stub(IAgentHostPeerChatPersistenceService, new class extends mock<IAgentHostPeerChatPersistenceService>() { }());
		const commands = disposables.add(instantiationService.createInstance(AgentHostLocalCommands));

		const handled = commands.tryHandle({ turnChannel: chat, turnId: 'turn-1', text: '/hold' });
		stateManager.removeChat(session, chat);
		await release.complete();
		await timeout(0);

		assert.deepStrictEqual({
			handled: !!handled,
			owner: stateManager.getChatOwner(chat),
			turnEnds: turnEnds.map(turn => ({ session: turn.session, channel: turn.channel, turnId: turn.turnId })),
		}, {
			handled: true,
			owner: undefined,
			turnEnds: [{ session, channel: chat, turnId: 'turn-1' }],
		});
	});
});
