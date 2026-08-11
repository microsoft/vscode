/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../base/common/async.js';
import { Schemas } from '../../../../base/common/network.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { FileService } from '../../../files/common/fileService.js';
import { IFileWriteOptions } from '../../../files/common/files.js';
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
	let fileSystemProvider: TestFileSystemProvider;
	let manager: AgentHostStateManager;
	let executor: TestAutomationExecutor;
	let service: AgentAutomationService;

	setup(() => {
		fileService = disposables.add(new FileService(new NullLogService()));
		fileSystemProvider = disposables.add(new TestFileSystemProvider());
		disposables.add(fileService.registerProvider(Schemas.inMemory, fileSystemProvider));
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

	test('late cancellation removes a disposed session from the run', async () => {
		executor.createBarrier = new DeferredPromise<void>();
		await service.create({ channel: 'ahp-automation:/test', definition: automationDefinition() });
		const runPromise = service.run({ channel: 'ahp-automation:/test', requestId: 'request-1' });
		const runResource = await executor.createStarted.p;
		fileSystemProvider.blockNextWrite();
		executor.createBarrier.complete();
		await fileSystemProvider.whenWriteBlocked;

		const cancelPromise = service.cancel(runResource);
		await executor.cancelStarted.p;
		await Promise.resolve();
		fileSystemProvider.releaseWrite();
		await Promise.all([runPromise, cancelPromise]);

		assert.deepStrictEqual({
			status: manager.getAutomationRunState(runResource)?.lifecycle.status,
			startCount: executor.startCount,
			disposeCount: executor.disposeCount,
			sessions: manager.getAutomationRunState(runResource)?.sessions,
			primarySession: manager.getAutomationRunState(runResource)?.primarySession,
		}, {
			status: AutomationRunStatus.Cancelled,
			startCount: 0,
			disposeCount: 1,
			sessions: [],
			primarySession: undefined,
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

	test('cancelling while session creation is pending cannot start the session', async () => {
		executor.createBarrier = new DeferredPromise<void>();
		await service.create({ channel: 'ahp-automation:/test', definition: automationDefinition() });
		const runPromise = service.run({ channel: 'ahp-automation:/test', requestId: 'request-1' });
		const runResource = await executor.createStarted.p;

		await service.cancel(runResource);
		executor.createBarrier.complete();
		await runPromise;

		assert.deepStrictEqual({
			status: manager.getAutomationRunState(runResource)?.lifecycle.status,
			startCount: executor.startCount,
			disposeCount: executor.disposeCount,
			primarySession: manager.getAutomationRunState(runResource)?.primarySession,
		}, {
			status: AutomationRunStatus.Cancelled,
			startCount: 0,
			disposeCount: 1,
			primarySession: undefined,
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
	startCount = 0;
	disposeCount = 0;
	readonly createStarted = new DeferredPromise<string>();
	readonly cancelStarted = new DeferredPromise<void>();
	createBarrier: DeferredPromise<void> | undefined;
	turnId: string | undefined;

	constructor(private readonly manager: AgentHostStateManager) { }

	async createSession(_definition: AutomationDefinition, _automation: string, run: string): Promise<{ session: string; chat: string }> {
		this.createCount++;
		this.createStarted.complete(run);
		if (this.createBarrier) {
			await this.createBarrier.p;
		}
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
		this.startCount++;
		this.turnId = turnId;
		this.manager.dispatchServerAction(chat, {
			type: ActionType.ChatTurnStarted,
			turnId,
			startedAt: new Date().toISOString(),
			message: definition.message,
		});
	}

	async cancelSession(): Promise<void> {
		this.cancelStarted.complete();
	}

	async disposeSession(session: string): Promise<void> {
		this.disposeCount++;
		this.manager.deleteSession(session);
	}
}

class TestFileSystemProvider extends InMemoryFileSystemProvider {
	private writeCount = 0;
	private blockedWriteNumber: number | undefined;
	private writeBlocked = new DeferredPromise<void>();
	private writeBarrier = new DeferredPromise<void>();

	get whenWriteBlocked(): Promise<void> {
		return this.writeBlocked.p;
	}

	blockNextWrite(): void {
		this.blockedWriteNumber = this.writeCount + 1;
		this.writeBlocked = new DeferredPromise<void>();
		this.writeBarrier = new DeferredPromise<void>();
	}

	releaseWrite(): void {
		this.writeBarrier.complete();
	}

	override async writeFile(resource: URI, content: Uint8Array, options: IFileWriteOptions): Promise<void> {
		this.writeCount++;
		if (this.writeCount === this.blockedWriteNumber) {
			this.writeBlocked.complete();
			await this.writeBarrier.p;
		}
		await super.writeFile(resource, content, options);
	}
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
