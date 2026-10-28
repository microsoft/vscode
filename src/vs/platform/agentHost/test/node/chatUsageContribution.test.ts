/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { InstantiationService } from '../../../instantiation/common/instantiationService.js';
import { ServiceCollection } from '../../../instantiation/common/serviceCollection.js';
import { ILogService, NullLogService } from '../../../log/common/log.js';
import type { IAgentChatUsageSignal } from '../../common/agent.js';
import type { IAgentHostChatContribution, IAgentHostChatContributionContext, IAgentHostChatContributions } from '../../common/agentHostChatContributionsService.js';
import { readChatUsage, type IAgentChatUsage } from '../../common/meta/agentUsageMeta.js';
import { ActionType } from '../../common/state/sessionActions.js';
import { buildChatUri, buildDefaultChatUri, isAhpChatChannel, SessionStatus } from '../../common/state/sessionState.js';
import { AgentHostChatContributions } from '../../node/agentHostChatContributionsService.js';
import { IAgentHostChatOwnershipService } from '../../node/agentHostChatOwnershipService.js';
import { AgentHostStateManager, IAgentHostStateManager } from '../../node/agentHostStateManager.js';
import { ChatUsageContribution } from '../../node/chatContributions/chatUsage/chatUsageContribution.js';
import { createTestChatOwnershipService } from './chatOwnershipTestUtils.js';

abstract class UsageObserver extends Disposable implements IAgentHostChatContribution {
	constructor(_context: IAgentHostChatContributionContext) {
		super();
	}
}

suite('ChatUsageContribution', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	const session = 'copilot:/aggregate-usage';
	const defaultChat = buildDefaultChatUri(session);
	const peer = buildChatUri(session, 'opaque-peer');
	const usage: IAgentChatUsage = { totalNanoAiu: 600_000_000, aiCreditsStatus: 'complete' };

	function createContext() {
		const logService = new NullLogService();
		const stateManager = disposables.add(new AgentHostStateManager(logService));
		const chatOwnership = createTestChatOwnershipService(stateManager);
		const instantiationService = disposables.add(new InstantiationService(new ServiceCollection(
			[ILogService, logService],
			[IAgentHostStateManager, stateManager],
			[IAgentHostChatOwnershipService, chatOwnership],
		), true));
		const contributions: IAgentHostChatContributions = disposables.add(new AgentHostChatContributions(logService, instantiationService));
		const registration = disposables.add(contributions.registerContribution(ChatUsageContribution));
		disposables.add(stateManager.onDidEmitEnvelope(envelope => contributions.didDispatchAction({
			channel: envelope.channel,
			session: isAhpChatChannel(envelope.channel) ? chatOwnership.requireChatOwner(envelope.channel) : envelope.channel,
			action: envelope.action,
			rejectionReason: envelope.rejectionReason,
		})));
		const createSession = (resource = session) => {
			stateManager.createSession({
				resource, defaultChat: buildDefaultChatUri(resource), provider: 'copilot', title: 'Usage', status: SessionStatus.IsRead,
				createdAt: '2026-10-12T00:00:00.000Z', modifiedAt: '2026-10-12T00:00:00.000Z',
				_meta: { unrelated: 'preserved' },
			});
			stateManager.dispatchServerAction(resource, { type: ActionType.SessionReady });
		};
		const report = (chat: string, value = usage) => contributions.chatUsage({ kind: 'chat_usage', chat: URI.parse(chat), usage: value });
		return { stateManager, contributions, registration, createSession, report };
	}

	test('buffers pre-catalog billing until the exact default or peer chat is restored', () => {
		const context = createContext();
		context.report(defaultChat);
		context.report(peer, { totalNanoAiu: 250_000_000, aiCreditsStatus: 'partial' });
		context.createSession();
		const beforePeer = context.stateManager.getSessionState(session)?._meta;
		context.stateManager.addChat(session, peer, peer, { title: 'Peer' });
		assert.deepStrictEqual({
			beforePeer,
			afterPeer: context.stateManager.getSessionState(session)?._meta,
		}, {
			beforePeer: { unrelated: 'preserved', 'vscode.chatUsage': { [defaultChat]: usage } },
			afterPeer: {
				unrelated: 'preserved',
				'vscode.chatUsage': { [defaultChat]: usage, [peer]: { totalNanoAiu: 250_000_000, aiCreditsStatus: 'partial' } },
			},
		});
	});

	test('ignores duplicate receipts without changing chat content', () => {
		const context = createContext();
		context.createSession();
		const before = context.stateManager.getChatState(defaultChat);
		const actions: string[] = [];
		disposables.add(context.stateManager.onDidEmitEnvelope(envelope => actions.push(envelope.action.type)));
		context.report(defaultChat);
		context.report(defaultChat);
		assert.deepStrictEqual({
			actions,
			chat: context.stateManager.getChatState(defaultChat),
			usage: readChatUsage(context.stateManager.getSessionState(session), defaultChat),
		}, { actions: [ActionType.SessionMetaChanged], chat: before, usage });
	});

	test('rejected removals preserve pending and published billing, while removal clears only its chat', () => {
		const context = createContext();
		context.createSession();
		context.report(defaultChat);
		context.report(peer);
		const rejected = {
			channel: session, session,
			action: { type: ActionType.SessionChatRemoved, chat: peer },
			rejectionReason: 'not applied',
		} as const;
		context.contributions.didDispatchAction(rejected);
		context.stateManager.addChat(session, peer, peer, { title: 'Peer' });
		context.contributions.didDispatchAction(rejected);
		const afterRejection = readChatUsage(context.stateManager.getSessionState(session), peer);
		context.stateManager.removeChat(session, peer);
		assert.deepStrictEqual({
			afterRejection,
			afterRemoval: context.stateManager.getSessionState(session)?._meta,
		}, {
			afterRejection: usage,
			afterRemoval: { unrelated: 'preserved', 'vscode.chatUsage': { [defaultChat]: usage } },
		});
	});

	test('discarding pending usage on session removal does not affect another session', () => {
		const context = createContext();
		const otherSession = 'copilot:/other-usage';
		const otherPeer = buildChatUri(otherSession, 'peer');
		context.createSession();
		context.report(peer);
		context.report(otherPeer);
		context.stateManager.removeSession(session);
		context.createSession();
		context.stateManager.addChat(session, peer, peer, { title: 'Peer' });
		context.createSession(otherSession);
		context.stateManager.addChat(otherSession, otherPeer, otherPeer, { title: 'Other peer' });
		const removed = readChatUsage(context.stateManager.getSessionState(session), peer);
		const newUsage = { totalNanoAiu: 125_000_000 };
		context.report(peer, newUsage);
		assert.deepStrictEqual({
			removed,
			newReceipt: readChatUsage(context.stateManager.getSessionState(session), peer),
			other: readChatUsage(context.stateManager.getSessionState(otherSession), otherPeer),
		}, { removed: undefined, newReceipt: newUsage, other: usage });
	});

	test('publishes buffered usage to the recorded owner rather than the session in the chat URI', () => {
		const context = createContext();
		const mintedSession = 'copilot:/original-usage-owner';
		const movedChat = buildChatUri(mintedSession, 'moved-peer');
		context.createSession(mintedSession);
		context.createSession();
		context.report(movedChat);
		context.stateManager.removeSession(mintedSession);
		context.stateManager.addChat(session, movedChat, movedChat, { title: 'Moved peer' });
		context.createSession(mintedSession);

		assert.deepStrictEqual({
			recordedOwner: readChatUsage(context.stateManager.getSessionState(session), movedChat),
			mintedOwner: readChatUsage(context.stateManager.getSessionState(mintedSession), movedChat),
		}, { recordedOwner: usage, mintedOwner: undefined });
	});

	test('unregistering the contribution stops publication and drops buffered usage', () => {
		const context = createContext();
		context.report(defaultChat);
		context.registration.dispose();
		context.createSession();
		context.report(defaultChat);
		disposables.add(context.contributions.registerContribution(ChatUsageContribution));
		context.stateManager.dispatchServerAction(session, { type: ActionType.SessionReady });
		const beforeNewReceipt = readChatUsage(context.stateManager.getSessionState(session), defaultChat);
		const newUsage = { totalNanoAiu: 250_000_000 };
		context.report(defaultChat, newUsage);
		assert.deepStrictEqual({
			beforeNewReceipt,
			afterNewReceipt: readChatUsage(context.stateManager.getSessionState(session), defaultChat),
		}, { beforeNewReceipt: undefined, afterNewReceipt: newUsage });
	});

	test('dispatches usage in contribution order, isolates failures, and honors registration disposal', () => {
		const context = createContext();
		const observed: { contribution: string; signal: IAgentChatUsageSignal }[] = [];
		class First extends UsageObserver {
			static readonly id = 'firstUsageObserver';
			readonly order = 10;
			onChatUsage(signal: IAgentChatUsageSignal): void {
				observed.push({ contribution: 'first', signal });
			}
		}
		class Throwing extends UsageObserver {
			static readonly id = 'throwingUsageObserver';
			readonly order = 0;
			onChatUsage(signal: IAgentChatUsageSignal): void {
				observed.push({ contribution: 'throwing', signal });
				throw new Error('expected contribution failure');
			}
		}
		class Last extends UsageObserver {
			static readonly id = 'lastUsageObserver';
			readonly order = 10;
			onChatUsage(signal: IAgentChatUsageSignal): void {
				observed.push({ contribution: 'last', signal });
			}
		}
		const first = disposables.add(context.contributions.registerContribution(First));
		disposables.add(context.contributions.registerContribution(Throwing));
		disposables.add(context.contributions.registerContribution(Last));
		const signal: IAgentChatUsageSignal = { kind: 'chat_usage', chat: URI.parse(defaultChat), usage };
		context.contributions.chatUsage(signal);
		first.dispose();
		context.contributions.chatUsage(signal);
		assert.deepStrictEqual(observed, ['throwing', 'first', 'last', 'throwing', 'last'].map(contribution => ({ contribution, signal })));
	});
});
