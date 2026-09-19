/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk';

import assert from 'assert';
import { VSBuffer } from '../../../../base/common/buffer.js';
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
import { AgentSignal } from '../../common/agent.js';
import { IDiffComputeService } from '../../common/diffComputeService.js';
import { IAgentEditAttribution, IAgentEditAttributionService, NullAgentEditAttributionService } from '../../common/fileEditAttribution.js';
import { ISessionDatabase } from '../../common/sessionDataService.js';
import { buildChatUri, buildDefaultChatUri, resolveChatUri } from '../../common/state/sessionState.js';
import { ClaudeSdkMessageRouter } from '../../node/claude/claudeSdkMessageRouter.js';
import { SubagentRegistry } from '../../node/claude/claudeSubagentRegistry.js';
import { IEditArcReporterService, NullEditArcReporterService } from '../../node/shared/editArcReporter.js';
import { IEditSurvivalReporterFactory, NullEditSurvivalReporterFactory } from '../../node/shared/editSurvivalReporter.js';
import { createZeroDiffComputeService, TestSessionDatabase } from '../common/sessionTestHelpers.js';
import {
	makeContentBlockStartText,
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
	readonly subagents: SubagentRegistry;
}

class RecordingAgentEditAttributionService extends NullAgentEditAttributionService {
	readonly recordedSessionUris: string[] = [];
	readonly flushedSessionUris: string[] = [];

	override async recordEdit(edit: IAgentEditAttribution) {
		this.recordedSessionUris.push(edit.sessionUri);
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
): IRouterHarness {
	const fileService = disposables.add(new FileService(new NullLogService()));
	const fs = disposables.add(new InMemoryFileSystemProvider());
	disposables.add(fileService.registerProvider('file', fs));

	const db = new TestSessionDatabase();
	const dbRef: IReference<ISessionDatabase> = { object: db, dispose: () => { } };

	const services = new ServiceCollection(
		[ILogService, new NullLogService()],
		[IFileService, fileService],
		[IDiffComputeService, createZeroDiffComputeService()],
		[IAgentEditAttributionService, attributionService],
		[IEditSurvivalReporterFactory, new NullEditSurvivalReporterFactory()],
		[IEditArcReporterService, new NullEditArcReporterService()],
	);
	const inst: IInstantiationService = disposables.add(new InstantiationService(services));
	const subagents = disposables.add(new SubagentRegistry());
	const router = disposables.add(inst.createInstance(
		ClaudeSdkMessageRouter,
		chatChannelUri,
		resolveChatUri(URI.parse('claude:/sess-1'), chatChannelUri),
		dbRef,
		subagents,
		undefined,
	));
	const signals: AgentSignal[] = [];
	disposables.add(router.onDidProduceSignal(s => signals.push(s)));
	return { router, signals, fileService, subagents };
}

function assistantMessage(content: unknown): Extract<SDKMessage, { type: 'assistant' }> {
	return { type: 'assistant', message: { content } } as Extract<SDKMessage, { type: 'assistant' }>;
}

function userMessage(content: unknown): Extract<SDKMessage, { type: 'user' }> {
	return { type: 'user', message: { content } } as Extract<SDKMessage, { type: 'user' }>;
}

suite('ClaudeSdkMessageRouter', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('handle with turnId=undefined drops turn-scoped messages', async () => {
		const { router, signals } = createRouter(disposables);
		await router.handle(makeStreamEvent('sess-1', makeMessageStart()), undefined);
		assert.deepStrictEqual(signals, []);
	});

	test('a background subagent that settles after its turn still completes', async () => {
		const { router, signals, subagents } = createRouter(disposables);
		subagents.recordSpawn('tu-1');
		subagents.getSpawn('tu-1')!.background = true;

		// The queue has drained by the time a background task notification
		// arrives, so there is no turn id to scope it to.
		await router.handle({
			type: 'system',
			subtype: 'task_notification',
			tool_use_id: 'tu-1',
			status: 'completed',
		} as unknown as SDKMessage, undefined);

		assert.deepStrictEqual(signals.map(s => s.kind), ['subagent_completed']);
		assert.strictEqual(subagents.getSpawn('tu-1'), undefined);
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
			flushedSessionUris: attributionService.flushedSessionUris,
		}, {
			recordedSessionUris: [chatChannelUri.toString()],
			flushedSessionUris: [chatChannelUri.toString()],
		});
	});
});
