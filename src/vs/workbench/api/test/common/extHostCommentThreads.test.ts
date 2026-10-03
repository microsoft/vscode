/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import type * as vscode from 'vscode';
import { timeout } from '../../../../base/common/async.js';
import { MarshalledId } from '../../../../base/common/marshallingIds.js';
import { URI } from '../../../../base/common/uri.js';
import { mock } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../../platform/log/common/log.js';
import { nullExtensionDescription } from '../../../services/extensions/common/extensions.js';
import { MainContext, MainThreadCommandsShape, MainThreadCommentsShape } from '../../common/extHost.protocol.js';
import { ExtHostCommands } from '../../common/extHostCommands.js';
import { createExtHostComments } from '../../common/extHostComments.js';
import { ExtHostDocuments } from '../../common/extHostDocuments.js';
import { IExtHostTelemetry } from '../../common/extHostTelemetry.js';
import { CommentMode, Range } from '../../common/extHostTypes.js';
import { TestRPCProtocol } from './testRPCProtocol.js';

suite('ExtHostCommentThreads', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createComments() {
		const rpc = new TestRPCProtocol();
		const threads: { commentControlHandle: number; commentThreadHandle: number }[] = [];
		const deletedThreads: number[] = [];
		const controllers: number[] = [];
		rpc.set(MainContext.MainThreadComments, new class extends mock<MainThreadCommentsShape>() {
			override $registerCommentController(handle: number): void {
				controllers.push(handle);
			}
			override $unregisterCommentController(): void { }
			override $createCommentThread(commentControlHandle: number, commentThreadHandle: number): undefined {
				threads.push({ commentControlHandle, commentThreadHandle });
				return undefined;
			}
			override $updateCommentThread(): void { }
			override $deleteCommentThread(_controller: number, thread: number): void {
				deletedThreads.push(thread);
			}
		});
		rpc.set(MainContext.MainThreadCommands, new class extends mock<MainThreadCommandsShape>() {
			override $registerCommand(): void { }
			override $unregisterCommand(): void { }
		});
		const commands = new ExtHostCommands(rpc, new NullLogService(), new class extends mock<IExtHostTelemetry>() { });
		store.add(commands.registerCommand(false, 'comments.identity', <T>(value: T) => value));
		const comments = createExtHostComments(rpc, commands, new class extends mock<ExtHostDocuments>() { });
		const controller = store.add(comments.createCommentController(nullExtensionDescription, 'test.comments', 'Comments'));
		return { rpc, commands, comments, controller, controllers, threads, deletedThreads };
	}

	test('a disposed thread no longer resolves as a command argument', async () => {
		const { rpc, commands, controller, threads } = createComments();
		const thread = controller.createCommentThread(URI.file('/review.txt'), new Range(0, 0, 0, 1), []);
		await rpc.sync();
		const argument = { $mid: MarshalledId.CommentThread, ...threads[0] };
		assert.strictEqual(await commands.$executeContributedCommand('comments.identity', argument), thread);
		thread.dispose();
		assert.deepStrictEqual(await commands.$executeContributedCommand('comments.identity', argument), argument);
	});

	test('repeated disposal deletes a thread from the renderer only once', async () => {
		const { rpc, controller, threads, deletedThreads } = createComments();
		const thread = controller.createCommentThread(URI.file('/review.txt'), new Range(0, 0, 0, 1), []);
		thread.dispose();
		thread.dispose();
		controller.dispose();
		await rpc.sync();
		assert.deepStrictEqual(deletedThreads, [threads[0].commentThreadHandle]);
	});

	test('disposing one thread preserves command arguments for another live thread', async () => {
		const { rpc, commands, controller, threads } = createComments();
		const first = controller.createCommentThread(URI.file('/review.txt'), new Range(0, 0, 0, 1), []);
		const second = controller.createCommentThread(URI.file('/review.txt'), new Range(1, 0, 1, 1), []);
		await rpc.sync();
		first.dispose();
		assert.strictEqual(await commands.$executeContributedCommand('comments.identity', { $mid: MarshalledId.CommentThread, ...threads[1] }), second);
	});

	test('a disposed template no longer resolves as a command argument', async () => {
		const { rpc, commands, comments, controllers, threads } = createComments();
		await rpc.sync();
		await comments.$createCommentThreadTemplate(controllers[0], URI.file('/review.txt'), undefined);
		await rpc.sync();
		const argument = { $mid: MarshalledId.CommentThread, ...threads[0] };
		const thread = await commands.$executeContributedCommand('comments.identity', argument) as vscode.CommentThread;
		thread.dispose();
		assert.deepStrictEqual(await commands.$executeContributedCommand('comments.identity', argument), argument);
	});

	test('renderer deletion and subsequent API disposal release the same thread once', async () => {
		const { rpc, comments, controller, threads, deletedThreads } = createComments();
		const thread = controller.createCommentThread(URI.file('/review.txt'), new Range(0, 0, 0, 1), []);
		await rpc.sync();
		comments.$deleteCommentThread(threads[0].commentControlHandle, threads[0].commentThreadHandle);
		thread.dispose();
		await rpc.sync();
		assert.deepStrictEqual(deletedThreads, [threads[0].commentThreadHandle]);
	});

	test('controller shutdown disposes every remaining thread', async () => {
		const { rpc, controller, threads, deletedThreads } = createComments();
		controller.createCommentThread(URI.file('/first.txt'), new Range(0, 0, 0, 1), []);
		controller.createCommentThread(URI.file('/second.txt'), new Range(0, 0, 0, 1), []);
		controller.dispose();
		await rpc.sync();
		assert.deepStrictEqual(deletedThreads, threads.map(thread => thread.commentThreadHandle));
	});

	test('a live controller releases the comments of a disposed thread', async function () {
		if (typeof globalThis.gc !== 'function') {
			this.skip(); // Run the Electron suite with --js-flags=--expose-gc.
		}
		const { rpc, controller } = createComments();
		function createAndDispose(): WeakRef<vscode.Comment> {
			const comment = { body: 'Review comment', mode: CommentMode.Preview, author: { name: 'Reviewer' } };
			const thread = controller.createCommentThread(URI.file('/review.txt'), new Range(0, 0, 0, 1), [comment]);
			thread.dispose();
			return new WeakRef(comment);
		}
		const comment = createAndDispose();
		await rpc.sync();
		await timeout(0);
		await globalThis.gc!({ type: 'major', execution: 'async' });
		assert.strictEqual(comment.deref() === undefined, true, 'Disposed thread comments are still retained');
	});
});
