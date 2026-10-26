/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk';

import assert from 'assert';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { CancellationError } from '../../../../base/common/errors.js';
import { DisposableStore, IReference } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { FileService } from '../../../files/common/fileService.js';
import { IFileService } from '../../../files/common/files.js';
import { InMemoryFileSystemProvider } from '../../../files/common/inMemoryFilesystemProvider.js';
import { IInstantiationService } from '../../../instantiation/common/instantiation.js';
import { InstantiationService } from '../../../instantiation/common/instantiationService.js';
import { ServiceCollection } from '../../../instantiation/common/serviceCollection.js';
import { ILogService, NullLogService } from '../../../log/common/log.js';
import { AgentSignal, fixedChatOwnerRef, type IAgentChatOwnerRef } from '../../common/agent.js';
import { mintDefaultChatUri, subagentChatUri } from '../../common/agentHostChatMinting.js';
import { IDiffComputeService } from '../../common/diffComputeService.js';
import { IAgentEditAttribution, IAgentEditAttributionService, NullAgentEditAttributionService } from '../../common/fileEditAttribution.js';
import { ISessionDatabase, ISessionDataService } from '../../common/sessionDataService.js';
import { ActionType } from '../../common/state/sessionActions.js';
import { buildChatUri, buildDefaultChatUri, buildSubagentChatUri, SessionStatus, ToolResultContentType } from '../../common/state/sessionState.js';
import { createAgentChatContext } from '../../node/agentChatContext.js';
import { AgentHostAuthenticationService } from '../../node/agentHostAuthenticationService.js';
import { AgentHostFileEditCoordinator, IAgentHostFileEditCoordinator } from '../../node/agentHostFileEditCoordinator.js';
import { AgentHostStateManager } from '../../node/agentHostStateManager.js';
import { ClaudeSdkMessageRouter } from '../../node/claude/claudeSdkMessageRouter.js';
import { SubagentRegistry } from '../../node/claude/claudeSubagentRegistry.js';
import { IEditArcReporterService, NullEditArcReporterService } from '../../node/shared/editArcReporter.js';
import { IEditSurvivalReporterFactory, NullEditSurvivalReporterFactory } from '../../node/shared/editSurvivalReporter.js';
import { createSessionDataService, createZeroDiffComputeService, TestSessionDatabase } from '../common/sessionTestHelpers.js';
import { isMintedTestDefaultChat } from '../common/mintedChatUri.js';
import { TestChatOwnerRef } from './agentChatContextTestUtils.js';
import {
	makeContentBlockStartText,
	makeContentBlockStartToolUse,
	makeContentBlockStop,
	makeMessageStart,
	makeMessageStop,
	makeStreamEvent,
	makeTextDelta,
} from './claudeMapSessionEventsTestUtils.js';

interface IRouterHarness {
	readonly router: ClaudeSdkMessageRouter;
	readonly signals: AgentSignal[];
	readonly fileService: FileService;
	readonly database: TestSessionDatabase;
}

class RecordingAgentEditAttributionService extends NullAgentEditAttributionService {
	readonly recordedSessionUris: string[] = [];
	readonly recordedChatUris: (string | undefined)[] = [];
	readonly flushedSessionUris: string[] = [];

	override async recordEdit(edit: IAgentEditAttribution) {
		this.recordedSessionUris.push(edit.sessionUri);
		this.recordedChatUris.push(edit.chatUri);
		return undefined;
	}

	override async flushSession(sessionUri: string): Promise<void> {
		this.flushedSessionUris.push(sessionUri);
	}
}

function createRouter(
	disposables: Pick<DisposableStore, 'add'>,
	chatChannelUri = URI.parse(buildDefaultChatUri('claude:/sess-1')),
	attributionService = new NullAgentEditAttributionService(),
	db = new TestSessionDatabase(),
	sessionDataService: ISessionDataService = createSessionDataService(db),
	fileService = disposables.add(new FileService(new NullLogService())),
	owner: IAgentChatOwnerRef = fixedChatOwnerRef(URI.parse('claude:/sess-1')),
): IRouterHarness {
	const fs = disposables.add(new InMemoryFileSystemProvider());
	disposables.add(fileService.registerProvider('file', fs));

	const dbRef: IReference<ISessionDatabase> = { object: db, dispose: () => { } };

	const services = new ServiceCollection(
		[ILogService, new NullLogService()],
		[IFileService, fileService],
		[IAgentHostFileEditCoordinator, disposables.add(new AgentHostFileEditCoordinator())],
		[IDiffComputeService, createZeroDiffComputeService()],
		[IAgentEditAttributionService, attributionService],
		[IEditSurvivalReporterFactory, new NullEditSurvivalReporterFactory()],
		[IEditArcReporterService, new NullEditArcReporterService()],
		[ISessionDataService, sessionDataService],
	);
	const inst: IInstantiationService = disposables.add(new InstantiationService(services));
	const subagents = disposables.add(new SubagentRegistry());
	const router = disposables.add(inst.createInstance(
		ClaudeSdkMessageRouter,
		chatChannelUri,
		owner,
		isMintedTestDefaultChat(chatChannelUri.toString()) ? URI.parse('claude:/sess-1') : chatChannelUri,
		dbRef,
		subagents,
		undefined,
	));
	const signals: AgentSignal[] = [];
	disposables.add(router.onDidProduceSignal(s => signals.push(s)));
	return { router, signals, fileService, database: db };
}

function assistantMessage(content: unknown, parentToolUseId: string | null = null): Extract<SDKMessage, { type: 'assistant' }> {
	return { type: 'assistant', message: { content }, parent_tool_use_id: parentToolUseId } as Extract<SDKMessage, { type: 'assistant' }>;
}

function userMessage(content: unknown, parentToolUseId: string | null = null): Extract<SDKMessage, { type: 'user' }> {
	return { type: 'user', message: { content }, parent_tool_use_id: parentToolUseId } as Extract<SDKMessage, { type: 'user' }>;
}

suite('ClaudeSdkMessageRouter', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('handle with turnId=undefined produces no signals (turn-less messages are routed to nowhere)', async () => {
		const { router, signals } = createRouter(disposables);
		await router.handle(makeStreamEvent('sess-1', makeMessageStart()), undefined);
		assert.deepStrictEqual(signals, []);
	});

	test('handle with a turnId on a text content block produces ChatResponsePart + ChatDelta signals', async () => {
		const { router, signals } = createRouter(disposables);
		await router.handle(makeStreamEvent('sess-1', makeMessageStart()), 'turn-1');
		await router.handle(makeStreamEvent('sess-1', makeContentBlockStartText(0)), 'turn-1');
		await router.handle(makeStreamEvent('sess-1', makeTextDelta(0, 'hi')), 'turn-1');
		await router.handle(makeStreamEvent('sess-1', makeContentBlockStop(0)), 'turn-1');
		await router.handle(makeStreamEvent('sess-1', makeMessageStop()), 'turn-1');

		assert.ok(signals.length >= 2, `expected >=2 signals, got ${signals.length}`);
	});

	test('mapper failure on a malformed message is swallowed and does not throw out of handle()', async () => {
		const { router } = createRouter(disposables);
		const bogus = { type: 'stream_event', event: { type: 'unknown_event_kind' } } as unknown as SDKMessage;
		await router.handle(bogus, 'turn-1');
		// Followed by a valid message — the router must still be functional.
		await router.handle(makeStreamEvent('sess-1', makeMessageStart()), 'turn-1');
	});

	test('handle returns a Promise so the consumer can await observation ordering (assistant tool_use → user tool_result)', async () => {
		const { router } = createRouter(disposables);
		const p1 = router.handle(makeStreamEvent('sess-1', makeMessageStart()), 'turn-1');
		assert.ok(p1 instanceof Promise);
		await p1;
	});

	test('tracks and flushes peer chat edits by their chat channel URI', async () => {
		const chatChannelUri = URI.parse(buildChatUri('claude:/sess-1', 'peer'));
		const attributionService = new RecordingAgentEditAttributionService();
		const { router, fileService } = createRouter(disposables, chatChannelUri, attributionService);
		const file = URI.file('/work/a.txt');
		await fileService.writeFile(file, VSBuffer.fromString('before'));

		await router.handle(assistantMessage([
			{ type: 'tool_use', id: 'tu-1', name: 'Write', input: { file_path: file.fsPath, content: 'after' } },
		]), 'turn-1');
		await fileService.writeFile(file, VSBuffer.fromString('after'));
		await router.handle(userMessage([
			{ type: 'tool_result', tool_use_id: 'tu-1', content: 'ok' },
		]), 'turn-1');
		router.dispose();

		assert.deepStrictEqual({
			recordedSessionUris: attributionService.recordedSessionUris,
			recordedChatUris: attributionService.recordedChatUris,
			flushedSessionUris: attributionService.flushedSessionUris,
		}, {
			recordedSessionUris: [chatChannelUri.toString()],
			recordedChatUris: [chatChannelUri.toString()],
			flushedSessionUris: [chatChannelUri.toString()],
		});
	});

	test('publishes retained Bash output after storing it in the chat database', async () => {
		const { router, signals, fileService, database } = createRouter(disposables);
		const outputFile = URI.file('/claude/tool-results/toolu_1.txt');
		await fileService.writeFile(outputFile, VSBuffer.fromString('full output'));
		const storedSizesAtCompletion: Promise<number | undefined>[] = [];
		disposables.add(router.onDidProduceSignal(signal => {
			if (signal.kind === 'action' && signal.action.type === ActionType.ChatToolCallComplete) {
				storedSizesAtCompletion.push(database.getTerminalOutputSize(signal.action.toolCallId));
			}
		}));

		await router.handle(makeStreamEvent('sess-1', makeMessageStart()), 'turn-1');
		await router.handle(makeStreamEvent('sess-1', makeContentBlockStartToolUse(0, 'toolu_1', 'Bash')), 'turn-1');
		await router.handle(makeStreamEvent('sess-1', makeContentBlockStop(0)), 'turn-1');
		await router.handle({
			...userMessage([{ type: 'tool_result', tool_use_id: 'toolu_1', content: 'Output too large' }]),
			parent_tool_use_id: null,
			tool_use_result: { stdout: 'full', stderr: '', interrupted: false, persistedOutputPath: outputFile.fsPath },
		}, 'turn-1');

		const completion = signals.find(signal => signal.kind === 'action' && signal.action.type === ActionType.ChatToolCallComplete);
		assert.deepStrictEqual({
			storedSizesAtCompletion: await Promise.all(storedSizesAtCompletion),
			content: completion?.kind === 'action' && completion.action.type === ActionType.ChatToolCallComplete
				? completion.action.result.content?.map(content => content.type)
				: undefined,
		}, {
			storedSizesAtCompletion: ['full output'.length],
			content: [ToolResultContentType.Text, ToolResultContentType.Terminal],
		});
	});

	for (const failure of ['read', 'store']) {
		test(`preserves the text completion when output ${failure} fails without cancellation`, async () => {
			const database = new class extends TestSessionDatabase {
				override async storeTerminalOutput(): Promise<void> {
					throw new Error('Cannot store output');
				}
			}();
			const { router, signals, fileService } = createRouter(disposables, undefined, undefined, database);
			const outputFile = URI.file('/claude/tool-results/toolu_1.txt');
			if (failure === 'store') {
				await fileService.writeFile(outputFile, VSBuffer.fromString('full output'));
			}
			await router.handle(makeStreamEvent('sess-1', makeMessageStart()), 'turn-1');
			await router.handle(makeStreamEvent('sess-1', makeContentBlockStartToolUse(0, 'toolu_1', 'Bash')), 'turn-1');
			await router.handle(makeStreamEvent('sess-1', makeContentBlockStop(0)), 'turn-1');
			await router.handle({
				...userMessage([{ type: 'tool_result', tool_use_id: 'toolu_1', content: 'Output too large' }]),
				parent_tool_use_id: null,
				tool_use_result: { persistedOutputPath: outputFile.fsPath },
			}, 'turn-1');

			assert.deepStrictEqual(signals.flatMap(signal => signal.kind === 'action' && signal.action.type === ActionType.ChatToolCallComplete ? [signal.action.result.content] : []), [
				[{ type: ToolResultContentType.Text, text: 'Output too large' }],
			]);
		});
	}

	test('drops retained Bash output when cancellation lands after capture completes', async () => {
		const cancellation = new AbortController();
		const database = new TestSessionDatabase();
		const baseSessionDataService = createSessionDataService(database);
		const sessionDataService: ISessionDataService = {
			...baseSessionDataService,
			openDatabase: resource => {
				const reference = baseSessionDataService.openDatabase(resource);
				return {
					object: reference.object,
					dispose: () => {
						reference.dispose();
						cancellation.abort();
					},
				};
			},
		};
		const { router, signals, fileService } = createRouter(
			disposables,
			undefined,
			undefined,
			database,
			sessionDataService,
		);
		const outputFile = URI.file('/claude/tool-results/toolu_1.txt');
		await fileService.writeFile(outputFile, VSBuffer.fromString('full output'));

		await router.handle(makeStreamEvent('sess-1', makeMessageStart()), 'turn-1');
		await router.handle(makeStreamEvent('sess-1', makeContentBlockStartToolUse(0, 'toolu_1', 'Bash')), 'turn-1');
		await router.handle(makeStreamEvent('sess-1', makeContentBlockStop(0)), 'turn-1');
		await router.handle({
			...userMessage([{ type: 'tool_result', tool_use_id: 'toolu_1', content: 'Output too large' }]),
			parent_tool_use_id: null,
			tool_use_result: { stdout: 'full', stderr: '', interrupted: false, persistedOutputPath: outputFile.fsPath },
		}, 'turn-1', { signal: cancellation.signal });

		assert.deepStrictEqual({
			aborted: cancellation.signal.aborted,
			completion: signals.find(signal => signal.kind === 'action' && signal.action.type === ActionType.ChatToolCallComplete),
			stored: await database.getTerminalOutputSize('toolu_1'),
		}, {
			aborted: true,
			completion: undefined,
			stored: undefined,
		});
	});

	for (const phase of ['before read', 'during read', 'after read', 'after store', 'after store with failed delete', 'after store with persistent failed delete']) {
		test(`does not publish cancelled Bash output ${phase}`, async () => {
			const cancellation = new AbortController();
			let readCount = 0;
			let readTokenCancelled = false;
			let deleteCount = 0;
			const fileService = disposables.add(new class extends FileService {
				override async readFile(...args: Parameters<FileService['readFile']>) {
					readCount++;
					const output = await super.readFile(...args);
					if (phase === 'during read' || phase === 'after read') {
						cancellation.abort();
					}
					readTokenCancelled = args[2]?.isCancellationRequested === true;
					if (phase === 'during read') {
						throw new CancellationError();
					}
					return output;
				}
			}(new NullLogService()));
			const database = new class extends TestSessionDatabase {
				override async storeTerminalOutput(turnId: string, toolCallId: string, content: Uint8Array): Promise<void> {
					await super.storeTerminalOutput(turnId, toolCallId, content);
					cancellation.abort();
				}

				override async deleteTerminalOutput(toolCallId: string): Promise<void> {
					deleteCount++;
					if ((phase === 'after store with failed delete' && deleteCount === 1) || phase === 'after store with persistent failed delete') {
						throw new Error('Cannot delete output');
					}
					await super.deleteTerminalOutput(toolCallId);
				}
			}();
			const { router, signals } = createRouter(disposables, undefined, undefined, database, undefined, fileService);
			const outputFile = URI.file('/claude/tool-results/toolu_1.txt');
			await fileService.writeFile(outputFile, VSBuffer.fromString('full output'));
			await router.handle(makeStreamEvent('sess-1', makeMessageStart()), 'turn-1');
			await router.handle(makeStreamEvent('sess-1', makeContentBlockStartToolUse(0, 'toolu_1', 'Bash')), 'turn-1');
			await router.handle(makeStreamEvent('sess-1', makeContentBlockStop(0)), 'turn-1');
			const message = {
				...userMessage([{ type: 'tool_result', tool_use_id: 'toolu_1', content: 'Output too large' }]),
				parent_tool_use_id: null,
				tool_use_result: { persistedOutputPath: outputFile.fsPath },
			};
			if (phase === 'before read') {
				cancellation.abort();
			}

			await router.handle(message, 'turn-1', { signal: cancellation.signal });
			// A duplicate result must not resurrect the discarded mapper tracking.
			await router.handle(message, 'turn-1');

			assert.deepStrictEqual({
				aborted: cancellation.signal.aborted,
				completions: signals.filter(signal => signal.kind === 'action' && signal.action.type === ActionType.ChatToolCallComplete),
				stored: await database.getTerminalOutputSize('toolu_1'),
				readCount,
				readTokenCancelled,
			}, {
				aborted: true,
				completions: [],
				stored: phase === 'after store with persistent failed delete' ? 'full output'.length : undefined,
				readCount: phase === 'before read' ? 0 : 1,
				readTokenCancelled: phase === 'during read' || phase === 'after read',
			});
		});
	}

	for (const format of ['shaped', 'opaque'] as const) {
		test(`attributes subagent edits after registering the ${format} default chat`, async () => {
			const session = URI.parse('claude:/new-session');
			const chat = URI.parse(mintDefaultChatUri(format, session.toString(), undefined));
			const manager = disposables.add(new AgentHostStateManager(new NullLogService()));
			const authenticationService = disposables.add(new AgentHostAuthenticationService(new NullLogService()));
			const context = createAgentChatContext(manager, authenticationService, session, chat, session.toString(), undefined);
			const attribution = new RecordingAgentEditAttributionService();
			const { router, fileService } = createRouter(disposables, chat, attribution, undefined, undefined, undefined, context.owner);
			manager.createSession({
				resource: session.toString(),
				defaultChat: chat.toString(),
				provider: 'claude',
				title: 'New session',
				status: SessionStatus.Idle,
				createdAt: new Date(0).toISOString(),
				modifiedAt: new Date(0).toISOString(),
			});
			const file = URI.file('/work/subagent-format.txt');
			await fileService.writeFile(file, VSBuffer.fromString('before'));

			for (const availableAtStart of [true, false]) {
				const task = availableAtStart ? 'task-start' : 'task-result';
				const toolUseId = `edit-${task}`;
				await router.handle(assistantMessage([
					{ type: 'tool_use', id: toolUseId, name: 'Write', input: { file_path: file.fsPath, content: task } },
				], availableAtStart ? task : null), 'turn-1');
				await fileService.writeFile(file, VSBuffer.fromString(task));
				await router.handle(userMessage([
					{ type: 'tool_result', tool_use_id: toolUseId, content: 'ok' },
				], availableAtStart ? null : task), 'turn-1');
			}

			assert.deepStrictEqual({
				format: context.owner.getSubagentChatUriFormat(),
				editChats: attribution.recordedChatUris,
			}, {
				format,
				editChats: ['task-start', 'task-result'].map(task => subagentChatUri(format, session.toString(), chat.toString(), task)),
			});
		});
	}

	test('mints subagent chats under the chat\'s owner and format at the time each subagent runs', async () => {
		const first = 'claude:/sess-1';
		const second = 'claude:/sess-2';
		const chatChannelUri = URI.parse(buildChatUri(first, 'peer'));
		const attributionService = new RecordingAgentEditAttributionService();
		const owner = disposables.add(new TestChatOwnerRef(URI.parse(first)));
		const fileService = disposables.add(new FileService(new NullLogService()));
		const { router } = createRouter(disposables, chatChannelUri, attributionService, undefined, undefined, fileService, owner);
		const file = URI.file('/work/owner-change.txt');
		await fileService.writeFile(file, VSBuffer.fromString('before'));

		for (const parentToolUseId of ['before-change', 'after-change']) {
			if (parentToolUseId === 'after-change') {
				// The chat's owner changes while it runs.
				owner.set(URI.parse(second), 'opaque');
			}
			const toolUseId = `edit-${parentToolUseId}`;
			await router.handle(assistantMessage([
				{ type: 'tool_use', id: toolUseId, name: 'Write', input: { file_path: file.fsPath, content: parentToolUseId } },
			], parentToolUseId), 'turn-1');
			await fileService.writeFile(file, VSBuffer.fromString(parentToolUseId));
			await router.handle(userMessage([{ type: 'tool_result', tool_use_id: toolUseId, content: 'ok' }]), 'turn-1');
		}

		assert.deepStrictEqual(attributionService.recordedChatUris, [
			buildSubagentChatUri(first, 'before-change'),
			subagentChatUri('opaque', second, chatChannelUri.toString(), 'after-change'),
		]);
	});

	test('uses available subagent provenance from edit start and completion', async () => {
		const sessionUri = 'claude:/sess-1';
		const chatChannelUri = URI.parse(buildChatUri(sessionUri, 'peer'));
		const attributionService = new RecordingAgentEditAttributionService();
		const { router, fileService } = createRouter(disposables, chatChannelUri, attributionService);
		const file = URI.file('/work/subagent.txt');
		await fileService.writeFile(file, VSBuffer.fromString('before'));

		for (const { parentToolUseId, availableAtStart } of [
			{ parentToolUseId: 'task-1', availableAtStart: true },
			{ parentToolUseId: 'nested-task', availableAtStart: true },
			{ parentToolUseId: 'result-task', availableAtStart: false },
		]) {
			const toolUseId = `edit-${parentToolUseId}`;
			await router.handle(assistantMessage([
				{ type: 'tool_use', id: toolUseId, name: 'Write', input: { file_path: file.fsPath, content: parentToolUseId } },
			], availableAtStart ? parentToolUseId : null), 'turn-1');
			await fileService.writeFile(file, VSBuffer.fromString(parentToolUseId));
			await router.handle(userMessage([
				{ type: 'tool_result', tool_use_id: toolUseId, content: 'ok' },
			], availableAtStart ? null : parentToolUseId), 'turn-1');
		}
		assert.deepStrictEqual({
			sessionUris: attributionService.recordedSessionUris,
			chatUris: attributionService.recordedChatUris,
		}, {
			sessionUris: [chatChannelUri.toString(), chatChannelUri.toString(), chatChannelUri.toString()],
			chatUris: ['task-1', 'nested-task', 'result-task'].map(toolCallId => buildSubagentChatUri(sessionUri, toolCallId)),
		});
	});
});
