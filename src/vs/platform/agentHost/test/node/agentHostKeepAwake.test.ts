/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { timeout } from '../../../../base/common/async.js';
import { toDisposable } from '../../../../base/common/lifecycle.js';
import { runWithFakedTimers } from '../../../../base/test/common/timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { AgentHostKeepAwakeConfigKey } from '../../common/agentHostSchema.js';
import { ActionType } from '../../common/state/sessionActions.js';
import { buildChatUri, buildDefaultChatUri, ChatInputQuestionKind, ChatInputResponseKind, SessionStatus } from '../../common/state/sessionState.js';
import { AgentConfigurationService } from '../../node/agentConfigurationService.js';
import { AgentHostKeepAwake } from '../../node/agentHostKeepAwake.js';
import { AgentHostStateManager, creationTimeChatStorageResource } from '../../node/agentHostStateManager.js';
import { chatTurnComplete, chatTurnStarted } from '../common/chatActionBuilders.js';

suite('AgentHostKeepAwake', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	const session = 'copilot:/keep-awake';
	const chat = buildDefaultChatUri(session);
	const peer = buildChatUri(session, 'peer');
	let state: AgentHostStateManager;
	let config: AgentConfigurationService;
	let acquired: boolean[];
	let releases: number;

	function startController(): AgentHostKeepAwake {
		return disposables.add(new AgentHostKeepAwake(allowOnBattery => {
			acquired.push(allowOnBattery);
			return toDisposable(() => releases++);
		}, state, config));
	}

	function waitForInput(resource = chat): void {
		state.dispatchServerAction(resource, {
			type: ActionType.ChatInputRequested,
			request: { id: 'input', questions: [{ id: 'question', kind: ChatInputQuestionKind.Text, message: 'Continue?' }] },
		});
	}

	setup(() => {
		state = disposables.add(new AgentHostStateManager(new NullLogService()));
		config = disposables.add(new AgentConfigurationService(state, new NullLogService()));
		acquired = [];
		releases = 0;
		state.createSession({
			resource: session, defaultChat: chat, provider: 'copilot', title: 'Test',
			status: SessionStatus.Idle, createdAt: new Date().toISOString(), modifiedAt: new Date().toISOString(),
		});
	});

	test('defaults to requiring external power for existing work without any connected client and releases after the grace period', async () => {
		await runWithFakedTimers({}, async () => {
			state.dispatchServerAction(chat, chatTurnStarted('turn', 'Work'));
			startController();
			assert.deepStrictEqual(acquired, [false]);
			state.dispatchServerAction(chat, chatTurnComplete('turn', 1));
			await timeout(AgentHostKeepAwake.RELEASE_DELAY - 1);
			assert.strictEqual(releases, 0);
			await timeout(1);
			assert.strictEqual(releases, 1);
		});
	});

	test('resuming work cancels release without taking a second hold', async () => {
		await runWithFakedTimers({}, async () => {
			startController();
			assert.deepStrictEqual(acquired, []);
			state.dispatchServerAction(chat, chatTurnStarted('first', 'Work'));
			state.dispatchServerAction(chat, chatTurnComplete('first', 1));
			await timeout(AgentHostKeepAwake.RELEASE_DELAY / 2);
			state.dispatchServerAction(chat, chatTurnStarted('second', 'More work'));
			await timeout(AgentHostKeepAwake.RELEASE_DELAY);
			assert.deepStrictEqual(acquired, [false]);
			assert.strictEqual(releases, 0);
		});
	});

	test('a running peer keeps the hold when aggregate session status needs input', async () => {
		await runWithFakedTimers({}, async () => {
			startController();
			state.addChat(session, peer, creationTimeChatStorageResource(session, peer, chat));
			state.dispatchServerAction(chat, chatTurnStarted('default', 'Wait'));
			waitForInput();
			state.dispatchServerAction(peer, chatTurnStarted('peer', 'Work'));
			assert.strictEqual(state.getSessionState(session)!.status & SessionStatus.InputNeeded, SessionStatus.InputNeeded);
			await timeout(AgentHostKeepAwake.RELEASE_DELAY);
			assert.strictEqual(releases, 0);
			waitForInput(peer);
			assert.strictEqual(state.hasRunningChats, false);
			assert.strictEqual(state.hasActiveSessions, true);
			await timeout(AgentHostKeepAwake.RELEASE_DELAY);
			assert.strictEqual(releases, 1);
			state.dispatchServerAction(peer, { type: ActionType.ChatInputCompleted, requestId: 'input', response: ChatInputResponseKind.Accept });
			assert.deepStrictEqual(acquired, [false, false]);
		});
	});

	test('removing the only running peer releases even if another chat is waiting', async () => {
		await runWithFakedTimers({}, async () => {
			startController();
			state.addChat(session, peer, creationTimeChatStorageResource(session, peer, chat));
			state.dispatchServerAction(chat, chatTurnStarted('default', 'Wait'));
			waitForInput();
			state.dispatchServerAction(peer, chatTurnStarted('peer', 'Work'));
			state.removeChat(session, peer);
			await timeout(AgentHostKeepAwake.RELEASE_DELAY);
			assert.strictEqual(releases, 1);
		});
	});

	test('removing an active session releases its hold', async () => {
		await runWithFakedTimers({}, async () => {
			startController();
			state.dispatchServerAction(chat, chatTurnStarted('turn', 'Work'));
			state.removeSession(session);
			await timeout(AgentHostKeepAwake.RELEASE_DELAY);
			assert.strictEqual(releases, 1);
		});
	});

	test('changing the mode immediately releases or replaces the hold, and disposal releases it', () => {
		const controller = startController();
		state.dispatchServerAction(chat, chatTurnStarted('turn', 'Work'));
		config.updateRootConfig({ [AgentHostKeepAwakeConfigKey]: 'never' });
		assert.strictEqual(releases, 1);
		assert.deepStrictEqual(acquired, [false]);
		config.updateRootConfig({ [AgentHostKeepAwakeConfigKey]: 'whenPluggedIn' });
		assert.deepStrictEqual(acquired, [false, false]);
		config.updateRootConfig({ [AgentHostKeepAwakeConfigKey]: 'always' });
		assert.deepStrictEqual(acquired, [false, false, true]);
		assert.strictEqual(releases, 2);
		controller.dispose();
		assert.strictEqual(releases, 3);
	});

	test('waiting chats do not acquire a hold at activation', () => {
		state.dispatchServerAction(chat, chatTurnStarted('turn', 'Wait'));
		waitForInput();
		startController();
		assert.deepStrictEqual(acquired, []);
	});
});
