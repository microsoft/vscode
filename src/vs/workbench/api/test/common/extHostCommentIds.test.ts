/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import type * as vscode from 'vscode';
import { DeferredPromise } from '../../../../base/common/async.js';
import { MarshalledId } from '../../../../base/common/marshallingIds.js';
import { URI, UriComponents } from '../../../../base/common/uri.js';
import { mock } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { IRange } from '../../../../editor/common/core/range.js';
import * as languages from '../../../../editor/common/languages.js';
import { ICellRange } from '../../../contrib/notebook/common/notebookRange.js';
import { nullExtensionDescription } from '../../../services/extensions/common/extensions.js';
import { CommentChanges, CommentThreadChanges, MainThreadCommentsShape } from '../../common/extHost.protocol.js';
import { ArgumentProcessor, ExtHostCommands } from '../../common/extHostCommands.js';
import { createExtHostComments } from '../../common/extHostComments.js';
import { ExtHostDocuments } from '../../common/extHostDocuments.js';
import { CommentMode, Range } from '../../common/extHostTypes.js';
import { SingleProxyRPCProtocol } from './testRPCProtocol.js';

suite('Extension host comment ID lifetime', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	let processor: ArgumentProcessor;
	let controllerHandle: number;
	let threadHandle: number;
	let initial: readonly CommentChanges[];
	let updated: DeferredPromise<readonly CommentChanges[]>;
	let controller: vscode.CommentController;

	setup(() => {
		const proxy = new class extends mock<MainThreadCommentsShape>() {
			override $registerCommentController(handle: number): void { controllerHandle = handle; }
			override $unregisterCommentController(): void { }
			override $deleteCommentThread(): void { }
			override $createCommentThread(_handle: number, handle: number, _id: string, _resource: UriComponents, _range: IRange | ICellRange | undefined, comments: languages.Comment[]): undefined {
				threadHandle = handle;
				initial = comments;
				return undefined;
			}
			override $updateCommentThread(_handle: number, _thread: number, _id: string, _resource: UriComponents, changes: CommentThreadChanges): void {
				if (changes.comments) { updated.complete(changes.comments); }
			}
		};
		const commands = new class extends mock<ExtHostCommands>() {
			override registerArgumentProcessor(value: ArgumentProcessor): void { processor = value; }
		};
		const service = createExtHostComments(SingleProxyRPCProtocol(proxy), commands, new class extends mock<ExtHostDocuments>() { });
		controller = store.add(service.createCommentController(nullExtensionDescription, 'review', 'Review'));
	});

	function comment(body: string): vscode.Comment {
		return { body, mode: CommentMode.Preview, author: { name: 'Reviewer' } };
	}

	function argument(id: number) {
		return { $mid: MarshalledId.CommentNode, thread: { commentControlHandle: controllerHandle, commentThreadHandle: threadHandle }, commentUniqueId: id };
	}

	async function replace(thread: vscode.CommentThread, comments: vscode.Comment[]): Promise<readonly CommentChanges[]> {
		updated = new DeferredPromise();
		thread.comments = comments;
		return updated.p;
	}

	test('no longer resolves a removed comment from its old command ID', async () => {
		const retired = comment('old');
		const thread = controller.createCommentThread(URI.file('/review.txt'), new Range(0, 0, 0, 0), [retired]);
		const oldArgument = argument(initial[0].uniqueIdInThread);
		await replace(thread, [comment('new')]);
		assert.strictEqual(processor.processArgument(oldArgument, undefined), oldArgument);
	});

	test('preserves the ID and command target of a comment still in the thread', async () => {
		const active = comment('keep');
		const thread = controller.createCommentThread(URI.file('/review.txt'), new Range(0, 0, 0, 0), [comment('old'), active]);
		const id = initial[1].uniqueIdInThread;
		const changes = await replace(thread, [active, comment('new')]);
		assert.deepStrictEqual({ id: changes[0].uniqueIdInThread, target: processor.processArgument(argument(id), undefined) }, { id, target: active });
	});

	test('keeps the old ID usable until the debounced update is sent', async () => {
		const retired = comment('old');
		const thread = controller.createCommentThread(URI.file('/review.txt'), new Range(0, 0, 0, 0), [retired]);
		const oldArgument = argument(initial[0].uniqueIdInThread);
		const update = replace(thread, []);
		assert.strictEqual(processor.processArgument(oldArgument, undefined), retired);
		await update;
		assert.strictEqual(processor.processArgument(oldArgument, undefined), oldArgument);
	});

	test('clears all comment IDs when the thread becomes empty', async () => {
		const thread = controller.createCommentThread(URI.file('/review.txt'), new Range(0, 0, 0, 0), [comment('old')]);
		const oldArgument = argument(initial[0].uniqueIdInThread);
		await replace(thread, []);
		assert.strictEqual(processor.processArgument(oldArgument, undefined), oldArgument);
	});

	test('assigns a fresh ID if a removed comment object is added again later', async () => {
		const reused = comment('reused');
		const thread = controller.createCommentThread(URI.file('/review.txt'), new Range(0, 0, 0, 0), [reused]);
		const oldId = initial[0].uniqueIdInThread;
		await replace(thread, []);
		const changes = await replace(thread, [reused]);
		assert.notStrictEqual(changes[0].uniqueIdInThread, oldId);
		assert.strictEqual(processor.processArgument(argument(changes[0].uniqueIdInThread), undefined), reused);
	});
});
