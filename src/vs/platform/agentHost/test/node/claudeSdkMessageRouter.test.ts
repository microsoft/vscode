/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk';

import assert from 'assert';
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
import { AgentSignal } from '../../common/agentService.js';
import { IDiffComputeService } from '../../common/diffComputeService.js';
import { ISessionDatabase } from '../../common/sessionDataService.js';
import { ClaudeSdkMessageRouter } from '../../node/claude/claudeSdkMessageRouter.js';
import { SubagentRegistry } from '../../node/claude/claudeSubagentRegistry.js';
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
}

function createRouter(disposables: Pick<DisposableStore, 'add'>): IRouterHarness {
	const fileService = disposables.add(new FileService(new NullLogService()));
	const fs = disposables.add(new InMemoryFileSystemProvider());
	disposables.add(fileService.registerProvider('file', fs));

	const db = new TestSessionDatabase();
	const dbRef: IReference<ISessionDatabase> = { object: db, dispose: () => { } };

	const services = new ServiceCollection(
		[ILogService, new NullLogService()],
		[IFileService, fileService],
		[IDiffComputeService, createZeroDiffComputeService()],
	);
	const inst: IInstantiationService = disposables.add(new InstantiationService(services));
	const subagents = disposables.add(new SubagentRegistry());
	const router = disposables.add(inst.createInstance(
		ClaudeSdkMessageRouter,
		URI.parse('claude:/sess-1'),
		dbRef,
		subagents,
	));
	const signals: AgentSignal[] = [];
	disposables.add(router.onDidProduceSignal(s => signals.push(s)));
	return { router, signals, fileService };
}

suite('ClaudeSdkMessageRouter', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('handle with turnId=undefined produces no signals (turn-less messages are routed to nowhere)', async () => {
		const { router, signals } = createRouter(disposables);
		await router.handle(makeStreamEvent('sess-1', makeMessageStart()), undefined);
		assert.deepStrictEqual(signals, []);
	});

	test('handle with a turnId on a text content block produces SessionResponsePart + SessionDelta signals', async () => {
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
});
