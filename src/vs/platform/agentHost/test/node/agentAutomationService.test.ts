/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Schemas } from '../../../../base/common/network.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { FileService } from '../../../files/common/fileService.js';
import { InMemoryFileSystemProvider } from '../../../files/common/inMemoryFilesystemProvider.js';
import { NullLogService } from '../../../log/common/log.js';
import { ActionType } from '../../common/state/sessionActions.js';
import { AutomationOperation, AutomationScheduleKind, type AutomationDefinition } from '../../common/state/protocol/channels-automation/state.js';
import { AutomationRunStatus } from '../../common/state/protocol/channels-automation-run/state.js';
import { MessageKind, SessionStatus, buildDefaultChatUri } from '../../common/state/sessionState.js';
import { AgentAutomationService, type IAutomationSessionExecutor } from '../../node/agentAutomationService.js';
import { AgentHostStateManager } from '../../node/agentHostStateManager.js';

suite('AgentAutomationService', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	const resource = URI.from({ scheme: Schemas.inMemory, path: '/automations/store.json' });
	let fileService: FileService;
	let manager: AgentHostStateManager;
	let executor: TestAutomationExecutor;
	let service: AgentAutomationService;

	setup(() => {
		fileService = disposables.add(new FileService(new NullLogService()));
		disposables.add(fileService.registerProvider(Schemas.inMemory, disposables.add(new InMemoryFileSystemProvider())));
		manager = disposables.add(new AgentHostStateManager(new NullLogService()));
		executor = new TestAutomationExecutor(manager);
		service = disposables.add(new AgentAutomationService(resource, fileService, manager, executor, new NullLogService()));
	});

	test('manual request is durable and idempotent across restart', async () => {
		await service.create({ channel: 'ahp-automation:/test', definition: automationDefinition() });
		const first = await service.run({ channel: 'ahp-automation:/test', requestId: 'request-1' });
		service.dispose();

		const restoredManager = disposables.add(new AgentHostStateManager(new NullLogService()));
		const restoredExecutor = new TestAutomationExecutor(restoredManager);
		const restored = disposables.add(new AgentAutomationService(resource, fileService, restoredManager, restoredExecutor, new NullLogService()));
		const second = await restored.run({ channel: 'ahp-automation:/test', requestId: 'request-1' });

		assert.deepStrictEqual({
			first,
			second,
			createdSessions: executor.createCount,
			restoredCreatedSessions: restoredExecutor.createCount,
			automationOperations: restoredManager.getAutomationState('ahp-automation:/test')?.operations,
			restoredRunStatus: restoredManager.getAutomationRunState(first.run)?.lifecycle.status,
		}, {
			first: { run: first.run },
			second: { run: first.run },
			createdSessions: 1,
			restoredCreatedSessions: 0,
			automationOperations: [AutomationOperation.Update, AutomationOperation.Dispose, AutomationOperation.Run],
			restoredRunStatus: AutomationRunStatus.Failed,
		});
	});

	test('projects initial turn completion into the run channel', async () => {
		await service.create({ channel: 'ahp-automation:/test', definition: automationDefinition() });
		const result = await service.run({ channel: 'ahp-automation:/test', requestId: 'request-1' });
		const run = manager.getAutomationRunState(result.run)!;
		const chat = buildDefaultChatUri(run.primarySession!);
		manager.dispatchServerAction(chat, {
			type: ActionType.ChatTurnComplete,
			turnId: executor.turnId!,
			duration: 10,
		});

		assert.deepStrictEqual({
			status: manager.getAutomationRunState(result.run)?.lifecycle.status,
			summaryStatus: manager.getAutomationState('ahp-automation:/test')?.runs[0].lifecycle.status,
			session: manager.getAutomationRunState(result.run)?.primarySession,
		}, {
			status: AutomationRunStatus.Completed,
			summaryStatus: AutomationRunStatus.Completed,
			session: 'copilot:/automation-session',
		});
	});

	test('unix cron treats restricted day-of-month and weekday as alternatives', async () => {
		const result = await service.preview({
			channel: 'ahp-root://',
			schedule: {
				kind: AutomationScheduleKind.Cron,
				expression: '0 0 31 * 1',
				timeZone: 'UTC',
			},
			count: 1,
		});
		const next = result.items[0] ? new Date(result.items[0]) : undefined;

		assert.deepStrictEqual({
			count: result.items.length,
			matchesEitherDayField: next ? next.getUTCDate() === 31 || next.getUTCDay() === 1 : false,
		}, {
			count: 1,
			matchesEitherDayField: true,
		});
	});

	test('unix cron treats star-step day-of-month as a wildcard', async () => {
		const result = await service.preview({
			channel: 'ahp-root://',
			schedule: {
				kind: AutomationScheduleKind.Cron,
				expression: '0 0 */2 * 1',
				timeZone: 'UTC',
			},
			count: 1,
		});
		const next = result.items[0] ? new Date(result.items[0]) : undefined;

		assert.deepStrictEqual({
			count: result.items.length,
			isMonday: next?.getUTCDay() === 1,
			isSelectedDayOfMonth: next ? next.getUTCDate() % 2 === 1 : false,
		}, {
			count: 1,
			isMonday: true,
			isSelectedDayOfMonth: true,
		});
	});
});

class TestAutomationExecutor implements IAutomationSessionExecutor {
	createCount = 0;
	turnId: string | undefined;

	constructor(private readonly manager: AgentHostStateManager) { }

	async createSession(_definition: AutomationDefinition): Promise<{ session: string; chat: string }> {
		this.createCount++;
		const session = 'copilot:/automation-session';
		this.manager.createSession({
			resource: session,
			provider: 'copilot',
			title: 'Automation',
			status: SessionStatus.Idle,
			createdAt: new Date().toISOString(),
			modifiedAt: new Date().toISOString(),
		});
		return { session, chat: buildDefaultChatUri(session) };
	}

	async startSession(_session: string, chat: string, definition: AutomationDefinition, turnId: string): Promise<void> {
		this.turnId = turnId;
		this.manager.dispatchServerAction(chat, {
			type: ActionType.ChatTurnStarted,
			turnId,
			startedAt: new Date().toISOString(),
			message: definition.message,
		});
	}

	async cancelSession(): Promise<void> { }
}

function automationDefinition(): AutomationDefinition {
	return {
		title: 'Test automation',
		message: { text: 'Run tests', origin: { kind: MessageKind.User } },
		session: { provider: 'copilot', model: { id: 'gpt-test' } },
		enabled: true,
		triggers: [],
	};
}
