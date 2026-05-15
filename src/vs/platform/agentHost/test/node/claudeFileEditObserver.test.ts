/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk';

import assert from 'assert';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { IReference } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { FileService } from '../../../files/common/fileService.js';
import { IFileService } from '../../../files/common/files.js';
import { InMemoryFileSystemProvider } from '../../../files/common/inMemoryFilesystemProvider.js';
import { IInstantiationService } from '../../../instantiation/common/instantiation.js';
import { InstantiationService } from '../../../instantiation/common/instantiationService.js';
import { ServiceCollection } from '../../../instantiation/common/serviceCollection.js';
import { ILogService, NullLogService } from '../../../log/common/log.js';
import { IDiffComputeService } from '../../common/diffComputeService.js';
import { ISessionDatabase } from '../../common/sessionDataService.js';
import { ToolResultContentType } from '../../common/state/sessionState.js';
import { ClaudeFileEditObserver } from '../../node/claude/claudeFileEditObserver.js';
import { ClaudeMapperState } from '../../node/claude/claudeMapSessionEvents.js';
import { createZeroDiffComputeService, TestSessionDatabase } from '../common/sessionTestHelpers.js';

interface IObserverHarness {
	readonly observer: ClaudeFileEditObserver;
	readonly db: TestSessionDatabase;
	readonly fileService: FileService;
	readonly mapperState: ClaudeMapperState;
}

function createObserver(disposables: Pick<import('../../../../base/common/lifecycle.js').DisposableStore, 'add'>): IObserverHarness {
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
	const instantiationService: IInstantiationService = disposables.add(new InstantiationService(services));
	const observer = disposables.add(instantiationService.createInstance(
		ClaudeFileEditObserver,
		'claude:/sess-1',
		dbRef,
	));
	return { observer, db, fileService, mapperState: new ClaudeMapperState() };
}

function assistantMessage(content: unknown): Extract<SDKMessage, { type: 'assistant' }> {
	return { type: 'assistant', message: { content } } as Extract<SDKMessage, { type: 'assistant' }>;
}

function userMessage(content: unknown): Extract<SDKMessage, { type: 'user' }> {
	return { type: 'user', message: { content } } as Extract<SDKMessage, { type: 'user' }>;
}

suite('ClaudeFileEditObserver', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('observe assistant→user round-trip caches a file edit on the mapper state', async () => {
		const { observer, fileService, mapperState } = createObserver(disposables);
		await fileService.writeFile(URI.file('/work/a.txt'), VSBuffer.fromString('before'));

		observer.observeAssistant(assistantMessage([
			{ type: 'tool_use', id: 'tu-1', name: 'Write', input: { file_path: '/work/a.txt', content: 'after' } },
		]));

		// Tool runs (we simulate it here): file content changes.
		await fileService.writeFile(URI.file('/work/a.txt'), VSBuffer.fromString('after'));

		await observer.observeUser(userMessage([
			{ type: 'tool_result', tool_use_id: 'tu-1', content: 'ok' },
		]), 'turn-1', mapperState);

		const cached = mapperState.takeFileEdit('tu-1');
		assert.ok(cached, 'expected a cached file edit');
		assert.strictEqual(cached.type, ToolResultContentType.FileEdit);
	});

	test('observeAssistant ignores non-edit tools and tools with no path', () => {
		const { observer, mapperState } = createObserver(disposables);

		observer.observeAssistant(assistantMessage([
			{ type: 'tool_use', id: 'tu-bash', name: 'Bash', input: { command: 'ls' } },
			{ type: 'tool_use', id: 'tu-bad', name: 'Write', input: {} }, // missing file_path
			{ type: 'text', text: 'hi' },
		]));

		// No tool_result for either id should produce a cached edit.
		assert.strictEqual(mapperState.takeFileEdit('tu-bash'), undefined);
		assert.strictEqual(mapperState.takeFileEdit('tu-bad'), undefined);
	});

	test('observeUser ignores tool_result for unknown tool_use_id', async () => {
		const { observer, mapperState } = createObserver(disposables);

		await observer.observeUser(userMessage([
			{ type: 'tool_result', tool_use_id: 'never-tracked', content: 'ok' },
		]), 'turn-1', mapperState);

		assert.strictEqual(mapperState.takeFileEdit('never-tracked'), undefined);
	});

	test('observe* tolerate non-array message content', async () => {
		const { observer, mapperState } = createObserver(disposables);

		observer.observeAssistant(assistantMessage('plain string body'));
		await observer.observeUser(userMessage('plain string body'), 'turn-1', mapperState);

		// No throws, no cached edits.
		assert.strictEqual(mapperState.takeFileEdit('any'), undefined);
	});
});
