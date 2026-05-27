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

	test('ensureRequestCheckpoint creates sentinel and is idempotent', () => {
		const controller = createController(store, new Map());
		controller.ensureRequestCheckpoint('req-1');
		controller.ensureRequestCheckpoint('req-1');
		// A sentinel alone doesn't enable undo (currentIdx === -1 since
		// sentinels never advance the cursor on their own).
		assert.strictEqual(controller.canUndo.get(), false);
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

	test('streaming-edits APIs throw — agent host owns edits server-side', () => {
		const controller = createController(store, new Map());
		const fakeResponseModel = {} as IChatResponseModel;
		assert.throws(() => controller.startStreamingEdits(URI.file('/x'), fakeResponseModel, undefined));
		assert.throws(() => controller.applyWorkspaceEdit({ kind: 'workspaceEdit', edits: [] }, fakeResponseModel, 'stop'));
	});
});
