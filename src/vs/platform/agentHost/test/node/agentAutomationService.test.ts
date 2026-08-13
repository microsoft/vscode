/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, timeout } from '../../../../base/common/async.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { Emitter } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../base/common/network.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { FileService } from '../../../files/common/fileService.js';
import { IFileWriteOptions } from '../../../files/common/files.js';
import { InMemoryFileSystemProvider } from '../../../files/common/inMemoryFilesystemProvider.js';
import { NullLogService } from '../../../log/common/log.js';
import { ActionType } from '../../common/state/sessionActions.js';
import { AutomationOperation, AutomationTriggerKind, type AutomationDefinition } from '../../common/state/protocol/channels-automation/state.js';
import { AutomationRunCauseKind, AutomationRunStatus } from '../../common/state/protocol/channels-automation-run/state.js';
import type { ProtectedResourceMetadata } from '../../common/state/protocol/common/state.js';
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
		executor = disposables.add(new TestAutomationExecutor(manager));
		service = disposables.add(new AgentAutomationService(resource, fileService, manager, executor, new NullLogService()));
	});

	/** Seeds the durable store that a freshly constructed service loads on startup. */
	async function writeStore(store: unknown): Promise<void> {
		await fileService.createFolder(URI.from({ scheme: Schemas.inMemory, path: '/automations' }));
		await fileService.writeFile(resource, VSBuffer.fromString(JSON.stringify(store)));
	}

	/** Lets queued persistence and lifecycle work settle before asserting. */
	async function waitForIdle(): Promise<void> {
		for (let index = 0; index < 5; index++) {
			await timeout(0);
		}
	}

	test('manual request is durable and idempotent across restart', async () => {
		await service.create({ channel: 'ahp-automation:/test', definition: automationDefinition() });
		const first = await service.run({ channel: 'ahp-automation:/test', requestId: 'request-1' });
		service.dispose();

		const restoredManager = disposables.add(new AgentHostStateManager(new NullLogService()));
		const restoredExecutor = disposables.add(new TestAutomationExecutor(restoredManager));
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

	test('retains only the advertised number of runs', async () => {
		const limit = service.capabilities.runHistoryLimit!;
		await service.create({ channel: 'ahp-automation:/test', definition: automationDefinition() });
		const created: string[] = [];
		for (let index = 0; index < limit + 2; index++) {
			const result = await service.run({ channel: 'ahp-automation:/test', requestId: `request-${index}` });
			created.push(result.run);
			const run = manager.getAutomationRunState(result.run)!;
			manager.dispatchServerAction(buildDefaultChatUri(run.primarySession!), {
				type: ActionType.ChatTurnComplete,
				turnId: executor.turnId!,
				duration: 1,
			});
		}
		// The idempotency key of a pruned run must not resurrect it.
		const rerun = await service.run({ channel: 'ahp-automation:/test', requestId: 'request-0' });

		assert.deepStrictEqual({
			retained: manager.getAutomationState('ahp-automation:/test')?.runs.length,
			oldestRunState: manager.getAutomationRunState(created[0]),
			newestRetained: manager.getAutomationState('ahp-automation:/test')?.runs[0].resource,
			rerunIsNew: rerun.run !== created[0],
		}, {
			retained: limit,
			oldestRunState: undefined,
			newestRetained: rerun.run,
			rerunIsNew: true,
		});
	});

	test('a due tick starts at most one run even when several triggers fire', async () => {
		const scheduled = new Date(Date.now() - 5 * 60_000).toISOString();
		await writeStore({
			version: 2,
			automations: [{
				resource: 'ahp-automation:/scheduled',
				definition: {
					...automationDefinition(),
					triggers: [
						{ id: 'trigger-a', kind: AutomationTriggerKind.Schedule, schedule: { expression: '* * * * *', timeZone: 'UTC' } },
						{ id: 'trigger-b', kind: AutomationTriggerKind.Schedule, schedule: { expression: '* * * * *', timeZone: 'UTC' } },
					],
				},
				revision: 1,
				runs: [],
				operations: [AutomationOperation.Update, AutomationOperation.Dispose, AutomationOperation.Run],
				createdAt: '2025-01-01T00:00:00.000Z',
				modifiedAt: '2025-01-01T00:00:00.000Z',
			}],
			runs: [],
			requestRuns: {},
			triggerNextRuns: { 'ahp-automation:/scheduled': { 'trigger-a': scheduled, 'trigger-b': scheduled } },
			initialTurnIds: {},
			pendingImports: [],
		});
		const scheduledExecutor = disposables.add(new TestAutomationExecutor(manager));
		const scheduledService = disposables.add(new AgentAutomationService(resource, fileService, manager, scheduledExecutor, new NullLogService()));
		await scheduledExecutor.createStarted.p;
		await scheduledService.list({ channel: 'ahp-root://' });
		await waitForIdle();

		const runs = manager.getAutomationState('ahp-automation:/scheduled')?.runs ?? [];
		assert.deepStrictEqual({
			createdSessions: scheduledExecutor.createCount,
			runCount: runs.length,
			// Both triggers advance even though only one of them claimed the run slot.
			advancedTriggers: manager.getAutomationState('ahp-automation:/scheduled')?.nextRunAt !== scheduled,
		}, {
			createdSessions: 1,
			runCount: 1,
			advancedTriggers: true,
		});
	});

	test('runs an overdue imported occurrence only after cutover and claims it across restart', async () => {
		const scheduledFor = new Date(Date.now() - 5 * 60_000).toISOString();
		const automation = 'ahp-automation:/imported';
		const importedManager = disposables.add(new AgentHostStateManager(new NullLogService()));
		const importedExecutor = disposables.add(new TestAutomationExecutor(importedManager));
		const importedService = disposables.add(new AgentAutomationService(resource, fileService, importedManager, importedExecutor, new NullLogService()));
		await importedService.create({
			channel: automation,
			definition: {
				...automationDefinition(),
				enabled: false,
				triggers: [{
					id: 'schedule',
					kind: AutomationTriggerKind.Schedule,
					schedule: { expression: '* * * * *', timeZone: 'UTC' },
				}],
			},
			import: {
				source: 'legacy',
				batchId: 'batch',
				itemId: 'item',
				triggerNextRuns: [{ triggerId: 'schedule', nextRunAt: scheduledFor }],
			},
		});
		await waitForIdle();
		const beforeCutover = {
			runs: importedManager.getAutomationState(automation)?.runs.length,
			nextRunAt: importedManager.getAutomationState(automation)?.nextRunAt,
			createdSessions: importedExecutor.createCount,
		};
		importedService.dispose();

		const cutoverManager = disposables.add(new AgentHostStateManager(new NullLogService()));
		const cutoverExecutor = disposables.add(new TestAutomationExecutor(cutoverManager));
		const cutoverService = disposables.add(new AgentAutomationService(resource, fileService, cutoverManager, cutoverExecutor, new NullLogService()));
		await cutoverService.list({ channel: 'ahp-root://' });
		await cutoverService.update({ channel: automation, expectedRevision: 1, changes: { enabled: true } });
		await cutoverExecutor.createStarted.p;
		await waitForIdle();
		const run = cutoverManager.getAutomationState(automation)?.runs[0];
		const runState = run ? cutoverManager.getAutomationRunState(run.resource) : undefined;
		const persisted = JSON.parse((await fileService.readFile(resource)).value.toString()) as {
			readonly pendingImports: string[];
			readonly triggerNextRuns: Record<string, Record<string, string>>;
		};
		cutoverService.dispose();

		const restartedManager = disposables.add(new AgentHostStateManager(new NullLogService()));
		const restartedExecutor = disposables.add(new TestAutomationExecutor(restartedManager));
		const restartedService = disposables.add(new AgentAutomationService(resource, fileService, restartedManager, restartedExecutor, new NullLogService()));
		await restartedService.list({ channel: 'ahp-root://' });
		await waitForIdle();

		assert.deepStrictEqual({
			beforeCutover,
			cutover: {
				runCount: cutoverManager.getAutomationState(automation)?.runs.length,
				cause: runState?.cause,
				cursorAdvanced: new Date(persisted.triggerNextRuns[automation].schedule).getTime() > Date.now(),
				pendingImports: persisted.pendingImports,
			},
			afterRestart: {
				runCount: restartedManager.getAutomationState(automation)?.runs.length,
				createdSessions: restartedExecutor.createCount,
			},
		}, {
			beforeCutover: { runs: 0, nextRunAt: undefined, createdSessions: 0 },
			cutover: {
				runCount: 1,
				cause: {
					kind: AutomationRunCauseKind.Trigger,
					triggerId: 'schedule',
					scheduledFor,
					catchUp: true,
				},
				cursorAdvanced: true,
				pendingImports: [],
			},
			afterRestart: { runCount: 1, createdSessions: 0 },
		});
	});

	test('waits for required authentication before starting a due run', async () => {
		const scheduled = new Date(Date.now() - 5 * 60_000).toISOString();
		await writeStore({
			version: 2,
			automations: [{
				resource: 'ahp-automation:/scheduled',
				definition: {
					...automationDefinition(),
					triggers: [{ id: 'schedule', kind: AutomationTriggerKind.Schedule, schedule: { expression: '* * * * *', timeZone: 'UTC' } }],
				},
				revision: 1,
				runs: [],
				operations: [AutomationOperation.Update, AutomationOperation.Dispose, AutomationOperation.Run],
				createdAt: '2025-01-01T00:00:00.000Z',
				modifiedAt: '2025-01-01T00:00:00.000Z',
			}],
			runs: [],
			requestRuns: {},
			triggerNextRuns: { 'ahp-automation:/scheduled': { schedule: scheduled } },
			initialTurnIds: {},
			pendingImports: [],
		});
		const scheduledManager = disposables.add(new AgentHostStateManager(new NullLogService()));
		const scheduledExecutor = disposables.add(new TestAutomationExecutor(scheduledManager));
		scheduledExecutor.missingAuthentication = [{
			resource: 'https://api.github.com',
			scopes_supported: ['read:user', 'user:email'],
		}];
		const scheduledService = disposables.add(new AgentAutomationService(resource, fileService, scheduledManager, scheduledExecutor, new NullLogService()));
		await scheduledService.list({ channel: 'ahp-root://' });
		await waitForIdle();
		const beforeAuthentication = {
			createdSessions: scheduledExecutor.createCount,
			runCount: scheduledManager.getAutomationState('ahp-automation:/scheduled')?.runs.length,
		};

		scheduledExecutor.authenticate();
		await scheduledExecutor.createStarted.p;
		await waitForIdle();

		assert.deepStrictEqual({
			beforeAuthentication,
			afterAuthentication: {
				createdSessions: scheduledExecutor.createCount,
				runCount: scheduledManager.getAutomationState('ahp-automation:/scheduled')?.runs.length,
			},
		}, {
			beforeAuthentication: { createdSessions: 0, runCount: 0 },
			afterAuthentication: { createdSessions: 1, runCount: 1 },
		});
	});

	test('rejects enabled imports before they can become schedulable', async () => {
		await assert.rejects(() => service.create({
			channel: 'ahp-automation:/enabled-import',
			definition: automationDefinition(),
			import: {
				source: 'legacy',
				batchId: 'batch',
				itemId: 'item',
				triggerNextRuns: [],
			},
		}), /Imported automation definitions must be disabled/);

		assert.strictEqual(manager.getAutomationState('ahp-automation:/enabled-import'), undefined);
	});

	test('rejects event triggers that this host cannot fire', async () => {
		await assert.rejects(() => service.create({
			channel: 'ahp-automation:/event',
			definition: {
				...automationDefinition(),
				triggers: [{ id: 'trigger-a', kind: AutomationTriggerKind.Event, type: 'pullRequest', events: ['opened'] }],
			},
		}), /event triggers are not supported/);

		assert.strictEqual(manager.getAutomationState('ahp-automation:/event'), undefined);
	});

	test('rejects cron steps on single values', async () => {
		await assert.rejects(() => service.create({
			channel: 'ahp-automation:/invalid-schedule',
			definition: {
				...automationDefinition(),
				triggers: [{
					id: 'trigger-a',
					kind: AutomationTriggerKind.Schedule,
					schedule: { expression: '5/2 * * * *', timeZone: 'UTC' },
				}],
			},
		}), /Invalid automation schedule/);
	});

	test('unix cron treats restricted day-of-month and weekday as alternatives', async () => {
		const result = await service.preview({
			channel: 'ahp-root://',
			schedule: {
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

	test('AHP cron supports names, ranges, and Sunday 7', async () => {
		const soon = new Date(Date.now() + 2 * 60_000);
		const monthName = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'][soon.getUTCMonth()];
		const namedMonth = await service.preview({
			channel: 'ahp-root://',
			schedule: {
				expression: `${soon.getUTCMinutes()} ${soon.getUTCHours()} * ${monthName} *`,
				timeZone: 'UTC',
			},
			count: 1,
		});
		const namedWeekdayRange = await service.preview({
			channel: 'ahp-root://',
			schedule: {
				expression: '* * * * MON-FRI',
				timeZone: 'UTC',
			},
			count: 1,
		});
		const sunday = await service.preview({
			channel: 'ahp-root://',
			schedule: {
				expression: '0 0 * * 7',
				timeZone: 'UTC',
			},
			count: 1,
		});
		const namedMonthDate = namedMonth.items[0] ? new Date(namedMonth.items[0]) : undefined;
		const namedWeekdayDate = namedWeekdayRange.items[0] ? new Date(namedWeekdayRange.items[0]) : undefined;
		const sundayDate = sunday.items[0] ? new Date(sunday.items[0]) : undefined;

		assert.deepStrictEqual({
			namedMonth: namedMonthDate?.getUTCMonth(),
			namedWeekdayInRange: namedWeekdayDate ? namedWeekdayDate.getUTCDay() >= 1 && namedWeekdayDate.getUTCDay() <= 5 : false,
			numericSunday: sundayDate?.getUTCDay(),
		}, {
			namedMonth: soon.getUTCMonth(),
			namedWeekdayInRange: true,
			numericSunday: 0,
		});
	});
});

class TestAutomationExecutor extends Disposable implements IAutomationSessionExecutor {
	createCount = 0;
	startCount = 0;
	disposeCount = 0;
	readonly createStarted = new DeferredPromise<string>();
	readonly cancelStarted = new DeferredPromise<void>();
	createBarrier: DeferredPromise<void> | undefined;
	turnId: string | undefined;
	missingAuthentication: readonly ProtectedResourceMetadata[] = [];
	private readonly _onDidAuthenticate = this._register(new Emitter<void>());
	readonly onDidAuthenticate = this._onDidAuthenticate.event;

	constructor(private readonly manager: AgentHostStateManager) {
		super();
	}

	getMissingAuthentication(): readonly ProtectedResourceMetadata[] {
		return this.missingAuthentication;
	}

	authenticate(): void {
		this.missingAuthentication = [];
		this._onDidAuthenticate.fire();
	}

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
