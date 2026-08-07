/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { buildChatUri, buildDefaultChatUri, MessageKind, SessionStatus, TurnState, type SessionSummary } from '../../common/state/sessionState.js';
import { AgentHostSessionTitleController } from '../../node/agentHostSessionTitleController.js';
import { AgentHostStateManager } from '../../node/agentHostStateManager.js';
import { AGENT_HOST_TITLE_SOURCE_AGENT, AGENT_HOST_TITLE_SOURCE_AUTO, AGENT_HOST_TITLE_SOURCE_USER, customChatTitleMetadataKey, customChatTitleSourceMetadataKey, SESSION_CUSTOM_TITLE_SOURCE_KEY } from '../../node/shared/persistSessionMetadata.js';
import { createSessionDataService, TestSessionDatabase } from '../common/sessionTestHelpers.js';

suite('AgentHostSessionTitleController', () => {
	const disposables = new DisposableStore();

	teardown(() => disposables.clear());
	ensureNoDisposablesAreLeakedInTestSuite();

	function createSummary(session: URI, title = ''): SessionSummary {
		return {
			resource: session.toString(),
			provider: 'copilot',
			title,
			status: SessionStatus.Idle,
			createdAt: new Date(1).toISOString(),
			modifiedAt: new Date(1).toISOString(),
		};
	}

	function setup(title = ''): {
		controller: AgentHostSessionTitleController;
		stateManager: AgentHostStateManager;
		session: URI;
		db: TestSessionDatabase;
	} {
		const stateManager = disposables.add(new AgentHostStateManager(new NullLogService()));
		const db = new TestSessionDatabase();
		const session = URI.parse('agenthost-session://copilot/session-title-test');
		stateManager.createSession(createSummary(session, title));
		const controller = disposables.add(new AgentHostSessionTitleController(stateManager, {
			sessionDataService: createSessionDataService(db),
		}, new NullLogService()));
		return { controller, stateManager, session, db };
	}

	async function waitForMetadata(db: TestSessionDatabase, key: string, expected: string): Promise<void> {
		for (let attempt = 0; attempt < 20; attempt++) {
			if (await db.getMetadata(key) === expected) {
				return;
			}
			await Promise.resolve();
		}
		assert.strictEqual(await db.getMetadata(key), expected);
	}

	test('first prompt applies and persists a normalized auto fallback', async () => {
		const { controller, stateManager, session, db } = setup();

		controller.seedTitleFromFirstMessage(session.toString(), `  Please \n explain title generation ${'x'.repeat(250)}  `);

		const title = stateManager.getSessionState(session.toString())?.title;
		assert.ok(title);
		assert.ok(title.length <= 40);
		assert.ok(!title.includes('\n'));
		await waitForMetadata(db, 'customTitle', title);
		await waitForMetadata(db, SESSION_CUSTOM_TITLE_SOURCE_KEY, AGENT_HOST_TITLE_SOURCE_AUTO);
	});

	test('first prompt does not replace an existing title', async () => {
		const { controller, stateManager, session, db } = setup('User title');

		controller.seedTitleFromFirstMessage(session.toString(), 'Replace me');

		assert.strictEqual(stateManager.getSessionState(session.toString())?.title, 'User title');
		assert.strictEqual(await db.getMetadata('customTitle'), undefined);
	});

	test('first real prompt replaces a provisional local-command title as auto', async () => {
		const { controller, stateManager, session, db } = setup();
		controller.seedProvisionalTitle(session.toString(), 'git status');
		stateManager.seedDefaultChatTurns(session.toString(), [{
			id: 'local-turn',
			message: { text: '!git status', origin: { kind: MessageKind.User } },
			responseParts: [],
			usage: undefined,
			state: TurnState.Complete,
		}]);

		controller.seedTitleFromFirstMessage(session.toString(), 'Explain the build');

		assert.strictEqual(stateManager.getSessionState(session.toString())?.title, 'Explain the build');
		await waitForMetadata(db, 'customTitle', 'Explain the build');
		await waitForMetadata(db, SESSION_CUSTOM_TITLE_SOURCE_KEY, AGENT_HOST_TITLE_SOURCE_AUTO);
	});

	test('auto session title adds a model-only session reminder', async () => {
		const { controller, session } = setup();
		controller.seedTitleFromFirstMessage(session.toString(), 'Fix the login bug');

		const prompt = await controller.preparePromptForAgent(session.toString(), buildDefaultChatUri(session), 'Fix the login bug');

		assert.ok(prompt.startsWith('Fix the login bug\n\n<system_notification>'));
		assert.ok(prompt.includes('`rename_session`'));
		assert.ok(prompt.includes('This session currently has an auto-generated or placeholder name.'));
	});

	test('auto peer-chat title adds a rename_chat reminder', async () => {
		const { controller, stateManager, session, db } = setup('Session title');
		const chat = buildChatUri(session.toString(), 'peer-1');
		stateManager.addChat(session.toString(), chat, {});
		controller.seedTitleFromFirstMessage(session.toString(), 'Investigate tests', chat);

		const prompt = await controller.preparePromptForAgent(session.toString(), chat, 'Investigate tests');

		await waitForMetadata(db, customChatTitleMetadataKey(chat), 'Investigate tests');
		await waitForMetadata(db, customChatTitleSourceMetadataKey(chat), AGENT_HOST_TITLE_SOURCE_AUTO);
		assert.ok(prompt.includes('`rename_chat`'));
		assert.ok(prompt.includes('This chat currently has an auto-generated or placeholder name.'));
		assert.ok(!prompt.includes('`rename_session`'));
	});

	for (const source of [AGENT_HOST_TITLE_SOURCE_USER, AGENT_HOST_TITLE_SOURCE_AGENT]) {
		test(`${source} session title suppresses the reminder`, async () => {
			const { controller, session, db } = setup('Descriptive title');
			await db.setMetadata(SESSION_CUSTOM_TITLE_SOURCE_KEY, source);

			assert.strictEqual(
				await controller.preparePromptForAgent(session.toString(), buildDefaultChatUri(session), 'Continue'),
				'Continue',
			);
		});
	}

	test('persisted auto title adds a reminder after restore', async () => {
		const { controller, session, db } = setup('Restored fallback');
		await db.setMetadata(SESSION_CUSTOM_TITLE_SOURCE_KEY, AGENT_HOST_TITLE_SOURCE_AUTO);

		const prompt = await controller.preparePromptForAgent(session.toString(), buildDefaultChatUri(session), 'Continue');

		assert.ok(prompt.includes('`rename_session`'));
	});

	test('persisted auto peer-chat title adds a reminder after restore', async () => {
		const { controller, stateManager, session, db } = setup('Session title');
		const chat = buildChatUri(session.toString(), 'peer-restored');
		stateManager.addChat(session.toString(), chat, { title: 'Restored fallback' });
		await db.setMetadata(customChatTitleSourceMetadataKey(chat), AGENT_HOST_TITLE_SOURCE_AUTO);

		const prompt = await controller.preparePromptForAgent(session.toString(), chat, 'Continue');

		assert.ok(prompt.includes('`rename_chat`'));
	});
});
