/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { VSBuffer } from '../../../../../../base/common/buffer.js';
import { DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { ToolCallConfirmationReason, ToolCallStatus, ToolResultContentType } from '../../../../../../platform/agentHost/common/state/protocol/state.js';
import type { ToolCallCompletedState } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { IFileContent, IFileService } from '../../../../../../platform/files/common/files.js';
import { NullLogService } from '../../../../../../platform/log/common/log.js';
import { IChatResponseModel } from '../../../common/model/chatModel.js';
import { AgentHostSnapshotController } from '../../../browser/agentSessions/agentHost/agentHostSnapshotController.js';

function makeToolCall(opts: {
	toolCallId: string;
	filePath: string;
	beforeURI: string;
	afterURI: string;
	added?: number;
	removed?: number;
}): ToolCallCompletedState {
	return {
		status: ToolCallStatus.Completed,
		toolCallId: opts.toolCallId,
		toolName: 'codeEdit',
		displayName: 'Edit File',
		invocationMessage: 'Editing file',
		toolInput: JSON.stringify({ path: opts.filePath }),
		success: true,
		pastTenseMessage: 'Edited file',
		confirmed: ToolCallConfirmationReason.NotNeeded,
		content: [{
			type: ToolResultContentType.FileEdit,
			before: {
				uri: URI.file(opts.filePath).toString(),
				content: { uri: opts.beforeURI },
			},
			after: {
				uri: URI.file(opts.filePath).toString(),
				content: { uri: opts.afterURI },
			},
			diff: {
				added: opts.added ?? 0,
				removed: opts.removed ?? 0,
			},
		}],
	};
}

function makeMockFileService(contentMap: Map<string, string>): IFileService {
	return new class extends mock<IFileService>() {
		override async readFile(uri: URI) {
			const data = contentMap.get(uri.toString());
			if (data === undefined) {
				throw new Error(`Content not found: ${uri.toString()}`);
			}
			return { value: VSBuffer.fromString(data) } as IFileContent;
		}
		override async writeFile(uri: URI, content: VSBuffer): Promise<any> {
			contentMap.set(uri.toString(), content.toString());
			return {};
		}
		override async del(uri: URI) {
			contentMap.delete(uri.toString());
		}
		override async move(source: URI, target: URI): Promise<any> {
			const data = contentMap.get(source.toString());
			if (data !== undefined) {
				contentMap.set(target.toString(), data);
				contentMap.delete(source.toString());
			}
			return {};
		}
	};
}

function createController(store: DisposableStore, contentMap: Map<string, string>): AgentHostSnapshotController {
	const sessionResource = URI.from({ scheme: 'agent-host-copilot', path: '/test-session' });
	const controller = new AgentHostSnapshotController(
		sessionResource,
		'local',
		new NullLogService(),
		makeMockFileService(contentMap),
	);
	store.add(controller);
	return controller;
}

suite('AgentHostSnapshotController', () => {

	const store = new DisposableStore();

	teardown(() => store.clear());

	ensureNoDisposablesAreLeakedInTestSuite();

	test('initial state — empty checkpoints, no disablement, no undo', () => {
		const controller = createController(store, new Map());
		assert.deepStrictEqual(controller.requestDisablement.get(), []);
		assert.strictEqual(controller.canUndo.get(), false);
		assert.strictEqual(controller.canRedo.get(), false);
		assert.deepStrictEqual(controller.entries.get(), []);
	});

	test('addToolCallEdits records snapshot data, enables undo', () => {
		const contentMap = new Map<string, string>();
		const controller = createController(store, contentMap);
		controller.addToolCallEdits('req-1', makeToolCall({
			toolCallId: 'tc-1',
			filePath: '/file.ts',
			beforeURI: 'agenthost-content:///snap/before',
			afterURI: 'agenthost-content:///snap/after',
		}));
		assert.strictEqual(controller.canUndo.get(), true);
		assert.strictEqual(controller.canRedo.get(), false);
	});

	test('addToolCallEdits is idempotent on toolCallId', () => {
		const controller = createController(store, new Map());
		const tc = makeToolCall({
			toolCallId: 'tc-1',
			filePath: '/file.ts',
			beforeURI: 'agenthost-content:///snap/before',
			afterURI: 'agenthost-content:///snap/after',
		});
		controller.addToolCallEdits('req-1', tc);
		controller.addToolCallEdits('req-1', tc);
		// Restore to before the request — only one undo expected.
		assert.strictEqual(controller.canUndo.get(), true);
	});

	test('restoreSnapshot to a prior checkpoint writes before-content to disk', async () => {
		const before = URI.file('/snap/before-1').toString();
		const after = URI.file('/snap/after-1').toString();
		const file = URI.file('/file.ts').toString();
		const contentMap = new Map([
			[before, 'original'],
			[after, 'modified'],
			[file, 'modified'],
		]);
		const controller = createController(store, contentMap);
		controller.addToolCallEdits('req-1', makeToolCall({
			toolCallId: 'tc-1',
			filePath: '/file.ts',
			beforeURI: before,
			afterURI: after,
		}));
		// Restore before the request → wraps back to the original content.
		await controller.restoreSnapshot('req-1', undefined);
		assert.strictEqual(contentMap.get(file), 'original');
	});

	test('requestDisablement reports requests after a checkpoint restore', async () => {
		const before1 = URI.file('/snap/before-1').toString();
		const after1 = URI.file('/snap/after-1').toString();
		const before2 = URI.file('/snap/before-2').toString();
		const after2 = URI.file('/snap/after-2').toString();
		const file = URI.file('/file.ts').toString();
		const controller = createController(store, new Map([
			[before1, 'a'],
			[after1, 'b'],
			[before2, 'b'],
			[after2, 'c'],
			[file, 'c'],
		]));
		controller.addToolCallEdits('req-1', makeToolCall({
			toolCallId: 'tc-1', filePath: '/file.ts',
			beforeURI: before1, afterURI: after1,
		}));
		controller.addToolCallEdits('req-2', makeToolCall({
			toolCallId: 'tc-2', filePath: '/file.ts',
			beforeURI: before2, afterURI: after2,
		}));
		// At HEAD nothing is disabled
		assert.deepStrictEqual(controller.requestDisablement.get(), []);

		// Restore before req-2 → req-2 becomes disabled
		await controller.restoreSnapshot('req-2', undefined);
		assert.deepStrictEqual(controller.requestDisablement.get().map(d => d.requestId), ['req-2']);
	});

	test('ensureRequestCheckpoint creates a checkpoint and is idempotent', () => {
		const controller = createController(store, new Map());
		controller.ensureRequestCheckpoint('req-1');
		controller.ensureRequestCheckpoint('req-1');
		// Undo is request-level: a checkpoint exists, so we can undo it
		// (even though the request produced no edits).
		assert.strictEqual(controller.canUndo.get(), true);
		assert.strictEqual(controller.canRedo.get(), false);
	});

	test('ensureRequestCheckpoint does not mark the current request as disabled', () => {
		const controller = createController(store, new Map());
		// Simulates the start-of-turn path in the session handler: the
		// checkpoint for the in-flight request must not appear in
		// requestDisablement (otherwise the chat UI hides the live turn).
		controller.ensureRequestCheckpoint('req-1');
		assert.deepStrictEqual(controller.requestDisablement.get(), []);
		controller.ensureRequestCheckpoint('req-2');
		assert.deepStrictEqual(controller.requestDisablement.get(), []);
	});

	test('restoreSnapshot of a no-edit request marks it disabled', async () => {
		const controller = createController(store, new Map());
		// Two requests, neither produced file edits — mirrors a session
		// hydrated from history where intermediate turns had no tool calls.
		controller.ensureRequestCheckpoint('req-1');
		controller.ensureRequestCheckpoint('req-2');
		await controller.restoreSnapshot('req-2', undefined);
		assert.deepStrictEqual(
			controller.requestDisablement.get().map(d => d.requestId),
			['req-2'],
		);
	});

	test('starting a new request after restore-to-start splices stale checkpoints', () => {
		const before = URI.file('/snap/before-1').toString();
		const after = URI.file('/snap/after-1').toString();
		const controller = createController(store, new Map([
			[before, 'a'], [after, 'b'], [URI.file('/file.ts').toString(), 'a'],
		]));
		controller.addToolCallEdits('req-1', makeToolCall({
			toolCallId: 'tc-1', filePath: '/file.ts',
			beforeURI: before, afterURI: after,
		}));
		return controller.restoreSnapshot('req-1', undefined).then(() => {
			// After restoring before req-1, the user sends a new request.
			// The stale forward branch must be spliced or the new checkpoint
			// would coexist with the discarded one.
			controller.ensureRequestCheckpoint('req-2');
			assert.deepStrictEqual(controller.requestDisablement.get(), []);
			assert.strictEqual(controller.canRedo.get(), false);
		});
	});

	test('multiple tool calls in one request share a checkpoint', async () => {
		const before1 = URI.file('/snap/before-1').toString();
		const after1 = URI.file('/snap/after-1').toString();
		const before2 = URI.file('/snap/before-2').toString();
		const after2 = URI.file('/snap/after-2').toString();
		const fileA = URI.file('/a.ts').toString();
		const fileB = URI.file('/b.ts').toString();
		const contentMap = new Map([
			[before1, 'a-original'], [after1, 'a-modified'], [fileA, 'a-modified'],
			[before2, 'b-original'], [after2, 'b-modified'], [fileB, 'b-modified'],
		]);
		const controller = createController(store, contentMap);
		controller.addToolCallEdits('req-1', makeToolCall({
			toolCallId: 'tc-1', filePath: '/a.ts',
			beforeURI: before1, afterURI: after1,
		}));
		controller.addToolCallEdits('req-1', makeToolCall({
			toolCallId: 'tc-2', filePath: '/b.ts',
			beforeURI: before2, afterURI: after2,
		}));
		// Restoring before req-1 undoes BOTH tool calls' edits.
		await controller.restoreSnapshot('req-1', undefined);
		assert.strictEqual(contentMap.get(fileA), 'a-original');
		assert.strictEqual(contentMap.get(fileB), 'b-original');
	});

	test('multiple tool calls editing the same file collapse to one net edit', async () => {
		// Two sequential edits to /file.ts within the same request: the
		// second edit's after-content must win on redo, and the first
		// edit's before-content must win on undo. Without merging, the
		// two edits would race when applied in parallel.
		const beforeA = URI.file('/snap/before-a').toString();
		const afterA = URI.file('/snap/after-a').toString();
		const beforeB = URI.file('/snap/before-b').toString();
		const afterB = URI.file('/snap/after-b').toString();
		const file = URI.file('/file.ts').toString();
		const contentMap = new Map([
			[beforeA, 'v0'], [afterA, 'v1'],
			[beforeB, 'v1'], [afterB, 'v2'],
			[file, 'v2'],
		]);
		const controller = createController(store, contentMap);
		controller.addToolCallEdits('req-1', makeToolCall({
			toolCallId: 'tc-1', filePath: '/file.ts',
			beforeURI: beforeA, afterURI: afterA,
		}));
		controller.addToolCallEdits('req-1', makeToolCall({
			toolCallId: 'tc-2', filePath: '/file.ts',
			beforeURI: beforeB, afterURI: afterB,
		}));
		await controller.restoreSnapshot('req-1', undefined);
		assert.strictEqual(contentMap.get(file), 'v0');
	});

	test('hasEditsInRequest reflects added tool call edits', () => {
		const controller = createController(store, new Map());
		controller.addToolCallEdits('req-1', makeToolCall({
			toolCallId: 'tc-1', filePath: '/file.ts',
			beforeURI: 'agenthost-content:///before', afterURI: 'agenthost-content:///after',
		}));
		assert.strictEqual(controller.hasEditsInRequest('req-1'), true);
		assert.strictEqual(controller.hasEditsInRequest('req-2'), false);
	});

	test('non-completed tool calls are ignored', () => {
		const controller = createController(store, new Map());
		controller.addToolCallEdits('req-1', {
			status: ToolCallStatus.Running,
			toolCallId: 'tc-1',
			toolName: 'codeEdit',
			displayName: 'Edit File',
			invocationMessage: 'Editing file',
			toolInput: '{}',
			confirmed: ToolCallConfirmationReason.NotNeeded,
			content: [],
		});
		assert.strictEqual(controller.canUndo.get(), false);
	});

	test('undoInteraction steps back one checkpoint at a time', async () => {
		const beforeA = URI.file('/snap/before-a').toString();
		const afterA = URI.file('/snap/after-a').toString();
		const beforeB = URI.file('/snap/before-b').toString();
		const afterB = URI.file('/snap/after-b').toString();
		const fileA = URI.file('/a.ts').toString();
		const fileB = URI.file('/b.ts').toString();
		const contentMap = new Map([
			[beforeA, 'a0'], [afterA, 'a1'], [fileA, 'a1'],
			[beforeB, 'b0'], [afterB, 'b1'], [fileB, 'b1'],
		]);
		const controller = createController(store, contentMap);
		controller.addToolCallEdits('req-1', makeToolCall({ toolCallId: 'tc-1', filePath: '/a.ts', beforeURI: beforeA, afterURI: afterA }));
		controller.addToolCallEdits('req-2', makeToolCall({ toolCallId: 'tc-2', filePath: '/b.ts', beforeURI: beforeB, afterURI: afterB }));

		// Undo req-2 only — req-1's edit stays applied.
		await controller.undoInteraction();
		assert.strictEqual(contentMap.get(fileA), 'a1');
		assert.strictEqual(contentMap.get(fileB), 'b0');
		assert.strictEqual(controller.canUndo.get(), true);
		assert.strictEqual(controller.canRedo.get(), true);

		// Undo req-1 too.
		await controller.undoInteraction();
		assert.strictEqual(contentMap.get(fileA), 'a0');
		assert.strictEqual(controller.canUndo.get(), false);

		// Extra undo past the start is a safe no-op.
		await controller.undoInteraction();
		assert.strictEqual(contentMap.get(fileA), 'a0');
	});

	test('redoInteraction steps forward and stops at HEAD (no infinite loop)', async () => {
		const beforeA = URI.file('/snap/before-a').toString();
		const afterA = URI.file('/snap/after-a').toString();
		const beforeB = URI.file('/snap/before-b').toString();
		const afterB = URI.file('/snap/after-b').toString();
		const fileA = URI.file('/a.ts').toString();
		const fileB = URI.file('/b.ts').toString();
		const contentMap = new Map([
			[beforeA, 'a0'], [afterA, 'a1'], [fileA, 'a1'],
			[beforeB, 'b0'], [afterB, 'b1'], [fileB, 'b1'],
		]);
		const controller = createController(store, contentMap);
		controller.addToolCallEdits('req-1', makeToolCall({ toolCallId: 'tc-1', filePath: '/a.ts', beforeURI: beforeA, afterURI: afterA }));
		controller.addToolCallEdits('req-2', makeToolCall({ toolCallId: 'tc-2', filePath: '/b.ts', beforeURI: beforeB, afterURI: afterB }));

		// Restore to before req-1 so both edits are pending a redo.
		await controller.restoreSnapshot('req-1', undefined);
		assert.strictEqual(contentMap.get(fileA), 'a0');
		assert.strictEqual(contentMap.get(fileB), 'b0');
		assert.strictEqual(controller.canRedo.get(), true);

		// Emulate the "Redo" action's drain loop. The bounded guard turns a
		// regression (redoInteraction not advancing the cursor) into a clean
		// assertion failure instead of an infinite loop that would hang the
		// window — which is exactly the bug this guards against.
		let guard = 0;
		while (controller.canRedo.get()) {
			await controller.redoInteraction();
			assert.ok(++guard <= 10, 'redoInteraction failed to advance the checkpoint cursor');
		}

		assert.strictEqual(contentMap.get(fileA), 'a1');
		assert.strictEqual(contentMap.get(fileB), 'b1');
		assert.strictEqual(controller.canRedo.get(), false);
		assert.strictEqual(controller.canUndo.get(), true);
	});

	test('streaming-edits APIs throw — agent host owns edits server-side', () => {
		const controller = createController(store, new Map());
		const fakeResponseModel = {} as IChatResponseModel;
		assert.throws(() => controller.startStreamingEdits(URI.file('/x'), fakeResponseModel, undefined));
		assert.throws(() => controller.applyWorkspaceEdit({ kind: 'workspaceEdit', edits: [] }, fakeResponseModel, 'stop'));
	});
});
